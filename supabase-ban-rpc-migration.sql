-- ─────────────────────────────────────────────────────────────────────────────
-- DIRO: ban_user / unban_user SECURITY DEFINER RPC functions
-- Run this in Supabase SQL Editor after the base ban migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- ban_user: superadmin-only, updates users + inserts notification
CREATE OR REPLACE FUNCTION ban_user(
  target_user_id uuid,
  ban_reason_text text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role   text;
  is_superadmin boolean;
BEGIN
  -- Verify caller is admin
  SELECT role INTO caller_role FROM users WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  -- Verify caller is the designated superadmin (bini2222)
  SELECT (username = 'bini2222') INTO is_superadmin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(is_superadmin, false) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  -- Apply ban
  UPDATE users
  SET is_banned  = true,
      ban_reason = ban_reason_text,
      banned_at  = now()
  WHERE id = target_user_id;

  -- Notify the banned user
  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    target_user_id,
    'ban',
    '계정이 차단되었습니다',
    CASE
      WHEN ban_reason_text IS NOT NULL THEN '차단 사유: ' || ban_reason_text
      ELSE '관리자에 의해 서비스 이용이 제한되었습니다.'
    END
  );

  RETURN json_build_object('success', true);
END;
$$;

-- unban_user: superadmin-only, clears ban fields + inserts notification
CREATE OR REPLACE FUNCTION unban_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role   text;
  is_superadmin boolean;
BEGIN
  SELECT role INTO caller_role FROM users WHERE id = auth.uid();
  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT (username = 'bini2222') INTO is_superadmin FROM users WHERE id = auth.uid();
  IF NOT COALESCE(is_superadmin, false) THEN
    RAISE EXCEPTION 'Forbidden: superadmin only';
  END IF;

  UPDATE users
  SET is_banned  = false,
      ban_reason = null,
      banned_at  = null
  WHERE id = target_user_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    target_user_id,
    'unban',
    '계정 차단이 해제되었습니다',
    '계정 차단이 해제되어 DIRO 서비스를 정상적으로 이용하실 수 있습니다.'
  );

  RETURN json_build_object('success', true);
END;
$$;

-- Grant execute to authenticated users (function itself enforces superadmin check)
GRANT EXECUTE ON FUNCTION ban_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION unban_user(uuid) TO authenticated;
