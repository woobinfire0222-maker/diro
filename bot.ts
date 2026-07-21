/**
 * DIRO Discord Bot
 *
 * 실행:
 *   DISCORD_BOT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx bot.ts
 *
 * 필요 패키지:
 *   npm install discord.js @supabase/supabase-js dotenv
 *   npm install -D tsx typescript @types/node
 */

import "dotenv/config";
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
import { createClient } from "@supabase/supabase-js";

// ── 환경 변수 ─────────────────────────────────────────────────────────────────

const TOKEN    = process.env.DISCORD_BOT_TOKEN!;
const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!TOKEN || !SUPA_URL || !SUPA_KEY) {
  console.error("❌ 환경 변수 누락: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const supabase = createClient(SUPA_URL, SUPA_KEY);
const rest     = new REST({ version: "10" }).setToken(TOKEN);

const TOSS_ACCOUNT = "190839534245";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

// ── 서버 목록 동기화 ──────────────────────────────────────────────────────────

async function syncGuild(id: string, name: string) {
  const { error } = await supabase
    .from("bot_guilds")
    .upsert({ guild_id: id, guild_name: name, updated_at: new Date().toISOString() });
  if (error) console.error(`[bot_guilds] upsert 실패: ${error.message}`);
}

async function removeGuild(id: string) {
  const { error } = await supabase.from("bot_guilds").delete().eq("guild_id", id);
  if (error) console.error(`[bot_guilds] delete 실패: ${error.message}`);
}

client.once("clientReady", async (c) => {
  console.log(`✅ 봇 준비: ${c.user.tag}`);

  const rows = c.guilds.cache.map((g) => ({
    guild_id:   g.id,
    guild_name: g.name,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await supabase.from("bot_guilds").upsert(rows);
    if (error) console.error(`[bot_guilds] 초기 동기화 실패: ${error.message}`);
    else console.log(`📋 서버 ${rows.length}개 동기화 완료`);
  }
});

client.on("guildCreate", async (guild) => {
  console.log(`📥 새 서버 참여: ${guild.name} (${guild.id})`);
  await syncGuild(guild.id, guild.name);
});

client.on("guildDelete", async (guild) => {
  console.log(`📤 서버 떠남: ${guild.name} (${guild.id})`);
  await removeGuild(guild.id);
});

// ── 채널 타입 매핑 ────────────────────────────────────────────────────────────

const CHANNEL_TYPE: Record<string, number> = {
  text:         0,
  voice:        2,
  announcement: 5,
  stage:        13,
  forum:        15,
  media:        16,
};

// ── ServerEditor config 형식 파싱 ─────────────────────────────────────────────
//
// ServerEditor는 채널을 카테고리 안에 중첩해서 저장합니다:
//   config.categories[].channels[]
//
// bot이 필요한 형식:
//   flat categories  → config.categories (channels 없는 메타만)
//   flat channels    → category_id 참조 포함
//
// 이 함수가 두 형식 모두 처리합니다.

interface NormalizedConfig {
  server: {
    name:               string;
    description:        string | null;
    verification_level: number;
  };
  roles: Array<{
    id:          string;
    name:        string;
    color:       string;
    hoist:       boolean;
    mentionable: boolean;
  }>;
  categories: Array<{
    id:       string;
    name:     string;
    position: number;
  }>;
  channels: Array<{
    id:          string;
    name:        string;
    type:        string;
    category_id: string | null;
    position:    number;
    topic:       string | null;
    nsfw:        boolean;
    slow_mode:   number;
  }>;
}

function normalizeConfig(raw: any): NormalizedConfig {
  // server info ─ ServerEditor uses serverName / serverDescription
  const server = {
    name:               raw.serverName  ?? raw.server?.name  ?? "DIRO 서버",
    description:        raw.serverDescription ?? raw.server?.description ?? null,
    verification_level: (() => {
      const vl = raw.verificationLevel ?? raw.server?.verification_level ?? "none";
      const map: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, "very_high": 4 };
      return typeof vl === "number" ? vl : (map[vl] ?? 0);
    })(),
  };

  // roles
  const roles = (raw.roles ?? [])
    .filter((r: any) => r.name !== "@everyone")
    .map((r: any) => ({
      id:          String(r.id),
      name:        r.name,
      color:       r.color ?? "#000000",
      hoist:       r.hoist       ?? false,
      mentionable: r.mentionable ?? false,
    }));

  // categories + channels ─ handle both nested and flat formats
  const categories: NormalizedConfig["categories"] = [];
  const channels:   NormalizedConfig["channels"]   = [];

  if (Array.isArray(raw.categories)) {
    raw.categories.forEach((cat: any, catIdx: number) => {
      categories.push({
        id:       String(cat.id),
        name:     cat.name,
        position: cat.position ?? catIdx,
      });

      // nested channels inside each category (ServerEditor format)
      if (Array.isArray(cat.channels)) {
        cat.channels.forEach((ch: any, chIdx: number) => {
          channels.push({
            id:          String(ch.id),
            name:        ch.name,
            type:        ch.type ?? "text",
            category_id: String(cat.id),
            position:    ch.position ?? chIdx,
            topic:       ch.topic    ?? null,
            nsfw:        ch.nsfw     ?? false,
            slow_mode:   ch.slowmode ?? ch.slow_mode ?? 0,
          });
        });
      }
    });
  }

  // flat channels at top level (older format or channels outside categories)
  if (Array.isArray(raw.channels)) {
    raw.channels.forEach((ch: any, chIdx: number) => {
      // avoid duplicates already added from nested
      if (!channels.find((c) => c.id === String(ch.id))) {
        channels.push({
          id:          String(ch.id),
          name:        ch.name,
          type:        ch.type ?? "text",
          category_id: ch.category_id ? String(ch.category_id) : null,
          position:    ch.position ?? chIdx,
          topic:       ch.topic    ?? null,
          nsfw:        ch.nsfw     ?? false,
          slow_mode:   ch.slowmode ?? ch.slow_mode ?? 0,
        });
      }
    });
  }

  return { server, roles, categories, channels };
}

// ── 서버 초기화 후 재생성 ────────────────────────────────────────────────────

async function applyConfig(serverId: string, rawConfig: any) {
  const config  = normalizeConfig(rawConfig);
  const applied: string[] = [];
  const errors:  string[] = [];

  const log = (msg: string) => { applied.push(msg); console.log(`  ✓ ${msg}`); };
  const err = (msg: string) => { errors.push(msg);  console.error(`  ✗ ${msg}`); };

  // ── 1. 서버 정보 수정 ──────────────────────────────────────────────────────
  try {
    await rest.patch(Routes.guild(serverId), {
      body: {
        name:               config.server.name,
        description:        config.server.description,
        verification_level: config.server.verification_level,
      },
    });
    log(`서버 이름: ${config.server.name}`);
  } catch (e) {
    err(`서버 이름 수정 실패: ${(e as Error).message}`);
  }

  // ── 2. 기존 채널 전부 삭제 ────────────────────────────────────────────────
  try {
    const guildChannels = await rest.get(Routes.guildChannels(serverId)) as any[];
    for (const ch of guildChannels) {
      try {
        await rest.delete(`/channels/${ch.id}` as any);
        console.log(`  🗑️ 채널 삭제: ${ch.name}`);
      } catch (e) {
        err(`채널 삭제 실패 (${ch.name}): ${(e as Error).message}`);
      }
    }
  } catch (e) {
    err(`채널 목록 조회 실패: ${(e as Error).message}`);
  }

  // ── 3. 기존 역할 전부 삭제 (everyone · 봇 관리 역할 제외) ─────────────────
  try {
    const guildRoles = await rest.get(Routes.guildRoles(serverId)) as any[];
    const botMember  = await rest.get(Routes.guildMember(serverId, client.user!.id)) as any;
    const botRoleIds = new Set<string>(botMember.roles ?? []);

    for (const role of guildRoles) {
      if (role.name === "@everyone" || role.managed || botRoleIds.has(role.id)) continue;
      try {
        await rest.delete(Routes.guildRole(serverId, role.id));
        console.log(`  🗑️ 역할 삭제: ${role.name}`);
      } catch (e) {
        err(`역할 삭제 실패 (${role.name}): ${(e as Error).message}`);
      }
    }
  } catch (e) {
    err(`역할 목록 조회 실패: ${(e as Error).message}`);
  }

  // ── 4. 역할 생성 ──────────────────────────────────────────────────────────
  const roleMap: Record<string, string> = {};

  for (const role of config.roles) {
    try {
      const colorHex = role.color.replace("#", "") || "000000";
      const created  = await rest.post(Routes.guildRoles(serverId), {
        body: {
          name:        role.name,
          color:       parseInt(colorHex, 16) || 0,
          hoist:       role.hoist,
          mentionable: role.mentionable,
        },
      }) as { id: string };
      roleMap[role.id] = created.id;
      log(`역할 생성: ${role.name}`);
    } catch (e) {
      err(`역할 생성 실패 (${role.name}): ${(e as Error).message}`);
    }
  }

  // ── 5. 카테고리 생성 ──────────────────────────────────────────────────────
  const catMap: Record<string, string> = {};

  for (const cat of config.categories) {
    try {
      const created = await rest.post(Routes.guildChannels(serverId), {
        body: { name: cat.name, type: 4, position: cat.position },
      }) as { id: string };
      catMap[cat.id] = created.id;
      log(`카테고리 생성: ${cat.name}`);
    } catch (e) {
      err(`카테고리 생성 실패 (${cat.name}): ${(e as Error).message}`);
    }
  }

  // ── 6. 채널 생성 ──────────────────────────────────────────────────────────
  for (const ch of config.channels) {
    try {
      const discordType = CHANNEL_TYPE[ch.type] ?? 0;
      const parentId    = ch.category_id ? (catMap[ch.category_id] ?? undefined) : undefined;

      await rest.post(Routes.guildChannels(serverId), {
        body: {
          name:                ch.name,
          type:                discordType,
          parent_id:           parentId,
          position:            ch.position,
          topic:               ch.type === "text" || ch.type === "announcement" ? (ch.topic ?? null) : undefined,
          nsfw:                ch.nsfw,
          rate_limit_per_user: ch.slow_mode,
        },
      });
      log(`채널 생성: ${ch.name} (${ch.type})`);
    } catch (e) {
      err(`채널 생성 실패 (${ch.name}): ${(e as Error).message}`);
    }
  }

  return { applied, errors };
}

// ── Discord 버튼 인터랙션: 결제 승인 / 거절 ───────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const colonIdx = interaction.customId.indexOf(":");
  if (colonIdx === -1) return;

  const action    = interaction.customId.slice(0, colonIdx);
  const paymentId = interaction.customId.slice(colonIdx + 1);

  if (action === "approve") {
    try {
      const { data: payment, error } = await supabase
        .from("payment_requests")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", paymentId)
        .select()
        .single();

      if (error || !payment) {
        await interaction.reply({ content: "❌ 오류: 결제 정보를 찾을 수 없습니다.", flags: 64 });
        return;
      }

      await supabase
        .from("orders")
        .update({ status: "payment_pending", updated_at: new Date().toISOString() })
        .eq("id", payment.order_id);

      const { data: order } = await supabase
        .from("orders")
        .select("user_id, order_number, server_name")
        .eq("id", payment.order_id)
        .single();

      if (order) {
        await supabase.from("order_messages").insert({
          order_id:      payment.order_id,
          sender_id:     payment.counselor_id,
          content:       `₩${Number(payment.amount).toLocaleString()} 송금 요청이 도착했습니다.`,
          type:          "payment",
          metadata_json: JSON.stringify({
            amount:     payment.amount,
            deeplink:   payment.deeplink,
            payment_id: paymentId,
          }),
        });

        await supabase.from("notifications").insert({
          user_id:      order.user_id,
          type:         "payment_request",
          title:        `₩${Number(payment.amount).toLocaleString()} 결제 요청`,
          body:         "채팅에서 송금하기 버튼을 눌러주세요",
          reference_id: payment.order_id,
        });
      }

      await interaction.reply({
        content: `✅ **승인 완료!** 신청자에게 송금 알림이 전송되었습니다.\n토스 계좌: \`${TOSS_ACCOUNT}\``,
        flags:   64,
      });
      console.log(`✅ 결제 승인 완료: ${paymentId}`);
    } catch (e) {
      console.error("결제 승인 처리 오류:", (e as Error).message);
      try { await interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 }); } catch { /* already replied */ }
    }

  } else if (action === "reject") {
    try {
      await supabase
        .from("payment_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", paymentId);

      await interaction.reply({ content: "❌ **거절 완료.** 개발자에게 별도로 알려주세요.", flags: 64 });
      console.log(`❌ 결제 거절 완료: ${paymentId}`);
    } catch (e) {
      console.error("결제 거절 처리 오류:", (e as Error).message);
      try { await interaction.reply({ content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 }); } catch { /* already replied */ }
    }
  }
});

