import { useState, useEffect, useCallback, useRef } from "react";
import {
  Key, Plus, Loader2, AlertCircle, Copy, Eye, EyeOff, ShieldOff, Check,
  ChevronDown, ChevronUp, Terminal, Code2, Globe, Zap, ExternalLink, MessageSquare,
} from "lucide-react";
import { fetchApiKeys, createApiKey, revokeApiKey, type ApiKeyItem, type ApiKeyCreateResult } from "../api/client";

const API_BASE = "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessagePair {
  id: string;
  userMsg: string;
  assistantMsg: string;
}

// ---------------------------------------------------------------------------
// Reusable dark code block with copy button
// ---------------------------------------------------------------------------

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-lg overflow-hidden border border-slate-700 bg-[#0d1f33]">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700">
        <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-widest">{language}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-xs leading-relaxed text-slate-200 overflow-x-auto whitespace-pre font-mono">{code}</pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dynamic code generators (single-turn and multi-turn)
// ---------------------------------------------------------------------------

function buildMessages(pairs: MessagePair[]) {
  return pairs.flatMap((m) => [
    { role: "user",      content: m.userMsg      || "…previous user message…" },
    { role: "assistant", content: m.assistantMsg || "…previous assistant response…" },
  ]);
}

function genCurl(
  apiKey: string, libraryId: string, prompt: string,
  multiTurn = false, conversationId = "", priorMessages: MessagePair[] = [],
): string {
  const k   = apiKey     || "sk-your-api-key-here";
  const lib = libraryId  || "{library_id}";
  const p   = prompt     || "What are the key obligations in clause 4?";

  if (!multiTurn) {
    return `curl -X POST "${API_BASE}/v1/libraries/${lib}/query" \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": ${JSON.stringify(p)},
    "top_k": 20,
    "top_n": 5
  }'`;
  }

  const convId = conversationId || "{conversation_id}";
  const msgs   = buildMessages(priorMessages);
  const msgsStr = msgs.length === 0
    ? "[]"
    : "[\n" + msgs.map((m) => `      ${JSON.stringify(m)},`).join("\n") + "\n    ]";

  return `curl -X POST "${API_BASE}/v1/libraries/${lib}/query" \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": ${JSON.stringify(p)},
    "top_k": 20,
    "top_n": 5,
    "conversation_id": "${convId}",
    "messages": ${msgsStr}
  }'`;
}

function genPython(
  apiKey: string, libraryId: string, prompt: string,
  multiTurn = false, conversationId = "", priorMessages: MessagePair[] = [],
): string {
  const k   = apiKey    || "sk-your-api-key-here";
  const lib = libraryId || "your-library-id";
  const p   = prompt    || "What are the key obligations in clause 4?";

  if (!multiTurn) {
    return `import requests

response = requests.post(
    "${API_BASE}/v1/libraries/${lib}/query",
    headers={
        "Authorization": "Bearer ${k}",
        "Content-Type": "application/json",
    },
    json={
        "prompt": ${JSON.stringify(p)},
        "top_k": 20,   # chunks to retrieve from Qdrant
        "top_n": 5,    # chunks sent to the LLM after reranking
    },
)

data = response.json()
print(data["answer"])
for source in data["sources"]:
    score = source["relevance_score"]
    print(f"  [{score:.0%}] {source['filename']}")`;
  }

  const convId = conversationId || "{conversation_id}";
  const msgs   = buildMessages(priorMessages);
  const msgsStr = msgs.length === 0
    ? "[]"
    : "[\n" + msgs.map((m) => `    {"role": "${m.role}", "content": ${JSON.stringify(m.content)}},`).join("\n") + "\n]";

  return `import requests

messages = ${msgsStr}

response = requests.post(
    "${API_BASE}/v1/libraries/${lib}/query",
    headers={
        "Authorization": "Bearer ${k}",
        "Content-Type": "application/json",
    },
    json={
        "prompt": ${JSON.stringify(p)},
        "top_k": 20,
        "top_n": 5,
        "conversation_id": "${convId}",  # from previous response
        "messages": messages,
    },
)

data = response.json()
print(data["answer"])
# Save conversation_id for the next request:
# conversation_id = data["conversation_id"]`;
}

function genJs(
  apiKey: string, libraryId: string, prompt: string,
  multiTurn = false, conversationId = "", priorMessages: MessagePair[] = [],
): string {
  const k   = apiKey    || "sk-your-api-key-here";
  const lib = libraryId || "your-library-id";
  const p   = prompt    || "What are the key obligations in clause 4?";

  if (!multiTurn) {
    return `const response = await fetch(
  "${API_BASE}/v1/libraries/${lib}/query",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer ${k}",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: ${JSON.stringify(p)},
      top_k: 20,
      top_n: 5,
    }),
  }
);

const { answer, sources, tokens_used, latency_ms } = await response.json();
console.log(answer);
sources.forEach(s => console.log(\`[\${(s.relevance_score * 100).toFixed(0)}%] \${s.filename}\`));`;
  }

  const convId = conversationId || "{conversationId}";
  const msgs   = buildMessages(priorMessages);
  const msgsStr = msgs.length === 0
    ? "[]"
    : "[\n" + msgs.map((m) => `  { role: "${m.role}", content: ${JSON.stringify(m.content)} },`).join("\n") + "\n]";

  return `const messages = ${msgsStr};

const response = await fetch(
  "${API_BASE}/v1/libraries/${lib}/query",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer ${k}",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: ${JSON.stringify(p)},
      top_k: 20,
      top_n: 5,
      conversation_id: "${convId}", // from previous response
      messages,
    }),
  }
);

const { answer, conversation_id, sources } = await response.json();
console.log(answer);
// Pass conversation_id in your next request to continue the conversation`;
}

// ---------------------------------------------------------------------------
// Live API Playground (with multi-turn toggle + conversation builder)
// ---------------------------------------------------------------------------

type PlaygroundTab = "curl" | "python" | "javascript";

const PLAYGROUND_TABS: { id: PlaygroundTab; label: string }[] = [
  { id: "curl",       label: "curl"      },
  { id: "python",     label: "Python"    },
  { id: "javascript", label: "JS / fetch"},
];

function ApiPlayground({
  firstActiveKey,
  onRequestNewKey,
}: {
  firstActiveKey?: string;
  onRequestNewKey: () => void;
}) {
  const [apiKey,    setApiKey]    = useState(firstActiveKey ?? "");
  const [libraryId, setLibraryId] = useState("");
  const [prompt,    setPrompt]    = useState("");
  const [tab,       setTab]       = useState<PlaygroundTab>("curl");

  // Multi-turn state
  const [multiTurn,      setMultiTurn]      = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [priorMessages,  setPriorMessages]  = useState<MessagePair[]>([]);

  useEffect(() => {
    if (firstActiveKey && !apiKey) setApiKey(firstActiveKey);
  }, [firstActiveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPair = () => {
    setPriorMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), userMsg: "", assistantMsg: "" },
    ]);
  };

  const removePair = (id: string) =>
    setPriorMessages((prev) => prev.filter((p) => p.id !== id));

  const updatePair = (id: string, field: "userMsg" | "assistantMsg", value: string) =>
    setPriorMessages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );

  const code =
    tab === "curl"
      ? genCurl(apiKey, libraryId, prompt, multiTurn, conversationId, priorMessages)
      : tab === "python"
      ? genPython(apiKey, libraryId, prompt, multiTurn, conversationId, priorMessages)
      : genJs(apiKey, libraryId, prompt, multiTurn, conversationId, priorMessages);

  const inputCls =
    "w-full rounded-md border border-[#1a3050] bg-[#0d1f33] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/30 font-mono transition-colors";
  const labelCls =
    "block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5";

  return (
    <section className="border-t border-slate-700 bg-[#0b1d35] sticky top-4 z-10">

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-700/60">
        <div className="flex items-start gap-2 flex-wrap">
          <Zap className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <h3 className="text-sm font-semibold text-white leading-snug flex-1">
            Generate your API call — paste your values and get ready-to-run code in your preferred language
          </h3>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/20 shrink-0">
            interactive
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1.5 ml-6">Get a working API call in under 2 minutes</p>
      </div>

      {/* Core inputs */}
      <div className="px-6 py-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className={inputCls}
          />
          {!apiKey && (
            <button
              type="button"
              onClick={onRequestNewKey}
              className="mt-1 text-[11px] text-yellow-500/70 hover:text-yellow-400 transition-colors text-left"
            >
              Generate one above ↑
            </button>
          )}
        </div>
        <div>
          <label className={labelCls}>Knowledge Base ID</label>
          <input
            value={libraryId}
            onChange={(e) => setLibraryId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className={inputCls}
          />
          <button
            type="button"
            onClick={() => window.open(`${window.location.origin}/#libraries`, "_blank")}
            className="mt-1 flex items-center gap-1 text-[11px] text-teal-500/70 hover:text-teal-400 transition-colors"
          >
            Copy from the Knowledge Bases page
            <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Prompt</label>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What are the key obligations in clause 4?"
            className={inputCls}
          />
        </div>
      </div>

      {/* Multi-turn toggle */}
      <div className="px-6 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setMultiTurn((m) => !m)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
              multiTurn ? "bg-teal-600" : "bg-slate-600"
            }`}
            aria-pressed={multiTurn}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                multiTurn ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-300">Multi-turn conversation</span>
            <span className="text-xs text-slate-500">— include history &amp; conversation ID</span>
          </div>
        </div>

        {multiTurn && (
          <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-4 space-y-4">

            {/* Explanatory note */}
            <div className="flex items-start gap-2">
              <span className="text-teal-400 text-sm shrink-0 mt-0.5">ℹ</span>
              <p className="text-xs text-teal-400/90 leading-relaxed">
                Pass the <code className="bg-teal-900/40 px-1 py-0.5 rounded text-teal-300 font-mono">conversation_id</code>{" "}
                from the previous response and the full <code className="bg-teal-900/40 px-1 py-0.5 rounded text-teal-300 font-mono">messages</code> history
                to maintain context across multiple questions. The current prompt still goes in the{" "}
                <code className="bg-teal-900/40 px-1 py-0.5 rounded text-teal-300 font-mono">prompt</code> field.
              </p>
            </div>

            {/* Conversation ID */}
            <div>
              <label className={labelCls}>Conversation ID</label>
              <input
                value={conversationId}
                onChange={(e) => setConversationId(e.target.value)}
                placeholder="Paste from previous response's conversation_id field…"
                className={inputCls}
              />
              <p className="mt-1 text-[11px] text-slate-600">
                Returned in every query response as <code className="text-slate-500 font-mono">conversation_id</code>. Omit to start a new conversation.
              </p>
            </div>

            {/* Prior message pairs */}
            {priorMessages.length > 0 && (
              <div className="space-y-3">
                <label className={labelCls}>
                  Conversation History{" "}
                  <span className="text-teal-500 normal-case font-normal">
                    ({priorMessages.length} prior turn{priorMessages.length !== 1 ? "s" : ""})
                  </span>
                </label>
                {priorMessages.map((pair, i) => (
                  <div key={pair.id} className="rounded-md border border-slate-700 bg-[#091627] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Turn {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePair(pair.id)}
                        className="text-[11px] text-slate-600 hover:text-red-400 transition-colors"
                      >
                        ✕ Remove
                      </button>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">User</div>
                      <input
                        value={pair.userMsg}
                        onChange={(e) => updatePair(pair.id, "userMsg", e.target.value)}
                        placeholder="Previous user question…"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Assistant</div>
                      <input
                        value={pair.assistantMsg}
                        onChange={(e) => updatePair(pair.id, "assistantMsg", e.target.value)}
                        placeholder="Previous assistant response…"
                        className={inputCls}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addPair}
              className="flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors py-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add previous message pair
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="px-6 flex gap-0 border-b border-slate-700">
        {PLAYGROUND_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-teal-400 text-teal-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Generated code */}
      <div className="p-6">
        <CodeBlock code={code} language={tab === "javascript" ? "javascript" : tab} />
        <p className="text-[11px] text-slate-600 mt-3 text-center">
          Replace <code className="text-slate-500">{API_BASE}</code> with your production URL when deployed
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Static reference helpers
// ---------------------------------------------------------------------------

const CURL_EXAMPLE = `curl -X POST "${API_BASE}/v1/libraries/{library_id}/query" \\
  -H "Authorization: Bearer sk-your-api-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "What are the key obligations in clause 4?",
    "top_k": 20,
    "top_n": 5
  }'`;

