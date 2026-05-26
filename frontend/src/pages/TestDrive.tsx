import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  MessageSquare, Loader2, AlertCircle, Send, BookOpen,
  FileText, Sparkles, User, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  fetchLibraries,
  fetchLibraryDocuments,
  queryLibrary,
  fetchConversations,
  fetchConversationMessages,
  deleteConversation,
  type Library,
  type SourceChunk,
  type Conversation,
  type ChatMessage,
} from "../api/client";
import { useNavigate } from "../lib/navigation";
import { useChatSidebarSet, CHAT_SIDEBAR_EMPTY } from "../lib/chatSidebar";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: SourceChunk[];
  error?: boolean;
}

export default function Chat() {
  const navigate = useNavigate();
  const setChatSidebar = useChatSidebarSet();

  // Libraries
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibId, setSelectedLibId] = useState("");
  const [fetchingLibs, setFetchingLibs] = useState(true);

  // Doc count for selected lib
  const [libDocCount, setLibDocCount] = useState<number | null>(null);
  const [fetchingDocCount, setFetchingDocCount] = useState(false);

  // Chat messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Which assistant messages have their sources expanded (collapsed by default)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const toggleSources = (id: string) =>
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Conversation persistence
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadLibraries = useCallback(async () => {
    setFetchingLibs(true);
    try {
      const data = await fetchLibraries();
      setLibraries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchingLibs(false);
    }
  }, []);

  const loadConversations = useCallback(async (libId: string) => {
    setLoadingConversations(true);
    try {
      const data = await fetchConversations(libId);
      setConversations(data);
    } catch {
      // non-critical
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, querying]);

  // When library changes: reset chat state + fetch conversations + doc count
  useEffect(() => {
    if (!selectedLibId) {
      setLibDocCount(null);
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
      return;
    }
    setMessages([]);
    setActiveConversationId(null);
    loadConversations(selectedLibId);

    setFetchingDocCount(true);
    fetchLibraryDocuments(selectedLibId)
      .then((docs) => setLibDocCount(docs.length))
      .catch(() => setLibDocCount(null))
      .finally(() => setFetchingDocCount(false));
  }, [selectedLibId, loadConversations]);

  // ── Conversation actions (stable callbacks — passed to context) ───────────

  const handleSelectConversation = useCallback(async (conv: Conversation) => {
    setLoadingHistory(true);
    setActiveConversationId(conv.id);
    setMessages([]);
    try {
      const rows = await fetchConversationMessages(conv.id);
      setMessages(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          text: r.content,
          sources: r.sources ?? undefined,
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveConversationId(null);
    setPrompt("");
  }, []);

  const handleDeleteConversation = useCallback(
    async (conv: Conversation) => {
      if (!confirm(`Delete "${conv.title}"? This cannot be undone.`)) return;
      try {
        await deleteConversation(conv.id);
        setConversations((prev) => prev.filter((c) => c.id !== conv.id));
        if (activeConversationId === conv.id) {
          setMessages([]);
          setActiveConversationId(null);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [activeConversationId]
  );

  // ── Sync conversation state into App.tsx sidebar via context ─────────────

  useEffect(() => {
    setChatSidebar({
      selectedLibId,
      conversations,
      activeConversationId,
      loadingConversations,
      onSelect: handleSelectConversation,
      onNew: handleNewChat,
      onDelete: handleDeleteConversation,
    });
  }, [
    selectedLibId, conversations, activeConversationId, loadingConversations,
    handleSelectConversation, handleNewChat, handleDeleteConversation, setChatSidebar,
  ]);

  // Reset context when Chat unmounts (user navigates away)
  useEffect(() => {
    return () => setChatSidebar(CHAT_SIDEBAR_EMPTY);
  }, [setChatSidebar]);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleQuery = async () => {
    const text = prompt.trim();
    if (!selectedLibId || !text) return;

    const historyMessages: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setQuerying(true);
    setError(null);

    try {
      const data = await queryLibrary(selectedLibId, text, {
        messages: historyMessages,
        conversation_id: activeConversationId,
      });

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: data.answer, sources: data.sources || [] },
      ]);

      if (data.conversation_id) {
        const wasNew = !activeConversationId;
        setActiveConversationId(data.conversation_id);
        if (wasNew) {
          loadConversations(selectedLibId);
        } else {
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === data.conversation_id
                  ? { ...c, updated_at: new Date().toISOString() }
                  : c
              )
              .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          );
        }
      }
    } catch (e: unknown) {
      const errText = e instanceof Error ? e.message : String(e);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: errText, error: true },
      ]);
      setError(errText);
    } finally {
      setQuerying(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedLib = libraries.find((l) => l.id === selectedLibId);
  const libIsEmpty = selectedLibId && !fetchingDocCount && libDocCount === 0;
  const canSend = !querying && !!selectedLibId && !!prompt.trim() && !libIsEmpty;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ minHeight: "calc(100vh - 4rem)" }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Chat</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cast your question — we'll fish out the answer from your documents.
        </p>
      </div>

      {/* Knowledge base selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <div className="flex items-end gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Knowledge Base
            </label>
            {fetchingLibs ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : libraries.length === 0 ? (
              <div className="flex items-center gap-3 py-1">
                <p className="text-xs text-slate-400">No knowledge bases yet.</p>
                <button
                  onClick={() => navigate("libraries")}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Create one <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <select
                value={selectedLibId}
                onChange={(e) => setSelectedLibId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition-colors"
              >
                <option value="">Select a knowledge base…</option>
                {libraries.map((lib) => (
                  <option key={lib.id} value={lib.id}>{lib.name}</option>
                ))}
              </select>
            )}
            {selectedLib?.description && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                <BookOpen className="w-3 h-3 shrink-0" />
                <span className="truncate">{selectedLib.description}</span>
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors pb-1 shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Empty-library warning */}
      {libIsEmpty && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">This knowledge base has no documents</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Add documents in the Knowledge Bases page before chatting.
            </p>
          </div>
          <button
            onClick={() => navigate("libraries")}
            className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
          >
            Go to Knowledge Bases
          </button>
        </div>
      )}

      {/* History loading */}
      {loadingHistory && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      )}

      {/* Conversation thread */}
      {!loadingHistory && messages.length > 0 && (
        <div className="space-y-4 mb-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div className="flex items-start gap-3 justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3">
                    <p className="text-sm text-white leading-relaxed">{msg.text}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.error ? "bg-red-50" : "bg-slate-100"}`}>
                    {msg.error
                      ? <AlertCircle className="w-4 h-4 text-red-500" />
                      : <Sparkles className="w-4 h-4 text-blue-600" />
                    }
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    <div className={`rounded-2xl rounded-tl-sm px-4 py-3 ${msg.error ? "bg-red-50 border border-red-200" : "bg-white border border-slate-200 shadow-sm"}`}>
                      {msg.error ? (
                        <p className="text-sm leading-relaxed text-red-700">{msg.text}</p>
                      ) : (
                        <>
                          <div className="prose prose-sm prose-slate max-w-none
                            prose-p:leading-relaxed prose-p:my-1.5 first:prose-p:mt-0 last:prose-p:mb-0
                            prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
                            prose-strong:font-semibold prose-strong:text-slate-800
                            prose-headings:font-semibold prose-headings:text-slate-900
                            prose-code:text-xs prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-700 prose-code:before:content-none prose-code:after:content-none
                            prose-pre:bg-slate-100 prose-pre:text-slate-700 prose-pre:rounded-lg prose-pre:text-xs">
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>

                          {/* Inline citation pills — deduplicated filenames */}
                          {msg.sources && msg.sources.length > 0 && (() => {
                            const seen = new Set<string>();
                            const unique = msg.sources.filter(s => {
                              if (seen.has(s.filename)) return false;
                              seen.add(s.filename);
                              return true;
                            });
                            return (
                              <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                                {unique.map((s, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                                    <FileText className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span className="truncate max-w-[14rem]">{s.filename}</span>
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    {msg.sources && msg.sources.length > 0 && (() => {
                      return (
                        <div>
                          {/* Toggle button — always visible */}
                          <button
                            onClick={() => toggleSources(msg.id)}
                            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 uppercase tracking-wider transition-colors"
                          >
                            <FileText className="w-3 h-3" />
                            Sources ({msg.sources.length})
                            {expandedSources.has(msg.id)
                              ? <ChevronUp className="w-3 h-3" />
                              : <ChevronDown className="w-3 h-3" />
                            }
                          </button>

                          {/* Expanded source list with normalized relevance scores */}
                          {expandedSources.has(msg.id) && (
                            <div className="mt-2 space-y-2">
                              {msg.sources.map((chunk, i) => {
                                return (
                                  <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="text-xs font-medium text-slate-600 truncate flex-1">
                                        {chunk.filename}
                                      </span>
                                      <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 shrink-0">
                                        Source {i + 1}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                                      {chunk.text}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}

          {querying && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Empty state */}
      {!loadingHistory && messages.length === 0 && !querying && (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-center">
            <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {selectedLibId
                ? "Ask a question about your documents"
                : "Select a knowledge base to get started"}
            </p>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="sticky bottom-0 bg-slate-50 pt-2 pb-4">
        <div className="relative rounded-xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleQuery();
            }}
            placeholder={
              !selectedLibId
                ? "Select a knowledge base first…"
                : libIsEmpty
                  ? "Add documents to this knowledge base before chatting…"
                  : "Ask a question about your documents…"
            }
            disabled={!selectedLibId || !!libIsEmpty}
            rows={2}
            className="w-full rounded-xl px-4 py-3 pr-14 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none resize-none bg-transparent disabled:opacity-50"
          />
          <button
            onClick={handleQuery}
            disabled={!canSend}
            className="absolute bottom-2.5 right-2.5 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
            title="Send (Ctrl+Enter)"
          >
            {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-1.5">
          Answers are surfaced strictly from your documents · Ctrl+Enter to send
        </p>
      </div>
    </div>
  );
}
