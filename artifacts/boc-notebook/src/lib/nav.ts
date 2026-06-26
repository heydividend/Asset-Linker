import {
  Activity,
  BookText,
  Bot,
  Brain,
  CalendarDays,
  ClipboardList,
  Gamepad2,
  Headphones,
  LayoutDashboard,
  Sparkles,
  Stethoscope,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/notebooks", label: "Notebooks", icon: BookText },
  { href: "/study-guides", label: "Study Guides", icon: Headphones },
  { href: "/flashcards", label: "Flashcards", icon: Brain },
  { href: "/blueprint", label: "Exam Blueprint", icon: Target },
  { href: "/quiz", label: "Practice Quizzes", icon: ClipboardList },
  { href: "/mock-exam", label: "Mock Exam", icon: Stethoscope },
  { href: "/body-map", label: "Body Map", icon: Activity },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/tutor", label: "AI Tutor", icon: Bot },
  { href: "/study-group", label: "Study Group", icon: Users },
  { href: "/ai-learning", label: "AI Learning", icon: Sparkles },
];
