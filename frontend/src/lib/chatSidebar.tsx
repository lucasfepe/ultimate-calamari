/**
 * Shared context that lets TestDrive.tsx (child) expose conversation state
 * upward to App.tsx (parent sidebar) without prop-drilling.
 *
 * Pattern:
 *   - ChatSidebarProvider wraps the whole app (in App.tsx)
 *   - TestDrive.tsx calls useChatSidebarSet() and syncs its local state into
 *     the context via a useEffect.
 *   - App.tsx calls useChatSidebar() to read the state for the sidebar.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Conversation } from "../api/client";

export interface ChatSidebarState {
  selectedLibId: string;
  conversations: Conversation[];
  activeConversationId: string | null;
  loadingConversations: boolean;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  onDelete: (conv: Conversation) => void;
}

export const CHAT_SIDEBAR_EMPTY: ChatSidebarState = {
  selectedLibId: "",
  conversations: [],
  activeConversationId: null,
  loadingConversations: false,
  onSelect: () => {},
  onNew: () => {},
  onDelete: () => {},
};

// Separate read and write contexts so consumers only re-render when needed.
const ReadCtx = createContext<ChatSidebarState>(CHAT_SIDEBAR_EMPTY);
const WriteCtx = createContext<(s: ChatSidebarState) => void>(() => {});

export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChatSidebarState>(CHAT_SIDEBAR_EMPTY);
  return (
    <WriteCtx.Provider value={setState}>
      <ReadCtx.Provider value={state}>
        {children}
      </ReadCtx.Provider>
    </WriteCtx.Provider>
  );
}

/** Read sidebar state — used by App.tsx. */
export function useChatSidebar(): ChatSidebarState {
  return useContext(ReadCtx);
}

/** Write sidebar state — used by TestDrive.tsx. */
export function useChatSidebarSet(): (s: ChatSidebarState) => void {
  return useContext(WriteCtx);
}
