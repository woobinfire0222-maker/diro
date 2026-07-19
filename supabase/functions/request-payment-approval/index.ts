/**
 * Supabase Edge Function: request-payment-approval
 *
 * 개발자가 금액을 확정하고 bini2222에게 Discord DM으로 결제 승인 요청을 보냅니다.
 *
 * Required Supabase secrets:
 *   DISCORD_BOT_TOKEN
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendDiscordDM(botToken: string, recipientDiscordId: string, content: string) {
  // 1. DM 채널 생성
  const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: recipientDiscordId }),
  });
  if (!dmRes.ok) {
    const t = await dmRes.text();
    throw new Error(`DM 채널 생성 실패: ${t}`);
  }
  const { id: channelId } = await dmRes.json();

  // 2. 메시지 전송
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!msgRes.ok) {
    const t = await msgRes.text();
    throw new Error(`메시지 전송 실패: ${t}`);
  }
  return await msgRes.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 인증 ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Unauthorized", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");

    // 사용자 JWT 검증
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return err("Unauthorized", 401);

    const { data: profile } = await userClient.from("users").select("role").eq("id", user.id).single();
    if (!profile || !["developer", "counselor", "admin"].includes(profile.role)) {
      return err("Forbidden: 개발자 이상 권한 필요", 403);
    }

    // ── 요청 파싱 ──────────────────────────────────────────────────────────
    const { order_id, amount } = await req.json() as { order_id?: string; amount?: number };
    if (!order_id || !amount || amount <= 0) return err("order_id와 유효한 amount가 필요합니다.");

    // ── service role 클라이언트 (RLS 우회) ───────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey);

    // 주문 정보 조회
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*, _user:users!user_id(username, display_name), _dev:users!developer_id(username)")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) return err("주문을 찾을 수 없습니다.", 404);

    // 중복 결제 요청 방지
    const { data: existing } = await admin
      .from("payment_requests")
      .select("id, status")
      .eq("order_id", order_id)
      .in("status", ["pending", "awaiting_approval", "approved"])
      .maybeSingle();
    if (existing) return err("이미 처리 중인 결제 요청이 있습니다.");

    // ── 결제 요청 레코드 생성 ───────────────────────────────────────────
    const { data: payReq, error: prErr } = await admin
      .from("payment_requests")
      .insert({
        order_id,
        user_id: user.id,
        amount,
        status: "awaiting_approval",
        notes: `개발자 ${profile.role} 가격 확정`,
      })
      .select()
      .single();
    if (prErr || !payReq) throw new Error(prErr?.message || "결제 요청 생성 실패");

    // ── 주문 상태 → payment_pending ─────────────────────────────────────
    await admin
      .from("orders")
      .update({ status: "payment_pending", price: amount, updated_at: new Date().toISOString() })
      .eq("id", order_id);

    // ── Discord DM (선택: 토큰 없으면 건너뜀) ───────────────────────────
    let discordSent = false;
    if (botToken) {
      try {
        // bini2222 의 discord_id 조회
        const { data: adminUser } = await admin
          .from("users")
          .select("discord_id, username")
          .eq("username", "bini2222")
          .maybeSingle();

        if (adminUser?.discord_id) {
          const serverName = order.server_name;
          const clientName = (order._user as { username?: string; display_name?: string })?.display_name
            || (order._user as { username?: string })?.username
            || "고객";
          const devName = (order._dev as { username?: string })?.username || profile.role;

          const dmContent = [
            "━━━━━━━━━━━━━━━━━━━━━━",
            "💰 **결제 승인 요청이 도착했습니다**",
            "━━━━━━━━━━━━━━━━━━━━━━",
            `📋 주문번호: \`${order.order_number}\``,
            `🖥️ 서버명: **${serverName}**`,
            `👤 고객: ${clientName}`,
            `👨‍💻 개발자: ${devName}`,
            `💵 금액: **₩${Number(amount).toLocaleString("ko-KR")}**`,
            "",
            "DIRO 관리자 패널에서 승인 후 토스 결제 링크를 고객에게 전달해주세요.",
            "━━━━━━━━━━━━━━━━━━━━━━",
          ].join("\n");

          await sendDiscordDM(botToken, adminUser.discord_id, dmContent);
          discordSent = true;
        }
      } catch (dmErr) {
        // DM 실패는 치명적이지 않음 — 결제 요청은 이미 생성됨
        console.error("Discord DM 전송 실패 (비치명적):", dmErr);
      }
    }

    return ok({
      success: true,
      payment_request_id: payReq.id,
      discord_notified: discordSent,
      message: discordSent
        ? "결제 요청이 생성되고 Discord DM이 전송되었습니다."
        : "결제 요청이 생성되었습니다. (Discord DM 미설정)",
    });
  } catch (e) {
    const error = e as Error;
    console.error("request-payment-approval 오류:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