const PYTHON_EXAMPLE = `import requests

API_KEY = "sk-your-api-key-here"
LIBRARY_ID = "your-library-id"
BASE_URL = "${API_BASE}"

response = requests.post(
    f"{BASE_URL}/v1/libraries/{LIBRARY_ID}/query",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "prompt": "What are the key obligations in clause 4?",
        "top_k": 20,   # chunks to retrieve from Qdrant
        "top_n": 5,    # chunks sent to the LLM after reranking
    },
)

data = response.json()
print(data["answer"])
for source in data["sources"]:
    print(f"  [{source['relevance_score']:.0%}] {source['filename']}")`;

const JS_EXAMPLE = `const API_KEY = "sk-your-api-key-here";
const LIBRARY_ID = "your-library-id";
const BASE_URL = "${API_BASE}";

const response = await fetch(
  \`\${BASE_URL}/v1/libraries/\${LIBRARY_ID}/query\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: "What are the key obligations in clause 4?",
      top_k: 20,
      top_n: 5,
    }),
  }
);

const { answer, sources, tokens_used, latency_ms } = await response.json();
console.log(answer);`;

const MULTITURN_PYTHON_EXAMPLE = `import requests

LIBRARY_ID = "your-library-id"
API_KEY    = "sk-your-api-key-here"
BASE_URL   = "${API_BASE}"

# Start a new conversation (no conversation_id on first request)
messages = []
conversation_id = None

def ask(prompt: str) -> str:
    global conversation_id, messages

    payload = {
        "prompt": prompt,
        "top_k": 20,
        "top_n": 5,
        "messages": messages,
    }
    if conversation_id:
        payload["conversation_id"] = conversation_id

    response = requests.post(
        f"{BASE_URL}/v1/libraries/{LIBRARY_ID}/query",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json=payload,
    )
    data = response.json()

    # Store conversation_id and update history for next turn
    conversation_id = data["conversation_id"]
    messages.append({"role": "user",      "content": prompt})
    messages.append({"role": "assistant", "content": data["answer"]})
    return data["answer"]

print(ask("What are the termination clauses?"))
print(ask("How much notice is required?"))  # follows on from above`;

