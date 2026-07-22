# DIRO (디로)

A premium Discord server custom-creation platform. Users log in, submit server orders, and chat with counselors who build the server using a Discord-like editor. The finished structure is applied to a real Discord server via bot.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TailwindCSS v4 + Framer Motion + Wouter |
| Backend | Node.js + Express (ESM, built with esbuild) |
| Database | Supabase (PostgreSQL via Drizzle ORM) |
| Auth | Supabase Auth (email/password + Discord OAuth2) |
| Realtime | Supabase Realtime (WebSocket) |
| Bot | Discord.js (standalone `bot.ts` + embedded in API server) |
| Shared libs | `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, `lib/db` |

## Artifacts / Services

| Artifact | Path | Port env var | Dev command |
|----------|------|-------------|-------------|
| Frontend (DIRO web app) | `artifacts/diro` | `PORT` | `pnpm --filter @workspace/diro run dev` |
| Backend (API Server) | `artifacts/api-server` | `PORT` | `pnpm --filter @workspace/api-server run dev` |
| Mockup sandbox | `artifacts/mockup-sandbox` | `PORT` | `pnpm --filter @workspace/mockup-sandbox run dev` |

## How to run

All three workflows are managed by Replit automatically. The main ones are:

- **`artifacts/diro: web`** — React frontend (preview at `/`)
- **`artifacts/api-server: API Server`** — Express API (preview at `/api`)

Install dependencies from the workspace root:
```bash
pnpm install
```

## Required Secrets (Replit Secrets)

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin operations) |
| `SUPABASE_DATABASE_URL` | PostgreSQL connection string (with real password) |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` — exposed to Vite frontend |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` — exposed to Vite frontend |
| `DISCORD_BOT_TOKEN` | Discord bot token for server integration |

> **Note:** `DATABASE_URL` is reserved by Replit's runtime. This project uses `SUPABASE_DATABASE_URL` instead (see `lib/db/src/index.ts`).

## Database schema

The Supabase schema lives in `diro_schema.sql`. Run it in the Supabase SQL Editor to create all tables.

## Standalone Discord bot

`bot.ts` at the repo root is a standalone bot runner (separate from the embedded bot in the API server). Run with:
```bash
npx tsx bot.ts
```

## User preferences

- Keep existing project structure and stack — do not restructure unless asked.
