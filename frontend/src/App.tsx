import { useState, useEffect, useRef } from "react";
import {
  FileText, BookOpen, MessageSquare, Key, Menu, X, HelpCircle,
  LogOut, Loader2, ChevronLeft, ChevronRight, Plus, Trash2, MessageCircle,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { setAuthToken } from "./api/client";
import { NavigationProvider, type Page } from "./lib/navigation";
import { ChatSidebarProvider, useChatSidebar } from "./lib/chatSidebar";
import Login from "./pages/Login";
import Documents from "./pages/Documents";
import Libraries from "./pages/Libraries";
import Chat from "./pages/TestDrive";
import ApiKeys from "./pages/ApiKeys";
import Guide from "./pages/Guide";

interface NavItem {
  id: Page;
  label: string;
  icon: typeof FileText;
}

const navItems: NavItem[] = [
  { id: "chat",      label: "Chat",         icon: MessageSquare },
  { id: "documents", label: "Documents",    icon: FileText },
  { id: "libraries", label: "Knowledge Bases", icon: BookOpen },
  { id: "apikeys",   label: "API Keys",     icon: Key },
  { id: "guide",     label: "How It Works", icon: HelpCircle },
];

const pageComponents: Record<Page, () => JSX.Element> = {
  chat:      Chat,
  documents: Documents,
  libraries: Libraries,
  apikeys:   ApiKeys,
  guide:     Guide,
};

const HAS_SEEN_GUIDE_KEY = "hasSeenGuide";
const VALID_PAGES: Page[] = ["chat", "documents", "libraries", "apikeys", "guide"];

function pageFromHash(): Page | null {
  const hash = window.location.hash.slice(1) as Page;
  return VALID_PAGES.includes(hash) ? hash : null;
}


function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Inner app (rendered after auth resolves) ─────────────────────────────────
// Separate component so it can read ChatSidebarContext (which is provided above it).

function AppShell({ session }: { session: Session }) {
  const [page, setPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);   // mobile drawer
  const [collapsed, setCollapsed] = useState(false);        // desktop collapse
  const deepLinked = useRef(false);

  // Conversation history from TestDrive.tsx via context
  const chatSidebar = useChatSidebar();
  const showHistory = page === "chat" && !!chatSidebar.selectedLibId && !collapsed;

  // Deep-link via URL hash
  useEffect(() => {
    const hashPage = pageFromHash();
    if (hashPage) {
      deepLinked.current = true;
      setPage(hashPage);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // First-time guide redirect
  useEffect(() => {
    if (!deepLinked.current && !localStorage.getItem(HAS_SEEN_GUIDE_KEY)) {
      setPage("guide");
    }
  }, []);

  useEffect(() => {
    if (page === "guide") localStorage.setItem(HAS_SEEN_GUIDE_KEY, "true");
  }, [page]);

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  const navigate = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  const ActivePage = pageComponents[page];
  const userEmail = session.user.email ?? "";
  const emailPreview = userEmail.length > 24 ? userEmail.slice(0, 22) + "…" : userEmail;

  // ── Sidebar content (shared between mobile and desktop) ───────────────────

  const sidebarContent = (mobile = false) => (
    <>
      {/* Logo row + desktop collapse toggle */}
      <div className="relative flex items-center h-14 border-b border-white/10 shrink-0">
        {/* Logo — hidden when collapsed on desktop */}
        {(!collapsed || mobile) && (
          <div className="flex items-center gap-2.5 px-5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-900/60 flex items-center justify-center shrink-0">
              <span className="text-lg leading-none select-none">🦑</span>
            </div>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-white leading-none">Ultimate Calamari</span>
              <p className="text-[10px] text-teal-400/80 mt-0.5 leading-none">Your Marine AI Knowledge Assistant</p>
            </div>
          </div>
        )}

        {/* Collapse toggle — desktop only, coral/pink so it's visible on dark navy */}
        {!mobile && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden lg:flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0
              text-[#e879a0] hover:text-white hover:bg-[#e879a0]/20
              ${collapsed ? "mx-auto" : "absolute right-1.5 top-1/2 -translate-y-1/2"}`}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />
            }
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav className="mt-3 px-2 shrink-0">
        <div className="space-y-0.5">
          {navItems.slice(0, 4).map((item) => {
            const active = page === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                title={collapsed && !mobile ? item.label : undefined}
                className={`w-full flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  collapsed && !mobile ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
                } ${
                  active
                    ? "bg-teal-500/15 text-teal-300"
                    : "text-slate-400 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-teal-400" : "text-slate-500"}`} />
                {(!collapsed || mobile) && item.label}
              </button>
            );
          })}
        </div>

        <div className="my-3 border-t border-white/10" />

        {/* Guide */}
        {navItems.slice(4).map((item) => {
          const active = page === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              title={collapsed && !mobile ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                collapsed && !mobile ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
              } ${
                active
                  ? "bg-teal-500/15 text-teal-300"
                  : "text-slate-400 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-teal-400" : "text-slate-500"}`} />
              {(!collapsed || mobile) && item.label}
            </button>
          );
        })}
      </nav>

      {/* Chat history — only when on Chat page with a library selected and sidebar expanded */}
      {showHistory || (!collapsed && !mobile && page === "chat" && !!chatSidebar.selectedLibId) ? (
        <div className="flex flex-col flex-1 min-h-0 mt-2">
          <div className="mx-2 border-t border-white/10 mb-2" />
          {/* Section header */}
          <div className="flex items-center justify-between px-3 mb-1.5 shrink-0">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">History</span>
            <button
              onClick={chatSidebar.onNew}
              className="flex items-center gap-1 text-[11px] font-medium text-teal-500 hover:text-teal-300 transition-colors"
              title="New chat"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
            {chatSidebar.loadingConversations ? (
              <div className="flex justify-center pt-4">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
              </div>
            ) : chatSidebar.conversations.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <MessageCircle className="w-5 h-5 text-slate-700 mx-auto mb-1.5" />
                <p className="text-[11px] text-slate-600">No conversations yet</p>
              </div>
            ) : (
              chatSidebar.conversations.map((conv) => {
                const isActive = chatSidebar.activeConversationId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => chatSidebar.onSelect(conv)}
                    className={`group relative flex items-start gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                      isActive
                        ? "bg-teal-500/15 border border-teal-500/20"
                        : "border border-transparent hover:bg-white/5"
                    }`}
                  >
                    <MessageCircle className={`w-3 h-3 mt-0.5 shrink-0 ${isActive ? "text-teal-400" : "text-slate-600"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate leading-snug ${isActive ? "text-teal-200" : "text-slate-400"}`}>
                        {conv.title}
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{relativeTime(conv.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); chatSidebar.onDelete(conv); }}
                      className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        // Spacer pushes footer to bottom when history isn't shown
        <div className="flex-1" />
      )}

      {/* User footer */}
      <div className="shrink-0 border-t border-white/10 p-2">
        {collapsed && !mobile ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <div className="w-7 h-7 rounded-full bg-teal-900/80 flex items-center justify-center">
              <span className="text-[11px] font-semibold text-teal-300 uppercase">
                {userEmail.charAt(0)}
              </span>
            </div>
            <button onClick={handleSignOut} title="Sign out" className="text-slate-500 hover:text-red-400 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <div className="w-7 h-7 rounded-full bg-teal-900/80 flex items-center justify-center shrink-0">
              <span className="text-[11px] font-semibold text-teal-300 uppercase">
                {userEmail.charAt(0)}
              </span>
            </div>
            <span className="text-xs text-slate-400 flex-1 truncate min-w-0">{emailPreview}</span>
            <button onClick={handleSignOut} title="Sign out" className="text-slate-500 hover:text-red-400 transition-colors shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between bg-[#0b1d35] border-b border-white/10 px-4 h-14">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-900/60 flex items-center justify-center">
            <span className="text-base leading-none">🦑</span>
          </div>
          <span className="text-sm font-semibold text-white">Ultimate Calamari</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-20 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex fixed top-0 left-0 bottom-0 z-20 flex-col bg-[#0b1d35] border-r border-white/10 transition-all duration-200 ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile sidebar drawer */}
      <aside
        className={`lg:hidden fixed top-0 left-0 bottom-0 z-20 w-60 flex flex-col bg-[#0b1d35] border-r border-white/10 transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent(true)}
      </aside>

      {/* Main content */}
      <main className={`transition-all duration-200 pt-14 lg:pt-0 ${collapsed ? "lg:pl-14" : "lg:pl-60"}`}>
        <div className="p-6 lg:p-10 max-w-6xl">
          <NavigationProvider value={navigate}>
            <ActivePage />
          </NavigationProvider>
        </div>
      </main>
    </div>
  );
}

// ── Root App — provides context + handles auth ────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthToken(session?.access_token ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <ChatSidebarProvider>
      <AppShell session={session} />
    </ChatSidebarProvider>
  );
}
