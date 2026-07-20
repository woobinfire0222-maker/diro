/**
 * DIRO Discord Bot
 * 
 * 실행:
 *   DISCORD_BOT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx ts-node bot.ts
 *
 * 필요 패키지:
 *   npm install discord.js @supabase/supabase-js dotenv
 *   npm install -D ts-node typescript @types/node
 */

import "dotenv/config";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

// ── 서버 초기화 (기존 내용 전체 삭제) ───────────────────────────────────────

const CHANNEL_TYPE: Record<string, number> = {
  text:         0,
  voice:        2,
  announcement: 5,
  forum:        15,
};

/** 지정 서버의 기존 채널·역할을 전부 삭제한 뒤 config대로 재생성 */
async function applyConfig(serverId: string, config: any) {
  const applied: string[] = [];
  const errors:  string[] = [];

  const log = (msg: string) => { applied.push(msg); console.log(`  ✓ ${msg}`); };
  const err = (msg: string) => { errors.push(msg);  console.error(`  ✗ ${msg}`); };

  // ── 1. 서버 정보 수정 ──────────────────────────────────────────────────────
  try {
    await rest.patch(Routes.guild(serverId), {
      body: {
        name:               config.server?.name        ?? undefined,
        description:        config.server?.description ?? null,
        verification_level: config.server?.verification_level ?? 0,
      },
    });
    log(`서버 이름: ${config.server?.name}`);
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

  // ── 3. 기존 역할 전부 삭제 (everyone · 관리봇 역할 제외) ─────────────────
  try {
    const guildRoles = await rest.get(Routes.guildRoles(serverId)) as any[];
    // 봇 자신의 역할 ID 수집 (삭제 불가)
    const botMember = await rest.get(Routes.guildMember(serverId, client.user!.id)) as any;
    const botRoleIds = new Set<string>(botMember.roles ?? []);

    for (const role of guildRoles) {
      // everyone, 관리 불가 역할, 봇 역할은 스킵
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
  const roleMap: Record<string, string> = {}; // config role id → discord role id

  for (const role of (config.roles ?? []).filter((r: any) => r.name !== "@everyone")) {
    try {
      const colorHex = role.color?.replace?.("#", "") ?? "000000";
      const created = await rest.post(Routes.guildRoles(serverId), {
        body: {
          name:        role.name,
          color:       parseInt(colorHex, 16) || 0,
          hoist:       role.hoist       ?? false,
          mentionable: role.mentionable ?? false,
        },
      }) as { id: string };
      roleMap[role.id] = created.id;
      log(`역할 생성: ${role.name}`);
    } catch (e) {
      err(`역할 생성 실패 (${role.name}): ${(e as Error).message}`);
    }
  }

  // ── 5. 카테고리 생성 ──────────────────────────────────────────────────────
  const catMap: Record<string, string> = {}; // config category id → discord channel id

  for (const cat of (config.categories ?? [])) {
    try {
      const created = await rest.post(Routes.guildChannels(serverId), {
        body: { name: cat.name, type: 4, position: cat.position ?? 0 },
      }) as { id: string };
      catMap[cat.id] = created.id;
      log(`카테고리 생성: ${cat.name}`);
    } catch (e) {
      err(`카테고리 생성 실패 (${cat.name}): ${(e as Error).message}`);
    }
  }

  // ── 6. 채널 생성 ──────────────────────────────────────────────────────────
  for (const ch of (config.channels ?? [])) {
    try {
      await rest.post(Routes.guildChannels(serverId), {
        body: {
          name:                ch.name,
          type:                CHANNEL_TYPE[ch.type] ?? 0,
          parent_id:           ch.category_id ? (catMap[ch.category_id] ?? undefined) : undefined,
          position:            ch.position    ?? 0,
          topic:               ch.topic       ?? null,
          nsfw:                ch.nsfw        ?? false,
          rate_limit_per_user: ch.slow_mode   ?? 0,
        },
      });
      log(`채널 생성: ${ch.name} (${ch.type})`);
    } catch (e) {
      err(`채널 생성 실패 (${ch.name}): ${(e as Error).message}`);
    }
  }

  return { applied, errors };
}

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
        await supabase.from("orders")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", order.id);
        return;
      }

      try {
        // 서버 설정 조회
        const { data: project, error: projErr } = await supabase
          .from("server_projects")
          .select("config_json")
          .eq("order_id", order.id)
          .single();

        if (projErr || !project?.config_json) {
          throw new Error(projErr?.message ?? "서버 설정 없음");
        }

        const config = JSON.parse(project.config_json);

        // 기존 내용 지우고 새로 생성
        const { applied, errors } = await applyConfig(order.discord_server_id, config);

        // 결과 저장
        await supabase.from("server_projects")
          .update({ apply_result_json: JSON.stringify({ applied, errors }) })
          .eq("order_id", order.id);

        // 완료 처리
        const finalStatus = errors.length === applied.length ? "failed" : "completed";
        await supabase.from("orders")
          .update({ status: finalStatus, updated_at: new Date().toISOString() })
          .eq("id", order.id);

        console.log(`\n${finalStatus === "completed" ? "✅" : "⚠️"} 완료: ${applied.length}개 적용, ${errors.length}개 오류`);

      } catch (err) {
        console.error("❌ 적용 중 오류:", (err as Error).message);
        await supabase.from("server_projects")
          .update({ apply_result_json: JSON.stringify({ applied: [], errors: [(err as Error).message] }) })
          .eq("order_id", order.id)
          .then(() =>
            supabase.from("orders")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("id", order.id)
          );
      }
    },
  )
  .subscribe((status) => {
    if (status === "SUBSCRIBED")  console.log("✅ Realtime 연결됨 — 전송 대기 중");
    if (status === "CHANNEL_ERROR") console.error("❌ Realtime 연결 실패");
  });

client.login(TOKEN);
