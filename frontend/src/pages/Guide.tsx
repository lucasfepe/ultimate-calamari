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
    title: "Upload your documents",
    page: "documents",
    body: "Upload PDF, Word (.docx), or plain text files. Each document is indexed automatically at the paragraph level. No configuration, training data, or technical setup is required.",
    tip: "Examples: policy documents, legislation, directives, briefing notes, meeting transcripts.",
  },
  {
    icon: FolderOpen,
    number: "02",
    title: "Organise into knowledge bases",
    page: "libraries",
    body: "Group related documents into focused knowledge bases — for example, one for departmental policy, another for regulatory guidance, another for program documentation. A single document can belong to multiple knowledge bases without being re-processed.",
    tip: "Keep knowledge bases tightly scoped. Smaller, focused collections produce more precise answers.",
  },
  {
    icon: FolderPlus,
    number: "03",
    title: "Add documents to your knowledge base",
    page: "libraries",
    body: "Open any knowledge base and add the documents you want included in search. Documents can be shared across multiple knowledge bases when they span several subject areas. Once added, they are immediately available for querying.",
    tip: "Use the 'Chat with this knowledge base' shortcut inside any knowledge base to open Chat with it pre-selected.",
  },
  {
    icon: MessageSquare,
    number: "04",
    title: "Ask questions and receive cited answers",
    page: "chat",
    body: "Go to Chat, select your knowledge base, and ask questions in plain language. Archivio searches every document for the most relevant passages and returns answers with clear references to the source files.",
    tip: 'Try: "What are the reporting requirements under this directive?" or "Summarise the key compliance obligations identified in the audit."',
  },
];

const audienceCards = [
  {
    title: "Federal Departments",
    body: "Give policy analysts and program officers instant access to departmental archives, directives, and internal guidance — with every answer traced to its source document.",
  },
  {
    title: "Regulatory Bodies",
    body: "Search regulations, standards, and compliance documentation across large corpora. Staff receive accurate, citation-backed responses grounded in authoritative materials.",
  },
  {
    title: "Crown Corporations",
    body: "Make operational manuals, board materials, and corporate policies searchable for employees — reducing time spent locating information across distributed document libraries.",
  },
];

export default function Guide() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-goc-text">How It Works</h1>
        <p className="mt-2 text-base text-slate-500 leading-relaxed max-w-xl">
          Upload your documents, organise them into knowledge bases, and ask questions.
          Receive precise, cited answers drawn exclusively from your files.
        </p>
      </div>

      <div className="space-y-4 mb-12">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.number}
              onClick={() => window.open(`${window.location.origin}/#${step.page}`, "_blank")}
              className="w-full text-left rounded-lg border border-slate-200 bg-white p-6 cursor-pointer hover:border-goc-blue-border hover:shadow-sm transition-all duration-150 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-goc-blue-light flex items-center justify-center shrink-0 group-hover:bg-goc-blue-muted transition-colors">
                  <Icon className="w-5 h-5 text-goc-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold text-goc-blue-accent tracking-widest uppercase">
                      Step {step.number}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-goc-blue group-hover:translate-x-0.5 transition-all duration-150" />
                  </div>
                  <h2 className="text-base font-semibold text-goc-text mb-2 group-hover:text-goc-blue transition-colors">{step.title}</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.body}</p>
                  {step.tip && (
                    <p className="mt-3 text-xs text-slate-400 border-l-2 border-slate-200 pl-3">
                      {step.tip}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mb-12">
        <h2 className="text-lg font-semibold text-goc-text mb-4">Built for government and public sector</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {audienceCards.map((card) => (
            <div key={card.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-goc-text mb-2">{card.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-goc-grey p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-goc-text mb-1">For developers and integrations</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              API Keys allow your technical team to query any knowledge base programmatically — embed
              document intelligence directly into case management systems, intranet portals, or custom
              applications via a REST API.
            </p>
            <button
              onClick={() => navigate("apikeys")}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-goc-blue hover:text-goc-blue-hover transition-colors"
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
