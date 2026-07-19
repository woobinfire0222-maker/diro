# DIRO (디로)

A premium Discord server custom-creation platform where users order custom Discord servers, consult with a counselor via real-time chat, and have their server built and deployed via Discord Bot.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/diro run dev` — run the DIRO frontend (port 24277)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, TailwindCSS, Framer Motion, @supabase/supabase-js
- Backend: Express 5
- Database: Supabase (PostgreSQL + Auth + Realtime + Storage)
- Auth: Supabase Auth with Discord OAuth2
- Discord Bot: discord.js
- API codegen: Orval (from OpenAPI spec)

## Where things live

- `artifacts/diro/` — React frontend (Vite)
- `artifacts/api-server/` — Express backend
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react/` — Generated React Query hooks (do not edit)
- `lib/api-zod/` — Generated Zod schemas (do not edit)
- `supabase-schema.sql` — Database schema to run in Supabase SQL Editor

## Architecture decisions

- Supabase handles auth (Discord OAuth2), real-time, and primary data storage
- Express backend uses Supabase service_role key to bypass RLS for privileged operations
- Frontend uses Supabase anon key + JWT for all queries; Supabase Realtime for live chat
- Server configurations stored as JSON strings in `config_json` column (avoids Orval's `looseObject` zod v3 incompatibility)
- Discord Bot operations (verify server, apply config) go through the Express backend

## Product

- **Login**: Discord OAuth2 via Supabase Auth
- **Home**: Dashboard with recent orders, progress tracking, and quick order creation
- **Orders**: Multi-step order form (server type, structure, budget), status tracking
- **Chat**: Discord-style real-time chat with Supabase Realtime; supports text, images, files, payment cards, and preview cards
- **Counselor Dashboard**: Order management, in-app Discord server editor, payment requests via Toss deeplink
- **Discord Server Editor**: Full Discord-like editor with drag-and-drop channels/categories/roles
- **Admin Panel**: Platform stats, user management, order management, announcements
- **Discord Bot**: Applies server config to real Discord servers via Discord API

## Setup required

1. **Supabase Database**: Run `supabase-schema.sql` in your Supabase SQL Editor
2. **Supabase Auth**: Enable Discord OAuth provider in Supabase Dashboard → Authentication → Providers → Discord
   - Set Client ID: your Discord Application's OAuth2 Client ID
   - Set Client Secret: your Discord Application's OAuth2 Client Secret
   - Add redirect URL: `https://mhwszzaaotwxoituugcv.supabase.co/auth/v1/callback`
3. **Discord App**: In Discord Developer Portal → OAuth2, add the Supabase callback URL as a redirect URI
4. **Discord Bot**: Invite the bot to any server you want to test with

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before building
- Avoid `type: object` without `additionalProperties: false` in openapi.yaml — Orval v8 generates `zod.looseObject()` which doesn't exist in zod v3
- Operations with both path AND query params collide on `{OperationId}Params` type name — remove query params or restructure
- Never use `zod/v4` imports — this project uses zod v3 (`zod` package, `z.object` etc.)
- Supabase Realtime requires tables to be added to `supabase_realtime` publication (done in schema.sql)
