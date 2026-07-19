import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// List orders (role-based filtering)
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { status, limit = 20, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    // Role-based access
    if (user.role === "user") {
      query = query.eq("user_id", user.id);
    } else if (user.role === "counselor") {
      query = query.eq("counselor_id", user.id);
    }
    // Admin sees all

    if (status) {
      query = query.eq("status", String(status));
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Create order
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const {
      server_name, server_description, atmosphere,
      category_count, text_channel_count, voice_channel_count,
      desired_roles, desired_permissions, desired_features,
      budget, additional_notes
    } = req.body;

    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        status: "pending",
        server_name,
        server_description: server_description || null,
        atmosphere,
        category_count: category_count || null,
        text_channel_count: text_channel_count || null,
        voice_channel_count: voice_channel_count || null,
        desired_roles: desired_roles || null,
        desired_permissions: desired_permissions || null,
        desired_features: desired_features || null,
        budget: Number(budget),
        additional_notes: additional_notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Create initial server project
    await supabaseAdmin.from("server_projects").insert({
      order_id: order.id,
      config_json: JSON.stringify({
        server: { name: server_name, icon: null, banner: null },
        categories: [],
        channels: [],
        roles: [{ id: "default", name: "@everyone", color: "#000000", position: 0, hoist: false, mentionable: false, permissions: 0 }],
      }),
      history_json: "[]",
    });

    // Create system message
    await supabaseAdmin.from("order_messages").insert({
      order_id: order.id,
      sender_id: user.id,
      content: `주문이 생성되었습니다. 상담사가 곧 연결될 예정입니다.`,
      type: "system",
    });

    // Create notification for admins/counselors
    const { data: staff } = await supabaseAdmin
      .from("users")
      .select("id")
      .in("role", ["admin", "counselor"]);

    if (staff && staff.length > 0) {
      await supabaseAdmin.from("notifications").insert(
        staff.map((s) => ({
          user_id: s.id,
          type: "new_order",
          title: `새 주문: ${server_name}`,
          body: `예산: ₩${Number(budget).toLocaleString()}`,
          reference_id: order.id,
        }))
      );
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Get order by ID
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Access check
    if (user.role === "user" && data.user_id !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (user.role === "counselor" && data.counselor_id !== user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

// Update order
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.authUser!;
    const { id } = req.params;
    const { status, counselor_id } = req.body;

    // Only counselors/admins can change status and assign counselors
    if (user.role === "user" && (status || counselor_id)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (counselor_id !== undefined) updates.counselor_id = counselor_id;

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Notify user of status change
    if (status) {
      const statusLabels: Record<string, string> = {
        consulting: "상담이 시작되었습니다",
        building: "서버 제작이 시작되었습니다",
        payment_pending: "결제 요청이 도착했습니다",
        completed: "서버 제작이 완료되었습니다",
        cancelled: "주문이 취소되었습니다",
      };

      if (statusLabels[status]) {
        await supabaseAdmin.from("notifications").insert({
          user_id: data.user_id,
          type: "status_change",
          title: statusLabels[status],
          body: `주문 #${data.order_number}`,
          reference_id: id,
        });
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update order" });
  }
});

// Delete order (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from("orders").delete().eq("id", id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete order" });
  }
});

// Get order stats
router.get("/:id/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("created_at, updated_at, status")
      .eq("id", id)
      .single();

    const { count: messageCount } = await supabaseAdmin
      .from("order_messages")
      .select("id", { count: "exact", head: true })
      .eq("order_id", id);

    const { data: lastMessage } = await supabaseAdmin
      .from("order_messages")
      .select("created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const statusProgress: Record<string, number> = {
      pending: 10,
      consulting: 30,
      building: 60,
      payment_pending: 80,
      completed: 100,
      cancelled: 0,
    };

    const createdAt = order ? new Date(order.created_at) : new Date();
    const daysElapsed = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    res.json({
      message_count: messageCount || 0,
      days_elapsed: daysElapsed,
      progress_percent: statusProgress[order?.status || "pending"] || 0,
      last_activity: lastMessage?.created_at || order?.updated_at || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order stats" });
  }
});

export default router;
