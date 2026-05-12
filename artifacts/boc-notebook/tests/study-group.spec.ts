import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the AI Study Group feature.
 *
 * Covers, in one suite:
 *   1. Creating a session, running an LLM-driven round, promoting a
 *      candidate flashcard, and verifying it lands on /flashcards
 *      with `source === "study_group"`.
 *   2. The `?topicId=` deep link contract used by both the
 *      QuizRunner "Group" link and the Dashboard "Group" button.
 *   3. The Dashboard "Group" button itself, when a weak topic row is
 *      visible (skipped gracefully when the dev DB has no weak
 *      topics yet).
 *
 * Notes:
 * - Rounds make several Anthropic streaming calls + an OpenAI
 *   extraction call; one round routinely takes 30–80s. The suite
 *   has a generous timeout and waits on the SSE response itself
 *   rather than polling.
 * - The web app is mounted at `/` (path-based routing); API at
 *   `/api`. We talk to both using the same baseURL.
 * - We accept the dev DB having existing data — assertions key off
 *   values we created in this spec, never absolute counts.
 */

const ROUND_TIMEOUT_MS = 150_000;

interface Topic {
  id: number;
  name: string;
  domainId: number | null;
}

interface Artifact {
  id: number;
  kind: string;
  payload: { front?: string; back?: string };
  promotedRefId: number | null;
}

interface SessionDetail {
  session: { id: number; title: string; topicId: number | null };
  artifacts: Artifact[];
  messages: { id: number; speaker: string; kind: string }[];
}

async function getTopics(api: APIRequestContext): Promise<Topic[]> {
  const r = await api.get("/api/topics");
  expect(r.ok(), "GET /api/topics").toBeTruthy();
  return (await r.json()) as Topic[];
}

