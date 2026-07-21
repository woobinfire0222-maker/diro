# DIRO — Discord Server Management Platform

A premium Discord server creation/management platform ("프리미엄 Discord 서버 제작 플랫폼") built with a React + Vite frontend and an Express API backend.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui, Wouter (routing), TanStack Query |
| Backend | Express 5, Node.js 24, Pino logging, Discord.js 14 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |

## Project layout

```
artifacts/
  diro/          — React frontend (preview path: /)
  api-server/    — Express API server (preview path: /api)
  mockup-sandbox/ — Canvas/design preview server
```

## Running the project

Both services start automatically via the configured workflows:
- **DIRO (frontend)**: `pnpm --filter @workspace/diro run dev`
- **API Server**: `pnpm --filter @workspace/api-server run dev`

## Required secrets

All set in Replit Secrets:

| Secret | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → Bot → Token |

## Database schema

See `diro_schema.sql` at the project root for the full Supabase schema.

## User preferences

- Keep the existing monorepo structure (pnpm workspace)
- Korean-language UI is intentional
