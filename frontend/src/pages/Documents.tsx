import { useState, useEffect, useCallback } from "react";
import {
  Upload, Trash2, Loader2, AlertCircle, RefreshCw,
  Search, X, ChevronLeft, ChevronRight, FileText,
} from "lucide-react";
import { fetchDocuments, uploadDocument, deleteDocument, type DocumentItem } from "../api/client";

const PAGE_SIZE = 20;

const STATUS_CONFIG = {
  pending:    { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-400",   label: "Pending" },
  processing: { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500",    label: "Processing" },
  ready:      { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-400", label: "Ready" },
  failed:     { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-400",     label: "Failed" },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;
type StatusFilter = "all" | StatusKey;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",        label: "All statuses" },
  { value: "ready",      label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "pending",    label: "Pending" },
  { value: "failed",     label: "Failed" },
];

const FILE_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  pdf:  { label: "PDF",  className: "bg-red-50 text-red-600 border-red-100" },
  docx: { label: "DOCX", className: "bg-blue-50 text-blue-600 border-blue-100" },
  doc:  { label: "DOC",  className: "bg-blue-50 text-blue-600 border-blue-100" },
  txt:  { label: "TXT",  className: "bg-slate-100 text-slate-500 border-slate-200" },
};

export function FileTypeTag({ filename }: { filename: string }) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const t = FILE_TYPE_CONFIG[ext] ?? { label: (ext || "FILE").toUpperCase(), className: "bg-slate-100 text-slate-500 border-slate-200" };
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${t.className}`}>
      {t.label}
    </span>
  );
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return dateStr; }
}

// ── Reusable pagination bar ───────────────────────────────────────────────────

function PaginationBar({
  page, totalPages, total, onPrev, onNext,
}: { page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs text-slate-400">
        Page {page} of {totalPages} · {total} result{total !== 1 ? "s" : ""}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={page === 1}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          disabled={page === totalPages}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Documents() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"upload" | "docs">("upload");

  // My Documents filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDocuments();
      setDocuments(data);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent background refresh (no loading spinner) for ingestion progress
  const silentRefresh = useCallback(async () => {
    try {
      const data = await fetchDocuments();
      setDocuments(data);
      setLoaded(true);
    } catch { /* swallow */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s while any doc is pending or processing
  useEffect(() => {
    if (!loaded) return;
    const inProgress = documents.some((d) => d.status === "pending" || d.status === "processing");
    if (!inProgress) return;
    const timer = setInterval(silentRefresh, 5000);
    return () => clearInterval(timer);
  }, [documents, loaded, silentRefresh]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUploadFiles = async (files: File[]) => {
    const valid = files.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase();
      return ext && ["pdf", "docx", "txt"].includes(ext);
    });
    const skipped = files.length - valid.length;
    if (skipped > 0) setError(`${skipped} file(s) skipped — only PDF, DOCX, and TXT are supported.`);
    if (!valid.length) return;

    setUploading(valid.map((f) => f.name));
    const errors: string[] = [];
    for (const file of valid) {
      try {
        await uploadDocument(file);
      } catch (e: unknown) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading([]);
    if (errors.length) setError(errors.join("\n"));
    // Switch to My Documents so the user can watch ingestion progress
    setActiveTab("docs");
    await load();
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleUploadFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleUploadFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  // ── Filtering + pagination ─────────────────────────────────────────────────

  const handleSearch = (q: string) => { setSearch(q); setCurrentPage(1); };
  const handleStatusFilter = (v: StatusFilter) => { setStatusFilter(v); setCurrentPage(1); };

  const filtered = documents
    .filter((d) => d.filename.toLowerCase().includes(search.toLowerCase()))
    .filter((d) => statusFilter === "all" || d.status === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const isUploading = uploading.length > 0;
  const inProgressCount = documents.filter((d) => d.status === "pending" || d.status === "processing").length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload files to build your knowledge base — PDF, DOCX, or TXT
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 mb-6 w-fit">
        <button
          onClick={() => setActiveTab("upload")}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "upload"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload
        </button>
        <button
          onClick={() => setActiveTab("docs")}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "docs"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          My Documents
          {documents.length > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 leading-none">
              {documents.length}
            </span>
          )}
          {inProgressCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" title="Ingestion in progress" />
          )}
        </button>
      </div>

      {/* ── Upload tab ── */}
      {activeTab === "upload" && (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`relative rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
              dragActive ? "border-blue-400 bg-blue-50/60 scale-[1.01]" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              multiple
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              disabled={isUploading}
            />
            <div className="flex flex-col items-center gap-3">
              {isUploading ? (
                <>
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-blue-600">
                      Uploading {uploading.length} file{uploading.length > 1 ? "s" : ""}…
                    </p>
                    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                      {uploading.map((name) => (
                        <span key={name} className="text-xs text-slate-500 bg-slate-100 rounded px-2 py-0.5 max-w-[200px] truncate">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-slate-700">
                      Drop files here or <span className="text-blue-600">browse</span>
                    </p>
                    <p className="text-sm text-slate-400 mt-1">PDF, DOCX, or TXT · up to 50 MB · multiple files at once</p>
                  </div>
                  <p className="text-xs text-slate-300">Files will be chunked and indexed automatically after upload.</p>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-wrap">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}
        </>
      )}

      {/* ── My Documents tab ── */}
      {activeTab === "docs" && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by filename…"
                className="w-full rounded-lg border border-slate-200 pl-9 pr-9 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
              {search && (
                <button onClick={() => handleSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value as StatusFilter)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition-colors shrink-0"
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Count + refresh */}
            {loaded && (
              <span className="text-xs text-slate-400 shrink-0">
                {filtered.length !== documents.length
                  ? `${filtered.length} of ${documents.length}`
                  : `${documents.length} file${documents.length !== 1 ? "s" : ""}`
                }
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {/* Auto-refresh notice */}
          {inProgressCount > 0 && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
              <p className="text-xs text-blue-700">
                {inProgressCount} document{inProgressCount !== 1 ? "s" : ""} being processed — refreshing automatically every 5 seconds.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1 whitespace-pre-wrap">{error}</span>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">&times;</button>
            </div>
          )}

          {/* Initial spinner */}
          {loading && !loaded && (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}

          {/* Empty states */}
          {loaded && filtered.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                {search || statusFilter !== "all"
                  ? <Search className="w-6 h-6 text-slate-400" />
                  : <FileText className="w-6 h-6 text-slate-400" />
                }
              </div>
              {search || statusFilter !== "all" ? (
                <>
                  <p className="text-sm text-slate-500 font-medium">No documents match these filters</p>
                  <button
                    onClick={() => { setSearch(""); setStatusFilter("all"); }}
                    className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-500 font-medium">No documents uploaded yet</p>
                  <button
                    onClick={() => setActiveTab("upload")}
                    className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                  >
                    Upload your first file
                  </button>
                </>
              )}
            </div>
          )}

          {/* Document rows */}
          {paginated.length > 0 && (
            <>
              <div className="space-y-2">
                {paginated.map((doc) => {
                  const s = STATUS_CONFIG[doc.status as StatusKey] ?? STATUS_CONFIG.pending;
                  const isFailed = doc.status === "failed";
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition-colors"
                    >
                      <FileTypeTag filename={doc.filename} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{doc.filename}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatBytes(doc.file_size_bytes)}
                          {doc.file_size_bytes ? " · " : ""}
                          {formatDate(doc.created_at)}
                          {doc.chunk_count ? ` · ${doc.chunk_count} chunks` : ""}
                        </p>
                      </div>
                      {/* Status badge — shows error on hover for failed docs */}
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${s.bg} ${s.text} ${s.border} ${isFailed && doc.error_message ? "cursor-help" : ""}`}
                        title={isFailed && doc.error_message ? doc.error_message : undefined}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${doc.status === "processing" ? "animate-pulse" : ""}`} />
                        {s.label}
                        {isFailed && doc.error_message && (
                          <AlertCircle className="w-3 h-3 ml-0.5 opacity-70" />
                        )}
                      </span>
                      <button
                        onClick={() => handleDelete(doc.id, doc.filename)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0"
                        title="Delete document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                total={filtered.length}
                onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
                onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
