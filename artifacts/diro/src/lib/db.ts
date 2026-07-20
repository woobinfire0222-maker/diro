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
  total_developers: number;
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
      const { data, error } = await supabase.functions.invoke("discord-verify", {
        body: { server_id: serverId },
      });
      if (error) throw new Error(error.message || "Verify failed");
      return data as { in_server: boolean; server_name: string | null; error: string | null };
    },
  });
}

export function useApplyDiscord() {
  return useMutation({
    mutationFn: async ({ orderId, serverId }: { orderId: string; serverId: string }) => {
      const { data, error } = await supabase.functions.invoke("discord-apply", {
        body: { order_id: orderId, server_id: serverId },
      });
      if (error) throw new Error(error.message || "Apply failed");
      return data as { success: boolean; applied_items: string[]; error: string | null };
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
        { count: totalDevelopers },
        { data: byStatus },
        { data: revenueData },
        { count: ordersThisWeek },
        { count: activeChats },
      ] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "counselor"),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "developer"),
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
        total_developers: totalDevelopers ?? 0,
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
// ban_user / unban_user 는 Supabase SECURITY DEFINER RPC 함수 (superadmin 체크 내장)

export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("ban_user", {
        target_user_id: userId,
        ban_reason_text: reason || null,
      });
      if (error) throw new Error(error.message || "차단 실패");
      return data as { success: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminUsers"] }),
  });
}

export function useUnbanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc("unban_user", {
        target_user_id: userId,
      });
      if (error) throw new Error(error.message || "차단 해제 실패");
      return data as { success: boolean };
    },
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

// ─── 결제 요청 ────────────────────────────────────────────────────────────────

export interface PaymentRequest {
  id: string;
  order_id: string;
  user_id: string | null;
  amount: number;
  status: "pending" | "awaiting_approval" | "approved" | "paid" | "cancelled";
  method: string | null;
  notes: string | null;
  created_at: string;
  // joined
  order_number?: string | null;
  server_name?: string | null;
  client_username?: string | null;
  client_display_name?: string | null;
}

/** 개발자: edge function을 통해 결제 승인 요청 전송 */
export function useRequestPaymentApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, amount }: { orderId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("request-payment-approval", {
        body: { order_id: orderId, amount },
      });
      if (error) throw new Error(error.message || "결제 요청 전송 실패");
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; payment_request_id: string; discord_notified: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["paymentRequests"] });
    },
  });
}

