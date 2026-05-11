import { create } from "zustand";

interface ChatState {
  isOpen: boolean;
  isPanelCollapsed: boolean;
  conversationId: number | null;
  notebookId: number | null;
  initialContext: string | null;
  newChatNonce: number;
  setOpen: (isOpen: boolean) => void;
  togglePanel: () => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  openChat: (options?: { conversationId?: number; notebookId?: number; initialContext?: string }) => void;
  closeChat: () => void;
  startNewChat: (options?: { notebookId?: number; initialContext?: string }) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  isPanelCollapsed: false,
  conversationId: null,
  notebookId: null,
  initialContext: null,
  newChatNonce: 0,
  setOpen: (isOpen) => set({ isOpen }),
  togglePanel: () => set((s) => ({ isPanelCollapsed: !s.isPanelCollapsed })),
  setPanelCollapsed: (collapsed) => set({ isPanelCollapsed: collapsed }),
  openChat: (options = {}) =>
    set((s) => ({
      isOpen: true,
      isPanelCollapsed: false,
      conversationId: options.conversationId ?? null,
      notebookId: options.notebookId ?? s.notebookId,
      initialContext: options.initialContext ?? null,
      newChatNonce: options.conversationId ? s.newChatNonce : s.newChatNonce + 1,
    })),
  closeChat: () => set({ isOpen: false, initialContext: null }),
  startNewChat: (options = {}) =>
    set((s) => ({
      isOpen: true,
      isPanelCollapsed: false,
      conversationId: null,
      notebookId: options.notebookId ?? null,
      initialContext: options.initialContext ?? null,
      newChatNonce: s.newChatNonce + 1,
    })),
}));
