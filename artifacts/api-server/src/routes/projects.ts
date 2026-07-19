import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { applyServerConfig, verifyBotInServer } from "../lib/discord.js";
import type { Request, Response } from "express";

const router = Router();

// Get server project for an order
router.get("/:orderId", requireAuth, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const { data, error } = await supabaseAdmin
      .from("server_projects")
      .select("*")
      .eq("order_id", orderId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Server project not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch server project" });
  }
});

// Update server project
router.put("/:orderId", requireAuth, requireRole("counselor", "admin"), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { config_json } = req.body;

    // Store history snapshot
    const { data: existing } = await supabaseAdmin
      .from("server_projects")
      .select("config_json, history_json")
      .eq("order_id", orderId)
      .single();

    let history: unknown[] = [];
    if (existing?.history_json) {
      try {
        history = JSON.parse(existing.history_json);
      } catch {
        history = [];
      }
    }

    // Keep last 50 history items
    if (existing?.config_json) {
      history = [
        { config: existing.config_json, timestamp: new Date().toISOString() },
        ...history,
      ].slice(0, 50);
    }

    const { data, error } = await supabaseAdmin
      .from("server_projects")
      .upsert({
        order_id: orderId,
        config_json,
        history_json: JSON.stringify(history),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update server project" });
  }
});

// Send preview to client
router.post("/:orderId/preview", requireAuth, requireRole("counselor", "admin"), async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { orderId } = req.params;

    const { data: project } = await supabaseAdmin
      .from("server_projects")
      .select("config_json")
      .eq("order_id", orderId)
      .single();

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Send preview message to chat
    const { data: message, error } = await supabaseAdmin
      .from("order_messages")
      .insert({
        order_id: orderId,
        sender_id: user.id,
        content: "서버 미리보기를 전송했습니다.",
        type: "preview",
        metadata_json: project.config_json,
      })
      .select()
      .single();

    if (error) throw error;

    // Get order user_id to notify
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("user_id")
      .eq("id", orderId)
      .single();

    if (order) {
      await supabaseAdmin.from("notifications").insert({
        user_id: order.user_id,
        type: "preview_sent",
        title: "서버 미리보기가 도착했습니다",
        body: "채팅에서 확인하세요",
        reference_id: orderId,
      });
    }

    res.json({ success: true, message_id: message.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to send preview" });
  }
});

export default router;