// ── Realtime: payment_requests.status = 'awaiting_approval' → bini2222 DM ────

supabase
  .channel("payments-approval")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "payment_requests", filter: "status=eq.awaiting_approval" },
    async (payload) => {
      const payment = payload.new as {
        id:           string;
        order_id:     string;
        amount:       number;
        counselor_id: string;
        notes:        string | null;
      };

      console.log(`\n🔔 결제 승인 요청: ${payment.id} — ₩${Number(payment.amount).toLocaleString()}`);

      try {
        // bini2222의 discord_id 조회
        const { data: biniUser } = await supabase
          .from("users")
          .select("discord_id, username")
          .eq("username", "bini2222")
          .single();

        if (!biniUser?.discord_id) {
          console.warn("bini2222 discord_id 없음 — DM 전송 불가");
          return;
        }

        // 주문 정보 조회
        const { data: order } = await supabase
          .from("orders")
          .select("server_name, user_id")
          .eq("id", payment.order_id)
          .single();

        const developerName = payment.notes?.match(/개발자\((.+?)\)/)?.[1] ?? "개발자";

        if (!client.isReady()) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(() => resolve(), 5000);
            client.once("clientReady", () => { clearTimeout(t); resolve(); });
          });
        }

        const discordUser = await client.users.fetch(biniUser.discord_id);

        const embed = new EmbedBuilder()
          .setTitle("🔔 DIRO 결제 승인 요청")
          .setColor(0x5865F2)
          .setDescription("개발자가 가격을 확정했습니다. 승인하면 신청자에게 송금 알림이 전송됩니다.")
          .addFields(
            { name: "📌 서버명",  value: order?.server_name ?? "알 수 없음", inline: true },
            { name: "💰 금액",    value: `₩${Number(payment.amount).toLocaleString()}`, inline: true },
            { name: "👨‍💻 개발자", value: developerName, inline: true },
            { name: "🏦 토스 계좌", value: TOSS_ACCOUNT, inline: false },
          )
          .setTimestamp()
          .setFooter({ text: `주문 ID: ${payment.order_id.slice(0, 8)}…` });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve:${payment.id}`)
            .setLabel("✅ 승인")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`reject:${payment.id}`)
            .setLabel("❌ 거절")
            .setStyle(ButtonStyle.Danger),
        );

        await discordUser.send({ embeds: [embed], components: [row] });
        console.log(`✅ bini2222에게 결제 승인 DM 전송 완료: ${payment.id}`);
      } catch (e) {
        console.error("결제 DM 전송 오류:", (e as Error).message);
      }
    },
  )
  .subscribe((status) => {
    if (status === "SUBSCRIBED")    console.log("✅ Realtime 연결됨 — 결제 승인 대기 중");
    if (status === "CHANNEL_ERROR") console.error("❌ Realtime 연결 실패 (payments-approval)");
  });

// ── Realtime: orders.status = 'applying' 감지 ────────────────────────────────

supabase
  .channel("orders-apply")
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "orders", filter: "status=eq.applying" },
    async (payload) => {
      const order = payload.new as {
        id:                string;
        server_name:       string;
        discord_server_id: string;
      };

      console.log(`\n🔔 서버 적용 요청: 주문 ${order.id} — ${order.server_name}`);

      if (!order.discord_server_id) {
        console.error("❌ discord_server_id 없음 — 중단");
        await supabase
          .from("orders")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", order.id);
        return;
      }

      try {
        const { data: project, error: projErr } = await supabase
          .from("server_projects")
          .select("config_json")
          .eq("order_id", order.id)
          .single();

        if (projErr || !project?.config_json) {
          throw new Error(projErr?.message ?? "서버 설정 없음");
        }

        const rawConfig = JSON.parse(project.config_json);
        const { applied, errors } = await applyConfig(order.discord_server_id, rawConfig);

        await supabase
          .from("server_projects")
          .update({ apply_result_json: JSON.stringify({ applied, errors }) })
          .eq("order_id", order.id);

        // 오류가 있어도 일부라도 성공하면 completed
        const finalStatus = errors.length > 0 && applied.length === 0 ? "failed" : "completed";

        await supabase
          .from("orders")
          .update({ status: finalStatus, updated_at: new Date().toISOString() })
          .eq("id", order.id);

        console.log(
          `\n${finalStatus === "completed" ? "✅" : "⚠️"} 완료: ${applied.length}개 적용, ${errors.length}개 오류`,
        );
      } catch (e) {
        console.error("❌ 적용 중 오류:", (e as Error).message);
        await supabase
          .from("server_projects")
          .update({
            apply_result_json: JSON.stringify({ applied: [], errors: [(e as Error).message] }),
          })
          .eq("order_id", order.id);
        await supabase
          .from("orders")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", order.id);
      }
    },
  )
  .subscribe((status) => {
    if (status === "SUBSCRIBED")   console.log("✅ Realtime 연결됨 — 전송 대기 중");
    if (status === "CHANNEL_ERROR") console.error("❌ Realtime 연결 실패");
  });

client.login(TOKEN);
