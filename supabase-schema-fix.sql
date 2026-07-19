-- ============================================================
-- DIRO 스키마 수정 패치 v2
-- ============================================================
-- 이 파일 하나만 Supabase SQL Editor에서 실행하면 됩니다.
-- 이미 성공한 부분은 OR REPLACE / IF NOT EXISTS 로 중복 안전합니다.
-- ============================================================

-- ── 1. 헬퍼 함수 ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT username = 'bini2222' FROM public.users WHERE id = auth.uid()), false)
$$;

-- ── 2. 누락 컬럼 추가 ────────────────────────────────────────

ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

-- ── 3. 트리거 함수 (OR REPLACE로 중복 안전) ───────────────────

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
      'verificationLevel', 'low',
      'categories', '[]'::json,
      'roles', json_build_array(
        json_build_object('id','role-1','name','@everyone','color','#000000','permissions','[]'::json)
      )
    )::text,
    '[]'
  );

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
    WHEN 'payment_pending' THEN '결제 요청이 도착했습니다'
    WHEN 'completed'       THEN '서버 제작이 완료되었습니다'
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
  IF notify_id IS NOT NULL THEN
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

-- ── 4. 관리자 통계 함수 ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_build_object(
    'total_orders',     (SELECT COUNT(*) FROM public.orders),
    'pending_orders',   (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    'active_orders',    (SELECT COUNT(*) FROM public.orders WHERE status IN ('consulting','building','payment_pending')),
    'completed_orders', (SELECT COUNT(*) FROM public.orders WHERE status = 'completed'),
    'total_users',      (SELECT COUNT(*) FROM public.users),
    'total_counselors', (SELECT COUNT(*) FROM public.users WHERE role = 'counselor'),
    'total_developers', (SELECT COUNT(*) FROM public.users WHERE role = 'developer'),
    'total_revenue',    (SELECT COALESCE(SUM(amount),0) FROM public.payment_requests WHERE status = 'paid')
  ) INTO result;
  RETURN result;
END;
$$;

-- ── 5. RLS 활성화 ─────────────────────────────────────────────

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_projects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements    ENABLE ROW LEVEL SECURITY;

-- ── 6. RLS 정책 (기존 DROP 후 재생성) ────────────────────────

-- users
DROP POLICY IF EXISTS "users_select"     ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_select"     ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

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
  USING (is_superadmin() OR get_my_role() = 'admin');

-- server_projects
DROP POLICY IF EXISTS "projects_select"    ON public.server_projects;
DROP POLICY IF EXISTS "projects_all_staff" ON public.server_projects;
CREATE POLICY "projects_select" ON public.server_projects FOR SELECT TO authenticated USING (
  is_superadmin() OR get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid()))
);
CREATE POLICY "projects_all_staff" ON public.server_projects FOR ALL TO authenticated
  USING (is_superadmin() OR get_my_role() IN ('admin','counselor'))
  WITH CHECK (is_superadmin() OR get_my_role() IN ('admin','counselor'));

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
  USING (sender_id = auth.uid());
CREATE POLICY "messages_delete" ON public.order_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR is_superadmin() OR get_my_role() = 'admin');

-- notifications
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- payment_requests
DROP POLICY IF EXISTS "payments_select" ON public.payment_requests;
DROP POLICY IF EXISTS "payments_insert" ON public.payment_requests;
DROP POLICY IF EXISTS "payments_update" ON public.payment_requests;
CREATE POLICY "payments_select" ON public.payment_requests FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_superadmin() OR get_my_role() IN ('admin','counselor')
);
CREATE POLICY "payments_insert" ON public.payment_requests FOR INSERT TO authenticated
  WITH CHECK (is_superadmin() OR get_my_role() IN ('admin','counselor'));
CREATE POLICY "payments_update" ON public.payment_requests FOR UPDATE TO authenticated
  USING (is_superadmin() OR get_my_role() = 'admin');

-- announcements
DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
DROP POLICY IF EXISTS "announcements_write"  ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcements_write"  ON public.announcements FOR ALL TO authenticated
  USING (is_superadmin() OR get_my_role() = 'admin')
  WITH CHECK (is_superadmin() OR get_my_role() = 'admin');

-- ── 7. 인덱스 ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_user_id      ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_counselor_id ON public.orders(counselor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_messages_order_id   ON public.order_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_id       ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread        ON public.notifications(user_id, is_read);
