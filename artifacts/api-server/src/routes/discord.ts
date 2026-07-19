import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { verifyBotInServer, applyServerConfig, ServerConfig } from "../lib/discord.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// Verify bot is in server
router.post("/verify", requireAuth, requireRole("counselor", "admin"), async (req: Request, res: Response) => {
  try {
    const { server_id } = req.body;

    if (!server_id) {
      res.status(400).json({ error: "server_id is required" });
      return;
    }

    const result = await verifyBotInServer(String(server_id));
    res.json({
      success: true,
      in_server: result.inServer,
      server_name: result.serverName,
      error: null,
    });
  } catch (err) {
    const error = err as Error;
    res.json({
      success: false,
      in_server: false,
      server_name: null,
      error: error.message || "Failed to verify server",
    });
  }
});

// Apply server config to Discord
router.post("/apply", requireAuth, requireRole("counselor", "admin"), async (req: Request, res: Response) => {
  try {
    const { order_id, server_id } = req.body;

    const { data: project } = await supabaseAdmin
      .from("server_projects")
      .select("config_json")
      .eq("order_id", order_id)
      .single();

    if (!project) {
      res.status(404).json({ success: false, applied_items: [], error: "Project not found" });
      return;
    }

    let config: ServerConfig;
    try {
      config = JSON.parse(project.config_json) as ServerConfig;
    } catch {
      res.status(400).json({ success: false, applied_items: [], error: "Invalid config JSON" });
      return;
    }

    const result = await applyServerConfig(String(server_id), config);

    if (result.success) {
      // Update order status to completed
      await supabaseAdmin
        .from("orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", order_id);
    }

    res.json({
      success: result.success,
      applied_items: result.appliedItems,
      error: result.error,
    });
  } catch (err) {
    const error = err as Error;
    res.json({
      success: false,
      applied_items: [],
      error: error.message || "Failed to apply config",
    });
  }
});

export default router;
