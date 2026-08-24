import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, ArrowLeft, Loader2, Download, Send, AlertTriangle, FileText } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  splitQuestionPaper,
  questionPaperFileName,
  SplitQuestion,
  SplitProgress,
} from "@/lib/splitQuestionPaper";
import { DocTypeToggle, DocType } from "@/components/DocTypeToggle";

type Step = "idle" | "working" | "review";

interface Props {
  onBack: () => void;
  onSendToQueue: (files: File[]) => void;
  docType: DocType;
  onDocTypeChange: (v: DocType) => void;
}

interface ReviewItem extends SplitQuestion {
  previewUrl: string;
}

export function QuestionPaperSplitter({ onBack, onSendToQueue, docType, onDocTypeChange }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [baseName, setBaseName] = useState("");
  const [progress, setProgress] = useState<SplitProgress | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => { items.forEach((i) => URL.revokeObjectURL(i.previewUrl)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async () => {
    if (!pendingFile) return;
    setStep("working");
    setError("");
    setProgress(null);
    try {
      const questions = await splitQuestionPaper(pendingFile, setProgress);
      if (!questions.length) {
        setError("No questions were found in this PDF.");
        setStep("idle");
        return;
      }
      setItems(questions.map((q) => ({ ...q, previewUrl: URL.createObjectURL(q.blob) })));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Splitting failed");
      setStep("idle");
    }
  }, [pendingFile]);

  const reset = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setPendingFile(null);
    setBaseName("");
    setStep("idle");
    setError("");
    setProgress(null);
  };

  const download = async () => {
    if (items.length === 1) {
      saveAs(items[0].blob, questionPaperFileName(baseName, items[0].n));
      return;
    }
    const zip = new JSZip();
    const folder = zip.folder(baseName || "question-paper");
    items.forEach((i) => folder?.file(questionPaperFileName(baseName, i.n), i.blob));
    const out = await zip.generateAsync({ type: "blob" });
    saveAs(out, `${baseName || "question-paper"}_questions.zip`);
  };

  const sendToQueue = () => {
    onSendToQueue(
      items.map((i) => new File([i.blob], questionPaperFileName(baseName, i.n), { type: "image/png" })),
    );
  };

  const onFile = (f: File) => {
    setError("");
    setPendingFile(f);
    setBaseName(f.name.replace(/\.pdf$/i, ""));
  };

  const totalMarks = items.reduce((a, i) => a + (i.marks ?? 0), 0);
  const flagged = items.filter((i) => i.warnings.length > 0).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div
        className="border-b px-6 py-3 flex items-center gap-3 shrink-0"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <button onClick={onBack} className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2">
          <ArrowLeft size={13} /> Back
        </button>
        <div className="flex items-center gap-2">
          <FileText size={15} style={{ color: "hsl(var(--primary))" }} />
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Question Paper Splitter
          </h2>
          {baseName && <span className="label-mono">· {baseName}.pdf</span>}
        </div>
        <div className="flex-1" />
        {step === "review" && (
          <>
            <button onClick={sendToQueue} className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2">
              <Send size={13} /> Send to queue
            </button>
            <button onClick={download} className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2">
              <Download size={13} /> Download ({items.length})
            </button>
            <button onClick={reset} className="btn-secondary px-3 py-1.5 text-sm">Start over</button>
          </>
        )}
      </div>

      {error && (
        <div
          className="px-6 py-2 text-xs"
          style={{ background: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--destructive))" }}
        >
          {error}
        </div>
      )}

      {step === "idle" && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xl w-full flex flex-col items-center gap-5 text-center">
            <DocTypeToggle value={docType} onChange={onDocTypeChange} />
            <h3 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Upload a Cambridge question paper PDF
            </h3>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              Questions are located by reading the PDF's own text layer, so the split is exact and
              repeatable — no AI, no credits, and questions spanning a page break are joined
              automatically.
            </p>
            <div
              className="drop-zone w-full rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer p-8"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              <Upload size={20} style={{ color: "hsl(var(--muted-foreground))" }} />
              <p className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
                {pendingFile ? pendingFile.name : "Drop a PDF or click to browse"}
              </p>
              <p className="label-mono">PDF with a text layer · scanned papers need the manual tools</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            {pendingFile && (
              <button onClick={run} className="btn-primary px-5 py-2 text-sm flex items-center gap-2">
                <FileText size={14} /> Split into questions
              </button>
            )}
          </div>
        </div>
      )}

      {step === "working" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin" style={{ color: "hsl(var(--primary))" }} />
            <p className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
              {progress?.phase === "building"
                ? `Building question images… ${progress.done} / ${progress.total}`
                : `Reading pages… ${progress?.done ?? 0} / ${progress?.total ?? 0}`}
            </p>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="flex-1 overflow-auto p-6 flex flex-col gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <p className="label-mono">
              {items.length} question{items.length !== 1 ? "s" : ""}
              {totalMarks > 0 && ` · ${totalMarks} marks total`}
            </p>
            {flagged > 0 && (
              <span
                className="px-2 py-1 rounded text-xs flex items-center gap-1.5"
                style={{ background: "hsl(40 90% 55% / 0.15)", color: "hsl(40 90% 45%)" }}
              >
                <AlertTriangle size={11} /> {flagged} flagged for review
              </span>
            )}
            <div className="flex-1" />
            <label className="flex items-center gap-2 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              File name base
              <input
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                className="px-2 py-1 rounded text-xs"
                style={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                }}
              />
            </label>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {items.map((q) => (
              <div
                key={q.n}
                className="rounded-lg overflow-hidden flex flex-col"
                style={{
                  background: "hsl(var(--card))",
                  border: `1px solid ${q.warnings.length ? "hsl(40 90% 55%)" : "hsl(var(--border))"}`,
                }}
              >
                <div className="overflow-auto" style={{ maxHeight: 340, background: "#fff" }}>
                  <img src={q.previewUrl} alt={`Question ${q.n}`} className="w-full h-auto block" />
                </div>
                <div className="px-3 py-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                      Question {q.n}
                    </span>
                    <span className="label-mono">
                      {q.marks !== null ? `${q.marks} marks` : "—"}
                    </span>
                  </div>
                  <span className="label-mono">{q.width}×{q.height}px</span>
                  {q.warnings.map((w, i) => (
                    <span key={i} className="text-xs flex items-start gap-1.5" style={{ color: "hsl(40 90% 45%)" }}>
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
