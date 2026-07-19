/**
 * Supabase Edge Function: admin-announce
 *
 * 관리자가 모든 사용자에게 공지를 발송합니다.
 * - announcements 테이블에 레코드 삽입
 * - 모든 활성 사용자에게 notifications 삽입 (service role 사용)
 *
 * Required Supabase secrets:
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 인증 ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await userClient.from("users").select("role, username").eq("id", user.id).single();
    if (!profile || profile.role !== "admin") {
      return json({ error: "Forbidden: 관리자 권한 필요" }, 403);
    }

    // ── 요청 파싱 ──────────────────────────────────────────────────────────
    const { title, content } = await req.json() as { title?: string; content?: string };
    if (!title?.trim() || !content?.trim()) {
      return json({ error: "title과 content가 필요합니다." }, 400);
    }

    // ── service role 클라이언트 ──────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey);

    // announcements 테이블에 삽입
    const { data: announcement, error: annErr } = await admin
      .from("announcements")
      .insert({ title: title.trim(), content: content.trim() })
      .select()
      .single();
    if (annErr) throw new Error(annErr.message);

    // 모든 활성(비차단) 사용자 조회
    const { data: allUsers, error: usersErr } = await admin
      .from("users")
      .select("id")
      .eq("is_banned", false);
    if (usersErr) throw new Error(usersErr.message);

    if (!allUsers || allUsers.length === 0) {
      return json({ success: true, notified: 0, announcement_id: announcement.id });
    }

    // 알림 일괄 삽입
    const notifications = allUsers.map((u: { id: string }) => ({
      user_id: u.id,
      type: "announcement",
      title: `📢 공지: ${title.trim()}`,
      body: content.trim().slice(0, 200),
      reference_id: announcement.id,
    }));

    const { error: notifErr } = await admin.from("notifications").insert(notifications);
    if (notifErr) {
      console.error("알림 삽입 실패 (비치명적):", notifErr);
    }

    return json({
      success: true,
      announcement_id: announcement.id,
      notified: allUsers.length,
      message: `${allUsers.length}명에게 공지가 발송되었습니다.`,
    });
  } catch (e) {
    const error = e as Error;
    console.error("admin-announce 오류:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
