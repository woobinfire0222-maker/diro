/**
 * Supabase 직접 쿼리 훅 — API 서버 없이 프론트에서 직접 호출
 *
 * @workspace/api-client-react 훅을 1:1 대응으로 교체합니다.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "pending" | "consulting" | "building"
  | "payment_pending" | "completed" | "cancelled";

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  counselor_id: string | null;
  developer_id?: string | null;
  status: OrderStatus;
  server_name: string;
  server_description?: string | null;
  atmosphere: string;
  category_count?: number | null;
  text_channel_count?: number | null;
  voice_channel_count?: number | null;
  desired_roles?: string | null;
  desired_permissions?: string | null;
  desired_features?: string | null;
  budget: number;
  price?: number | null;
  additional_notes?: string | null;
  // joined fields
  user_username?: string | null;
  user_display_name?: string | null;
  user_avatar?: string | null;
  counselor_username?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  order_id: string;
  sender_id: string;
  content: string;
  type: "text" | "system" | "preview" | "payment";
  is_edited: boolean;
  metadata_json?: string | null;
  sender_username?: string | null;
  sender_display_name?: string | null;
  sender_avatar?: string | null;
  sender_role?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar?: string | null;
  discord_id?: string | null;
  role: "admin" | "counselor" | "developer" | "user";
  created_at: string;
  last_login?: string | null;
  is_banned?: boolean | null;
  ban_reason?: string | null;
  banned_at?: string | null;
}

export interface AdminStats {
  total_orders: number;
  total_users: number;
  total_counselors: number;
  pending_orders: number;
  consulting_orders: number;
  building_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  revenue_total: number;
  orders_this_week: number;
  active_chats: number;
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/** orders 테이블에서 유저 정보를 join해서 flatten */
async function fetchOrders(filters?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<Order[]> {
  let q = supabase
    .from("orders")
    .select(`
      *,
      _user:users!user_id(username, display_name, avatar),
      _counselor:users!counselor_id(username)
    `)
    .order("created_at", { ascending: false });

  if (filters?.status) q = q.eq("status", filters.status);
  if (filters?.limit) q = q.limit(filters.limit);
  if (filters?.offset) q = q.range(filters.offset, (filters.offset) + (filters.limit ?? 20) - 1);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    user_username: row._user?.username ?? null,
    user_display_name: row._user?.display_name ?? null,
    user_avatar: row._user?.avatar ?? null,
    counselor_username: row._counselor?.username ?? null,
    _user: undefined,
    _counselor: undefined,
  }));
}

// ─── 현재 로그인 유저 ─────────────────────────────────────────────────────────

export function useGetMe(options?: { query?: { enabled?: boolean } }) {
  return useQuery<UserProfile | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data as UserProfile;
    },
    enabled: options?.query?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserProfile> }) => {
      const { error } = await supabase.from("users").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  });
}

// ─── 주문 ────────────────────────────────────────────────────────────────────

export function useGetOrders(params?: { limit?: number; status?: string }) {
  return useQuery<Order[]>({
    queryKey: ["orders", params],
    queryFn: () => fetchOrders(params),
  });
}

export function useGetOrder(id: string, options?: { query?: { enabled?: boolean } }) {
  return useQuery<Order | null>({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          _user:users!user_id(username, display_name, avatar),
          _counselor:users!counselor_id(username)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      const row = data as any;
      return {
        ...row,
        user_username: row._user?.username ?? null,
        user_display_name: row._user?.display_name ?? null,
        user_avatar: row._user?.avatar ?? null,
        counselor_username: row._counselor?.username ?? null,
        _user: undefined,
        _counselor: undefined,
      } as Order;
    },
    enabled: (options?.query?.enabled ?? true) && !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: Omit<Order,
      "id" | "order_number" | "user_id" | "counselor_id" | "developer_id" |
      "status" | "price" | "created_at" | "updated_at" |
      "user_username" | "user_display_name" | "user_avatar" | "counselor_username"
    > }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

      const { data: order, error } = await supabase
        .from("orders")
        .insert({ ...data, user_id: user.id, order_number: orderNumber, status: "pending" })
        .select()
        .single();

      if (error) throw error;
      return order;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Order> }) => {
      const { data: updated, error } = await supabase
        .from("orders")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

// ─── 서버 프로젝트 ────────────────────────────────────────────────────────────

export interface ServerProject {
  order_id: string;
  config_json: string;
  history_json: string;
  created_at: string;
  updated_at: string;
}

export function useGetServerProject(orderId: string, options?: { query?: { enabled?: boolean } }) {
  return useQuery<ServerProject | null>({
    queryKey: ["project", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_projects")
        .select("*")
        .eq("order_id", orderId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // not found
        throw error;
      }
      return data as ServerProject;
    },
    enabled: options?.query?.enabled ?? !!orderId,
  });
}

export function useUpdateServerProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: { config_json: string } }) => {
      // 히스토리 스냅샷 저장
      const { data: existing } = await supabase
        .from("server_projects")
        .select("config_json, history_json")
        .eq("order_id", orderId)
        .single();

      let history: unknown[] = [];
      if (existing?.history_json) {
        try { history = JSON.parse(existing.history_json); } catch { history = []; }
      }
      if (existing?.config_json) {
        history = [
          { config: existing.config_json, timestamp: new Date().toISOString() },
          ...history,
        ].slice(0, 50);
      }

      const { data: updated, error } = await supabase
        .from("server_projects")
        .upsert({
          order_id: orderId,
          config_json: data.config_json,
          history_json: JSON.stringify(history),
          updated_at: new Date().toISOString(),
        }, { onConflict: "order_id" })
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["project", vars.orderId] }),
  });
}

