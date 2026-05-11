import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 360;
export const SIDEBAR_DEFAULT = 256;
export const CHAT_MIN = 280;
export const CHAT_MAX = 640;
export const CHAT_DEFAULT = 400;

interface LayoutState {
  sidebarWidth: number;
  chatWidth: number;
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  setSidebarWidth: (w: number) => void;
  setChatWidth: (w: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  toggleChat: () => void;
  setChatCollapsed: (v: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT,
      chatWidth: CHAT_DEFAULT,
      sidebarCollapsed: false,
      chatCollapsed: false,
      setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, SIDEBAR_MIN, SIDEBAR_MAX) }),
      setChatWidth: (w) => set({ chatWidth: clamp(w, CHAT_MIN, CHAT_MAX) }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleChat: () => set((s) => ({ chatCollapsed: !s.chatCollapsed })),
      setChatCollapsed: (v) => set({ chatCollapsed: v }),
    }),
    { name: "boc-layout" },
  ),
);
