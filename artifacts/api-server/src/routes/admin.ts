import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Request, Response } from "express";

const router = Router();

// Get admin stats
router.get("/stats", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const [
      { count: totalOrders },
      { count: totalUsers },
      { count: totalCounselors },
      { data: ordersByStatus },
      { data: revenueData },
    ] = await Promise.all([
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("role", "counselor"),
      supabaseAdmin.from("orders").select("status"),
      supabaseAdmin.from("payment_requests").select("amount").eq("status", "paid"),
    ]);

    const statusCounts = (ordersByStatus || []).reduce((acc: Record<string, number>, order: { status: string }) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    const revenueTotal = (revenueData || []).reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

    // Orders this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: ordersThisWeek } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo.toISOString());

    const { count: activeChats } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["consulting", "building"]);

    res.json({
      total_orders: totalOrders || 0,
      total_users: totalUsers || 0,
      total_counselors: totalCounselors || 0,
      pending_orders: statusCounts.pending || 0,
      consulting_orders: statusCounts.consulting || 0,
      building_orders: statusCounts.building || 0,
      completed_orders: statusCounts.completed || 0,
      cancelled_orders: statusCounts.cancelled || 0,
      revenue_total: revenueTotal,
      orders_this_week: ordersThisWeek || 0,
      active_chats: activeChats || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// List all users
router.get("/users", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { role, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (role) {
      query = query.eq("role", String(role));
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Update user role
router.patch("/users/:id", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ role })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// List all orders
router.get("/orders", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) {
      query = query.eq("status", String(status));
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch admin orders" });
  }
});

// Create announcement
router.post("/announce", requireAuth, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { title, content } = req.body;

    const { data, error } = await supabaseAdmin
      .from("announcements")
      .insert({ title, content })
      .select()
      .single();

    if (error) throw error;

    // Notify all users
    const { data: allUsers } = await supabaseAdmin.from("users").select("id");
    if (allUsers && allUsers.length > 0) {
      const notifications = allUsers.map((u: { id: string }) => ({
        user_id: u.id,
        type: "status_change",
        title: `공지: ${title}`,
        body: content.substring(0, 100),
        reference_id: data.id,
      }));
      await supabaseAdmin.from("notifications").insert(notifications);
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to create announcement" });
  }
});

export default router;
