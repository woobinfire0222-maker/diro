import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { sendApprovalDM } from "../lib/discord.js";
import type { Request, Response } from "express";

const TOSS_ACCOUNT = "190839534245";
const router = Router();

// Create payment request (counselor only — direct send without approval)
router.post("/", requireAuth, requireRole("counselor", "admin"), async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { order_id, amount } = req.body;

    const deeplink = `supertoss://send?bank=토스&accountNo=${TOSS_ACCOUNT}&amount=${Number(amount)}`;

    const { data, error } = await supabaseAdmin
      .from("payment_requests")
      .insert({
        order_id,
        counselor_id: user.id,
        amount: Number(amount),
        status: "pending",
        deeplink,
      })
      .select()
      .single();

    if (error) throw error;

    // Update order status to payment_pending
    await supabaseAdmin
      .from("orders")
      .update({ status: "payment_pending", updated_at: new Date().toISOString() })
      .eq("id", order_id);

    // Send payment message in chat
    await supabaseAdmin.from("order_messages").insert({
      order_id,
      sender_id: user.id,
      content: `₩${Number(amount).toLocaleString()} 송금 요청이 도착했습니다.`,
      type: "payment",
      metadata_json: JSON.stringify({ amount, deeplink, payment_id: data.id }),
    });

    // Notify client
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("user_id")
      .eq("id", order_id)
      .single();

    if (order) {
      await supabaseAdmin.from("notifications").insert({
        user_id: order.user_id,
        type: "payment_request",
        title: `₩${Number(amount).toLocaleString()} 결제 요청`,
        body: "채팅에서 송금하기 버튼을 눌러주세요",
        reference_id: order_id,
      });
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to create payment request" });
  }
});

// Developer: request approval from bini2222 via Discord DM
router.post("/request-approval", requireAuth, requireRole("developer", "counselor", "admin"), async (req: Request, res: Response) => {
  const user = req.authUser!;
  const { order_id, amount } = req.body;

  if (!order_id || !amount || Number(amount) <= 0) {
    res.status(400).json({ error: "order_id와 유효한 amount가 필요합니다." });
    return;
  }

  // ── 중복 결제 요청 방지 ────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("payment_requests")
    .select("id, status")
    .eq("order_id", order_id)
    .in("status", ["pending", "awaiting_approval", "approved"])
    .maybeSingle();

  if (existing) {
    res.status(409).json({ error: "이미 처리 중인 결제 요청이 있습니다. 관리자 패널에서 확인해주세요." });
    return;
  }

  // ── 결제 요청 생성 ────────────────────────────────────────────────────
  const deeplink = `supertoss://send?bank=토스&accountNo=${TOSS_ACCOUNT}&amount=${Number(amount)}`;

  const { data: payment, error: payErr } = await supabaseAdmin
    .from("payment_requests")
    .insert({
      order_id,
      counselor_id: user.id,
      amount: Number(amount),
      status: "awaiting_approval",
      deeplink,
      notes: `개발자(${user.username || user.display_name}) 가격 확정`,
    })
    .select()
    .single();

  if (payErr || !payment) {
    res.status(500).json({ error: `결제 요청 생성 실패: ${payErr?.message ?? "알 수 없는 오류"}` });
    return;
  }

  // ── 주문 상태 → payment_pending ───────────────────────────────────────
  await supabaseAdmin
    .from("orders")
    .update({ status: "payment_pending", price: Number(amount), updated_at: new Date().toISOString() })
    .eq("id", order_id);

  // ── 주문 정보 조회 ────────────────────────────────────────────────────
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("server_name, user_id, order_number")
    .eq("id", order_id)
    .single();

  // ── Discord DM 전송 ───────────────────────────────────────────────────
  let discordNotified = false;
  let discordError: string | null = null;

  try {
    await sendApprovalDM(
      payment.id,
      order_id,
      Number(amount),
      order?.server_name || "알 수 없음",
      user.display_name || user.username || "개발자",
    );
    discordNotified = true;
  } catch (dmErr) {
    const msg = (dmErr as Error).message || "Discord DM 전송 실패";
    discordError = msg;
    console.error("Discord DM 전송 실패:", msg);
  }

  res.status(201).json({
    ...payment,
    discord_notified: discordNotified,
    discord_error: discordError,
  });
});

// Update payment status
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const { data, error } = await supabaseAdmin
      .from("payment_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // If paid, update order to completed
    if (status === "paid" && data) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", data.order_id);
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update payment" });
  }
});

export default router;
