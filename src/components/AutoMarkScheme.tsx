import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Sparkles, ArrowLeft, Loader2, Download, Send, Trash2, RefreshCw, X, Check } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { pdfToImages } from "@/lib/pdfToImages";
import {
  detectAllPages,
  detectPage,
  groupIntoQuestions,
  buildQuestionImage,
  questionFileName,
  PageDetection,
  QuestionGroup,
  DetectedRegion,
} from "@/lib/autoMarkScheme";

type Step = "idle" | "rendering" | "selecting" | "detecting" | "review" | "exporting";

interface Props {
  onBack: () => void;
  onSendToQueue: (files: File[]) => void;
}

export function AutoMarkScheme({ onBack, onSendToQueue }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [pdfName, setPdfName] = useState<string>("");
  const [pages, setPages] = useState<{ blob: Blob; name: string }[]>([]);
  const [renderProgress, setRenderProgress] = useState({ done: 0, total: 0 });
  const [detectProgress, setDetectProgress] = useState({ done: 0, total: 0 });
  const [detections, setDetections] = useState<PageDetection[]>([]);
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [pagePreviewUrl, setPagePreviewUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [excludedPages, setExcludedPages] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // Build a preview URL for the selected page
  useEffect(() => {
    if (!detections.length) return;
    const page = detections[selectedPageIdx];
    if (!page) return;
    const url = URL.createObjectURL(page.pageBlob);
    setPagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [detections, selectedPageIdx]);

  const onFile = (file: File) => {
    setError("");
    setPendingFile(file);
    setPdfName(file.name.replace(/\.pdf$/i, ""));
  };

  const startProcessing = async () => {
    if (!pendingFile) return;
    setStep("rendering");
    setError("");
    try {
      const rendered = await pdfToImages(pendingFile, 4, (done, total) => {
        setRenderProgress({ done, total });
      });
      setPages(rendered);
      // Build preview URLs for page selection
      const urls = rendered.map((p) => URL.createObjectURL(p.blob));
      setPagePreviews(urls);
      setExcludedPages(new Set());
      setStep("selecting");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Processing failed");
      setStep("idle");
    }
  };

  const runDetection = async () => {
    const kept = pages
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => !excludedPages.has(i));
    if (!kept.length) {
      setError("Select at least one page to keep");
      return;
    }
    setStep("detecting");
    setError("");
    setDetectProgress({ done: 0, total: kept.length });
    try {
      const det = await detectAllPages(kept.map(({ p }) => p.blob), (done, total) => {
        setDetectProgress({ done, total });
      });
      setDetections(det);
      setGroups(groupIntoQuestions(det));
      setStep("review");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Detection failed");
      setStep("selecting");
    }
  };

  const togglePageExcluded = (idx: number) => {
    setExcludedPages((s) => {
      const next = new Set(s);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const reDetectPage = async (pageIdx: number) => {
    const page = detections[pageIdx];
    if (!page) return;
    try {
      const regions = await detectPage(page.pageBlob, pageIdx, detections.length);
      const next = detections.map((p, i) => i === pageIdx ? { ...p, regions } : p);
      setDetections(next);
      setGroups(groupIntoQuestions(next));
    } catch (e: any) {
      setError(e?.message || "Re-detect failed");
    }
  };

  const removeGroup = (id: string) => {
    setGroups((g) => g.filter((x) => x.id !== id));
  };

  const renameGroup = (id: string, label: string) => {
    setGroups((g) => g.map((x) => x.id === id ? { ...x, label } : x));
  };

  const exportAll = async (sendToQueue: boolean) => {
    if (!groups.length) return;
    setStep("exporting");
    try {
      const blobs: { name: string; blob: Blob }[] = [];
      for (let i = 0; i < groups.length; i++) {
        const blob = await buildQuestionImage(groups[i], detections);
        blobs.push({ name: questionFileName(groups[i].label, i), blob });
      }

      if (sendToQueue) {
        const files = blobs.map(({ name, blob }) => new File([blob], name, { type: "image/png" }));
        onSendToQueue(files);
      } else {
        const zip = new JSZip();
        const folder = zip.folder("mark-scheme-questions");
        blobs.forEach(({ name, blob }) => folder?.file(name, blob));
        const out = await zip.generateAsync({ type: "blob" });
        saveAs(out, `${pdfName || "mark-scheme"}_questions.zip`);
      }
      setStep("review");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Export failed");
      setStep("review");
    }
  };

  const reset = () => {
    pagePreviews.forEach((u) => URL.revokeObjectURL(u));
    setPagePreviews([]);
    setExcludedPages(new Set());
    setPendingFile(null);
    setPages([]);
    setDetections([]);
    setGroups([]);
    setStep("idle");
    setError("");
    setPdfName("");
    setRenderProgress({ done: 0, total: 0 });
    setDetectProgress({ done: 0, total: 0 });
  };

  const currentPageDet = detections[selectedPageIdx];

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
          <Sparkles size={15} style={{ color: "hsl(var(--primary))" }} />
          <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
            Auto Mark Scheme (AI)
          </h2>
          {pdfName && (
            <span className="label-mono">· {pdfName}.pdf</span>
          )}
        </div>
        <div className="flex-1" />
        {step === "review" && groups.length > 0 && (
          <>
            <button
              onClick={() => exportAll(true)}
              className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2"
            >
              <Send size={13} /> Send to queue
            </button>
            <button
              onClick={() => exportAll(false)}
              className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
            >
              <Download size={13} /> Download zip ({groups.length})
            </button>
          </>
        )}
        {(step === "review" || step === "exporting") && (
          <button onClick={reset} className="btn-secondary px-3 py-1.5 text-sm">Start over</button>
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

      {/* Body */}
      {step === "idle" && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xl w-full flex flex-col items-center gap-5 text-center">
            <h3 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Upload a Cambridge mark scheme PDF
            </h3>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              The app will render every page, ask Gemini to locate each question's region (including
              questions that span across pages), and stitch them into one image per question.
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
              <p className="label-mono">PDF only</p>
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
              <button onClick={startProcessing} className="btn-primary px-5 py-2 text-sm flex items-center gap-2">
                <Sparkles size={14} /> Process with AI
              </button>
            )}
            <p className="label-mono" style={{ color: "hsl(var(--muted-foreground))" }}>
              Each page costs ~1 AI call (Gemini 2.5 Pro). Larger PDFs use more credits.
            </p>
          </div>
        </div>
      )}

      {(step === "rendering" || step === "detecting" || step === "exporting") && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin" style={{ color: "hsl(var(--primary))" }} />
            <p className="text-sm" style={{ color: "hsl(var(--foreground))" }}>
              {step === "rendering" && `Rendering pages… ${renderProgress.done} / ${renderProgress.total}`}
              {step === "detecting" && `Detecting questions with AI… ${detectProgress.done} / ${detectProgress.total}`}
              {step === "exporting" && "Cropping & stitching…"}
            </p>
          </div>
        </div>
      )}

      {step === "review" && currentPageDet && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: page list */}
          <aside
            className="w-44 shrink-0 border-r overflow-y-auto p-2 flex flex-col gap-1"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
          >
            <p className="label-mono px-2 py-1">Pages</p>
            {detections.map((p, i) => (
              <button
                key={i}
                onClick={() => setSelectedPageIdx(i)}
                className="text-left px-2 py-1.5 rounded text-xs flex items-center justify-between"
                style={{
                  background: i === selectedPageIdx ? "hsl(var(--primary) / 0.15)" : "transparent",
                  color: i === selectedPageIdx ? "hsl(var(--primary))" : "hsl(var(--foreground))",
                  border: "1px solid " + (i === selectedPageIdx ? "hsl(var(--primary) / 0.4)" : "transparent"),
                }}
              >
                <span>Page {i + 1}</span>
                <span className="label-mono">{p.regions.length}</span>
              </button>
            ))}
          </aside>

          {/* Middle: page with overlay */}
          <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
            <PageWithBoxes
              imageUrl={pagePreviewUrl}
              regions={currentPageDet.regions}
              onReDetect={() => reDetectPage(selectedPageIdx)}
              pageNum={selectedPageIdx + 1}
            />
          </div>

          {/* Right: detected questions list */}
          <aside
            className="w-72 shrink-0 border-l overflow-y-auto p-3 flex flex-col gap-2"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
          >
            <p className="label-mono">{groups.length} question{groups.length !== 1 ? "s" : ""} detected</p>
            {groups.map((g, i) => {
              const spans = g.pieces.length > 1;
              return (
                <div
                  key={g.id}
                  className="rounded p-2 text-xs flex flex-col gap-1.5"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={g.label}
                      onChange={(e) => renameGroup(g.id, e.target.value)}
                      className="flex-1 px-2 py-1 rounded text-xs"
                      style={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <button
                      onClick={() => removeGroup(g.id)}
                      className="opacity-60 hover:opacity-100"
                      style={{ color: "hsl(var(--destructive))" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between label-mono">
                    <span>{g.pieces.length} piece{g.pieces.length !== 1 ? "s" : ""}</span>
                    {spans && <span style={{ color: "hsl(var(--primary))" }}>spans pages</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.pieces.map((p, j) => (
                      <button
                        key={j}
                        onClick={() => setSelectedPageIdx(p.pageIndex)}
                        className="px-1.5 py-0.5 rounded label-mono"
                        style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
                      >
                        p{p.pageIndex + 1}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {groups.length === 0 && (
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                No questions detected. Try re-running detection on a page.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function PageWithBoxes({
  imageUrl, regions, onReDetect, pageNum,
}: {
  imageUrl: string;
  regions: DetectedRegion[];
  onReDetect: () => void;
  pageNum: number;
}) {
  return (
    <div className="flex flex-col gap-2 max-w-full">
      <div className="flex items-center justify-between">
        <p className="label-mono">Page {pageNum} · {regions.length} region{regions.length !== 1 ? "s" : ""}</p>
        <button
          onClick={onReDetect}
          className="btn-secondary px-2 py-1 text-xs flex items-center gap-1.5"
        >
          <RefreshCw size={11} /> Re-detect
        </button>
      </div>
      <div className="relative inline-block" style={{ maxWidth: "100%" }}>
        {imageUrl && (
          <img src={imageUrl} alt="page" className="block max-w-full h-auto" />
        )}
        {regions.map((r, i) => {
          const lowConf = r.confidence < 0.6;
          const color = lowConf ? "hsl(40 90% 55%)" : "hsl(120 70% 55%)";
          return (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left: `${r.bbox.x * 100}%`,
                top: `${r.bbox.y * 100}%`,
                width: `${r.bbox.w * 100}%`,
                height: `${r.bbox.h * 100}%`,
                border: `2px solid ${color}`,
                background: `${color.replace(")", " / 0.08)")}`,
              }}
            >
              <span
                className="absolute top-0 left-0 px-1.5 py-0.5 text-xs font-semibold"
                style={{ background: color, color: "hsl(var(--background))" }}
              >
                {r.label || "?"}
                {r.isContinuationFromPrev && " ↑"}
                {r.continuesOnNext && " ↓"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
