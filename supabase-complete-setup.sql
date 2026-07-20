-- ============================================================
-- DIRO 완전 설치/수정 SQL (한 파일로 전부 해결)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- 이미 실행된 부분은 IF NOT EXISTS / OR REPLACE 로 안전합니다.
-- ============================================================


-- ── 헬퍼 함수 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT username = 'bini2222' FROM public.users WHERE id = auth.uid()), false)
$$;


-- ── 테이블 ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  username      TEXT,
  display_name  TEXT,
  avatar        TEXT,
  discord_id    TEXT,
  role          TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('admin','counselor','developer','user')),
  is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason    TEXT,
  banned_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- 누락 컬럼 보완
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_banned   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ban_reason  TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned_at   TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         TEXT NOT NULL UNIQUE,
  user_id              UUID NOT NULL REFERENCES public.users(id),
  counselor_id         UUID REFERENCES public.users(id),
  developer_id         UUID REFERENCES public.users(id),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','consulting','building','payment_pending','completed','cancelled','applying','failed')),
  server_name          TEXT NOT NULL,
  server_description   TEXT,
  atmosphere           TEXT NOT NULL,
  category_count       INT,
  text_channel_count   INT,
  voice_channel_count  INT,
  desired_roles        TEXT,
  desired_permissions  TEXT,
  desired_features     TEXT,
  discord_server_id    TEXT,
  budget               NUMERIC NOT NULL,
  price                NUMERIC,
  additional_notes     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS developer_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.server_projects (
  order_id          UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  config_json       TEXT NOT NULL DEFAULT '{}',
  history_json      TEXT NOT NULL DEFAULT '[]',
  apply_result_json TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- order_messages.type에 'payment' 추가 (CHECK 제약 수정)
DO $$
BEGIN
  ALTER TABLE public.order_messages DROP CONSTRAINT IF EXISTS order_messages_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

CREATE TABLE IF NOT EXISTS public.order_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES public.users(id),
  content        TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'text'
                   CHECK (type IN ('text','system','preview','payment')),
  is_edited      BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 이미 테이블이 있으면 CHECK만 교체
ALTER TABLE public.order_messages DROP CONSTRAINT IF EXISTS order_messages_type_check;
ALTER TABLE public.order_messages
  ADD CONSTRAINT order_messages_type_check
  CHECK (type IN ('text','system','preview','payment'));

CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  reference_id  UUID,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES public.orders(id),
  user_id    UUID REFERENCES public.users(id),
  amount     NUMERIC NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','awaiting_approval','approved','paid','cancelled')),
  method     TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_requests
  DROP CONSTRAINT IF EXISTS payment_requests_status_check;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_status_check
  CHECK (status IN ('pending','awaiting_approval','approved','paid','cancelled'));
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

CREATE TABLE IF NOT EXISTS public.announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 인덱스 ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_counselor_id  ON public.orders(counselor_id);
CREATE INDEX IF NOT EXISTS idx_orders_developer_id  ON public.orders(developer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_messages_order_id    ON public.order_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_id        ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread         ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_users_is_banned      ON public.users(is_banned);


-- ── 트리거 ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, display_name, avatar)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'username'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


CREATE OR REPLACE FUNCTION public.handle_order_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.server_projects (order_id, config_json, history_json)
  VALUES (
    NEW.id,
    json_build_object(
      'serverName', NEW.server_name,
      'serverDescription', COALESCE(NEW.server_description, ''),
      'verificationLevel', 'low',
      'explicitContentFilter', 'members_without_roles',
      'defaultNotifications', 'only_mentions',
      'mfaLevel', 'none',
      'afkTimeout', 300,
      'community', false,
      'categories', '[]'::json,
      'roles', json_build_array(
        json_build_object('id','role-1','name','@everyone','color','#000000','hoist',false,'mentionable',false,'permissions','[]'::json)
      ),
      'welcomeScreen', json_build_object('enabled',false,'description',''),
      'autoMod', json_build_object('filterExplicit',false,'filterSpam',false,'filterMentionSpam',false,'blockLinks',false,'keywords','')
    )::text,
    '[]'
  )
  ON CONFLICT (order_id) DO NOTHING;

  INSERT INTO public.order_messages (order_id, sender_id, content, type)
  VALUES (NEW.id, NEW.user_id, '주문이 생성되었습니다. 상담사가 곧 연결될 예정입니다.', 'system');

  INSERT INTO public.notifications (user_id, type, title, body, reference_id)
  SELECT u.id, 'new_order', '새 주문: ' || NEW.server_name,
         '예산: ₩' || to_char(NEW.budget, 'FM999,999,999'), NEW.id
  FROM public.users u WHERE u.role IN ('admin','counselor');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_order_created ON public.orders;
CREATE TRIGGER on_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_created();


CREATE OR REPLACE FUNCTION public.handle_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE label TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  label := CASE NEW.status
    WHEN 'consulting'      THEN '상담이 시작되었습니다'
    WHEN 'building'        THEN '서버 제작이 시작되었습니다'
    WHEN 'payment_pending' THEN '결제 요청이 도착했습니다. 결제 후 서버 제작이 완료됩니다.'
    WHEN 'completed'       THEN '서버 제작이 완료되었습니다 🎉'
    WHEN 'cancelled'       THEN '주문이 취소되었습니다'
    ELSE NULL
  END;
  IF label IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, reference_id)
    VALUES (NEW.user_id, 'status_change', label, '주문 #' || NEW.order_number, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_order_status_change ON public.orders;
CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_change();


CREATE OR REPLACE FUNCTION public.handle_message_sent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_order public.orders%ROWTYPE; notify_id UUID;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.sender_id = v_order.user_id THEN
    notify_id := v_order.counselor_id;
  ELSE
    notify_id := v_order.user_id;
  END IF;
  IF notify_id IS NOT NULL AND notify_id != NEW.sender_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, reference_id)
    VALUES (notify_id, 'new_message', '새 메시지', substring(NEW.content FROM 1 FOR 100), NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_message_sent ON public.order_messages;
CREATE TRIGGER on_message_sent
  AFTER INSERT ON public.order_messages
  FOR EACH ROW WHEN (NEW.type = 'text')
  EXECUTE FUNCTION public.handle_message_sent();


-- ── RPC 함수 ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_build_object(
    'total_orders',     (SELECT COUNT(*) FROM public.orders),
    'pending_orders',   (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    'consulting_orders',(SELECT COUNT(*) FROM public.orders WHERE status = 'consulting'),
    'building_orders',  (SELECT COUNT(*) FROM public.orders WHERE status = 'building'),
    'completed_orders', (SELECT COUNT(*) FROM public.orders WHERE status = 'completed'),
    'cancelled_orders', (SELECT COUNT(*) FROM public.orders WHERE status = 'cancelled'),
    'total_users',      (SELECT COUNT(*) FROM public.users),
    'total_counselors', (SELECT COUNT(*) FROM public.users WHERE role = 'counselor'),
    'total_developers', (SELECT COUNT(*) FROM public.users WHERE role = 'developer'),
    'total_revenue',    (SELECT COALESCE(SUM(amount),0) FROM public.payment_requests WHERE status = 'paid'),
    'orders_this_week', (SELECT COUNT(*) FROM public.orders WHERE created_at >= NOW() - INTERVAL '7 days'),
    'active_chats',     (SELECT COUNT(*) FROM public.orders WHERE status IN ('consulting','building'))
  ) INTO result;
  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION public.ban_user(
  target_user_id uuid,
  ban_reason_text text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role text; is_sa boolean;
BEGIN
  SELECT role INTO caller_role FROM users WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  SELECT (username = 'bini2222') INTO is_sa FROM users WHERE id = auth.uid();
  IF NOT COALESCE(is_sa, false) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;
  UPDATE users SET is_banned = true, ban_reason = ban_reason_text, banned_at = now()
  WHERE id = target_user_id;
  INSERT INTO notifications (user_id, type, title, body)
  VALUES (target_user_id, 'ban', '계정이 차단되었습니다',
    CASE WHEN ban_reason_text IS NOT NULL THEN '차단 사유: ' || ban_reason_text
         ELSE '관리자에 의해 서비스 이용이 제한되었습니다.' END);
  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unban_user(target_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller_role text; is_sa boolean;
BEGIN
  SELECT role INTO caller_role FROM users WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  SELECT (username = 'bini2222') INTO is_sa FROM users WHERE id = auth.uid();
  IF NOT COALESCE(is_sa, false) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;
  UPDATE users SET is_banned = false, ban_reason = null, banned_at = null
  WHERE id = target_user_id;
  INSERT INTO notifications (user_id, type, title, body)
  VALUES (target_user_id, 'unban', '계정 차단이 해제되었습니다',
    '계정 차단이 해제되어 DIRO 서비스를 정상적으로 이용하실 수 있습니다.');
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ban_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unban_user(uuid) TO authenticated;


-- ── RLS 활성화 ────────────────────────────────────────────────

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements    ENABLE ROW LEVEL SECURITY;


-- ── RLS 정책 ─────────────────────────────────────────────────

-- users
DROP POLICY IF EXISTS "users_select"        ON public.users;
DROP POLICY IF EXISTS "users_update_own"    ON public.users;
DROP POLICY IF EXISTS "admin_update_users"  ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated USING (true);

-- 본인 업데이트 (display_name, avatar 등)
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 관리자 업데이트 (역할 변경, 차단)
CREATE POLICY "admin_update_users" ON public.users
  FOR UPDATE TO authenticated
  USING   (is_superadmin() OR get_my_role() = 'admin')
  WITH CHECK (is_superadmin() OR get_my_role() = 'admin');


-- orders
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_update" ON public.orders;
DROP POLICY IF EXISTS "orders_delete" ON public.orders;

CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated USING (
  is_superadmin() OR get_my_role() = 'admin'
  OR (get_my_role() = 'counselor'  AND (counselor_id = auth.uid() OR status = 'pending'))
  OR (get_my_role() = 'developer'  AND (developer_id = auth.uid() OR status = 'consulting'))
  OR (get_my_role() = 'user'       AND user_id = auth.uid())
);
CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (is_superadmin() OR get_my_role() IN ('admin','counselor','developer'));
CREATE POLICY "orders_delete" ON public.orders FOR DELETE TO authenticated
  USING (is_superadmin() OR get_my_role() = 'admin'
         OR (user_id = auth.uid() AND status IN ('pending','cancelled')));


-- server_projects (버그 수정: developer 포함)
DROP POLICY IF EXISTS "projects_select"    ON public.server_projects;
DROP POLICY IF EXISTS "projects_all_staff" ON public.server_projects;
DROP POLICY IF EXISTS "projects_write"     ON public.server_projects;

CREATE POLICY "projects_select" ON public.server_projects FOR SELECT TO authenticated USING (
  is_superadmin() OR get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid()))
);

-- INSERT / UPDATE / DELETE: admin, counselor, developer 모두 허용
CREATE POLICY "projects_write" ON public.server_projects
  FOR ALL TO authenticated
  USING   (is_superadmin() OR get_my_role() IN ('admin','counselor','developer'))
  WITH CHECK (is_superadmin() OR get_my_role() IN ('admin','counselor','developer'));


-- order_messages
DROP POLICY IF EXISTS "messages_select"     ON public.order_messages;
DROP POLICY IF EXISTS "messages_insert"     ON public.order_messages;
DROP POLICY IF EXISTS "messages_update_own" ON public.order_messages;
DROP POLICY IF EXISTS "messages_delete"     ON public.order_messages;

CREATE POLICY "messages_select" ON public.order_messages FOR SELECT TO authenticated USING (
  is_superadmin() OR get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid()
         OR (get_my_role() = 'developer' AND o.status = 'consulting')))
);
CREATE POLICY "messages_insert" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND (
    is_superadmin() OR get_my_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid()))
  )
);
CREATE POLICY "messages_update_own" ON public.order_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR is_superadmin() OR get_my_role() = 'admin');
CREATE POLICY "messages_delete" ON public.order_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR is_superadmin() OR get_my_role() = 'admin');


