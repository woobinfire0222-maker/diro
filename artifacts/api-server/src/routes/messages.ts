import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router({ mergeParams: true });

// List messages for an order
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { orderId } = req.params;

    // Verify access to order
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("user_id, counselor_id")
      .eq("id", orderId)
      .single();

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (
      user.role === "user" && order.user_id !== user.id ||
      user.role === "counselor" && order.counselor_id !== user.id
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("order_messages")
      .select("*, sender:users(id, username, display_name, avatar, role)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    // Flatten sender info
    const messages = (data || []).map((msg: Record<string, unknown>) => {
      const sender = msg.sender as Record<string, unknown> | null;
      return {
        ...msg,
        sender: undefined,
        sender_username: sender?.username || null,
        sender_avatar: sender?.avatar || null,
        sender_display_name: sender?.display_name || null,
        sender_role: sender?.role || null,
      };
    });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Send message
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { orderId } = req.params;
    const { content, type = "text", metadata_json } = req.body;

    const { data, error } = await supabaseAdmin
      .from("order_messages")
      .insert({
        order_id: orderId,
        sender_id: user.id,
        content,
        type,
        metadata_json: metadata_json || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Notify the other party
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("user_id, counselor_id, order_number")
      .eq("id", orderId)
      .single();

    if (order) {
      const notifyUserId = user.id === order.user_id ? order.counselor_id : order.user_id;
      if (notifyUserId) {
        await supabaseAdmin.from("notifications").insert({
          user_id: notifyUserId,
          type: "new_message",
          title: "새 메시지",
          body: content.substring(0, 100),
          reference_id: orderId,
        });
      }
    }

    res.status(201).json({
      ...data,
      sender_username: user.username,
      sender_avatar: user.avatar,
      sender_display_name: user.display_name,
      sender_role: user.role,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Update message
router.patch("/:messageId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { messageId } = req.params;
    const { content } = req.body;

    const { data: existing } = await supabaseAdmin
      .from("order_messages")
      .select("sender_id")
      .eq("id", messageId)
      .single();

    if (!existing || existing.sender_id !== user.id) {
      res.status(403).json({ error: "Cannot edit this message" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("order_messages")
      .update({ content, is_edited: true, updated_at: new Date().toISOString() })
      .eq("id", messageId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update message" });
  }
});

// Delete message
router.delete("/:messageId", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { messageId } = req.params;

    const { data: existing } = await supabaseAdmin
      .from("order_messages")
      .select("sender_id")
      .eq("id", messageId)
      .single();

    if (!existing) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    if (existing.sender_id !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Cannot delete this message" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("order_messages")
      .delete()
      .eq("id", messageId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});

export default router;
