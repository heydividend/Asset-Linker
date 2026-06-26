import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";
import { TourProvider } from "@/components/TourProvider";
import Dashboard from "@/pages/Dashboard";
import NotebooksList from "@/pages/NotebooksList";
import NotebookDetail from "@/pages/NotebookDetail";
import FlashcardsReview from "@/pages/FlashcardsReview";
import QuizHub from "@/pages/QuizHub";
import BlueprintPage from "@/pages/BlueprintPage";
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
import ReviewSheetsPage from "@/pages/ReviewSheetsPage";
import ReviewSheetDetail from "@/pages/ReviewSheetDetail";
import { StudyGroupTimeoutNotifier } from "@/hooks/use-study-group-timeout-notifier";

const queryClient = new QueryClient();

function Router() {
  return (
    <TourProvider>
      <StudyGroupTimeoutNotifier />
      <Layout>
        <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/notebooks" component={NotebooksList} />
        <Route path="/notebooks/:id" component={NotebookDetail} />
        <Route path="/flashcards" component={FlashcardsReview} />
        <Route path="/blueprint" component={BlueprintPage} />
        <Route path="/quiz" component={QuizHub} />
        <Route path="/daily-quiz" component={DailyQuizPage} />
        <Route path="/quiz/:id" component={QuizRunner} />
        <Route path="/review-sheets" component={ReviewSheetsPage} />
        <Route path="/review-sheets/:code" component={ReviewSheetDetail} />
        <Route path="/mock-exam" component={MockExamLanding} />
        <Route path="/mock-exam/:id" component={MockExamRunner} />
        <Route path="/tutor" component={TutorPage} />
        <Route path="/games" component={GamesHub} />
        <Route path="/games/:id" component={MatchingGame} />
        <Route path="/schedule" component={SchedulePage} />
        <Route path="/body-map" component={BodyMapPage} />
        <Route path="/study-guides" component={StudyGuidesPage} />
        <Route path="/study-guides/:id" component={StudyGuideDetail} />
        <Route path="/study-group" component={StudyGroupPage} />
        <Route path="/ai-learning" component={AILearningPage} />
        <Route component={NotFound} />
      </Switch>
      </Layout>
    </TourProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