-- notifications
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- payment_requests (버그 수정: developer 포함)
DROP POLICY IF EXISTS "payments_select" ON public.payment_requests;
DROP POLICY IF EXISTS "payments_insert" ON public.payment_requests;
DROP POLICY IF EXISTS "payments_update" ON public.payment_requests;

CREATE POLICY "payments_select" ON public.payment_requests FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_superadmin() OR get_my_role() IN ('admin','counselor','developer')
);
-- developer도 삽입 가능 (자신의 담당 주문에 대한 결제 요청)
CREATE POLICY "payments_insert" ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (is_superadmin() OR get_my_role() IN ('admin','counselor','developer'));
CREATE POLICY "payments_update" ON public.payment_requests FOR UPDATE TO authenticated
  USING (is_superadmin() OR get_my_role() = 'admin');


-- announcements — 슈퍼관리자만 쓸 수 있음
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
DROP POLICY IF EXISTS "announcements_write"  ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcements_write"  ON public.announcements FOR ALL TO authenticated
  USING   (is_superadmin())
  WITH CHECK (is_superadmin());


-- ── site_settings (점검 모드 등 사이트 설정) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 점검 모드 여부는 비로그인(anon)도 읽어야 함
DROP POLICY IF EXISTS "site_settings_read"  ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_write" ON public.site_settings;
CREATE POLICY "site_settings_read"  ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "site_settings_write" ON public.site_settings FOR ALL TO authenticated
  USING   (is_superadmin())
  WITH CHECK (is_superadmin());

-- 기본값 삽입 (이미 있으면 무시)
INSERT INTO public.site_settings (key, value)
VALUES ('maintenance_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 완료! 이 파일을 실행한 뒤 Supabase 대시보드에서:
--   1. Table Editor > order_messages > Enable Realtime 켜기
--   2. Table Editor > notifications   > Enable Realtime 켜기
--   3. Authentication > Email > "Confirm email" 끄기 (이메일 인증 없이 바로 가입)
--   4. Edge Functions에 DISCORD_BOT_TOKEN 시크릿 등록
-- ============================================================
