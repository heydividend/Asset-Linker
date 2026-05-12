#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Rebuild shared package .d.ts files so downstream typechecks see new schema
# columns / generated types after a merge (otherwise stale dist/*.d.ts in
# composite project references will fail builds even though src/ is correct).
rm -rf lib/db/dist lib/api-spec/dist lib/api-zod/dist lib/api-client-react/dist
pnpm -r --if-present run build
