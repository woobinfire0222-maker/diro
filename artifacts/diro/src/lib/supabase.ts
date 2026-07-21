import { createClient } from '@supabase/supabase-js';
import { supabaseCookieStorage } from './cookies';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 세션을 localStorage 대신 쿠키에 저장
    // → 브라우저 탭을 닫아도 로그아웃 전까지 로그인 상태 유지
    storage:         supabaseCookieStorage,
    persistSession:  true,
    autoRefreshToken: true,
  },
});
