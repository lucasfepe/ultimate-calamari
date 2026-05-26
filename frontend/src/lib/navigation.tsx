import { createContext, useContext } from "react";

export type Page = "chat" | "documents" | "libraries" | "apikeys" | "guide";

const NavigationContext = createContext<(page: Page) => void>(() => {});

export const NavigationProvider = NavigationContext.Provider;

export function useNavigate() {
  return useContext(NavigationContext);
}
