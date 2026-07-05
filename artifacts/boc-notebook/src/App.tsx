import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  ClerkProvider,
  SignIn,
  Show,
  useAuth,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";
import { TourProvider } from "@/components/TourProvider";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import NotebooksList from "@/pages/NotebooksList";
import NotebookDetail from "@/pages/NotebookDetail";
import FlashcardsReview from "@/pages/FlashcardsReview";
import QuizHub from "@/pages/QuizHub";
import BlueprintPage from "@/pages/BlueprintPage";
import QuestionTypesPage from "@/pages/QuestionTypesPage";
import QuizRunner from "@/pages/QuizRunner";
import MockExamLanding from "@/pages/MockExamLanding";
import MockExamRunner from "@/pages/MockExamRunner";
import TutorPage from "@/pages/TutorPage";
import GamesHub from "@/pages/GamesHub";
import MatchingGame from "@/pages/MatchingGame";
import SchedulePage from "@/pages/SchedulePage";
import BodyMapPage from "@/pages/BodyMapPage";
import StudyGuidesPage from "@/pages/StudyGuidesPage";
import StudyGuideDetail from "@/pages/StudyGuideDetail";
import StudyGroupPage from "@/pages/StudyGroupPage";
import AILearningPage from "@/pages/AILearningPage";
import DailyQuizPage from "@/pages/DailyQuizPage";
import DailyQuizHistory from "@/pages/DailyQuizHistory";
import ReviewSheetsPage from "@/pages/ReviewSheetsPage";
import ReviewSheetDetail from "@/pages/ReviewSheetDetail";
import ItemQualityPage from "@/pages/ItemQualityPage";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminUserDetail from "@/pages/AdminUserDetail";
import CodeBlueGame from "@/pages/CodeBlueGame";
import SurvivorGame from "@/pages/SurvivorGame";
import SpotContraindicationGame from "@/pages/SpotContraindicationGame";
import { StudyGroupTimeoutNotifier } from "@/hooks/use-study-group-timeout-notifier";

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains. Do not inline the env var, leave
// publishableKey undefined, or replace publishableKeyFromHost with anything else.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly), auto-set
// in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV — the empty dev value
// is intentional, and any branching breaks the prod proxy.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk passes full paths to routerPush/routerReplace, but wouter's setLocation
// prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const queryClient = new QueryClient();

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(160 40% 30%)",
    colorForeground: "hsl(160 20% 16%)",
    colorMutedForeground: "hsl(160 15% 45%)",
    colorDanger: "hsl(0 72% 45%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(160 15% 97%)",
    colorInputForeground: "hsl(160 20% 16%)",
    colorNeutral: "hsl(160 15% 90%)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-[hsl(160_15%_90%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(160_20%_16%)] text-xl font-semibold",
    headerSubtitle: "text-[hsl(160_15%_45%)]",
    socialButtonsBlockButtonText: "text-[hsl(160_20%_16%)] font-medium",
    formFieldLabel: "text-[hsl(160_20%_16%)] font-medium",
    footerActionLink: "text-[hsl(160_40%_30%)] font-medium hover:underline",
    footerActionText: "text-[hsl(160_15%_45%)]",
    dividerText: "text-[hsl(160_15%_45%)]",
    identityPreviewEditButton: "text-[hsl(160_40%_30%)]",
    formFieldSuccessText: "text-[hsl(160_40%_30%)]",
    alertText: "text-[hsl(160_20%_16%)]",
    logoBox: "h-12 flex justify-center",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton:
      "border border-[hsl(160_15%_90%)] hover:bg-[hsl(160_15%_97%)]",
    formButtonPrimary:
      "bg-[hsl(160_40%_30%)] hover:bg-[hsl(160_40%_26%)] text-white font-medium",
    formFieldInput:
      "bg-[hsl(160_15%_97%)] border border-[hsl(160_15%_85%)] text-[hsl(160_20%_16%)]",
    // Public self-service sign-up is disabled (accounts are admin-provisioned),
    // so hide Clerk's "Don't have an account? Sign up" footer link everywhere.
    footerAction: "hidden",
    dividerLine: "bg-[hsl(160_15%_90%)]",
    otpCodeFieldInput: "text-[hsl(160_20%_16%)] border-[hsl(160_15%_85%)]",
    main: "gap-5",
  },
};

