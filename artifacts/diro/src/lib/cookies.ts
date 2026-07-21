/**
 * 브라우저 쿠키 유틸리티
 *
 * - Supabase 세션 저장 (로그아웃 전까지 유지)
 * - 사용자 설정값 저장 (테마, 사이드바 상태 등)
 */

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 365; // 1년 (초)
const DEFAULT_PATH = "/";

// ─── 저수준 API ───────────────────────────────────────────────────────────────

export function setCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;   // 초. 미지정 시 기본값(1년) 적용
    path?: string;
    sameSite?: "Strict" | "Lax" | "None";
    secure?: boolean;
  } = {},
) {
  const {
    maxAge  = DEFAULT_MAX_AGE,
    path    = DEFAULT_PATH,
    sameSite = "Lax",
    secure  = location.protocol === "https:",
  } = options;

  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  cookie += `; path=${path}`;
  cookie += `; max-age=${maxAge}`;
  cookie += `; samesite=${sameSite}`;
  if (secure) cookie += "; secure";

  document.cookie = cookie;
}

export function getCookie(name: string): string | null {
  const key = encodeURIComponent(name) + "=";
  for (const part of document.cookie.split(";")) {
    const c = part.trim();
    if (c.startsWith(key)) {
      return decodeURIComponent(c.slice(key.length));
    }
  }
  return null;
}

export function removeCookie(name: string, path = DEFAULT_PATH) {
  document.cookie = `${encodeURIComponent(name)}=; path=${path}; max-age=0`;
}

// ─── Supabase Storage Adapter ─────────────────────────────────────────────────
// Supabase createClient의 storage 옵션에 주입하면
// 세션(액세스 토큰 + 리프레시 토큰)을 localStorage 대신 쿠키에 저장합니다.

export const supabaseCookieStorage = {
  getItem(key: string): string | null {
    return getCookie(key);
  },
  setItem(key: string, value: string): void {
    // 리프레시 토큰이 포함된 세션 — 로그아웃 전까지 영구 유지
    setCookie(key, value, { maxAge: DEFAULT_MAX_AGE });
  },
  removeItem(key: string): void {
    removeCookie(key);
  },
} satisfies Storage;

// ─── 설정값 헬퍼 ──────────────────────────────────────────────────────────────

/** 사용자 설정값을 쿠키로 읽고 씁니다. */
export const prefCookies = {
  get(key: string): string | null {
    return getCookie(`diro_pref_${key}`);
  },
  set(key: string, value: string): void {
    setCookie(`diro_pref_${key}`, value, { maxAge: DEFAULT_MAX_AGE });
  },
  remove(key: string): void {
    removeCookie(`diro_pref_${key}`);
  },
};
