#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# Rebuild shared lib .d.ts files so downstream typechecks see schema /
# generated-type changes after a merge (otherwise stale dist/*.d.ts in
# composite project references fail builds even when src/ is correct).
rm -rf lib/db/dist lib/api-zod/dist lib/api-client-react/dist \
       lib/integrations-openai-ai-server/dist lib/integrations-anthropic-ai/dist
pnpm run typecheck:libs
