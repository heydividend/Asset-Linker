import { create } from "zustand";

interface ChatState {
  isOpen: boolean;
  conversationId: number | null;
  notebookId: number | null;
  initialContext: string | null;
  setOpen: (isOpen: boolean) => void;
  openChat: (options?: { conversationId?: number; notebookId?: number; initialContext?: string }) => void;
  closeChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  conversationId: null,
  notebookId: null,
  initialContext: null,
  setOpen: (isOpen) => set({ isOpen }),
  openChat: (options = {}) => set({ 
    isOpen: true, 
    conversationId: options.conversationId ?? null,
    notebookId: options.notebookId ?? null,
    initialContext: options.initialContext ?? null
  }),
  closeChat: () => set({ isOpen: false, initialContext: null }),
}));
