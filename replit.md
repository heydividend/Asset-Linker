# BOC Study Notebook

A single-user study companion for Athletic Training students preparing for the Board of Certification (BOC) exam. NotebookLM-style 3-panel notebooks (sources / generated content / AI tutor), adaptive practice quizzes, a strict timed mock exam following the BOC blueprint, weak-area tracking, and a daily study plan from May 11 → June 6, 2026.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080)
- `pnpm --filter @workspace/boc-notebook run dev` — web app (Vite)
- `pnpm run typecheck` — full typecheck
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/Zod schemas from `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push schema changes (dev only)
- `pnpm tsx artifacts/api-server/src/seed.ts` — seed domains, topics, schedule, starter notebook + sample questions
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, Drizzle ORM, PostgreSQL, Zod (`zod/v4`)
- Web: React + Vite, wouter, TanStack Query, shadcn/ui, Tailwind, zustand
- AI: OpenAI via Replit AI Integrations proxy — `gpt-5-mini` (chat / generation), `gpt-4o-mini-tts` (audio overviews)
- Codegen: Orval (axios + react-query hooks)
- Build: esbuild (ESM bundle for API)

## Where things live

- API spec (source of truth): `lib/api-spec/openapi.yaml` → generates `lib/api-client-react/src/generated/`
- DB schema: `lib/db/src/schema.ts` (notebooks, notes, flashcards, study_guides, audio_overviews, quizzes, mock_exams, conversations, messages, scrapes, schedule_items, weak_topics, plus `attempts`)
- API routes: `artifacts/api-server/src/routes/` (notebooks, quizzes, mock-exams, openai, audio, dashboard, plan, resources, scraper)
- Web pages: `artifacts/boc-notebook/src/pages/` (Dashboard, NotebooksList, NotebookDetail, FlashcardsReview, QuizHub, QuizRunner, MockExamLanding, MockExamRunner, ResourcesPage, ScraperPage, TutorPage, SchedulePage)
- Global UX: `src/components/GlobalChat.tsx` (floating Ask AI), `src/components/AskAiButton.tsx`, `src/hooks/use-chat.ts` (zustand store)

## Architecture decisions

- **Path-based artifacts**: web app lives behind `/` via the Replit proxy; API at `/api/*` is reverse-proxied to port 8080. Use `BASE_URL` for asset URLs in client code.
- **Mock exam strict mode**: full-screen fixed overlay (no sidebar escape), no back navigation, server-side timer, heartbeat ticked on `setInterval` + `visibilitychange` + `blur/focus`; auto-submit on `timeRemainingMs <= 0`.
- **Audio overviews**: generated async via OpenAI TTS, stored as `bytea` MP3, served from `GET /api/audio-overviews/:id/audio`; UI polls every 4 s while `pending`.
- **Chat uploads**: `POST /api/openai/conversations/:id/upload` (multer + `pdf-parse` v2 `PDFParse.getText()`; falls back to UTF-8 for txt/md/csv/json/html). When `saveToLibrary=true`, content is also persisted as a Note in an auto-created "Tutor Library" notebook.
- **`pdf-parse` is externalized** in `artifacts/api-server/build.mjs` because v2 is ESM-only with restricted `exports`; bundling it via esbuild fails.
- **Public Q&A scraper** uses an allow-list and explicitly blocks BOC.org and known paywalled vendors (Mometrix, BOC Study Guide, etc.); paywalled material is never scraped — users may upload PDFs they own via the chat upload instead.

## Product

- **Notebooks** (NotebookLM-style 3-panel): sources panel (notes/PDF/URL), tabs for Notes / Flashcards / Study Guides / Audio Overviews, dedicated tutor side-panel.
- **Adaptive practice quizzes** weighted toward weak topics; review screen shows rationale + sources per question.
- **Mock exam** matching BOC blueprint distribution; 4 hr timer, no back-nav, auto-submit, 75% pass.
- **Schedule**: daily phased plan (Foundation / Domain Deep-Dive / Mixed Review / Final) with edit dialog.
- **Dashboard**: readiness score, streak, weak topics, domain mastery, today's plan, recent quiz attempts.
- **Floating "Ask AI"**: per-entity context (note, card, guide, resource) and a global trigger on every page; supports file upload with optional save-to-library.

## User preferences

- Do not scrape or otherwise circumvent paywalled BOC prep material (e.g., Mometrix). When asked, point the user at the chat PDF upload flow instead.

## Gotchas

- API server **must be rebuilt** after route changes (`pnpm --filter @workspace/api-server run dev` rebuilds via esbuild). Don't edit `dist/` directly.
- After editing `openapi.yaml`, run codegen, then restart both workflows.
- `AppSidebar.tsx` is `Sidebar.tsx`; route paths are singular (`/quiz`, `/mock-exam`).
- Body limit on API is 5 mb; multer upload cap is 15 mb (different middleware path).
- Don't bundle `pdf-parse` — it's in `external` in `build.mjs`.

## Pointers

- See the `pnpm-workspace` skill for workspace/TS conventions
- See the `artifacts` skill for adding/modifying artifacts
- See the `integrations` skill for the OpenAI proxy used here
