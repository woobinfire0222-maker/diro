-- ============================================================
-- DIRO 차단 기능 마이그레이션
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요
-- ============================================================

-- 1. users 테이블에 차단 관련 컬럼 추가
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_banned  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT,
  ADD COLUMN IF NOT EXISTS banned_at  TIMESTAMPTZ;

-- 2. 관리자가 다른 유저를 업데이트(역할 변경/차단)할 수 있는 정책 추가
DROP POLICY IF EXISTS "admin_update_users" ON public.users;
CREATE POLICY "admin_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING   (is_superadmin() OR get_my_role() = 'admin')
  WITH CHECK (is_superadmin() OR get_my_role() = 'admin');

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON public.users(is_banned);