export function useSendPreview() {
  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: project } = await supabase
        .from("server_projects")
        .select("config_json")
        .eq("order_id", orderId)
        .single();

      const { error } = await supabase.from("order_messages").insert({
        order_id: orderId,
        sender_id: user.id,
        content: "서버 미리보기를 전송했습니다.",
        type: "preview",
        metadata_json: project?.config_json ?? null,
      });

      if (error) throw error;
    },
  });
}

// ─── 채팅 메시지 ──────────────────────────────────────────────────────────────

/** messages + sender 정보 flatten */
function flattenMessage(row: any): Message {
  const sender = row.sender;
  return {
    ...row,
    sender: undefined,
    sender_username: sender?.username ?? null,
    sender_display_name: sender?.display_name ?? null,
    sender_avatar: sender?.avatar ?? null,
    sender_role: sender?.role ?? null,
  };
}

export function useListMessages(
  orderId: string,
  options?: { query?: { enabled?: boolean } },
) {
  return useQuery<Message[]>({
    queryKey: ["messages", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages")
        .select("*, sender:users!sender_id(username, display_name, avatar, role)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return (data ?? []).map(flattenMessage);
    },
    enabled: (options?.query?.enabled ?? true) && !!orderId,
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: async ({
      orderId,
      content,
      type = "text",
      metadata_json,
    }: {
      orderId: string;
      content: string;
      type?: string;
      metadata_json?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("order_messages")
        .insert({ order_id: orderId, sender_id: user.id, content, type, metadata_json: metadata_json ?? null })
        .select("*, sender:users!sender_id(username, display_name, avatar, role)")
        .single();

      if (error) throw error;
      return flattenMessage(data);
    },
    // 실시간 구독이 처리하므로 별도 invalidate 불필요
  });
}

// ─── 알림 ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  reference_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export function useGetNotifications(params?: { unread_only?: boolean }, options?: { query?: { enabled?: boolean } }) {
  return useQuery<Notification[]>({
    queryKey: ["notifications", params],
    queryFn: async () => {
      let q = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (params?.unread_only) q = q.eq("is_read", false);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    enabled: options?.query?.enabled ?? true,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ─── Discord 적용 ──────────────────────────────────────────────────────────────

export function useVerifyBot() {
  return useMutation({
    mutationFn: async (serverId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch("/api/discord/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ server_id: serverId }),
      });
      if (!res.ok) throw new Error("Verify failed");
      return res.json() as Promise<{ in_server: boolean; server_name: string | null; error: string | null }>;
    },
  });
}

export function useApplyDiscord() {
  return useMutation({
    mutationFn: async ({ orderId, serverId }: { orderId: string; serverId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch("/api/discord/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ order_id: orderId, server_id: serverId }),
      });
      if (!res.ok) throw new Error("Apply failed");
      return res.json() as Promise<{ success: boolean; applied_items: string[]; error: string | null }>;
    },
  });
}

// ─── 결제 요청 ────────────────────────────────────────────────────────────────

export function useCreatePaymentRequest() {
  return useMutation({
    mutationFn: async ({ order_id, amount }: { order_id: string; amount: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("payment_requests")
        .insert({ order_id, user_id: user.id, amount, status: "pending" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });
}

// ─── 관리자 ───────────────────────────────────────────────────────────────────

export function useGetAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ["adminStats"],
    queryFn: async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [
        { count: totalOrders },
        { count: totalUsers },
        { count: totalCounselors },
        { data: byStatus },
        { data: revenueData },
        { count: ordersThisWeek },
        { count: activeChats },
      ] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "counselor"),
        supabase.from("orders").select("status"),
        supabase.from("payment_requests").select("amount").eq("status", "paid"),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", weekAgo.toISOString()),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["consulting", "building"]),
      ]);

      const sc = (byStatus ?? []).reduce((acc: Record<string, number>, o: { status: string }) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      }, {});

      const revenue = (revenueData ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);

      return {
        total_orders: totalOrders ?? 0,
        total_users: totalUsers ?? 0,
        total_counselors: totalCounselors ?? 0,
        pending_orders: sc.pending ?? 0,
        consulting_orders: sc.consulting ?? 0,
        building_orders: sc.building ?? 0,
        completed_orders: sc.completed ?? 0,
        cancelled_orders: sc.cancelled ?? 0,
        revenue_total: revenue,
        orders_this_week: ordersThisWeek ?? 0,
        active_chats: activeChats ?? 0,
      };
    },
  });
}

// ─── 차단/차단 해제 ──────────────────────────────────────────────────────────

async function callAdminApi(path: string, body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const res = await fetch(`${import.meta.env.BASE_URL}api/admin/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error || "요청 실패");
  return res.json();
}

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      callAdminApi(`users/${userId}/ban`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminUsers"] }),
  });
}

export function useUnbanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => callAdminApi(`users/${userId}/unban`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminUsers"] }),
  });
}

export function useGetAdminUsers(params?: { limit?: number; role?: string }) {
  return useQuery<UserProfile[]>({
    queryKey: ["adminUsers", params],
    queryFn: async () => {
      let q = supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (params?.limit) q = q.limit(params.limit);
      if (params?.role) q = q.eq("role", params.role);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UserProfile[];
    },
  });
}
