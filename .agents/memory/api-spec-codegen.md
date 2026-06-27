---
name: API spec codegen workflow
description: How to add a backend endpoint and get a typed React Query hook in this monorepo.
---

# Adding an API endpoint end-to-end

This monorepo generates the React client + zod from an OpenAPI spec — do NOT
hand-write client hooks.

1. Implement the Express route in `artifacts/api-server/src/routes/*.ts`.
2. Add the path + any new schema to `lib/api-spec/openapi.yaml` (give it an
   `operationId` — that becomes the hook name, e.g. `saveStudyGuide` ->
   `useSaveStudyGuide`).
3. Run `pnpm --filter @workspace/api-spec run codegen`. This runs orval AND
   `typecheck:libs`, regenerating `lib/api-client-react/src/generated/api.ts`
   (hooks + `get*QueryKey` helpers) and the zod layer.
4. Restart the api-server workflow (dev is build-then-start, no watch).

**Why:** the generated client is the only supported way to call the API from
the web app; skipping codegen leaves the hook missing and the web typecheck red.

**Gotcha:** during codegen the generated files are briefly deleted, so Vite may
log a transient "Failed to load url .../generated/api.ts" pre-transform error.
It self-resolves once codegen finishes — not a real failure if typecheck passes.

**Cache invalidation:** orval mutation hooks do NOT auto-invalidate. After a
create/save mutation, call `queryClient.invalidateQueries` with the relevant
`get*QueryKey()` (list + detail) or the new row won't show until refetch.
