# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BOC Study Notebook — a single-user study companion for Athletic Training students preparing for the Board of Certification (BOC) exam. NotebookLM-style 3-panel notebooks (sources / generated content / AI tutor), adaptive + daily practice quizzes, a strict timed mock exam, weak-area tracking, a weakness-first "BOC Pass Plan", study games, study groups, and Web Push reminders. Study window: May 11 → June 6, 2026. Live app: https://bocforme.replit.app

Everything is grounded in the **BOC Practice Analysis, 8th Edition (PA8) blueprint** — the central organizing concept for domains, topics, importance/frequency weighting, mock-exam distribution, and AI-tutor grounding. The blueprint metadata lives in `artifacts/api-server/src/lib/pa8Reference.ts` and `pa8Blueprint.ts`.

`README.md` is the up-to-date product/feature overview; `replit.md` goes deeper on architecture decisions but predates several subsystems now in the tree (study groups, games, reminders/web-push, review sheets, daily quiz, AI learning, blueprint, body map). Read both alongside this file.

## Commands

This is a **pnpm workspace** (Node 24, TypeScript 5.9). npm/yarn are blocked by a `preinstall` guard — always use pnpm.

```bash
# Run the two services (typically both, in separate terminals)
pnpm --filter @workspace/api-server run dev    # API server on :8080 (rebuilds via esbuild, then starts)
pnpm --filter @workspace/boc-notebook run dev  # web app (Vite, host 0.0.0.0)

# Typecheck
pnpm run typecheck                              # full: libs (tsc --build) then artifacts + scripts
pnpm --filter @workspace/api-server run typecheck

# Tests (api-server — node:test runner)
pnpm --filter @workspace/api-server run test    # runs the full curated test list
node --import tsx --test artifacts/api-server/src/routes/quizzes.test.ts   # single test file

# E2E (web — Playwright)
pnpm --filter @workspace/boc-notebook run test:e2e
pnpm --filter @workspace/boc-notebook run test:e2e:study-group

# API contract codegen — after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen   # regenerates hooks + Zod, then typecheck:libs

# DB (dev only)
pnpm --filter @workspace/db run push            # push schema changes (drizzle-kit)
pnpm tsx artifacts/api-server/src/seed.ts       # seed domains, topics, schedule, starter notebook, sample questions
```

Required env: `DATABASE_URL`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`.

## Architecture

**Workspaces:** `artifacts/*` (deployable apps), `lib/*` (shared packages), `lib/integrations/*`, `scripts`.

- `artifacts/api-server` (`@workspace/api-server`) — Express 5 API, Drizzle ORM, PostgreSQL, Zod (`zod/v4`). Bundled to an ESM file with **esbuild** via `build.mjs`; entry runs from `dist/index.mjs`.
- `artifacts/boc-notebook` (`@workspace/boc-notebook`) — React 19 + Vite, wouter routing, TanStack Query, shadcn/ui + Tailwind v4, zustand.
- `artifacts/mockup-sandbox` — design/mockup scratch space.
- `lib/api-spec` — **source of truth** `openapi.yaml`; Orval generates react-query hooks into `lib/api-client-react/` and Zod schemas into `lib/api-zod/`. Both are generated — never hand-edit.
- `lib/db` — Drizzle schema, one file per table under `src/schema/` (notebooks, notes, flashcards, studyGuides, audioOverviews, quizzes, mockExams, questions, conversations, messages, scrapeJobs, examSchedule, topics/domains, mastery tables, planCompletions/fixItCompletions, dailyQuizSets, gameSessions, studyGroup, reminderPrefs/pushSubscriptions, readinessSnapshots, tasks).
- `lib/integrations*` — OpenAI proxy (Replit AI Integrations) and an Anthropic integration package.

**API surface** lives in `artifacts/api-server/src/routes/` (one router per domain: notebooks, notes, flashcards, studyGuides, quizzes, mockExams, dailyQuiz via `aiLearning`, plan/planCompletions, reviewSheets, studyGroup, gameSessions, reminders, audioOverviews, tts, topicPodcasts, blueprint, catalog, dashboard, fixItPlan, openai, health). Non-trivial domain logic is factored into `src/lib/` (scoring, scheduleBuilder, domainMastery, reminderScheduler, webPush, scraperAllowlist, pa8Blueprint/pa8Reference, classifyTask, etc.) — check there before adding logic to a route.

**Web pages** are in `artifacts/boc-notebook/src/pages/`. Routes are **singular** (e.g. `/quiz`, `/mock-exam`). The sidebar component is `Sidebar.tsx` (not `AppSidebar.tsx`).

**AI:** OpenAI via the Replit AI Integrations proxy — `gpt-5-mini` for chat/generation, `gpt-4o-mini-tts` for audio overviews.

## Key behaviors & gotchas

- **Rebuild the API after route changes** — `dev` rebuilds via esbuild; never edit `dist/` directly.
- **`pdf-parse` must stay externalized** in `build.mjs` (`external`). It's ESM-only v2 with restricted `exports` and breaks esbuild bundling. Used by chat upload (`POST /api/openai/conversations/:id/upload`) via `PDFParse.getText()`, with UTF-8 fallback for txt/md/csv/json/html.
- **After editing `openapi.yaml`:** run codegen, then restart both services. Generated client code is not hand-edited.
- **Mock exam strict mode:** full-screen fixed overlay, no back-nav, server-side timer with heartbeat (setInterval + `visibilitychange` + `blur/focus`), auto-submit at `timeRemainingMs <= 0`. 4 hr, 75% pass, BOC blueprint distribution.
- **Audio overviews:** generated async (OpenAI TTS), stored as `bytea` MP3, served at `GET /api/audio-overviews/:id/audio`; UI polls every 4 s while `pending`.
- **Path-based deploy (Replit proxy):** web at `/`, API reverse-proxied at `/api/*` → :8080. Use `BASE_URL` for asset URLs in client code.
- **Body/upload limits differ by middleware:** JSON body limit 5 mb; multer upload cap 15 mb.
- **Scraper is allow-list only** (`src/lib/scraperAllowlist.ts`) and explicitly blocks BOC.org and paywalled vendors (Mometrix, etc.).
- **Stale composite `.d.ts` after schema/codegen changes:** the libs typecheck via `tsc --build` with project references (`db`, `api-client-react`, `api-zod`, `integrations-*`). If typecheck fails on types that look correct in `src/`, the emitted `lib/*/dist/*.d.ts` are stale — `rm -rf lib/{db,api-zod,api-client-react}/dist` and re-run `pnpm run typecheck:libs`. `scripts/post-merge.sh` does exactly this after a merge.

## Hard product constraint

Do **not** scrape or circumvent paywalled BOC prep material (e.g. Mometrix). When a user asks for that content, point them to the chat PDF upload flow (they may upload material they own, optionally saved to a "Tutor Library" notebook).
