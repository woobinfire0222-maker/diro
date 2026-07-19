import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// Get user by ID
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, discord_id, username, display_name, avatar, email, role, created_at, last_login")
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update user profile
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { id } = req.params;

    // Users can only update their own profile
    if (user.id !== id && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { display_name, avatar } = req.body;
    const updates: Record<string, unknown> = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (avatar !== undefined) updates.avatar = avatar;

    const { data, error } = await supabaseAdmin
      .from("users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
