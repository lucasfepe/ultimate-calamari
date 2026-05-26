import { Upload, FolderOpen, FolderPlus, MessageSquare, Key, ChevronRight } from "lucide-react";
import { useNavigate } from "../lib/navigation";

type StepPage = "documents" | "libraries" | "chat";

interface Step {
  icon: typeof Upload;
  number: string;
  title: string;
  body: string;
  page: StepPage;
  tip?: string;
}

const steps: Step[] = [
  {
    icon: Upload,
    number: "01",
    title: "Dive in — upload your documents",
    page: "documents",
    body: "Drop in any PDF, Word (.docx), or plain text file. We index every paragraph automatically — think of it as charting the ocean floor before you dive. No configuration, no training data, no technical setup needed.",
    tip: "Examples: contracts, policy documents, research papers, meeting transcripts, legislation.",
  },
  {
    icon: FolderOpen,
    number: "02",
    title: "Chart your waters — organise into knowledge bases",
    page: "libraries",
    body: "Group related documents into a Knowledge Base — a focused, purposeful collection. You might have one knowledge base for 'Employment Contracts', another for 'Q4 Financial Reports', another for 'Planning Policy'. A document can sail into more than one knowledge base without being re-processed.",
    tip: "Tip: keep knowledge bases tightly scoped. Smaller, focused knowledge bases surface more precise answers.",
  },
  {
    icon: FolderPlus,
    number: "03",
    title: "Stock your waters — add documents to your knowledge base",
    page: "libraries",
    body: "A knowledge base without documents is an empty net. Click into any knowledge base and add the documents you want it to search. You can add the same document to multiple knowledge bases — perfect for documents that span several topics. Once documents are added, they're ready to dive into instantly.",
    tip: "Tip: click the 'Chat with this knowledge base' shortcut inside any knowledge base to jump straight to Chat with it pre-selected.",
  },
  {
    icon: MessageSquare,
    number: "04",
    title: "Cast your question — surface the answer",
    page: "chat",
    body: "Head to the Chat page, select your knowledge base, and ask in plain language — exactly as you'd ask a colleague. We'll trawl every document for the most relevant passages and bring them to the surface, with clear references to the exact file they came from.",
    tip: 'Try: "What are the termination conditions in the supplier agreement?" or "Summarise the key risks identified in the audit."',
  },
];

const audienceCards = [
  {
    title: "Law firms & legal teams",
    body: "Quickly surface relevant clauses across hundreds of contracts. Ask about obligations, deadlines, or jurisdiction-specific terms without manually trawling every file.",
  },
  {
    title: "Government & public sector",
    body: "Make policy archives, legislation, and internal guidance instantly searchable. Give staff accurate answers drawn from authoritative sources — not general knowledge.",
  },
  {
    title: "Researchers & academics",
        body: "Build a searchable knowledge base from papers, datasets, and reports. Cast cross-cutting questions and trace every answer back to the original source.",
  },
];

export default function Guide() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-slate-900">How It Works</h1>
        <p className="mt-2 text-base text-slate-500 leading-relaxed max-w-xl">
          Drop in your documents, organise them into knowledge bases, and cast your questions.
          We'll surface precise answers — drawn from your files and nowhere else.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-12">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.number}
              onClick={() => window.open(`${window.location.origin}/#${step.page}`, "_blank")}
              className="w-full text-left rounded-xl border border-slate-200 bg-white p-6 shadow-sm cursor-pointer hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-blue-400 tracking-widest uppercase">
                      Step {step.number}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all duration-150" />
                  </div>
                  <h2 className="text-base font-semibold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">{step.title}</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
                  {step.tip && (
                    <p className="mt-3 text-xs text-slate-400 italic border-l-2 border-slate-200 pl-3">
                      {step.tip}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Who it's for */}
      <div className="mb-12">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Built for knowledge-intensive work</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {audienceCards.map((card) => (
            <div key={card.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">{card.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys callout */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
            <Key className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-1">For developers &amp; integrations</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              API Keys let your technical team query any knowledge base programmatically — embed the chat
              capability directly into your case management system, intranet portal, or custom
              application via a simple REST API call.
            </p>
            <button
              onClick={() => navigate("apikeys")}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Generate a key on the API Keys page
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
