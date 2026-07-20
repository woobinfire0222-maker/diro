-- ============================================================
-- DIRO: 'transferred' 상태 추가 마이그레이션
-- 
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================

-- 1. orders.status CHECK 제약 조건에 'transferred' 추가
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'consulting',
    'transferred',
    'building',
    'payment_pending',
    'completed',
    'cancelled',
    'applying',
    'failed'
  ));

-- 2. RLS: orders_select — 개발자가 'transferred' 상태 주문도 볼 수 있도록 수정
DROP POLICY IF EXISTS "orders_select" ON public.orders;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_superadmin()
    OR get_my_role() IN ('admin')
    OR (get_my_role() = 'counselor'  AND (counselor_id = auth.uid() OR status = 'pending'))
    OR (get_my_role() = 'developer'  AND (developer_id = auth.uid() OR status = 'transferred'))
  );

-- 3. RLS: order_messages — 개발자가 transferred 주문의 채팅도 볼 수 있도록 수정
DROP POLICY IF EXISTS "messages_select"     ON public.order_messages;
DROP POLICY IF EXISTS "messages_insert"     ON public.order_messages;
DROP POLICY IF EXISTS "messages_update_own" ON public.order_messages;
DROP POLICY IF EXISTS "messages_delete"     ON public.order_messages;

CREATE POLICY "messages_select" ON public.order_messages FOR SELECT TO authenticated USING (
  is_superadmin() OR get_my_role() = 'admin'
  OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid()
         OR (get_my_role() = 'developer' AND o.status = 'transferred')))
);
CREATE POLICY "messages_insert" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND (
    is_superadmin() OR get_my_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.user_id = auth.uid() OR o.counselor_id = auth.uid() OR o.developer_id = auth.uid())))
);
CREATE POLICY "messages_update_own" ON public.order_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_delete" ON public.order_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR is_superadmin() OR get_my_role() = 'admin');

-- 4. 상태 변경 알림 트리거 함수에 'transferred' 라벨 추가
CREATE OR REPLACE FUNCTION public.handle_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE label TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  label := CASE NEW.status
    WHEN 'consulting'     THEN '상담이 시작되었습니다'
    WHEN 'transferred'    THEN '개발팀에 전달되었습니다'
    WHEN 'building'       THEN '서버 제작이 시작되었습니다'
    WHEN 'payment_pending' THEN '결제 요청이 도착했습니다'
    WHEN 'completed'      THEN '서버 제작이 완료되었습니다'
    WHEN 'cancelled'      THEN '주문이 취소되었습니다'
    WHEN 'applying'       THEN 'Discord 서버에 적용 중입니다'
    WHEN 'failed'         THEN '적용 중 오류가 발생했습니다'
    ELSE NULL
  END;
  IF label IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, reference_id)
    VALUES (NEW.user_id, 'status_change', label, '주문 #' || NEW.order_number, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