const clerkLocalization = {
  signIn: {
    start: {
      title: "Welcome back",
      subtitle: "Sign in to continue your BOC prep",
    },
  },
  signUp: {
    start: {
      title: "Create your account",
      subtitle: "Start your private BOC study session",
    },
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} />
    </div>
  );
}

// Records a login session once when the signed-in app first mounts. The backend
// upserts by Clerk session id, so this is idempotent within a session.
function SessionHeartbeat() {
  const sentRef = useRef(false);
  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    fetch("/api/session/heartbeat", {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      // Heartbeat is best-effort; never block the app on it.
    });
  }, []);
  return null;
}

function AppRoutes() {
  return (
    <TourProvider>
      <StudyGroupTimeoutNotifier />
      <SessionHeartbeat />
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/notebooks" component={NotebooksList} />
          <Route path="/notebooks/:id" component={NotebookDetail} />
          <Route path="/flashcards" component={FlashcardsReview} />
          <Route path="/blueprint" component={BlueprintPage} />
          <Route path="/question-types" component={QuestionTypesPage} />
          <Route path="/quiz" component={QuizHub} />
          <Route path="/daily-quiz" component={DailyQuizPage} />
          <Route path="/daily-quiz/history" component={DailyQuizHistory} />
          <Route path="/quiz/:id" component={QuizRunner} />
          <Route path="/review-sheets" component={ReviewSheetsPage} />
          <Route path="/review-sheets/:code" component={ReviewSheetDetail} />
          <Route path="/mock-exam" component={MockExamLanding} />
          <Route path="/mock-exam/:id" component={MockExamRunner} />
          <Route path="/tutor" component={TutorPage} />
          <Route path="/games" component={GamesHub} />
          <Route path="/games/code-blue" component={CodeBlueGame} />
          <Route path="/games/survivor" component={SurvivorGame} />
          <Route
            path="/games/spot-contraindication"
            component={SpotContraindicationGame}
          />
          <Route path="/games/:id" component={MatchingGame} />
          <Route path="/schedule" component={SchedulePage} />
          <Route path="/body-map" component={BodyMapPage} />
          <Route path="/study-guides" component={StudyGuidesPage} />
          <Route path="/study-guides/:id" component={StudyGuideDetail} />
          <Route path="/study-group" component={StudyGroupPage} />
          <Route path="/ai-learning" component={AILearningPage} />
          <Route path="/item-quality" component={ItemQualityPage} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/users/:id" component={AdminUserDetail} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </TourProvider>
  );
}

function GatedApp() {
  return (
    <>
      <Show when="signed-in">
        <AppRoutes />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

// Keep the cached webview data in sync with the signed-in user: when the user
// changes (sign in / out / switch account) clear the React Query cache so no
// other user's data lingers on screen.
function ClerkQueryClientCacheInvalidator() {
  const { isLoaded, userId } = useAuth();
  const queryClientInstance = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Wait until Clerk has resolved auth state before tracking transitions, so
    // the first resolved user is recorded as the baseline (no spurious clear).
    if (!isLoaded) return;
    const current = userId ?? null;
    if (
      prevUserIdRef.current !== undefined &&
      prevUserIdRef.current !== current
    ) {
      // Any resolved user-id transition (sign in, sign out, switch account)
      // wipes the React Query cache so one account's data can never render for
      // another.
      queryClientInstance.clear();
    }
    prevUserIdRef.current = current;
  }, [isLoaded, userId, queryClientInstance]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={clerkLocalization}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Switch>
              <Route path="/sign-in/*?" component={SignInPage} />
              {/* Public sign-up is disabled — accounts are admin-created. Any
                  hit to the old sign-up route is sent to sign-in. */}
              <Route path="/sign-up/*?">
                <Redirect to="/sign-in" />
              </Route>
              <Route component={GatedApp} />
            </Switch>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
