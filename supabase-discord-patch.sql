-- ═══════════════════════════════════════════════════════════════
-- DIRO Discord 적용 패치 — Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════════════

-- 1. orders.status CHECK 제약 — 'applying' / 'failed' 추가
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending','consulting','transferred','building',
    'payment_pending','completed','cancelled',
    'applying','failed'
  ));

-- 2. orders에 discord_server_id 컬럼 추가
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discord_server_id TEXT;

-- 3. server_projects에 적용 결과 저장용 컬럼 추가
ALTER TABLE public.server_projects
  ADD COLUMN IF NOT EXISTS apply_result_json TEXT;

-- 4. bot_guilds 테이블: 봇이 참여한 서버 목록
CREATE TABLE IF NOT EXISTS public.bot_guilds (
  guild_id   TEXT PRIMARY KEY,
  guild_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bot_guilds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_guilds_read" ON public.bot_guilds;
CREATE POLICY "bot_guilds_read" ON public.bot_guilds
  FOR SELECT TO authenticated USING (true);

-- 5. orders Realtime 활성화 (봇이 변경 감지용)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
