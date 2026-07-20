-- ============================================================
-- DIRO 데이터베이스 스키마
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

-- ── 확장 ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT,
  username        TEXT UNIQUE,
  display_name    TEXT,
  avatar          TEXT,
  discord_id      TEXT,
  role            TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('admin', 'counselor', 'developer', 'user')),
  is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason      TEXT,
  banned_at       TIMESTAMPTZ,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 신규 가입 시 users 행 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, display_name, avatar, discord_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'preferred_username',
      NEW.raw_user_meta_data->>'user_name',
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'preferred_username'
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    NEW.raw_user_meta_data->>'provider_id'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number          TEXT UNIQUE NOT NULL,
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  counselor_id          UUID REFERENCES public.users(id),
  developer_id          UUID REFERENCES public.users(id),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'consulting', 'transferred', 'building',
                            'payment_pending', 'applying', 'completed', 'failed', 'cancelled'
                          )),
  server_name           TEXT NOT NULL,
  server_description    TEXT,
  atmosphere            TEXT NOT NULL DEFAULT '',
  category_count        INTEGER,
  text_channel_count    INTEGER,
  voice_channel_count   INTEGER,
  desired_roles         TEXT,
  desired_permissions   TEXT,
  desired_features      TEXT,
  budget                NUMERIC NOT NULL DEFAULT 0,
  price                 NUMERIC,
  additional_notes      TEXT,
  discord_server_id     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── order_messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'text'
                    CHECK (type IN ('text', 'system', 'preview', 'payment')),
  is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_messages_order_id_idx ON public.order_messages(order_id);

-- ── server_projects ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.server_projects (
  order_id          UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  config_json       TEXT NOT NULL DEFAULT '{}',
  history_json      TEXT NOT NULL DEFAULT '[]',
  apply_result_json TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  reference_id TEXT,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);

-- ── payment_requests ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  counselor_id UUID REFERENCES public.users(id),
  user_id      UUID REFERENCES public.users(id),
  amount       NUMERIC NOT NULL,
  deeplink     TEXT,
  method       TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'awaiting_approval', 'approved', 'paid', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── bot_guilds ────────────────────────────────────────────
-- 봇이 참여해 있는 서버 목록 (bot.ts가 자동 관리)
CREATE TABLE IF NOT EXISTS public.bot_guilds (
  guild_id    TEXT PRIMARY KEY,
  guild_name  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── announcements ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── site_settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 점검 모드 기본값
INSERT INTO public.site_settings (key, value)
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_guilds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings    ENABLE ROW LEVEL SECURITY;

-- 슈퍼관리자 헬퍼
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND username = 'bini2222'
  );
$$;

-- 역할 헬퍼
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- ── users 정책 ─────────────────────────────────────────────
CREATE POLICY "users: 본인 조회" ON public.users
  FOR SELECT USING (id = auth.uid() OR is_superadmin() OR get_my_role() IN ('admin', 'counselor', 'developer'));

CREATE POLICY "users: 본인 수정" ON public.users
  FOR UPDATE USING (id = auth.uid() OR is_superadmin());

-- ── orders 정책 ───────────────────────────────────────────
CREATE POLICY "orders: 조회" ON public.orders
  FOR SELECT USING (
    user_id = auth.uid()
    OR counselor_id = auth.uid()
    OR developer_id = auth.uid()
    OR get_my_role() IN ('admin', 'counselor', 'developer')
    OR is_superadmin()
  );

CREATE POLICY "orders: 생성" ON public.orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders: 수정" ON public.orders
  FOR UPDATE USING (
    user_id = auth.uid()
    OR get_my_role() IN ('admin', 'counselor', 'developer')
    OR is_superadmin()
  );

-- ── order_messages 정책 ───────────────────────────────────
CREATE POLICY "messages: 조회" ON public.order_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid()
             OR get_my_role() IN ('admin', 'counselor', 'developer') OR is_superadmin())
    )
  );

CREATE POLICY "messages: 생성" ON public.order_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages: 수정" ON public.order_messages
  FOR UPDATE USING (sender_id = auth.uid() OR is_superadmin());

-- ── server_projects 정책 ──────────────────────────────────
CREATE POLICY "projects: 조회" ON public.server_projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.counselor_id = auth.uid() OR o.developer_id = auth.uid()
             OR o.user_id = auth.uid() OR get_my_role() IN ('admin') OR is_superadmin())
    )
  );

CREATE POLICY "projects: 생성/수정" ON public.server_projects
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.counselor_id = auth.uid() OR o.developer_id = auth.uid()
             OR get_my_role() IN ('admin') OR is_superadmin())
    )
  );

-- ── notifications 정책 ────────────────────────────────────
CREATE POLICY "notifications: 본인 조회" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR is_superadmin());

CREATE POLICY "notifications: 본인 수정" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notifications: admin 생성" ON public.notifications
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'counselor', 'developer') OR is_superadmin());

-- ── payment_requests 정책 ─────────────────────────────────
CREATE POLICY "payments: 조회" ON public.payment_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR get_my_role() IN ('admin', 'developer')
    OR is_superadmin()
  );

CREATE POLICY "payments: 생성" ON public.payment_requests
  FOR INSERT WITH CHECK (get_my_role() IN ('developer', 'admin') OR is_superadmin());

CREATE POLICY "payments: 수정" ON public.payment_requests
  FOR UPDATE USING (get_my_role() IN ('admin', 'developer') OR is_superadmin());

-- ── bot_guilds 정책 ────────────────────────────────────────
-- service_role key(봇)만 쓰기, 로그인 유저는 읽기만
CREATE POLICY "bot_guilds: 읽기" ON public.bot_guilds
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── announcements 정책 ────────────────────────────────────
CREATE POLICY "announcements: 전체 읽기" ON public.announcements
  FOR SELECT USING (TRUE);

CREATE POLICY "announcements: admin 쓰기" ON public.announcements
  FOR ALL USING (get_my_role() = 'admin' OR is_superadmin());

-- ── site_settings 정책 ────────────────────────────────────
CREATE POLICY "settings: 읽기" ON public.site_settings
  FOR SELECT USING (TRUE);

CREATE POLICY "settings: admin 쓰기" ON public.site_settings
  FOR ALL USING (is_superadmin());

-- ============================================================
-- Realtime 활성화 (봇 Realtime 리스너용)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
