import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { supabaseAdmin } from "./supabase.js";

const botToken = process.env.DISCORD_BOT_TOKEN;

let discordClient: Client | null = null;
let discordRest: REST | null = null;
let botInitialized = false;

const TOSS_ACCOUNT = "190839534245";

// ── 채널 타입 매핑 ──────────────────────────────────────────────────────────
const CHANNEL_TYPE: Record<string, number> = {
  text:         0,
  voice:        2,
  announcement: 5,
  stage:        13,
  forum:        15,
  media:        16,
};

export function getDiscordClient(): Client {
  if (!discordClient) {
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN is not set");
    discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    });
    discordClient.login(botToken).catch((err) => {
      console.error("Failed to login Discord bot:", err);
    });
  }
  return discordClient;
}

export function getDiscordRest(): REST {
  if (!discordRest) {
    if (!botToken) throw new Error("DISCORD_BOT_TOKEN is not set");
    discordRest = new REST({ version: "10" }).setToken(botToken);
  }
  return discordRest;
}

export async function verifyBotInServer(serverId: string): Promise<{ inServer: boolean; serverName: string | null }> {
  try {
    const rest = getDiscordRest();
    const guild = await rest.get(Routes.guild(serverId)) as { name: string };
    return { inServer: true, serverName: guild.name };
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 403 || error.status === 404) {
      return { inServer: false, serverName: null };
    }
    throw err;
  }
}

// ── Config 정규화 (ServerEditor nested/flat 둘 다 처리) ──────────────────────

interface NormalizedConfig {
  server: { name: string; description: string | null; verification_level: number };
  roles: Array<{ id: string; name: string; color: string; hoist: boolean; mentionable: boolean }>;
  categories: Array<{ id: string; name: string; position: number }>;
  channels: Array<{
    id: string; name: string; type: string; category_id: string | null;
    position: number; topic: string | null; nsfw: boolean; slow_mode: number;
  }>;
}

function normalizeConfig(raw: any): NormalizedConfig {
  const server = {
    name: raw.serverName ?? raw.server?.name ?? "DIRO 서버",
    description: raw.serverDescription ?? raw.server?.description ?? null,
    verification_level: (() => {
      const vl = raw.verificationLevel ?? raw.server?.verification_level ?? "none";
      const map: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, very_high: 4 };
      return typeof vl === "number" ? vl : (map[vl] ?? 0);
    })(),
  };

  const roles = (raw.roles ?? [])
    .filter((r: any) => r.name !== "@everyone")
    .map((r: any) => ({
      id: String(r.id), name: r.name,
      color: r.color ?? "#000000",
      hoist: r.hoist ?? false,
      mentionable: r.mentionable ?? false,
    }));

  const categories: NormalizedConfig["categories"] = [];
  const channels: NormalizedConfig["channels"] = [];

  if (Array.isArray(raw.categories)) {
    raw.categories.forEach((cat: any, catIdx: number) => {
      categories.push({ id: String(cat.id), name: cat.name, position: cat.position ?? catIdx });
      if (Array.isArray(cat.channels)) {
        cat.channels.forEach((ch: any, chIdx: number) => {
          channels.push({
            id: String(ch.id), name: ch.name, type: ch.type ?? "text",
            category_id: String(cat.id), position: ch.position ?? chIdx,
            topic: ch.topic ?? null, nsfw: ch.nsfw ?? false,
            slow_mode: ch.slowmode ?? ch.slow_mode ?? 0,
          });
        });
      }
    });
  }

  if (Array.isArray(raw.channels)) {
    raw.channels.forEach((ch: any, chIdx: number) => {
      if (!channels.find((c) => c.id === String(ch.id))) {
        channels.push({
          id: String(ch.id), name: ch.name, type: ch.type ?? "text",
          category_id: ch.category_id ? String(ch.category_id) : null,
          position: ch.position ?? chIdx, topic: ch.topic ?? null,
          nsfw: ch.nsfw ?? false, slow_mode: ch.slowmode ?? ch.slow_mode ?? 0,
        });
      }
    });
  }

  return { server, roles, categories, channels };
}

// ── 서버 구조 Discord에 적용 (기존 채널·역할 전부 재생성) ───────────────────

