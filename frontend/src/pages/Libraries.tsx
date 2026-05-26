import { useState, useEffect, useCallback, useRef } from "react";
import { BookOpen, Plus, FileText, Loader2, AlertCircle, ArrowLeft, FolderOpen, Minus, MessageSquare, Search, X, ChevronLeft, ChevronRight, Copy, Check, ArrowUpDown, Sparkles, SlidersHorizontal } from "lucide-react";
import {
  fetchLibraries,
  createLibrary,
  addDocumentToLibrary,
  removeDocumentFromLibrary,
  fetchDocuments,
  fetchLibraryDocuments,
  searchDocuments,
  type Library,
  type DocumentItem,
  type DocumentSearchResult,
} from "../api/client";
import { useNavigate } from "../lib/navigation";
import { FileTypeTag, formatBytes, formatDate } from "./Documents";

const ADD_DOC_PAGE_SIZE = 10;

type SortOption = "name-asc" | "name-desc" | "date-new" | "date-old" | "size-large" | "size-small";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name-asc",   label: "Name A→Z" },
  { value: "name-desc",  label: "Name Z→A" },
  { value: "date-new",   label: "Newest first" },
  { value: "date-old",   label: "Oldest first" },
  { value: "size-large", label: "Largest first" },
  { value: "size-small", label: "Smallest first" },
];

