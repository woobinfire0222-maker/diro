# DIRO (디로)

A premium Discord server customization platform. Users log in, request a custom Discord server, chat with a counselor in real time, and the counselor builds it using a Discord-like in-app editor — then deploys it to the real server via a Discord bot.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite + Tailwind CSS v4 + shadcn/ui (`artifacts/diro`) |
| API Server | Express 5 + Pino logging (`artifacts/api-server`) |
| Discord Bot | discord.js v14 (runs inside the API server) |
| Database / Auth | Supabase (PostgreSQL + Auth) |
| API Contract | OpenAPI spec → Orval-generated Zod validators + React Query hooks (`lib/`) |

## Running on Replit

Two workflows run this project:

- **`artifacts/diro: web`** — Vite dev server for the React frontend (preview path: `/`)
- **`artifacts/api-server: API Server`** — Express API + Discord bot (preview path: `/api`)

Both start automatically. The frontend is available at the root preview URL.

## Required Secrets

| Secret | Where to get it |
|--------|----------------|
| `SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API (keep secret) |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → Bot |

## Project Structure

```
artifacts/
  diro/          # React frontend
  api-server/    # Express API + Discord bot
  mockup-sandbox/# Canvas/design preview server
lib/
  api-spec/      # OpenAPI spec (openapi.yaml)
  api-zod/       # Generated Zod validators
  api-client-react/ # Generated React Query hooks
  db/            # Drizzle ORM schema + client
bot.ts           # Standalone Discord bot script (alternative entry)
```

## User Preferences

- Keep the existing pnpm monorepo structure and stack — do not migrate or restructure.
