import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useLocation } from "wouter";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import {
  ALL_TOUR_QUEUE,
  PAGES,
  pageForLocation,
  TOUR_SEEN_KEY,
  type BocStep,
  type PageKey,
  clearCompletedTours,
  getTourProgress,
  markTourCompleted,
  type TourProgress,
} from "@/lib/tour";

type Scope = "page" | "all" | "remaining";

interface TourCtx {
  startTour: (scope: Scope) => void;
  replayWelcomeTour: () => void;
  isRunning: boolean;
  progress: TourProgress;
}

const Ctx = createContext<TourCtx | null>(null);

export function useTour(): TourCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTour must be used inside <TourProvider>");
  return v;
}

const driverBase = {
  showProgress: true,
  allowClose: true,
  overlayOpacity: 0.55,
  stagePadding: 6,
  stageRadius: 8,
  popoverClass: "boc-tour-popover",
  nextBtnText: "Next →",
  prevBtnText: "← Back",
  doneBtnText: "Done",
  showButtons: ["next", "previous", "close"] as Array<"next" | "previous" | "close">,
  closeBtnText: "Skip",
};

function fallbackStep(original: BocStep): DriveStep {
  const title = original.popover?.title ?? "Heads up";
  const baseDesc = original.popover?.description ?? "";
  return {
    popover: {
      title,
      description:
        baseDesc +
        (baseDesc ? "<br/><br/>" : "") +
        "<em>This control isn't on screen right now — it usually appears once you've added some content or taken a related action.</em>",
    },
  };
}

/** Resolve steps: run any ensureVisible side-effect, then drop steps whose
 *  element selector still doesn't resolve (replacing with a centered fallback). */