const STATUS_CONFIG = {
  pending:    { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-400" },
  processing: { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500" },
  ready:      { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-400" },
  failed:     { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-400" },
} as const;

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title="Copy knowledge base ID"
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-white transition-colors shrink-0"
    >
      {copied
        ? <><Check className="w-3 h-3 text-emerald-500" /> <span className="text-emerald-600">Copied!</span></>
        : <><Copy className="w-3 h-3" /> Copy ID</>
      }
    </button>
  );
}

export default function Libraries() {
  const navigate = useNavigate();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Library detail view
  const [selectedLib, setSelectedLib] = useState<Library | null>(null);
  const [libDocs, setLibDocs] = useState<DocumentItem[]>([]);
  const [allDocs, setAllDocs] = useState<DocumentItem[]>([]);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [addingDocId, setAddingDocId] = useState<string | null>(null);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);

  // Add Document picker state
  const [addDocSearch, setAddDocSearch] = useState("");
  const [addDocPage, setAddDocPage] = useState(1);
  const [addDocSort, setAddDocSort] = useState<SortOption>("name-asc");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const aiSelectAllRef = useRef<HTMLInputElement>(null);

  // AI search picker state
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<DocumentSearchResult[]>([]);
  const [aiSearching, setAiSearching] = useState(false);
  const [relevanceThreshold, setRelevanceThreshold] = useState(0);

  // Library document list: search + pagination
  const [libDocsSearch, setLibDocsSearch] = useState("");
  const [libDocsPage, setLibDocsPage] = useState(1);
  const LIB_DOCS_PAGE_SIZE = 10;

  const loadLibraries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLibraries();
      setLibraries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLibraries(); }, [loadLibraries]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createLibrary(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await loadLibraries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const openLibrary = async (lib: Library) => {
    setError(null);
    setSelectedLib(lib);
    setLibDocs([]);
    setAllDocs([]);
    setLibDocsSearch("");
    setLibDocsPage(1);
    try {
      const [libDocsData, allDocsData] = await Promise.all([
        fetchLibraryDocuments(lib.id),
        fetchDocuments(),
      ]);
      setLibDocs(libDocsData);
      setAllDocs(allDocsData);
      setShowAddDoc(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddDoc = async (docId: string) => {
    if (!selectedLib) return;
    setAddingDocId(docId);
    setError(null);
    try {
      await addDocumentToLibrary(selectedLib.id, docId);
      await openLibrary(selectedLib);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingDocId(null);
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!selectedLib) return;
    setRemovingDocId(docId);
    setError(null);
    try {
      await removeDocumentFromLibrary(selectedLib.id, docId);
      await openLibrary(selectedLib);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingDocId(null);
    }
  };

  const handleBulkAdd = async () => {
    if (!selectedLib || selectedDocIds.size === 0) return;
    const ids = Array.from(selectedDocIds);
    setBulkAdding(true);
    setBulkProgress({ done: 0, total: ids.length });
    setError(null);
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      try {
        await addDocumentToLibrary(selectedLib.id, ids[i]);
      } catch {
        failed.push(ids[i]);
      }
      setBulkProgress({ done: i + 1, total: ids.length });
    }
    setBulkAdding(false);
    setBulkProgress(null);
    setSelectedDocIds(new Set());
    if (failed.length) setError(`${failed.length} document(s) could not be added.`);
    await openLibrary(selectedLib);
  };

  const handleAiSearch = async () => {
    if (!aiQuery.trim() || aiSearching) return;
    setAiSearching(true);
    setAiResults([]);
    setSelectedDocIds(new Set());
    setAddDocPage(1);
    try {
      const results = await searchDocuments(aiQuery.trim());
      setAiResults(results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiSearching(false);
    }
  };

  const switchToAiMode = () => {
    setAiSearchMode(true);
    setAddDocSearch("");
    setSelectedDocIds(new Set());
    setAddDocPage(1);
  };

  const switchToRegularMode = () => {
    setAiSearchMode(false);
    setAiQuery("");
    setAiResults([]);
    setSelectedDocIds(new Set());
    setAddDocPage(1);
  };

  // Reset ALL picker state when panel closes
  useEffect(() => {
    if (!showAddDoc) {
      setAddDocSearch("");
      setAddDocPage(1);
      setAddDocSort("name-asc");
      setSelectedDocIds(new Set());
      setBulkProgress(null);
      setAiSearchMode(false);
      setAiQuery("");
      setAiResults([]);
      setRelevanceThreshold(0);
    }
  }, [showAddDoc]);

  // ── Add-Document picker derived state ────────────────────────────────────
  const readyDocs = allDocs.filter((d) => d.status === "ready");
  const libDocIds = new Set(libDocs.map((d) => d.id));

  // Regular mode: filter + sort
  const filteredPickerDocs = readyDocs.filter((d) =>
    d.filename.toLowerCase().includes(addDocSearch.toLowerCase())
  );
  const sortedPickerDocs = [...filteredPickerDocs].sort((a, b) => {
    switch (addDocSort) {
      case "name-asc":   return a.filename.localeCompare(b.filename);
      case "name-desc":  return b.filename.localeCompare(a.filename);
      case "date-new":   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "date-old":   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "size-large": return (b.file_size_bytes ?? 0) - (a.file_size_bytes ?? 0);
      case "size-small": return (a.file_size_bytes ?? 0) - (b.file_size_bytes ?? 0);
      default: return 0;
    }
  });

  // AI mode: filter by threshold, join with allDocs for file metadata
  const aiFiltered = aiResults.filter((r) => r.relevance_score >= relevanceThreshold / 100);

  // ── Unified PickerRow for rendering (works for both modes) ───────────────
  interface PickerRow {
    id: string;
    filename: string;
    file_size_bytes: number | null;
    created_at: string;
    relevanceScore?: number;
    topChunkText?: string;
  }

  const pickerRows: PickerRow[] = aiSearchMode
    ? aiFiltered.map((r) => {
        const full = allDocs.find((d) => d.id === r.document_id);
        return {
          id: r.document_id,
          filename: r.filename,
          file_size_bytes: full?.file_size_bytes ?? null,
          created_at: full?.created_at ?? "",
          relevanceScore: r.relevance_score,
          topChunkText: r.top_chunk_text,
        };
      })
    : sortedPickerDocs.map((d) => ({
        id: d.id,
        filename: d.filename,
        file_size_bytes: d.file_size_bytes,
        created_at: d.created_at,
      }));

  const addDocTotalPages = Math.max(1, Math.ceil(pickerRows.length / ADD_DOC_PAGE_SIZE));
  const safeAddDocPage = Math.min(addDocPage, addDocTotalPages);
  const paginatedPickerDocs = pickerRows.slice(
    (safeAddDocPage - 1) * ADD_DOC_PAGE_SIZE,
    safeAddDocPage * ADD_DOC_PAGE_SIZE
  );

  // Select-all logic: across ALL visible (current mode) available (non-added) rows
  const availableFiltered = pickerRows.filter((r) => !libDocIds.has(r.id));
  const allSelected = availableFiltered.length > 0 && availableFiltered.every((r) => selectedDocIds.has(r.id));
  const someSelected = availableFiltered.some((r) => selectedDocIds.has(r.id));
  const isIndeterminate = someSelected && !allSelected;

  // Keep indeterminate in sync on the DOM elements (can't set via JSX)
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = isIndeterminate;
    if (aiSelectAllRef.current) aiSelectAllRef.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);

  // ── Library document list: search + pagination ────────────────────────────
  const filteredLibDocs = libDocs.filter((d) =>
    d.filename.toLowerCase().includes(libDocsSearch.toLowerCase())
  );
  const libDocsTotalPages = Math.max(1, Math.ceil(filteredLibDocs.length / LIB_DOCS_PAGE_SIZE));
  const safeLibDocsPage = Math.min(libDocsPage, libDocsTotalPages);
  const paginatedLibDocs = filteredLibDocs.slice(
    (safeLibDocsPage - 1) * LIB_DOCS_PAGE_SIZE,
    safeLibDocsPage * LIB_DOCS_PAGE_SIZE
  );

  // Detail view
  if (selectedLib) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => setSelectedLib(null)}
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Knowledge Bases
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-slate-900">{selectedLib.name}</h1>
            <CopyIdButton id={selectedLib.id} />
          </div>
          {selectedLib.description && (
            <p className="mt-1 text-sm text-slate-500">{selectedLib.description}</p>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">&times;</button>
          </div>
        )}

        {/* Documents in library — header + search */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-800">
            Documents <span className="text-slate-400 font-normal">({libDocs.length})</span>
          </h2>
          <div className="flex items-center gap-3">
            {libDocs.length > 0 && (
              <button
                onClick={() => navigate("chat")}
                className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <MessageSquare className="w-4 h-4" /> Chat with this knowledge base
              </button>
            )}
            <button
              onClick={() => setShowAddDoc(!showAddDoc)}
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Document
            </button>
          </div>
        </div>

        {showAddDoc && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">

            {/* ── Picker toolbar ── */}
            {aiSearchMode ? (
              /* AI Search toolbar */
              <div className="flex flex-col border-b border-slate-100">
                <div className="flex items-center gap-2.5 px-4 py-3 bg-violet-50/60">
                  {/* AI mode indicator */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-xs font-semibold text-violet-700">AI Search</span>
                  </div>

                  {/* Query input */}
                  <div className="relative flex-1">
                    <input
                      value={aiQuery}
                      onChange={(e) => setAiQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAiSearch(); }}
                      placeholder="e.g. documents about termination clauses or supplier liability"
                      autoFocus
                      className="w-full rounded-md border border-violet-200 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 bg-white transition-colors"
                    />
                  </div>

                  {/* Search button */}
                  <button
                    onClick={handleAiSearch}
                    disabled={!aiQuery.trim() || aiSearching}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 py-1.5 rounded-md transition-colors shrink-0"
                  >
                    {aiSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Search
                  </button>

                  {/* Switch back */}
                  <button
                    onClick={switchToRegularMode}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                    title="Regular search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Threshold slider + select-all — only shown when there are results */}
                {aiResults.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-violet-50/30 border-t border-violet-100/60">
                    {/* Select-all for AI results */}
                    {availableFiltered.length > 0 && (
                      <input
                        ref={aiSelectAllRef}
                        type="checkbox"
                        checked={allSelected}
                        disabled={bulkAdding}
                        onChange={() => {
                          if (allSelected) {
                            setSelectedDocIds(new Set());
                          } else {
                            setSelectedDocIds(new Set(availableFiltered.map((r) => r.id)));
                          }
                        }}
                        title={allSelected ? "Deselect all" : "Select all shown"}
                        className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500/20 shrink-0 cursor-pointer"
                      />
                    )}
                    <SlidersHorizontal className="w-3 h-3 text-violet-400 shrink-0" />
                    <span className="text-[11px] text-slate-500 shrink-0">Min relevance</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={relevanceThreshold}
                      onChange={(e) => { setRelevanceThreshold(Number(e.target.value)); setAddDocPage(1); }}
                      className="flex-1 h-1.5 accent-violet-600 cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-violet-700 w-8 text-right shrink-0">
                      {relevanceThreshold}%
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {aiFiltered.length} of {aiResults.length} shown
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Regular toolbar */
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-blue-50/40">
                {/* Select-all checkbox */}
                {availableFiltered.length > 0 && (
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    disabled={bulkAdding}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedDocIds(new Set());
                      } else {
                        setSelectedDocIds(new Set(availableFiltered.map((r) => r.id)));
                      }
                    }}
                    title={allSelected ? "Deselect all" : "Select all available"}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 shrink-0 cursor-pointer"
                  />
                )}

                {/* Search */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    value={addDocSearch}
                    onChange={(e) => { setAddDocSearch(e.target.value); setAddDocPage(1); }}
                    placeholder="Search ready documents…"
                    autoFocus
                    className="w-full rounded-md border border-slate-200 pl-8 pr-8 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition-colors"
                  />
                  {addDocSearch && (
                    <button onClick={() => { setAddDocSearch(""); setAddDocPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort dropdown */}
                <div className="relative shrink-0">
                  <ArrowUpDown className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={addDocSort}
                    onChange={(e) => { setAddDocSort(e.target.value as SortOption); setAddDocPage(1); }}
                    className="pl-6 pr-2 py-1.5 text-xs rounded-md border border-slate-200 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors appearance-none cursor-pointer"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <span className="text-xs text-slate-400 shrink-0">
                  {sortedPickerDocs.length} ready
                </span>

                {/* AI Search toggle */}
                <button
                  onClick={switchToAiMode}
                  className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-2 py-1 rounded-md transition-colors shrink-0"
                  title="Search by concept using AI"
                >
                  <Sparkles className="w-3 h-3" />
                  AI
                </button>
              </div>
            )}

            {/* ── Bulk action bar — slides in when docs are selected ── */}
            {(selectedDocIds.size > 0 || bulkAdding) && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-blue-600 text-white">
                <div className="flex items-center gap-2">
                  {bulkAdding && bulkProgress ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span className="text-xs font-medium">
                        Adding {bulkProgress.done} of {bulkProgress.total}…
                      </span>
                      {/* Progress bar */}
                      <div className="w-24 h-1.5 bg-blue-400/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-300"
                          style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs font-medium">
                      {selectedDocIds.size} document{selectedDocIds.size !== 1 ? "s" : ""} selected
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!bulkAdding && (
                    <button
                      onClick={() => setSelectedDocIds(new Set())}
                      className="text-xs text-blue-200 hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={handleBulkAdd}
                    disabled={bulkAdding || selectedDocIds.size === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-60 px-3 py-1.5 rounded-md transition-colors"
                  >
                    {bulkAdding
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Plus className="w-3 h-3" />
                    }
                    Add selected ({selectedDocIds.size})
                  </button>
                </div>
              </div>
            )}

            {/* ── Picker body ── */}
            {aiSearchMode ? (
              /* AI search body */
              aiSearching ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                  <p className="text-xs text-slate-400">Searching across your documents…</p>
                </div>
              ) : aiResults.length === 0 && !aiQuery.trim() ? (
                <div className="px-4 py-8 text-center">
                  <Sparkles className="w-8 h-8 text-violet-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Describe what you're looking for</p>
                  <p className="text-xs text-slate-400 mt-1">e.g. "contracts with payment terms" or "supplier liability clauses"</p>
                </div>
              ) : aiResults.length > 0 && aiFiltered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">No results meet the {relevanceThreshold}% relevance threshold</p>
                  <button onClick={() => setRelevanceThreshold(0)} className="text-xs text-violet-600 hover:text-violet-700 mt-1">Reset threshold</button>
                </div>
              ) : aiResults.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">No matching documents found</p>
                  <p className="text-xs text-slate-400 mt-0.5">Try different search terms or check that documents are fully processed</p>
                </div>
              ) : null
            ) : (
              /* Regular body — empty states */
              readyDocs.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No ready documents available</p>
                  <p className="text-xs text-slate-400 mt-0.5">Upload and process documents on the Documents page first</p>
                </div>
              ) : sortedPickerDocs.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-slate-500">No documents match &ldquo;{addDocSearch}&rdquo;</p>
                </div>
              ) : null
            )}

            {/* ── Rows (shared for both modes) ── */}
            {paginatedPickerDocs.length > 0 && (
              <div>
                {paginatedPickerDocs.map((row) => {
                  const alreadyAdded = libDocIds.has(row.id);
                  const isChecked = selectedDocIds.has(row.id);
                  const isAiRow = row.relevanceScore !== undefined;
                  return (
                    <div
                      key={row.id}
                      onClick={() => {
                        if (alreadyAdded || bulkAdding) return;
                        setSelectedDocIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                          return next;
                        });
                      }}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${
                        alreadyAdded
                          ? "opacity-50 bg-slate-50/60"
                          : isChecked
                            ? isAiRow ? "bg-violet-50/60" : "bg-blue-50/60"
                            : "hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      {/* Checkbox */}
                      {alreadyAdded ? (
                        <div className="w-4 h-4 shrink-0" />
                      ) : (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={bulkAdding}
                          onChange={() => {
                            setSelectedDocIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                              return next;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-4 h-4 rounded border-slate-300 focus:ring-2 shrink-0 cursor-pointer ${
                            isAiRow
                              ? "text-violet-600 focus:ring-violet-500/20"
                              : "text-blue-600 focus:ring-blue-500/20"
                          }`}
                        />
                      )}

                      <FileTypeTag filename={row.filename} />

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${alreadyAdded ? "text-slate-400" : "text-slate-700"}`}>
                          {row.filename}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatBytes(row.file_size_bytes)}
                          {row.file_size_bytes ? " · " : ""}
                          {row.created_at ? formatDate(row.created_at) : ""}
                        </p>
                        {/* Top chunk preview — AI mode only */}
                        {isAiRow && row.topChunkText && !alreadyAdded && (
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 italic">
                            &ldquo;{row.topChunkText}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Relevance badge — AI mode only */}
                      {isAiRow && row.relevanceScore !== undefined && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                          row.relevanceScore >= 0.7
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : row.relevanceScore >= 0.45
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                        }`}>
                          {Math.round(row.relevanceScore * 100)}%
                        </span>
                      )}

                      {/* Action button */}
                      {alreadyAdded ? (
                        <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md shrink-0 border border-slate-200">
                          Already added
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddDoc(row.id); }}
                          disabled={addingDocId === row.id || bulkAdding}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 shrink-0 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
                        >
                          {addingDocId === row.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Plus className="w-3 h-3" />
                          }
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Picker pagination */}
                {addDocTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/60">
                    <span className="text-xs text-slate-400">
                      Page {safeAddDocPage} of {addDocTotalPages} · {availableFiltered.length} available
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAddDocPage((p) => Math.max(1, p - 1))}
                        disabled={safeAddDocPage === 1}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setAddDocPage((p) => Math.min(addDocTotalPages, p + 1))}
                        disabled={safeAddDocPage === addDocTotalPages}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {libDocs.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-white border border-blue-100 shadow-sm flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">
              This knowledge base has no documents yet
            </h3>
            <p className="text-xs text-slate-500 mb-5 max-w-xs mx-auto">
              Add documents to start chatting with your knowledge base. You can upload documents on the Documents page first.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowAddDoc(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add documents
              </button>
              <button
                onClick={() => navigate("documents")}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Go to Documents
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search bar for library's document list */}
            {libDocs.length > LIB_DOCS_PAGE_SIZE && (
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={libDocsSearch}
                  onChange={(e) => { setLibDocsSearch(e.target.value); setLibDocsPage(1); }}
                  placeholder="Search documents in this knowledge base…"
                  className="w-full rounded-lg border border-slate-200 pl-9 pr-9 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
                {libDocsSearch && (
                  <button onClick={() => { setLibDocsSearch(""); setLibDocsPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Show search bar even with fewer docs when search is active */}
            {libDocs.length <= LIB_DOCS_PAGE_SIZE && libDocs.length > 3 && (
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  value={libDocsSearch}
                  onChange={(e) => { setLibDocsSearch(e.target.value); setLibDocsPage(1); }}
                  placeholder="Search documents in this knowledge base…"
                  className="w-full rounded-lg border border-slate-200 pl-9 pr-9 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
                />
                {libDocsSearch && (
                  <button onClick={() => { setLibDocsSearch(""); setLibDocsPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {filteredLibDocs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">No documents match &ldquo;{libDocsSearch}&rdquo;</p>
                <button onClick={() => setLibDocsSearch("")} className="text-xs text-blue-600 hover:text-blue-700 mt-1">Clear search</button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedLibDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition-colors">
                      <FileTypeTag filename={doc.filename} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{doc.filename}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatBytes(doc.file_size_bytes)}
                          {doc.file_size_bytes ? " · " : ""}
                          {formatDate(doc.created_at)}
                          {doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveDoc(doc.id)}
                        disabled={removingDocId === doc.id}
                        className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {removingDocId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Minus className="w-3.5 h-3.5" />}
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                {/* Lib docs pagination */}
                {libDocsTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      Page {safeLibDocsPage} of {libDocsTotalPages} · {filteredLibDocs.length} document{filteredLibDocs.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setLibDocsPage((p) => Math.max(1, p - 1))}
                        disabled={safeLibDocsPage === 1}
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setLibDocsPage((p) => Math.min(libDocsTotalPages, p + 1))}
                        disabled={safeLibDocsPage === libDocsTotalPages}
                        className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Knowledge Bases</h1>
          <p className="mt-1 text-sm text-slate-500">Organize documents into searchable collections</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Knowledge Base
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Create Knowledge Base</h3>
          <div className="space-y-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Knowledge base name"
              autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none transition-colors"
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Create"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : libraries.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">No knowledge bases created yet</p>
          <p className="text-xs text-slate-400 mt-1">Create a knowledge base to group your documents</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {libraries.map((lib) => (
            <button
              key={lib.id}
              onClick={() => openLibrary(lib)}
              className="text-left rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors truncate">
                    {lib.name}
                  </h3>
                  {lib.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{lib.description}</p>
                  )}
                  <p className="mt-2.5 text-xs text-slate-400">
                    Created {new Date(lib.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
