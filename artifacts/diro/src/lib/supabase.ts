import { createClient } from '@supabase/supabase-js';
import { supabaseCookieStorage, setCookie, removeCookie } from './cookies';

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL     || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// ── localStorage → Cookie 1회 마이그레이션 ──────────────────────────────────
// 기존에 localStorage에 저장된 Supabase 세션을 쿠키로 옮깁니다.
// 이미 쿠키에 있으면 건너뜁니다.
function migrateLocalStorageToCookies() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('sb-')) continue;          // Supabase 키만 처리
      if (supabaseCookieStorage.getItem(key) !== null) continue; // 이미 쿠키에 있음
      const val = localStorage.getItem(key);
      if (val) setCookie(key, val);                   // 쿠키로 복사
    }
    // 마이그레이션 후 localStorage의 Supabase 항목 제거
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // 시크릿 모드 등 localStorage 접근 불가 환경에서는 조용히 무시
  }
}

migrateLocalStorageToCookies();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 세션을 localStorage 대신 쿠키에 저장
    // → 브라우저 탭을 닫아도 로그아웃 전까지 로그인 상태 유지
    storage:          supabaseCookieStorage,
    persistSession:   true,
    autoRefreshToken: true,
  },
});
