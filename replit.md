# DIRO (디로)

A premium Discord server custom-creation platform. Users sign in, request a custom Discord server, chat with a consultant in real time, and receive a fully configured server applied via a Discord bot.

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite (`artifacts/diro`) — served at `/`
- **API Server**: Express 5 (`artifacts/api-server`) — served at `/api`
- **Canvas/Mockup**: Vite sandbox (`artifacts/mockup-sandbox`) — served at `/__mockup`
- **Auth & DB**: Supabase (Auth + Postgres)
- **Discord integration**: discord.js bot (`DISCORD_BOT_TOKEN`)
- **Shared libs**: `lib/api-client-react`, `lib/api-spec`, `lib/api-zod`, `lib/db`

## Running the project

```bash
pnpm install          # install all workspace dependencies
```

Workflows (managed by Replit):
| Workflow | Command |
|---|---|
| `artifacts/diro: web` | `pnpm --filter @workspace/diro run dev` |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` |

## Required secrets

| Secret | Used by |
|---|---|
| `VITE_SUPABASE_URL` | Frontend |
| `VITE_SUPABASE_ANON_KEY` | Frontend |
| `SUPABASE_URL` | API Server |
| `SUPABASE_ANON_KEY` | API Server |
| `SUPABASE_SERVICE_ROLE_KEY` | API Server |
| `DISCORD_BOT_TOKEN` | API Server (discord.js bot) |

## User preferences
