# DIRO (디로)

Discord 서버 맞춤 제작 플랫폼.

## 프로젝트 구조

```
artifacts/diro/        - React + Vite 프론트엔드 (Replit & GitHub Pages 배포)
artifacts/api-server/  - Express API 서버 (현재 미사용 — 프론트엔드는 Supabase 직접 호출)
lib/db/                - Drizzle ORM 스키마
lib/api-spec/          - OpenAPI 스펙
lib/api-client-react/  - 생성된 API 클라이언트 (현재 미사용)
lib/api-zod/           - 생성된 Zod 유효성 검사기
bot.ts                 - Discord 봇 (별도 실행, Replit에서 구동하지 않음)
```

## Replit 실행

프론트엔드만 실행합니다:
- **Workflow**: `artifacts/diro: web` → `pnpm --filter @workspace/diro run dev`

## 필요한 환경 변수 (Secrets)

| 변수 | 용도 |
|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | Supabase anon 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 역할 키 (봇 전용) |
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 (봇 전용) |

## Discord 봇 별도 실행

`bot.ts`는 Realtime으로 `orders.status = 'applying'` 이벤트를 감지하여 Discord 서버를 구성합니다.

```bash
# 별도 Node.js 환경에서 실행
npm install discord.js @supabase/supabase-js dotenv
npm install -D tsx typescript @types/node

DISCORD_BOT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx bot.ts
```

## 주문 상태 흐름

```
pending → consulting → transferred → building → payment_pending → completed
                    ↑ 상담사 "넘기기"  ↑ 개발자 "이어받기"
```

## GitHub Pages 배포

`artifacts/diro`를 빌드하여 정적 사이트로 배포합니다.
모든 API는 Supabase 클라이언트를 직접 호출합니다 (별도 서버 불필요).

```bash
BASE_PATH=/diro/ SUPABASE_URL=... SUPABASE_ANON_KEY=... pnpm --filter @workspace/diro run build
```

## 주요 변경 이력

- 상담사 "개발자에게 넘기기" 버튼 추가 (status: transferred)
- 개발자 "이어받기" 목록 = transferred 상태만 표시
- 내 서버 목록 = completed 상태만 표시
- bot.ts: ServerEditor 중첩 채널 형식 파싱 수정 (Discord 적용 버그 수정)
- bot.ts: 적용 시 기존 채널·역할 전부 삭제 후 새로 생성