async function applyConfig(serverId: string, rawConfig: any) {
  const config = normalizeConfig(rawConfig);
  const applied: string[] = [];
  const errors: string[] = [];
  const rest = getDiscordRest();
  const log = (msg: string) => { applied.push(msg); console.log(`  ✓ ${msg}`); };
  const err = (msg: string) => { errors.push(msg);  console.error(`  ✗ ${msg}`); };

  // 1. 서버 정보 수정
  try {
    await rest.patch(Routes.guild(serverId), {
      body: { name: config.server.name, description: config.server.description,
              verification_level: config.server.verification_level },
    });
    log(`서버 이름: ${config.server.name}`);
  } catch (e) { err(`서버 이름 수정 실패: ${(e as Error).message}`); }

  // 2. 기존 채널 전부 삭제
  try {
    const guildChannels = await rest.get(Routes.guildChannels(serverId)) as any[];
    for (const ch of guildChannels) {
      try { await rest.delete(`/channels/${ch.id}` as any); }
      catch (e) { err(`채널 삭제 실패 (${ch.name}): ${(e as Error).message}`); }
    }
  } catch (e) { err(`채널 목록 조회 실패: ${(e as Error).message}`); }

  // 3. 기존 역할 삭제 (everyone·봇 관리 역할 제외)
  try {
    const client = getDiscordClient();
    const guildRoles = await rest.get(Routes.guildRoles(serverId)) as any[];
    const botMember = await rest.get(Routes.guildMember(serverId, client.user!.id)) as any;
    const botRoleIds = new Set<string>(botMember.roles ?? []);
    for (const role of guildRoles) {
      if (role.name === "@everyone" || role.managed || botRoleIds.has(role.id)) continue;
      try { await rest.delete(Routes.guildRole(serverId, role.id)); }
      catch (e) { err(`역할 삭제 실패 (${role.name}): ${(e as Error).message}`); }
    }
  } catch (e) { err(`역할 목록 조회 실패: ${(e as Error).message}`); }

  // 4. 역할 생성
  for (const role of config.roles) {
    try {
      await rest.post(Routes.guildRoles(serverId), {
        body: {
          name: role.name, color: parseInt(role.color.replace("#", "") || "000000", 16) || 0,
          hoist: role.hoist, mentionable: role.mentionable,
        },
      });
      log(`역할 생성: ${role.name}`);
    } catch (e) { err(`역할 생성 실패 (${role.name}): ${(e as Error).message}`); }
  }

  // 5. 카테고리 생성
  const catMap: Record<string, string> = {};
  for (const cat of config.categories) {
    try {
      const created = await rest.post(Routes.guildChannels(serverId), {
        body: { name: cat.name, type: 4, position: cat.position },
      }) as { id: string };
      catMap[cat.id] = created.id;
      log(`카테고리 생성: ${cat.name}`);
    } catch (e) { err(`카테고리 생성 실패 (${cat.name}): ${(e as Error).message}`); }
  }

  // 6. 채널 생성
  for (const ch of config.channels) {
    try {
      await rest.post(Routes.guildChannels(serverId), {
        body: {
          name: ch.name, type: CHANNEL_TYPE[ch.type] ?? 0,
          parent_id: ch.category_id ? (catMap[ch.category_id] ?? undefined) : undefined,
          position: ch.position,
          topic: ch.type === "text" || ch.type === "announcement" ? (ch.topic ?? null) : undefined,
          nsfw: ch.nsfw, rate_limit_per_user: ch.slow_mode,
        },
      });
      log(`채널 생성: ${ch.name} (${ch.type})`);
    } catch (e) { err(`채널 생성 실패 (${ch.name}): ${(e as Error).message}`); }
  }

  return { applied, errors };
}

// ── sendApprovalDM: payments 라우터에서 직접 호출 ─────────────────────────────

export async function sendApprovalDM(
  paymentId: string,
  orderId: string,
  amount: number,
  serverName: string,
  developerName: string,
): Promise<void> {
  const { data: biniUser } = await supabaseAdmin
    .from("users").select("discord_id, username").eq("username", "bini2222").single();

  if (!biniUser?.discord_id) {
    throw new Error("bini2222 계정을 찾을 수 없습니다. bini2222이 DIRO에 로그인한 적이 있어야 합니다.");
  }

  const client = getDiscordClient();

  if (!client.isReady()) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => resolve(), 5000);
      client.once("clientReady", () => { clearTimeout(t); resolve(); });
    });
  }

  const discordUser = await client.users.fetch(biniUser.discord_id as string);

  const embed = new EmbedBuilder()
    .setTitle("🔔 DIRO 결제 승인 요청")
    .setColor(0x5865F2)
    .setDescription("개발자가 가격을 확정했습니다. 승인하면 신청자에게 송금 알림이 전송됩니다.")
    .addFields(
      { name: "📌 서버명", value: serverName, inline: true },
      { name: "💰 금액", value: `₩${amount.toLocaleString()}`, inline: true },
      { name: "👨‍💻 개발자", value: developerName, inline: true },
      { name: "🏦 토스 계좌", value: TOSS_ACCOUNT, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `주문 ID: ${orderId.slice(0, 8)}…` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`approve:${paymentId}`).setLabel("✅ 승인").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`reject:${paymentId}`).setLabel("❌ 거절").setStyle(ButtonStyle.Danger),
  );

  await discordUser.send({ embeds: [embed], components: [row] });
  console.log(`결제 승인 DM 전송 완료: paymentId=${paymentId}`);
}

