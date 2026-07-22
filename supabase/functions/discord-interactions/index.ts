// Supabase Edge Function: discord-interactions
// Registered as: Discord Application → Interactions Endpoint URL
// Purpose: Handles button interactions (Approve / Reject payment)
//          verify_jwt = false (public endpoint — Discord verifies with Ed25519)

import { createClient } from "npm:@supabase/supabase-js@2";
import nacl from "npm:tweetnacl@1";

const DISCORD_API = "https://discord.com/api/v10";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const botToken       = Deno.env.get("DISCORD_BOT_TOKEN")!;
const discordPubKey  = Deno.env.get("DISCORD_PUBLIC_KEY")!; // Discord Developer Portal → App → General → Public Key

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

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
  // Some endpoints (DELETE) return 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

const TOSS_ACCOUNT = "190839534245";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    return new Response("Missing signature headers", { status: 401 });
  }

  const rawBody = await req.text();

  // ── Discord Ed25519 서명 검증 ────────────────────────────────────────────
  try {
    const isValid = nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToUint8Array(signature),
      hexToUint8Array(discordPubKey),
    );
    if (!isValid) {
      return new Response("Invalid request signature", { status: 401 });
    }
  } catch {
    return new Response("Signature verification error", { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // ── PING (Discord가 연결 확인 시 전송) ───────────────────────────────────
  if (interaction.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── 버튼 인터랙션 (type=3, component_type=2) ────────────────────────────
  if (interaction.type === 3 && interaction.data?.component_type === 2) {
    const customId: string = interaction.data.custom_id;
    const colonIdx = customId.indexOf(":");
    if (colonIdx === -1) {
      return new Response(JSON.stringify({ type: 4, data: { content: "잘못된 요청", flags: 64 } }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const action    = customId.slice(0, colonIdx);
    const paymentId = customId.slice(colonIdx + 1);

    if (action === "approve") {
      try {
        const { data: payment, error } = await supabase
          .from("payment_requests")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("id", paymentId)
          .select()
          .single();

        if (error || !payment) {
          return new Response(
            JSON.stringify({ type: 4, data: { content: "❌ 오류: 결제 정보를 찾을 수 없습니다.", flags: 64 } }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // 주문 상태 → payment_pending
        await supabase.from("orders")
          .update({ status: "payment_pending", updated_at: new Date().toISOString() })
          .eq("id", payment.order_id);

        // 주문 정보 조회
        const { data: order } = await supabase
          .from("orders")
          .select("user_id, order_number, server_name")
          .eq("id", payment.order_id)
          .single();

        if (order) {
          // 채팅에 결제 메시지 삽입
          await supabase.from("order_messages").insert({
            order_id:    payment.order_id,
            sender_id:   payment.counselor_id,
            content:     `₩${Number(payment.amount).toLocaleString()} 송금 요청이 도착했습니다.`,
            type:        "payment",
            metadata_json: JSON.stringify({
              amount:     payment.amount,
              deeplink:   payment.deeplink,
              payment_id: paymentId,
            }),
          });

          // 알림 전송
          await supabase.from("notifications").insert({
            user_id:      order.user_id,
            type:         "payment_request",
            title:        `₩${Number(payment.amount).toLocaleString()} 결제 요청`,
            body:         "채팅에서 송금하기 버튼을 눌러주세요",
            reference_id: payment.order_id,
          });
        }

        console.log(`결제 승인 완료: ${paymentId}`);

        return new Response(
          JSON.stringify({
            type: 4,
            data: {
              content: `✅ **승인 완료!** 신청자에게 송금 알림이 전송되었습니다.\n토스 계좌: \`${TOSS_ACCOUNT}\``,
              flags: 64,
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (e) {
        console.error("결제 승인 처리 오류:", e);
        return new Response(
          JSON.stringify({ type: 4, data: { content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (action === "reject") {
      try {
        await supabase.from("payment_requests")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", paymentId);

        console.log(`결제 거절 완료: ${paymentId}`);

        return new Response(
          JSON.stringify({
            type: 4,
            data: { content: "❌ **거절 완료.** 개발자에게 별도로 알려주세요.", flags: 64 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (e) {
        console.error("결제 거절 처리 오류:", e);
        return new Response(
          JSON.stringify({ type: 4, data: { content: "❌ 처리 중 오류가 발생했습니다.", flags: 64 } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // 그 외 인터랙션 타입은 무시
  return new Response(JSON.stringify({ type: 1 }), {
    headers: { "Content-Type": "application/json" },
  });
});
