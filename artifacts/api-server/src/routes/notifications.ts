import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// Get notifications
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { unread_only } = req.query;

    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (unread_only === "true") {
      query = query.eq("is_read", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
router.patch("/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all notifications as read
router.post("/read-all", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;

    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) throw error;
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

export default router;