// ── Discord 봇 초기화 ────────────────────────────────────────────────────────

export function initDiscordBot(): void {
  if (botInitialized) return;
  botInitialized = true;

  if (!botToken) {
    console.warn("DISCORD_BOT_TOKEN not set – Discord bot disabled");
    return;
  }

  const client = getDiscordClient();

  // ── 봇 준비 + 서버 목록 동기화 ──────────────────────────────────────────
  client.once("clientReady", async (readyClient) => {
    console.log(`Discord bot ready: ${readyClient.user.tag}`);

    const rows = readyClient.guilds.cache.map((g) => ({
      guild_id: g.id, guild_name: g.name, updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await supabaseAdmin.from("bot_guilds").upsert(rows);
      if (error) console.error(`[bot_guilds] 초기 동기화 실패: ${error.message}`);
      else console.log(`서버 ${rows.length}개 동기화 완료`);
    }
  });

  client.on("guildCreate", async (guild) => {
    await supabaseAdmin.from("bot_guilds").upsert({
      guild_id: guild.id, guild_name: guild.name, updated_at: new Date().toISOString(),
    });
    console.log(`봇 서버 참여: ${guild.name} (${guild.id})`);
  });

  client.on("guildDelete", async (guild) => {
    await supabaseAdmin.from("bot_guilds").delete().eq("guild_id", guild.id);
    console.log(`봇 서버 떠남: ${guild.name} (${guild.id})`);
  });

  // ── Discord 버튼 인터랙션: 결제 승인/거절 ───────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const colonIdx = interaction.customId.indexOf(":");
    if (colonIdx === -1) return;

    const action = interaction.customId.slice(0, colonIdx);
    const paymentId = interaction.customId.slice(colonIdx + 1);

    if (action === "approve") {
      try {
        const { data: payment, error } = await supabaseAdmin
          .from("payment_requests")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", paymentId).select().single();

        if (error || !payment) {
          await interaction.reply({ content: "❌ 오류: 결제 정보를 찾을 수 없습니다.", flags: 64 });
          return;
        }

        await supabaseAdmin.from("orders")
          .update({ status: "payment_pending", updated_at: new Date().toISOString() })
          .eq("id", payment.order_id);

        const { data: order } = await supabaseAdmin.from("orders")
          .select("user_id, order_number, server_name").eq("id", payment.order_id).single();

        if (order) {
          await supabaseAdmin.from("order_messages").insert({
            order_id: payment.order_id, sender_id: payment.counselor_id,
            content: `₩${Number(payment.amount).toLocaleString()} 송금 요청이 도착했습니다.`,
            type: "payment",
            metadata_json: JSON.stringify({
              amount: payment.amount, deeplink: payment.deeplink, payment_id: paymentId,
            }),
          });
          await supabaseAdmin.from("notifications").insert({
            user_id: order.user_id, type: "payment_request",
            title: `₩${Number(payment.amount).toLocaleString()} 결제 요청`,
            body: "채팅에서 송금하기 버튼을 눌러주세요", reference_id: payment.order_id,
          });
        }

        await interaction.reply({
          content: `✅ **승인 완료!** 신청자에게 송금 알림이 전송되었습니다.\n토스 계좌: \`${TOSS_ACCOUNT}\``,
          flags: 64,
        });
        console.log(`결제 승인 완료: ${paymentId}`);
      } catch (e) {
        console.error("결제 승인 처리 오류:", e);
        try { await interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 }); } catch { /* already replied */ }
      }
    } else if (action === "reject") {
      try {
        await supabaseAdmin.from("payment_requests")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", paymentId);
        await interaction.reply({ content: "❌ **거절 완료.** 개발자에게 별도로 알려주세요.", flags: 64 });
        console.log(`결제 거절 완료: ${paymentId}`);
      } catch (e) {
        console.error("결제 거절 처리 오류:", e);
        try { await interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 }); } catch { /* already replied */ }
      }
    }
  });

  // ── Realtime: payment_requests.status = 'awaiting_approval' → bini2222 DM ─
  supabaseAdmin
    .channel("payments-approval")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "payment_requests", filter: "status=eq.awaiting_approval" },
      async (payload) => {
        const payment = payload.new as {
          id: string; order_id: string; amount: number;
          counselor_id: string; notes: string | null;
        };
        console.log(`결제 승인 요청: ${payment.id} — ₩${Number(payment.amount).toLocaleString()}`);

        try {
          const { data: biniUser } = await supabaseAdmin
            .from("users").select("discord_id, username").eq("username", "bini2222").single();

          if (!biniUser?.discord_id) {
            console.warn("bini2222 discord_id 없음 — DM 전송 불가");
            return;
          }

          const { data: order } = await supabaseAdmin
            .from("orders").select("server_name").eq("id", payment.order_id).single();

          const developerName = payment.notes?.match(/개발자\((.+?)\)/)?.[1] ?? "개발자";

          if (!client.isReady()) {
            await new Promise<void>((resolve) => {
              const t = setTimeout(() => resolve(), 5000);
              client.once("clientReady", () => { clearTimeout(t); resolve(); });
            });
          }

          const discordUser = await client.users.fetch(biniUser.discord_id as string);

          const embed = new EmbedBuilder()
            .setTitle("🔔 DIRO 결제 승인 요청")
            .setColor(0x5865F2)
            .setDescription("개발자가 가격을 확정했습니다. 승인하면 신청자에게 송금 알림이 전송됩니다.")
            .addFields(
              { name: "📌 서버명", value: order?.server_name ?? "알 수 없음", inline: true },
              { name: "💰 금액", value: `₩${Number(payment.amount).toLocaleString()}`, inline: true },
              { name: "👨‍💻 개발자", value: developerName, inline: true },
              { name: "🏦 토스 계좌", value: TOSS_ACCOUNT, inline: false },
            )
            .setTimestamp()
            .setFooter({ text: `주문 ID: ${payment.order_id.slice(0, 8)}…` });

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`approve:${payment.id}`).setLabel("✅ 승인").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject:${payment.id}`).setLabel("❌ 거절").setStyle(ButtonStyle.Danger),
          );

          await discordUser.send({ embeds: [embed], components: [row] });
          console.log(`bini2222에게 결제 승인 DM 전송 완료: ${payment.id}`);
        } catch (e) {
          console.error("결제 DM 전송 오류:", (e as Error).message);
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED")    console.log("Realtime 연결됨 — 결제 승인 대기 중");
      if (status === "CHANNEL_ERROR") console.error("Realtime 연결 실패 (payments-approval)");
    });

  // ── Realtime: orders.status = 'applying' 감지 → Discord 서버 구조 적용 ────
  supabaseAdmin
    .channel("orders-apply")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders", filter: "status=eq.applying" },
      async (payload) => {
        const order = payload.new as {
          id: string; server_name: string; discord_server_id: string;
        };
        console.log(`서버 적용 요청: 주문 ${order.id} — ${order.server_name}`);

        if (!order.discord_server_id) {
          console.error("discord_server_id 없음 — 중단");
          await supabaseAdmin.from("orders")
            .update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
          return;
        }

        try {
          const { data: project, error: projErr } = await supabaseAdmin
            .from("server_projects").select("config_json").eq("order_id", order.id).single();

          if (projErr || !project?.config_json) {
            throw new Error(projErr?.message ?? "서버 설정 없음");
          }

          const rawConfig = JSON.parse(project.config_json);
          const { applied, errors } = await applyConfig(order.discord_server_id, rawConfig);

          await supabaseAdmin.from("server_projects")
            .update({ apply_result_json: JSON.stringify({ applied, errors }) }).eq("order_id", order.id);

          const finalStatus = errors.length > 0 && applied.length === 0 ? "failed" : "completed";
          await supabaseAdmin.from("orders")
            .update({ status: finalStatus, updated_at: new Date().toISOString() }).eq("id", order.id);

          console.log(`완료: ${applied.length}개 적용, ${errors.length}개 오류 (${finalStatus})`);
        } catch (e) {
          console.error("적용 중 오류:", (e as Error).message);
          await supabaseAdmin.from("server_projects")
            .update({ apply_result_json: JSON.stringify({ applied: [], errors: [(e as Error).message] }) })
            .eq("order_id", order.id);
          await supabaseAdmin.from("orders")
            .update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id);
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED")    console.log("Realtime 연결됨 — 서버 적용 대기 중");
      if (status === "CHANNEL_ERROR") console.error("Realtime 연결 실패 (orders-apply)");
    });

  console.log("Discord bot initialized and listening for interactions");
}

// Legacy: kept for backwards compatibility with the /discord/apply REST route
export interface ServerConfig {
  server: { name: string; icon?: string | null; banner?: string | null; description?: string | null; verification_level?: number };
  categories?: Array<{ id: string; name: string; position: number }>;
  channels?: Array<{ id: string; name: string; type: string; category_id?: string | null; position: number; topic?: string | null; nsfw?: boolean; slow_mode?: number }>;
  roles?: Array<{ id: string; name: string; color: string; position: number; hoist?: boolean; mentionable?: boolean; permissions?: number }>;
}

export async function applyServerConfig(
  serverId: string, config: ServerConfig,
): Promise<{ success: boolean; appliedItems: string[]; error: string | null }> {
  const result = await applyConfig(serverId, config);
  return {
    success: result.errors.length === 0 || result.applied.length > 0,
    appliedItems: result.applied,
    error: result.errors.length ? result.errors.join(", ") : null,
  };
}
