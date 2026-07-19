import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const TOSS_ACCOUNT = "190839534245";
const router = Router();

// Create payment request (counselor only)
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