async function createSession(
  api: APIRequestContext,
  topicId: number,
  focus: string,
): Promise<{ id: number; title: string }> {
  const r = await api.post("/api/study-group/sessions", {
    data: { topicId, focus },
  });
  expect(r.ok(), `POST /api/study-group/sessions: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { id: number; title: string };
}

async function runRound(api: APIRequestContext, sessionId: number): Promise<void> {
  // The endpoint is SSE; the server only finishes writing once the
  // round (mentor/alex/jordan/verdict/takeaway/extraction) is done.
  // Awaiting the request to completion is therefore a clean wait.
  const r = await api.post(`/api/study-group/sessions/${sessionId}/round`, {
    data: {},
    timeout: ROUND_TIMEOUT_MS,
  });
  expect(r.ok(), `round SSE failed: ${r.status()}`).toBeTruthy();
  // Drain the body so the connection is properly closed.
  await r.body();
}

async function getSession(
  api: APIRequestContext,
  id: number,
): Promise<SessionDetail> {
  const r = await api.get(`/api/study-group/sessions/${id}`);
  expect(r.ok(), `GET /api/study-group/sessions/${id}`).toBeTruthy();
  return (await r.json()) as SessionDetail;
}

async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  // The app shows a one-time onboarding dialog in fresh browser
  // contexts. Dismiss it so it doesn't block subsequent clicks.
  const overlay = page
    .getByRole("dialog")
    .filter({ hasText: /welcome|onboarding|tour/i })
    .first();
  if (await overlay.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => undefined);
  }
}

test.describe("Study Group end-to-end", () => {
  test.describe.configure({ mode: "serial" });

  test("creates a session, runs a round, promotes a flashcard, and finds it on /flashcards", async ({
    page,
    request: req,
    baseURL,
  }) => {
    test.setTimeout(ROUND_TIMEOUT_MS + 90_000);

    const api = await request.newContext({ baseURL });
    const topics = await getTopics(api);
    expect(topics.length, "dev DB must have topics seeded").toBeGreaterThan(0);
    const topic = topics[0];

    // Create session + run round purely via API. This avoids the
    // browser holding an SSE connection open for ~60s and dodges
    // flaky LLM-streaming UI assertions; we then drive the *promote*
    // step through the actual UI, which is the part of the flow
    // most worth covering.
    const focus = `playwright e2e ${Date.now().toString(36)}`;
    const created = await createSession(api, topic.id, focus);
    await runRound(api, created.id);

    // After the round, at least one flashcard_candidate is expected
    // (extraction occasionally misses; retry one round if so).
    let detail = await getSession(api, created.id);
    let flashcardCandidate = detail.artifacts.find(
      (a) => a.kind === "flashcard_candidate" && !a.promotedRefId,
    );
    if (!flashcardCandidate) {
      await runRound(api, created.id);
      detail = await getSession(api, created.id);
      flashcardCandidate = detail.artifacts.find(
        (a) => a.kind === "flashcard_candidate" && !a.promotedRefId,
      );
    }
    expect(
      flashcardCandidate,
      "round must produce a flashcard_candidate artifact",
    ).toBeTruthy();
    const candidate = flashcardCandidate!;
    const front = candidate.payload.front!;
    expect(front, "candidate front text").toBeTruthy();

    // ---- Drive the promote action through the real UI. ----
    await page.goto("/study-group");
    await dismissOnboardingIfPresent(page);

    await expect(page.getByTestId("page-study-group")).toBeVisible();
    await page.getByTestId(`sg-session-${created.id}`).click();
    await expect(page.getByTestId("sg-session-title")).toContainText(
      topic.name,
    );

    const artifactCard = page.getByTestId(`sg-artifact-${candidate.id}`);
    await artifactCard.scrollIntoViewIfNeeded();
    await expect(artifactCard).toBeVisible();

    await page.getByTestId(`button-promote-artifact-${candidate.id}`).click();
    await expect(artifactCard).toContainText(/Promoted \(#\d+\)/, {
      timeout: 20_000,
    });

    // ---- Verify the flashcard was created with source=study_group. ----
    const cardsRes = await api.get("/api/flashcards");
    expect(cardsRes.ok()).toBeTruthy();
    const allCards = (await cardsRes.json()) as Array<{
      id: number;
      front: string;
      source: string | null;
    }>;
    const promoted = allCards.find((c) => c.front === front);
    expect(promoted, `card with front "${front.slice(0, 40)}…" exists`).toBeTruthy();
    expect(promoted!.source).toBe("study_group");

    // ---- Verify the card surfaces on /flashcards (Browse all). ----
    await page.goto("/flashcards");
    await dismissOnboardingIfPresent(page);

    const browseAll = page.getByTestId("button-browse-all").first();
    const browseAllEmpty = page.getByTestId("button-browse-all-empty").first();
    if (await browseAll.isVisible().catch(() => false)) {
      await browseAll.click();
    } else if (await browseAllEmpty.isVisible().catch(() => false)) {
      await browseAllEmpty.click();
    }

    // The Browse view paginates one card at a time. Page forward
    // until the front text shows up (cap iterations defensively).
    const frontHead = front.slice(0, 40);
    let found = false;
    for (let i = 0; i < 80; i += 1) {
      if (await page.getByText(frontHead, { exact: false }).first().isVisible().catch(() => false)) {
        found = true;
        break;
      }
      const next = page.locator('button:has(svg.lucide-chevron-right)').first();
      if (!(await next.isEnabled().catch(() => false))) break;
      await next.click().catch(() => undefined);
    }
    expect(found, `promoted flashcard front visible on /flashcards`).toBeTruthy();

    await api.dispose();
  });

  test("`?topicId=` deep link auto-opens the New session dialog with that topic preselected", async ({
    page,
    request: req,
    baseURL,
  }) => {
    const api = await request.newContext({ baseURL });
    const topics = await getTopics(api);
    expect(topics.length).toBeGreaterThan(0);
    const topic = topics[0];

    await page.goto(`/study-group?topicId=${topic.id}`);
    await dismissOnboardingIfPresent(page);

    await expect(page.getByTestId("page-study-group")).toBeVisible();
    // The NewSessionDialog auto-opens
    await expect(
      page.getByRole("heading", { name: "New study group session" }),
    ).toBeVisible();
    // And the topic select shows the preselected topic, not the
    // "Auto — my weakest topic" sentinel.
    const topicSelect = page.getByTestId("sg-topic-select");
    await expect(topicSelect).toContainText(topic.name);
    await expect(topicSelect).not.toContainText("Auto");

    await api.dispose();
  });

  test('Dashboard "Group" button routes to /study-group?topicId=N', async ({
    page,
  }) => {
    await page.goto("/");
    await dismissOnboardingIfPresent(page);

    // The "Group" button only renders in weak-topic mastery rows.
    // If none are present (fresh dev DB with no quiz attempts),
    // skip — the deep-link contract itself is already covered by
    // the test above, which is what this button drives.
    const groupBtn = page
      .getByRole("link", { name: /^Group$/ })
      .or(page.locator('a[title="Join a study group on this topic"]'))
      .first();

    if (!(await groupBtn.isVisible().catch(() => false))) {
      test.skip(
        true,
        'No weak-topic "Group" button rendered on the dashboard in this DB state — deep-link contract is exercised by the previous test.',
      );
      return;
    }

    await groupBtn.click();
    await expect(page).toHaveURL(/\/study-group\?topicId=\d+/);
    await expect(
      page.getByRole("heading", { name: "New study group session" }),
    ).toBeVisible();
    const topicSelect = page.getByTestId("sg-topic-select");
    await expect(topicSelect).not.toContainText("Auto");
  });
});