const MULTITURN_JS_EXAMPLE = `let conversationId = null;
let messages = [];

async function ask(prompt) {
  const response = await fetch(
    \`${API_BASE}/v1/libraries/\${LIBRARY_ID}/query\`,
    {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        top_k: 20,
        top_n: 5,
        ...(conversationId && { conversation_id: conversationId }),
        messages, // full history from previous turns
      }),
    }
  );

  const data = await response.json();

  // Persist for next turn
  conversationId = data.conversation_id;
  messages.push({ role: "user",      content: prompt });
  messages.push({ role: "assistant", content: data.answer });

  return data.answer;
}

console.log(await ask("What are the termination clauses?"));
console.log(await ask("How much notice is required?")); // context-aware follow-up`;

const LIST_LIBRARIES_EXAMPLE = `curl "${API_BASE}/v1/libraries" \\
  -H "Authorization: Bearer YOUR_SUPABASE_JWT"`;

function Field({
  name, type, required, desc,
}: {
  name: string; type: string; required?: boolean; desc: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="shrink-0 pt-0.5 flex items-center gap-2 flex-wrap">
        <code className="text-xs font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">{name}</code>
        <span className="text-[10px] text-slate-400 font-mono">{type}</span>
        {required && <span className="text-[10px] font-bold text-red-500 uppercase">required</span>}
      </div>
      <p className="text-xs text-slate-500 leading-relaxed min-w-0">{desc}</p>
    </div>
  );
}

