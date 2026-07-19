---
name: Orval Params type name collision (path + query params)
description: When an operation has both path params AND query params, Orval generates a {OperationIdPascal}Params type in both generated/api.ts and generated/types/, causing a TS2308 duplicate export error.
---

## Rule
Never put query params on an operation that also has path params, unless you are willing to restructure.

**Why:** Orval generates a Zod schema named `{OperationIdPascal}Params` in `api.ts` for query params, AND a TypeScript interface with the same name in `types/` for all params (path + query combined). The `lib/api-zod` barrel re-exports both with `export *`, causing TS2308.

**How to apply:**
- If an operation needs query params but also has path params, remove the query params from the spec and handle pagination/filtering via Supabase client directly in the frontend, OR
- Restructure to move query params to a different operation without path params.
- Operations with ONLY query params (no path params) are fine — Orval only generates one type in that case.
