-- DIRO Platform - Migration v2
-- 개발자(developer) 역할 추가 및 주문 테이블 업데이트
-- Supabase SQL Editor에서 실행하세요

-- 1. users 테이블: role CHECK 제약 조건에 'developer' 추가
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'counselor', 'developer', 'user'));

-- 2. orders 테이블: developer_id 컬럼 추가
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS developer_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_developer_id ON public.orders(developer_id);

-- 3. payment_requests 테이블: awaiting_approval, approved 상태 추가
ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_status_check;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check
  CHECK (status IN ('pending', 'awaiting_approval', 'approved', 'paid', 'cancelled'));
