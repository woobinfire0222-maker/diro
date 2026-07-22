// Supabase Edge Function: send-payment-dm
// Triggered by: Supabase DB Webhook on payment_requests table (INSERT)
// Purpose: When a new payment_request is inserted with status = 'awaiting_approval',
//          send a DM to bini2222 on Discord with Approve/Reject buttons.

import { createClient } from "npm:@supabase/supabase-js@2";

const DISCORD_API = "https://discord.com/api/v10";
const TOSS_ACCOUNT = "190839534245";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const botToken = Deno.env.get("DISCORD_BOT_TOKEN")!;

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

  const record = body.record ?? body;
  const { id: paymentId, order_id: orderId, amount, notes, status } = record;

  // status = 'awaiting_approval' 인 경우에만 처리
  if (status !== "awaiting_approval") {
    return new Response(JSON.stringify({ skipped: true, status }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`결제 승인 DM 전송 시작: paymentId=${paymentId}, amount=₩${amount}`);

  try {
    // bini2222의 discord_id 조회
    const { data: biniUser } = await supabase
      .from("users")
      .select("discord_id, username")
      .eq("username", "bini2222")
      .single();

    if (!biniUser?.discord_id) {
      throw new Error("bini2222 discord_id 없음 — DIRO에 Discord 로그인한 적이 있어야 합니다");
    }

    // 주문 정보 조회
    const { data: order } = await supabase
      .from("orders")
      .select("server_name")
      .eq("id", orderId)
      .single();

    const developerName = notes?.match(/개발자\((.+?)\)/)?.[1] ?? "개발자";
    const serverName = order?.server_name ?? "알 수 없음";

    // DM 채널 생성 (또는 기존 채널 반환)
    const dmChannel: any = await discordFetch("/users/@me/channels", {
      method: "POST",
      body: JSON.stringify({ recipient_id: biniUser.discord_id }),
    });

    // DM 전송 (임베드 + 버튼)
    await discordFetch(`/channels/${dmChannel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        embeds: [
          {
            title: "🔔 DIRO 결제 승인 요청",
            color: 0x5865f2,
            description: "개발자가 가격을 확정했습니다. 승인하면 신청자에게 송금 알림이 전송됩니다.",
            fields: [
              { name: "📌 서버명",    value: serverName,                          inline: true },
              { name: "💰 금액",      value: `₩${Number(amount).toLocaleString()}`, inline: true },
              { name: "👨‍💻 개발자",   value: developerName,                       inline: true },
              { name: "🏦 토스 계좌", value: TOSS_ACCOUNT,                         inline: false },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `주문 ID: ${orderId.slice(0, 8)}…` },
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3, // SUCCESS (green)
                label: "✅ 승인",
                custom_id: `approve:${paymentId}`,
              },
              {
                type: 2,
                style: 4, // DANGER (red)
                label: "❌ 거절",
                custom_id: `reject:${paymentId}`,
              },
            ],
          },
        ],
      }),
    });

    console.log(`bini2222에게 결제 승인 DM 전송 완료: paymentId=${paymentId}`);

    return new Response(JSON.stringify({ success: true, paymentId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("결제 DM 전송 오류:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