// Inner collapsible for individual static code examples
function CollapsibleCode({
  title, icon: Icon, code, language,
}: {
  title: string; icon: React.ElementType; code: string; language: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#091627]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-teal-400" />
          <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">Example — {title}</h4>
        </div>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        }
      </button>
      {open && (
        <div className="px-6 pb-5">
          <CodeBlock code={code} language={language} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration Guide wrapper
// ---------------------------------------------------------------------------

function IntegrationGuide({
  firstActiveKey,
  onRequestNewKey,
}: {
  firstActiveKey?: string;
  onRequestNewKey: () => void;
}) {
  const [open,    setOpen]    = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  return (
    <div className="mt-10 rounded-xl border border-slate-200" style={{ overflow: "clip" }}>

      {/* ── Outer toggle ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 bg-[#0b1d35] hover:bg-[#0f2540] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-teal-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">Integrate Ultimate Calamari into your app</p>
            <p className="text-xs text-teal-400/80 mt-0.5">Live code generator · REST reference · curl, Python &amp; JS</p>
          </div>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        }
      </button>

      {open && (
        <div>

          {/* ── 1. Playground — always visible and sticky ── */}
          <ApiPlayground firstActiveKey={firstActiveKey} onRequestNewKey={onRequestNewKey} />

          {/* ── 2. Full API Reference accordion — collapsed by default ── */}
          <div className="bg-[#091627]">
            <button
              onClick={() => setRefOpen((o) => !o)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors text-left border-t border-slate-700"
            >
              <div className="flex items-center gap-2.5">
                <Code2 className="w-4 h-4 text-teal-400 shrink-0" />
                <span className="text-sm font-semibold text-white">Full API Reference &amp; Documentation</span>
                <span className="hidden sm:inline text-xs text-slate-500">
                  — endpoint · request body · response · conversations · examples
                </span>
              </div>
              {refOpen
                ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              }
            </button>

            {refOpen && (
              <div className="divide-y divide-slate-700/50">

                {/* Endpoint */}
                <section className="px-6 py-5 bg-white">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Endpoint</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100 shrink-0">POST</span>
                    <code className="text-sm font-mono text-slate-800 break-all">
                      {API_BASE}/v1/libraries/<span className="text-teal-600">{"{library_id}"}</span>/query
                    </code>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                    Authenticate with{" "}
                    <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Authorization: Bearer sk-...</code>{" "}
                    on every request.
                  </p>
                </section>

                {/* Request body */}
                <section className="px-6 py-5 bg-white">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Request Body (JSON)</h3>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <Field name="prompt"          type="string"  required desc="The question or query to answer from the knowledge base's documents." />
                    <Field name="top_k"           type="integer"          desc="Number of chunks to retrieve from the vector database. Default: 20." />
                    <Field name="top_n"           type="integer"          desc="Number of chunks sent to the LLM after reranking. Default: 5. Lower = faster; higher = more context." />
                    <Field name="messages"        type="array"            desc="Prior conversation turns for multi-turn memory. Each item: { role: 'user' | 'assistant', content: string }. Omit or pass [] for a single-turn query." />
                    <Field name="conversation_id" type="uuid"             desc="ID of an existing conversation to append to. Omit to start a new conversation automatically. Returned in every response." />
                  </div>
                </section>

                {/* Response */}
                <section className="px-6 py-5 bg-white">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Response Fields</h3>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <Field name="answer"          type="string"  desc="AI-generated answer grounded strictly in the knowledge base's documents." />
                    <Field name="sources"         type="array"   desc="Source chunks used to generate the answer. Each item: filename, chunk_index, text (excerpt), relevance_score (0–1)." />
                    <Field name="tokens_used"     type="integer" desc="LLM tokens consumed — useful for cost tracking." />
                    <Field name="latency_ms"      type="integer" desc="Total server-side latency in milliseconds." />
                    <Field name="conversation_id" type="uuid"    desc="ID of the conversation this exchange belongs to. Pass it back in subsequent requests to maintain multi-turn memory." />
                  </div>
                </section>

                {/* Conversation endpoints */}
                <section className="px-6 py-5 bg-white">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Conversation Endpoints</h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    Every query automatically creates or appends to a conversation stored server-side. You can list, retrieve, and delete conversations using your Supabase session JWT.
                  </p>
                  <div className="rounded-lg border border-slate-200 overflow-hidden mb-3">
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">GET</span>
                      <code className="text-xs font-mono text-slate-700 flex-1 min-w-0 truncate">/v1/conversations?library_id={"<uuid>"}</code>
                      <span className="text-[11px] text-slate-400 shrink-0">List conversations</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">GET</span>
                      <code className="text-xs font-mono text-slate-700 flex-1 min-w-0 truncate">/v1/conversations/{"<id>"}/messages</code>
                      <span className="text-[11px] text-slate-400 shrink-0">Full history</span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100 shrink-0">DELETE</span>
                      <code className="text-xs font-mono text-slate-700 flex-1 min-w-0 truncate">/v1/conversations/{"<id>"}</code>
                      <span className="text-[11px] text-slate-400 shrink-0">Delete + messages</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Conversation endpoints require your Supabase session JWT (the same token used for the UI), not the{" "}
                    <code className="bg-slate-100 px-1 py-0.5 rounded">sk-</code> API key.
                  </p>
                </section>

                {/* Finding library_id */}
                <section className="px-6 py-5 bg-white">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    <Globe className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    Finding your Knowledge Base ID
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    The easiest way: open the <strong className="text-slate-700">Knowledge Bases</strong> page, click into any knowledge base, and press the{" "}
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500 align-middle">
                      📋 Copy ID
                    </span>{" "}
                    button next to the knowledge base name. The UUID is instantly on your clipboard.
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    Or fetch all knowledge bases via API with your <strong>Supabase session JWT</strong>:
                  </p>
                  <CodeBlock code={LIST_LIBRARIES_EXAMPLE} language="bash" />
                  <p className="text-xs text-slate-400 mt-2">
                    Each object in the response has an <code className="bg-slate-100 px-1 py-0.5 rounded">id</code> field — that is your knowledge base ID (<code className="bg-slate-100 px-1 py-0.5 rounded">library_id</code> in the API).
                  </p>
                </section>

                {/* Static code examples — individually collapsible */}
                <CollapsibleCode title="curl — single query"            icon={Terminal} code={CURL_EXAMPLE}           language="bash"       />
                <CollapsibleCode title="Python — single query"          icon={Code2}    code={PYTHON_EXAMPLE}         language="python"     />
                <CollapsibleCode title="JavaScript / fetch — single"    icon={Code2}    code={JS_EXAMPLE}             language="javascript" />
                <CollapsibleCode title="Python — multi-turn example"    icon={Code2}    code={MULTITURN_PYTHON_EXAMPLE} language="python"   />
                <CollapsibleCode title="JavaScript — multi-turn example" icon={Code2}   code={MULTITURN_JS_EXAMPLE}   language="javascript" />

              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ApiKeys page
// ---------------------------------------------------------------------------

export default function ApiKeys() {
  const [keys,    setKeys]    = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [loaded,  setLoaded]  = useState(false);

  const [showCreate,  setShowCreate]  = useState(false);
  const [newKeyName,  setNewKeyName]  = useState("");
  const [creating,    setCreating]    = useState(false);

  const [revealedKey,     setRevealedKey]     = useState<string | null>(null);
  const [revealedVisible, setRevealedVisible] = useState(false);
  const [copied,          setCopied]          = useState(false);

  const [revokingId,     setRevokingId]     = useState<string | null>(null);
  const [highlightNewKey, setHighlightNewKey] = useState(false);
  const newKeyBtnRef = useRef<HTMLButtonElement>(null);

  const handleRequestNewKey = useCallback(() => {
    newKeyBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightNewKey(true);
    setTimeout(() => setHighlightNewKey(false), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApiKeys();
      setKeys(data);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result: ApiKeyCreateResult = await createApiKey(newKeyName.trim());
      setRevealedKey(result.raw_key);
      setRevealedVisible(true);
      setNewKeyName("");
      setShowCreate(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return;
    setRevokingId(id);
    setError(null);
    try {
      await revokeApiKey(id);
      setKeys((prev) =>
        prev.map((k) => k.id === id ? { ...k, is_active: false, revoked_at: new Date().toISOString() } : k)
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = () => {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return dateStr; }
  };

  const firstActiveKey = revealedKey ?? undefined;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
          <p className="mt-1 text-sm text-slate-500">Manage keys for programmatic access to the query API</p>
        </div>
        <button
          ref={newKeyBtnRef}
          onClick={() => setShowCreate(true)}
          className={`flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm ${
            highlightNewKey ? "ring-4 ring-yellow-400 ring-offset-2 animate-pulse" : ""
          }`}
        >
          <Plus className="w-4 h-4" /> New Key
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Generate API Key</h3>
          <div className="flex gap-3">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. production, staging)"
              autoFocus
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Generate"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewKeyName(""); }}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800 mb-1">🔑 API Key Created</p>
              <p className="text-xs text-emerald-600 mb-3">Copy this key now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2.5">
                <code className="text-sm font-mono text-slate-800 break-all flex-1 min-w-0">
                  {revealedVisible ? revealedKey : revealedKey.slice(0, 8) + "••••••••••••••••••••"}
                </code>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setRevealedVisible(!revealedVisible)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                    title={revealedVisible ? "Hide" : "Show"}
                  >
                    {revealedVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {copied && <p className="text-xs text-emerald-600 mt-1.5">Copied to clipboard!</p>}
            </div>
            <button
              onClick={() => { setRevealedKey(null); setRevealedVisible(false); }}
              className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
            >
              <AlertCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Key list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-slate-800">Keys</h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && !loaded && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {loaded && keys.length === 0 && (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Key className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">No API keys generated yet</p>
          <p className="text-xs text-slate-400 mt-1">Create a key to start querying programmatically</p>
        </div>
      )}

      {keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className={`flex items-center justify-between rounded-lg border bg-white px-4 py-3 transition-colors ${
                !key.is_active ? "border-slate-100 opacity-60" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${!key.is_active ? "bg-slate-100" : "bg-blue-50"}`}>
                  <Key className={`w-4 h-4 ${!key.is_active ? "text-slate-400" : "text-blue-500"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${!key.is_active ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {key.name}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {key.last_used_at ? `Last used ${formatDate(key.last_used_at)}` : "Never used"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {!key.is_active ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Revoked
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-slate-400">{formatDate(key.created_at)}</span>
                    <button
                      onClick={() => handleRevoke(key.id, key.name)}
                      disabled={revokingId === key.id}
                      className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                    >
                      {revokingId === key.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ShieldOff className="w-3.5 h-3.5" />
                      }
                      Revoke
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Integration Guide */}
      <IntegrationGuide firstActiveKey={firstActiveKey} onRequestNewKey={handleRequestNewKey} />
    </div>
  );
}
