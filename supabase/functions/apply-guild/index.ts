// Supabase Edge Function: apply-guild
// Triggered by: Supabase DB Webhook on orders table (UPDATE)
// Purpose: When orders.status = 'applying', apply the server config to Discord

import { createClient } from "npm:@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";
const CHANNEL_TYPE: Record<string, number> = {
  text: 0,
  voice: 2,
  announcement: 5,
  stage: 13,
  forum: 15,
  media: 16,
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const botToken = Deno.env.get("DISCORD_BOT_TOKEN")!;

// ── Discord REST helper ────────────────────────────────────────────────────
async function discordFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Config 정규화 ──────────────────────────────────────────────────────────
function normalizeConfig(raw: any) {
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
      id: String(r.id),
      name: r.name,
      color: r.color ?? "#000000",
      hoist: r.hoist ?? false,
      mentionable: r.mentionable ?? false,
    }));

  const categories: any[] = [];
  const channels: any[] = [];

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

// ── Discord 서버 구조 적용 ─────────────────────────────────────────────────
async function applyConfig(serverId: string, rawConfig: any) {
  const config = normalizeConfig(rawConfig);
  const applied: string[] = [];
  const errors: string[] = [];

  // 1. 서버 정보 수정
  try {
    await discordFetch(`/guilds/${serverId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: config.server.name,
        description: config.server.description,
        verification_level: config.server.verification_level,
      }),
    });
    applied.push(`서버 이름: ${config.server.name}`);
  } catch (e) { errors.push(`서버 이름 수정 실패: ${(e as Error).message}`); }

  // 2. 기존 채널 전부 삭제
  try {
    const guildChannels: any[] = await discordFetch(`/guilds/${serverId}/channels`);
    for (const ch of guildChannels) {
      try {
        await discordFetch(`/channels/${ch.id}`, { method: "DELETE" });
      } catch (e) { errors.push(`채널 삭제 실패 (${ch.name}): ${(e as Error).message}`); }
    }
  } catch (e) { errors.push(`채널 목록 조회 실패: ${(e as Error).message}`); }

  // 3. 기존 역할 삭제 (everyone·봇 관리 역할 제외)
  try {
    const guildRoles: any[] = await discordFetch(`/guilds/${serverId}/roles`);
    // 봇 자신의 멤버 정보 가져오기
    const botUser: any = await discordFetch("/users/@me");
    const botMember: any = await discordFetch(`/guilds/${serverId}/members/${botUser.id}`);
    const botRoleIds = new Set<string>(botMember.roles ?? []);

    for (const role of guildRoles) {
      if (role.name === "@everyone" || role.managed || botRoleIds.has(role.id)) continue;
      try {
        await discordFetch(`/guilds/${serverId}/roles/${role.id}`, { method: "DELETE" });
      } catch (e) { errors.push(`역할 삭제 실패 (${role.name}): ${(e as Error).message}`); }
    }
  } catch (e) { errors.push(`역할 목록 조회 실패: ${(e as Error).message}`); }

  // 4. 역할 생성
  for (const role of config.roles) {
    try {
      await discordFetch(`/guilds/${serverId}/roles`, {
        method: "POST",
        body: JSON.stringify({
          name: role.name,
          color: parseInt(role.color.replace("#", "") || "000000", 16) || 0,
          hoist: role.hoist,
          mentionable: role.mentionable,
        }),
      });
      applied.push(`역할 생성: ${role.name}`);
    } catch (e) { errors.push(`역할 생성 실패 (${role.name}): ${(e as Error).message}`); }
  }

  // 5. 카테고리 생성
  const catMap: Record<string, string> = {};
  for (const cat of config.categories) {
    try {
      const created: any = await discordFetch(`/guilds/${serverId}/channels`, {
        method: "POST",
        body: JSON.stringify({ name: cat.name, type: 4, position: cat.position }),
      });
      catMap[cat.id] = created.id;
      applied.push(`카테고리 생성: ${cat.name}`);
    } catch (e) { errors.push(`카테고리 생성 실패 (${cat.name}): ${(e as Error).message}`); }
  }

  // 6. 채널 생성
  for (const ch of config.channels) {
    try {
      await discordFetch(`/guilds/${serverId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: ch.name,
          type: CHANNEL_TYPE[ch.type] ?? 0,
          parent_id: ch.category_id ? (catMap[ch.category_id] ?? undefined) : undefined,
          position: ch.position,
          topic: ch.type === "text" || ch.type === "announcement" ? (ch.topic ?? null) : undefined,
          nsfw: ch.nsfw,
          rate_limit_per_user: ch.slow_mode,
        }),
      });
      applied.push(`채널 생성: ${ch.name} (${ch.type})`);
    } catch (e) { errors.push(`채널 생성 실패 (${ch.name}): ${(e as Error).message}`); }
  }

  return { applied, errors };
}

// ── Edge Function 핸들러 ───────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // DB Webhook payload: { type, table, record, old_record }
  const record = body.record ?? body;
  const orderId: string = record.id;
  const status: string = record.status;
  const discordServerId: string = record.discord_server_id;

  // status = 'applying' 인 경우에만 처리
  if (status !== "applying") {
    return new Response(JSON.stringify({ skipped: true, status }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`서버 적용 시작: 주문 ${orderId} — discord_server_id=${discordServerId}`);

  if (!discordServerId) {
    await supabase.from("orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", orderId);
    return new Response(JSON.stringify({ error: "discord_server_id 없음" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { data: project, error: projErr } = await supabase
      .from("server_projects")
      .select("config_json")
      .eq("order_id", orderId)
      .single();

    if (projErr || !project?.config_json) {
      throw new Error(projErr?.message ?? "서버 설정 없음");
    }

    const rawConfig = JSON.parse(project.config_json);
    const { applied, errors } = await applyConfig(discordServerId, rawConfig);

    await supabase.from("server_projects")
      .update({ apply_result_json: JSON.stringify({ applied, errors }) })
      .eq("order_id", orderId);

    const finalStatus = errors.length > 0 && applied.length === 0 ? "failed" : "completed";
    await supabase.from("orders")
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);

    console.log(`완료: ${applied.length}개 적용, ${errors.length}개 오류 (${finalStatus})`);

    return new Response(JSON.stringify({ finalStatus, applied, errors }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("적용 중 오류:", msg);

    await supabase.from("server_projects")
      .update({ apply_result_json: JSON.stringify({ applied: [], errors: [msg] }) })
      .eq("order_id", orderId);
    await supabase.from("orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", orderId);

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