async function resolveSteps(steps: BocStep[]): Promise<DriveStep[]> {
  const out: DriveStep[] = [];
  for (const step of steps) {
    if (step.ensureVisible) {
      try {
        await step.ensureVisible();
      } catch {
        /* ignore */
      }
    }
    if (typeof step.element === "string") {
      const el = document.querySelector(step.element);
      if (!el) {
        out.push(fallbackStep(step));
        continue;
      }
    }
    const { ensureVisible: _ev, ...clean } = step;
    out.push(clean as DriveStep);
  }
  return out;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const driverRef = useRef<Driver | null>(null);
  const queueRef = useRef<PageKey[] | null>(null);
  const runningRef = useRef(false);
  /** Set true when the user explicitly skips/closes/Escapes — prevents the
   *  full-tour queue from auto-advancing to the next page. */
  const abortedRef = useRef(false);
  const navRef = useRef(setLocation);
  navRef.current = setLocation;

  const stop = useCallback(() => {
    abortedRef.current = true;
    queueRef.current = null;
    runningRef.current = false;
    if (driverRef.current) {
      try {
        driverRef.current.destroy();
      } catch {
        /* ignore */
      }
      driverRef.current = null;
    }
  }, []);

  const advanceQueue = useCallback(() => {
    if (abortedRef.current) {
      // User skipped — do not progress the full tour.
      abortedRef.current = false;
      runningRef.current = false;
      queueRef.current = null;
      return;
    }
    const q = queueRef.current;
    if (q && q.length > 0) {
      const next = q.shift()!;
      window.setTimeout(() => void startPage(next), 150);
    } else {
      runningRef.current = false;
      queueRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runStepsForPage = useCallback(
    async (key: PageKey) => {
      const def = PAGES[key];
      const built = def.steps();
      const resolved = await resolveSteps(built);
      if (resolved.length === 0) {
        try {
          def.cleanup?.();
        } catch {
          /* ignore */
        }
        advanceQueue();
        return;
      }
      if (driverRef.current) {
        try {
          driverRef.current.destroy();
        } catch {
          /* ignore */
        }
      }
      const totalSteps = resolved.length;
      let lastShownIndex = -1;
      const d = driver({
        ...driverBase,
        steps: resolved,
        onHighlightStarted: (_el, _step, opts) => {
          lastShownIndex = opts.state.activeIndex ?? lastShownIndex;
        },
        onCloseClick: (_el, _step, opts) => {
          abortedRef.current = true;
          try {
            opts.driver.destroy();
          } catch {
            /* ignore */
          }
        },
        onDestroyed: () => {
          driverRef.current = null;
          // Treat the page tour as completed if the user reached the final
          // step (Done). Closing/Esc partway through does NOT mark it done.
          const reachedEnd =
            !abortedRef.current && lastShownIndex >= totalSteps - 1;
          if (reachedEnd) {
            markTourCompleted(key);
          }
          try {
            def.cleanup?.();
          } catch {
            /* ignore */
          }
          advanceQueue();
        },
      });
      driverRef.current = d;
      d.drive();
    },
    [advanceQueue],
  );

  const startPage = useCallback(
    async (key: PageKey) => {
      runningRef.current = true;
      const def = PAGES[key];
      let targetPath = def.defaultPath;
      if (def.prepare) {
        try {
          const r = await def.prepare();
          if (r.skip) {
            if (driverRef.current) {
              try {
                driverRef.current.destroy();
              } catch {
                /* ignore */
              }
            }
            const d = driver({
              ...driverBase,
              steps: [
                {
                  popover: {
                    title: def.label,
                    description: r.reason ?? "Skipping this section for now.",
                  },
                },
              ],
              onCloseClick: (_el, _step, opts) => {
                abortedRef.current = true;
                try {
                  opts.driver.destroy();
                } catch {
                  /* ignore */
                }
              },
              onDestroyed: () => {
                driverRef.current = null;
                try {
                  def.cleanup?.();
                } catch {
                  /* ignore */
                }
                advanceQueue();
              },
            });
            driverRef.current = d;
            d.drive();
            return;
          }
          if (r.navigateTo) targetPath = r.navigateTo;
        } catch {
          /* fall through to default path */
        }
      }
      const needsNav = !def.match(getCurrentRoutePath());
      if (needsNav || targetPath !== def.defaultPath) {
        navRef.current(targetPath);
      }
      const delay = def.readyDelayMs ?? 350;
      await new Promise((r) =>
        window.setTimeout(r, needsNav || targetPath !== def.defaultPath ? delay : 100),
      );
      await runStepsForPage(key);
    },
    [advanceQueue, runStepsForPage],
  );

  const startTour = useCallback(
    (scope: Scope) => {
      if (runningRef.current) return;
      abortedRef.current = false;
      if (scope === "page") {
        const key = pageForLocation(location) ?? "dashboard";
        runningRef.current = true;
        queueRef.current = null;
        window.setTimeout(() => void runStepsForPage(key), 60);
        return;
      }
      if (scope === "remaining") {
        const { remaining } = getTourProgress();
        if (remaining.length === 0) {
          // Already done — replay everything.
          queueRef.current = [...ALL_TOUR_QUEUE];
        } else {
          // Walk only the pages the user hasn't finished, in canonical order.
          queueRef.current = [...remaining].sort(
            (a, b) => ALL_TOUR_QUEUE.indexOf(a) - ALL_TOUR_QUEUE.indexOf(b),
          );
        }
      } else {
        queueRef.current = [...ALL_TOUR_QUEUE];
      }
      const first = queueRef.current.shift()!;
      void startPage(first);
    },
    [location, runStepsForPage, startPage],
  );

  const replayWelcomeTour = useCallback(() => {
    try {
      window.localStorage.removeItem(TOUR_SEEN_KEY);
    } catch {
      /* ignore */
    }
    clearCompletedTours();
    startTour("all");
  }, [startTour]);

  /** Auto-start a tour if the URL has ?tour=page or ?tour=all. Strips the
   *  param after reading so refreshes don't keep re-launching. Runs once. */
  const queryHandledRef = useRef(false);
  useEffect(() => {
    if (queryHandledRef.current) return;
    if (typeof window === "undefined") return;
    let scope: Scope | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("tour");
      if (v === "page" || v === "all") {
        scope = v;
        params.delete("tour");
        const newQuery = params.toString();
        const newUrl =
          window.location.pathname +
          (newQuery ? `?${newQuery}` : "") +
          window.location.hash;
        window.history.replaceState(null, "", newUrl);
      }
    } catch {
      return;
    }
    if (!scope) return;
    queryHandledRef.current = true;
    const target: Scope = scope;
    const t = window.setTimeout(() => {
      if (target === "all") {
        try {
          window.localStorage.removeItem(TOUR_SEEN_KEY);
        } catch {
          /* ignore */
        }
      }
      startTour(target);
    }, 600);
    return () => window.clearTimeout(t);
  }, [startTour]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && driverRef.current) {
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stop]);

  const progress = useSyncExternalStore(
    subscribeToProgress,
    getCachedProgress,
    getInitialProgress,
  );

  return (
    <Ctx.Provider
      value={{ startTour, replayWelcomeTour, isRunning: runningRef.current, progress }}
    >
      {children}
    </Ctx.Provider>
  );
}

let cachedProgress: TourProgress | null = null;

function getCachedProgress(): TourProgress {
  if (!cachedProgress) cachedProgress = getTourProgress();
  return cachedProgress;
}

function subscribeToProgress(cb: () => void): () => void {
  const handler = () => {
    cachedProgress = getTourProgress();
    cb();
  };
  window.addEventListener("boc:tour:progress", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("boc:tour:progress", handler);
    window.removeEventListener("storage", handler);
  };
}

const INITIAL_PROGRESS: TourProgress = {
  completed: [],
  remaining: [],
  total: 0,
  done: false,
};

function getInitialProgress(): TourProgress {
  return INITIAL_PROGRESS;
}

function getCurrentRoutePath(): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  let p = window.location.pathname;
  if (base && p.startsWith(base)) p = p.slice(base.length);
  return p || "/";
}
