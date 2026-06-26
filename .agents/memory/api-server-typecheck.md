---
name: api-server typecheck baseline
description: api-server `typecheck` script is pre-existingly broken; use the test script as the validation gate.
---

`pnpm --filter @workspace/api-server typecheck` fails on a large set of
*pre-existing* errors and is not a clean baseline:

- `TS6305 Output file '.../lib/db/dist/index.d.ts' has not been built` — the
  script doesn't build the `@workspace/db` project reference first. Building it
  (`pnpm --filter @workspace/db build`) clears these specific errors but not the rest.
- Many `TS7006 implicitly has an 'any' type` on inline `.map/.filter/.reduce`
  callbacks throughout the route files (e.g. `quizzes.ts`, `flashcards.ts`,
  `seed.ts`), plus some `TS2339`/`TS2345` in `quizzes.ts`.

**Why:** these errors exist in untouched code, so a green typecheck is not
achievable by a normal feature/test task here.

**How to apply:** when changing api-server, judge your own diff's type-safety by
confirming no *new* errors point at your changed line ranges, and rely on
`pnpm --filter @workspace/api-server test` (node --test + tsx) as the real gate.