/** 관리자: 결제 요청 목록 조회 */
export function useGetPaymentRequests(options?: { query?: { enabled?: boolean } }) {
  return useQuery<PaymentRequest[]>({
    queryKey: ["paymentRequests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_requests")
        .select(`
          *,
          _order:orders!order_id(order_number, server_name,
            _user:users!user_id(username, display_name)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        order_number: row._order?.order_number ?? null,
        server_name: row._order?.server_name ?? null,
        client_username: row._order?._user?.username ?? null,
        client_display_name: row._order?._user?.display_name ?? null,
        _order: undefined,
      })) as PaymentRequest[];
    },
    enabled: options?.query?.enabled ?? true,
  });
}

/** 슈퍼관리자: 결제 승인 — 고객 채팅에 Toss 결제 메시지 삽입 */
export function useApprovePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId,
      orderId,
      amount,
      tossLink,
    }: {
      paymentId: string;
      orderId: string;
      amount: number;
      tossLink: string;
    }) => {
      // 1. 결제 요청 상태 → approved
      const { error: pe } = await supabase
        .from("payment_requests")
        .update({ status: "approved" })
        .eq("id", paymentId);
      if (pe) throw new Error(pe.message || "결제 승인 실패");

      // 2. 고객 채팅에 결제 메시지 삽입 (bini2222는 is_superadmin()이므로 RLS 통과)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      const { error: me } = await supabase.from("order_messages").insert({
        order_id: orderId,
        sender_id: authUser.id,
        content: `결제 요청이 승인되었습니다. 아래 버튼으로 ₩${Number(amount).toLocaleString("ko-KR")} 를 송금해주세요.`,
        type: "payment",
        metadata_json: JSON.stringify({ deeplink: tossLink, amount }),
      });
      if (me) throw new Error(me.message || "결제 메시지 삽입 실패");

      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paymentRequests"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/** 슈퍼관리자: 결제 완료 처리 */
export function useMarkPaymentPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, orderId }: { paymentId: string; orderId: string }) => {
      const { error: pe } = await supabase
        .from("payment_requests")
        .update({ status: "paid" })
        .eq("id", paymentId);
      if (pe) throw new Error(pe.message);

      const { error: oe } = await supabase
        .from("orders")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", orderId);
      if (oe) throw new Error(oe.message);

      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paymentRequests"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// ─── 공지 ─────────────────────────────────────────────────────────────────────

/** 슈퍼관리자: 전체 공지 발송 (DB 직접 삽입 — edge function 불필요) */
export function useAdminAnnounce() {
  return useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      // 1. announcements 테이블에 삽입
      const { data: ann, error: annErr } = await supabase
        .from("announcements")
        .insert({ title: title.trim(), content: content.trim() })
        .select("id")
        .single();
      if (annErr) throw new Error(annErr.message);

      // 2. 비차단 사용자 전체 조회
      const { data: allUsers, error: usersErr } = await supabase
        .from("users")
        .select("id")
        .eq("is_banned", false);
      if (usersErr) throw new Error(usersErr.message);

      if (!allUsers?.length) {
        return { success: true, notified: 0, announcement_id: ann.id };
      }

      // 3. 모든 사용자에게 알림 삽입 (admin INSERT 권한 보유)
      const notifications = allUsers.map((u: { id: string }) => ({
        user_id: u.id,
        type: "announcement" as const,
        title: `📢 공지: ${title.trim()}`,
        body: content.trim().slice(0, 200),
        reference_id: ann.id,
      }));
      const { error: notifErr } = await supabase.from("notifications").insert(notifications);
      if (notifErr) console.error("알림 삽입 오류:", notifErr.message);

      return { success: true, notified: allUsers.length, announcement_id: ann.id };
    },
  });
}

// ─── 점검 모드 ──────────────────────────────────────────────────────────────

export function useMaintenanceMode() {
  return useQuery<boolean>({
    queryKey: ["maintenanceMode"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();
      return (data?.value as boolean) ?? false;
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useToggleMaintenanceMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: "maintenance_mode", value: enabled, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return enabled;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenanceMode"] }),
  });
}

export interface SiteCheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function useRunSiteCheck() {
  return useMutation({
    mutationFn: async (): Promise<{ allOk: boolean; checks: SiteCheckResult[] }> => {
      const checks: SiteCheckResult[] = [];

      const run = async (name: string, fn: () => Promise<void>) => {
        try {
          await fn();
          checks.push({ name, ok: true, detail: "정상" });
        } catch (e) {
          checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
        }
      };

      await Promise.all([
        run("DB 연결 (users)", async () => {
          const { error } = await supabase.from("users").select("id", { count: "exact", head: true });
          if (error) throw new Error(error.message);
        }),
        run("주문 테이블", async () => {
          const { error } = await supabase.from("orders").select("id", { count: "exact", head: true });
          if (error) throw new Error(error.message);
        }),
        run("채팅 테이블", async () => {
          const { error } = await supabase.from("order_messages").select("id", { count: "exact", head: true });
          if (error) throw new Error(error.message);
        }),
        run("알림 테이블", async () => {
          const { error } = await supabase.from("notifications").select("id", { count: "exact", head: true });
          if (error) throw new Error(error.message);
        }),
        run("공지 테이블", async () => {
          const { error } = await supabase.from("announcements").select("id", { count: "exact", head: true });
          if (error) throw new Error(error.message);
        }),
        run("사이트 설정 테이블", async () => {
          const { data, error } = await supabase
            .from("site_settings")
            .select("key")
            .eq("key", "maintenance_mode")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!data) throw new Error("maintenance_mode 행 없음 — SQL 재실행 필요");
        }),
        run("인증 서비스", async () => {
          const { error } = await supabase.auth.getSession();
          if (error) throw new Error(error.message);
        }),
      ]);

      return { allOk: checks.every(c => c.ok), checks };
    },
  });
}
