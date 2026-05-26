const API_BASE = "http://127.0.0.1:8000";

// Set by App.tsx whenever the Supabase session changes.
let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  _authToken = token;
}

function authToken(): string {
  if (!_authToken) throw new Error("Not authenticated");
  return _authToken;
}

function baseHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${authToken()}` };
}

function jsonHeaders(): Record<string, string> {
  return { ...baseHeaders(), "Content-Type": "application/json" };
}

async function parseResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json();
}

// ── Documents ──────────────────────────────────────────────────────────────

export interface DocumentItem {
  id: string;
  filename: string;
  content_type: string;
  file_size_bytes: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  chunk_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchDocuments(): Promise<DocumentItem[]> {
  const res = await fetch(`${API_BASE}/v1/documents`, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function fetchDocument(id: string): Promise<DocumentItem> {
  const res = await fetch(`${API_BASE}/v1/documents/${id}`, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function uploadDocument(file: File): Promise<DocumentItem> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/v1/documents`, {
    method: "POST",
    headers: baseHeaders(),
    body: form,
  });
  return parseResponse(res);
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/documents/${id}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Libraries ──────────────────────────────────────────────────────────────

export interface Library {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchLibraries(): Promise<Library[]> {
  const res = await fetch(`${API_BASE}/v1/libraries`, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function fetchLibrary(id: string): Promise<Library> {
  const res = await fetch(`${API_BASE}/v1/libraries/${id}`, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function createLibrary(name: string, description?: string): Promise<Library> {
  const res = await fetch(`${API_BASE}/v1/libraries`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ name, description }),
  });
  return parseResponse(res);
}

export async function deleteLibrary(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/libraries/${id}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function fetchLibraryDocuments(libraryId: string): Promise<DocumentItem[]> {
  const res = await fetch(`${API_BASE}/v1/libraries/${libraryId}/documents`, {
    headers: baseHeaders(),
  });
  return parseResponse(res);
}

export async function addDocumentToLibrary(libraryId: string, documentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/libraries/${libraryId}/documents`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ document_id: documentId }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function removeDocumentFromLibrary(libraryId: string, documentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/libraries/${libraryId}/documents/${documentId}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Document semantic search ────────────────────────────────────────────────

export interface DocumentSearchResult {
  document_id: string;
  filename: string;
  relevance_score: number; // 0–1 cosine similarity
  top_chunk_text: string;
}

export async function searchDocuments(query: string): Promise<DocumentSearchResult[]> {
  const res = await fetch(`${API_BASE}/v1/documents/search`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ query }),
  });
  return parseResponse(res);
}

// ── Query ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SourceChunk {
  document_id: string;
  filename: string;
  chunk_index: number;
  text: string;
  relevance_score: number;
}

export interface QueryResult {
  answer: string;
  sources: SourceChunk[];
  tokens_used: number;
  latency_ms: number;
  conversation_id: string | null;
}

export async function queryLibrary(
  libraryId: string,
  prompt: string,
  options?: {
    top_k?: number;
    top_n?: number;
    messages?: ChatMessage[];
    conversation_id?: string | null;
  },
): Promise<QueryResult> {
  const res = await fetch(`${API_BASE}/v1/libraries/${libraryId}/query`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ prompt, ...options }),
  });
  return parseResponse(res);
}

// ── Conversations ───────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  library_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceChunk[] | null;
  tokens_used: number | null;
  created_at: string;
}

export async function fetchConversations(libraryId?: string): Promise<Conversation[]> {
  const url = libraryId
    ? `${API_BASE}/v1/conversations?library_id=${libraryId}`
    : `${API_BASE}/v1/conversations`;
  const res = await fetch(url, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function fetchConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
  const res = await fetch(`${API_BASE}/v1/conversations/${conversationId}/messages`, {
    headers: baseHeaders(),
  });
  return parseResponse(res);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/conversations/${conversationId}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── API Keys ───────────────────────────────────────────────────────────────

export interface ApiKeyItem {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
}

export interface ApiKeyCreateResult {
  id: string;
  name: string;
  raw_key: string;
  created_at: string;
}

export async function fetchApiKeys(): Promise<ApiKeyItem[]> {
  const res = await fetch(`${API_BASE}/v1/api-keys`, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function createApiKey(name: string): Promise<ApiKeyCreateResult> {
  const res = await fetch(`${API_BASE}/v1/api-keys`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ name }),
  });
  return parseResponse(res);
}

export async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/api-keys/${id}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
}
