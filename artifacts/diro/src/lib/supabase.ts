import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Supabase 세션은 localStorage에 저장합니다.
// (세션 JSON이 4KB를 초과해 브라우저 쿠키에 직접 저장할 수 없습니다)
// localStorage는 탭을 닫아도 유지되므로 로그아웃 전까지 로그인 상태가 유지됩니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
  },
});
