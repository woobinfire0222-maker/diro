-- ══════════════════════════════════════════════════════════════
--  DIRO 쿠키 시스템 — Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════════════════════

-- 1. users 테이블에 cookie_balance 컬럼 추가
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cookie_balance integer NOT NULL DEFAULT 0
    CONSTRAINT cookie_balance_non_negative CHECK (cookie_balance >= 0);

-- 2. cookie_transactions 테이블
CREATE TABLE IF NOT EXISTS cookie_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       integer     NOT NULL,            -- 양수=획득, 음수=소모
  type         text        NOT NULL
    CHECK (type IN ('admin_grant', 'order_complete', 'spend', 'refund', 'admin_deduct')),
  description  text        NOT NULL,
  reference_id uuid        NULL,                -- 연결된 order_id 등
  created_by   uuid        NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. 트리거: 트랜잭션 삽입 시 cookie_balance 자동 갱신
CREATE OR REPLACE FUNCTION _update_cookie_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users
  SET cookie_balance = cookie_balance + NEW.amount
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_cookie_balance ON cookie_transactions;
CREATE TRIGGER trg_update_cookie_balance
  AFTER INSERT ON cookie_transactions
  FOR EACH ROW EXECUTE FUNCTION _update_cookie_balance();

-- 4. RLS
ALTER TABLE cookie_transactions ENABLE ROW LEVEL SECURITY;

-- 본인 내역 조회
CREATE POLICY "cookie_tx_select_own"
  ON cookie_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- 관리자 전체 조회
CREATE POLICY "cookie_tx_select_admin"
  ON cookie_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin')
    )
    OR auth.uid()::text = (
      SELECT id::text FROM users WHERE username = 'bini2222' LIMIT 1
    )
  );

-- 관리자/슈퍼관리자 지급·차감 가능
CREATE POLICY "cookie_tx_insert_admin"
  ON cookie_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin')
    )
    OR auth.uid()::text = (
      SELECT id::text FROM users WHERE username = 'bini2222' LIMIT 1
    )
  );

-- 5. Realtime 구독 (잔액 변경 즉시 반영)
ALTER PUBLICATION supabase_realtime ADD TABLE cookie_transactions;
