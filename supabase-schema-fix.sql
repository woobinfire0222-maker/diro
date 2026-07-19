-- ============================================================
-- DIRO 스키마 수정 패치
-- ============================================================
-- supabase-schema.sql 실행 중 오류가 발생한 경우 이 파일을 실행하세요.
-- 이미 존재하는 테이블에 누락된 컬럼을 추가하고 나머지 작업을 처리합니다.
-- ============================================================

-- 누락된 컬럼 추가
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

-- ============================================================
-- 이하 supabase-schema.sql 에서 실패한 부분부터 다시 실행
-- (이미 성공한 부분은 IF NOT EXISTS / OR REPLACE 로 중복 실행 안전)
-- ============================================================

-- payment_requests RLS
DROP POLICY IF EXISTS "payments_select" ON public.payment_requests;
DROP POLICY IF EXISTS "payments_insert" ON public.payment_requests;
DROP POLICY IF EXISTS "payments_update" ON public.payment_requests;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payment_requests
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR is_superadmin()
    OR get_my_role() IN ('admin','counselor')
  );

CREATE POLICY "payments_insert" ON public.payment_requests
  FOR INSERT TO authenticated WITH CHECK (
    is_superadmin() OR get_my_role() IN ('admin','counselor')
  );

CREATE POLICY "payments_update" ON public.payment_requests
  FOR UPDATE TO authenticated
  USING (is_superadmin() OR get_my_role() = 'admin');

-- announcements RLS
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
DROP POLICY IF EXISTS "announcements_write"  ON public.announcements;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcements_select" ON public.announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "announcements_write" ON public.announcements
  FOR ALL TO authenticated
  USING (is_superadmin() OR get_my_role() = 'admin')
  WITH CHECK (is_superadmin() OR get_my_role() = 'admin');

-- 인덱스 (중복 안전)
CREATE INDEX IF NOT EXISTS idx_orders_user_id      ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_counselor_id ON public.orders(counselor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_messages_order_id   ON public.order_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_id       ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread        ON public.notifications(user_id, is_read);
