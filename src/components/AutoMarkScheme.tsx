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
  DocType,
} from "@/lib/autoMarkScheme";
import { useZoom } from "@/hooks/useZoom";
import { ZoomControls } from "@/components/ZoomControls";
import { PixelGridOverlay, GridToggle } from "@/components/PixelGrid";

type Step = "idle" | "rendering" | "selecting" | "detecting" | "review" | "exporting";

interface Props {
  onBack: () => void;
  onSendToQueue: (files: File[]) => void;
}

export function AutoMarkScheme({ onBack, onSendToQueue }: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [docType, setDocType] = useState<DocType>("markscheme");
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
      }, docType);
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
      const regions = await detectPage(page.pageBlob, pageIdx, detections.length, docType);
      const next = detections.map((p, i) => i === pageIdx ? { ...p, regions } : p);
      setDetections(next);
      setGroups(groupIntoQuestions(next));
    } catch (e: any) {
      setError(e?.message || "Re-detect failed");
    }
  };

  // Update only the vertical (y/h) of a single region. Horizontal edges are
  // linked globally and updated via setAllLeft/setAllRight/shiftAllHorizontal.
  const updateRegionVertical = (pageIdx: number, regionIdx: number, y: number, h: number) => {
    setDetections((prev) => {
      const next = prev.map((p, i) => {
        if (i !== pageIdx) return p;
        const regions = p.regions.map((r, j) =>
          j === regionIdx ? { ...r, bbox: { ...r.bbox, y, h }, manual: true } : r,
        );
        return { ...p, regions };
      });
      setGroups(groupIntoQuestions(next));
      return next;
    });
  };

  // Set the left edge of every region on every page to the same normalized x.
  const setAllLeft = (xN: number) => {
    setDetections((prev) => {
      const next = prev.map((p) => ({
        ...p,
        regions: p.regions.map((r) => {
          const right = r.bbox.x + r.bbox.w;
          const newX = Math.max(0, Math.min(right - 0.005, xN));
          return { ...r, bbox: { ...r.bbox, x: newX, w: right - newX }, manual: true };
        }),
      }));
      setGroups(groupIntoQuestions(next));
      return next;
    });
  };

  // Set the right edge of every region on every page to the same normalized x.
  const setAllRight = (xN: number) => {
    setDetections((prev) => {
      const next = prev.map((p) => ({
        ...p,
        regions: p.regions.map((r) => {
          const left = r.bbox.x;
          const newRight = Math.max(left + 0.005, Math.min(1, xN));
          return { ...r, bbox: { ...r.bbox, w: newRight - left }, manual: true };
        }),
      }));
      setGroups(groupIntoQuestions(next));
      return next;
    });
  };

  // Shift every region horizontally by dxN (preserves widths). Used by "move".
  const shiftAllHorizontal = (dxN: number) => {
    setDetections((prev) => {
      const next = prev.map((p) => ({
        ...p,
        regions: p.regions.map((r) => {
          const newX = Math.max(0, Math.min(1 - r.bbox.w, r.bbox.x + dxN));
          return { ...r, bbox: { ...r.bbox, x: newX }, manual: true };
        }),
      }));
      setGroups(groupIntoQuestions(next));
      return next;
    });
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
        const blob = await buildQuestionImage(groups[i], detections, 0, docType);
        blobs.push({ name: questionFileName(groups[i].label, i, docType), blob });
      }

      if (sendToQueue) {
        const files = blobs.map(({ name, blob }) => new File([blob], name, { type: "image/png" }));
        onSendToQueue(files);
      } else {
        const zip = new JSZip();
        const folder = zip.folder(docType === "questionpaper" ? "question-paper-questions" : "mark-scheme-questions");
        blobs.forEach(({ name, blob }) => folder?.file(name, blob));
        const out = await zip.generateAsync({ type: "blob" });
        const base = pdfName || (docType === "questionpaper" ? "question-paper" : "mark-scheme");
        saveAs(out, `${base}_questions.zip`);
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
            {docType === "questionpaper" ? "Auto Question Paper (AI)" : "Auto Mark Scheme (AI)"}
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
        {(step === "selecting" || step === "review" || step === "exporting") && (
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
            {/* Doc-type toggle */}
            <div
              className="inline-flex rounded-lg p-1"
              style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
            >
              {([
                { key: "markscheme", label: "Mark Scheme" },
                { key: "questionpaper", label: "Question Paper" },
              ] as { key: DocType; label: string }[]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setDocType(opt.key)}
                  className="px-4 py-1.5 text-sm rounded-md transition-colors"
                  style={{
                    background: docType === opt.key ? "hsl(var(--primary))" : "transparent",
                    color: docType === opt.key ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    fontWeight: docType === opt.key ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <h3 className="text-xl font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              {docType === "questionpaper"
                ? "Upload a Cambridge question paper PDF"
                : "Upload a Cambridge mark scheme PDF"}
            </h3>
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              {docType === "questionpaper"
                ? "The app will render every page, ask Gemini to locate each numbered question (including questions that span across pages), and stitch them into one image per question."
                : "The app will render every page, ask Gemini to locate each question's region (including questions that span across pages), and stitch them into one image per question."}
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

      {step === "selecting" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="px-6 py-3 border-b flex items-center gap-3 shrink-0"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
          >
            <div className="flex flex-col">
              <p className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                Select pages to process
              </p>
              <p className="label-mono">
                Click a page to exclude it. {pages.length - excludedPages.size} of {pages.length} kept · ~{pages.length - excludedPages.size} AI calls
              </p>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setExcludedPages(new Set())}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Keep all
            </button>
            <button
              onClick={() => setExcludedPages(new Set(pages.map((_, i) => i)))}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Exclude all
            </button>
            <button
              onClick={runDetection}
              disabled={pages.length - excludedPages.size === 0}
              className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles size={13} /> Detect ({pages.length - excludedPages.size})
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {pages.map((p, i) => {
                const excluded = excludedPages.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => togglePageExcluded(i)}
                    className="relative rounded overflow-hidden flex flex-col group"
                    style={{
                      border: "2px solid " + (excluded ? "hsl(var(--destructive))" : "hsl(var(--primary))"),
                      background: "hsl(var(--card))",
                      opacity: excluded ? 0.45 : 1,
                    }}
                  >
                    <img src={pagePreviews[i]} alt={`Page ${i + 1}`} className="w-full h-auto block" />
                    <div
                      className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{
                        background: excluded ? "hsl(var(--destructive))" : "hsl(var(--primary))",
                        color: "hsl(var(--background))",
                      }}
                    >
                      {excluded ? <X size={12} /> : <Check size={12} />}
                    </div>
                    <div
                      className="px-2 py-1 text-xs flex items-center justify-between"
                      style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
                    >
                      <span>Page {i + 1}</span>
                      <span className="label-mono">{excluded ? "skip" : "keep"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
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
              onRegionVerticalChange={(idx, y, h) => updateRegionVertical(selectedPageIdx, idx, y, h)}
              onSetAllLeft={setAllLeft}
              onSetAllRight={setAllRight}
              onShiftAllHorizontal={shiftAllHorizontal}
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
  onRegionVerticalChange, onSetAllLeft, onSetAllRight, onShiftAllHorizontal,
}: {
  imageUrl: string;
  regions: DetectedRegion[];
  onReDetect: () => void;
  pageNum: number;
  onRegionVerticalChange: (idx: number, y: number, h: number) => void;
  onSetAllLeft: (xN: number) => void;
  onSetAllRight: (xN: number) => void;
  onShiftAllHorizontal: (dxN: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const { zoom, setScale, reset, zoomIn, zoomOut, onPanMouseDown, MIN_SCALE, MAX_SCALE } = useZoom(containerRef);
  const [showGrid, setShowGrid] = useState(true);
  const [imgDims, setImgDims] = useState({ dW: 0, dH: 0, nW: 0, nH: 0 });

  // Track natural & rendered size for pixel grid
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const measure = () => {
      setImgDims({
        dW: img.clientWidth,
        dH: img.clientHeight,
        nW: img.naturalWidth,
        nH: img.naturalHeight,
      });
    };
    if (img.complete) measure();
    img.addEventListener("load", measure);
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    return () => { img.removeEventListener("load", measure); ro.disconnect(); };
  }, [imageUrl]);

  const beginDrag = (
    e: React.MouseEvent,
    idx: number,
    region: DetectedRegion,
    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    // The rect is already transformed by zoom, so screen deltas map back to the
    // image by dividing by the scaled rect. This gives much finer motion when zoomed in.
    const dragW = Math.max(1, rect.width);
    const dragH = Math.max(1, rect.height);
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...region.bbox };
    const startLeft = start.x;
    const startRight = start.x + start.w;
    const startBottom = start.y + start.h;
    // Snap to natural image pixels only when Shift is held; otherwise allow
    // sub-pixel placement so the border can land exactly on a feature even
    // when the source image's pixel grid doesn't align with it.
    const snapX = (n: number, snap: boolean) =>
      snap && imgDims.nW > 0 ? Math.round(n * imgDims.nW) / imgDims.nW : n;
    const snapY = (n: number, snap: boolean) =>
      snap && imgDims.nH > 0 ? Math.round(n * imgDims.nH) / imgDims.nH : n;

    let lastDx = 0;
    const onMove = (ev: MouseEvent) => {
      const dxN = (ev.clientX - startX) / dragW;
      const dyN = (ev.clientY - startY) / dragH;
      const snap = ev.shiftKey;

      if (mode === "move") {
        const nextDx = snapX(dxN, snap);
        onShiftAllHorizontal(nextDx - lastDx);
        lastDx = nextDx;
        let y = snapY(start.y + dyN, snap);
        const h = start.h;
        y = Math.max(0, Math.min(1 - h, y));
        onRegionVerticalChange(idx, y, h);
        return;
      }
      if (mode === "w" || mode === "nw" || mode === "sw") {
        onSetAllLeft(snapX(startLeft + dxN, snap));
      }
      if (mode === "e" || mode === "ne" || mode === "se") {
        onSetAllRight(snapX(startRight + dxN, snap));
      }
      let y = start.y;
      let h = start.h;
      if (mode.includes("n")) { y = snapY(start.y + dyN, snap); h = startBottom - y; }
      if (mode.includes("s")) { h = snapY(startBottom + dyN, snap) - start.y; }
      if (h < 0.005) h = 0.005;
      y = Math.max(0, Math.min(1 - h, y));
      h = Math.min(1 - y, h);
      if (mode !== "e" && mode !== "w") {
        onRegionVerticalChange(idx, y, h);
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Handle size in screen px stays constant regardless of zoom
  const handlePx = 10 / (zoom.scale || 1);
  const handleBase: React.CSSProperties = {
    position: "absolute",
    background: "hsl(var(--primary))",
    border: `${1 / (zoom.scale || 1)}px solid hsl(var(--background))`,
    width: handlePx,
    height: handlePx,
    zIndex: 2,
    pointerEvents: "auto",
  };
  const borderPx = 1 / (zoom.scale || 1);

  return (
    <div className="flex flex-col gap-2 max-w-full w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="label-mono">
          Page {pageNum} · {regions.length} region{regions.length !== 1 ? "s" : ""} · L/R linked · Ctrl+scroll to zoom
        </p>
        <div className="flex items-center gap-3">
          <GridToggle show={showGrid} onToggle={() => setShowGrid((s) => !s)} />
          <ZoomControls
            scale={zoom.scale}
            min={MIN_SCALE}
            max={MAX_SCALE}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={reset}
            onSliderChange={(v) => setScale(v)}
          />
          <button
            onClick={onReDetect}
            className="btn-secondary px-2 py-1 text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={11} /> Re-detect
          </button>
        </div>
      </div>
      {/* Outer scroll/clip area for the zoomable canvas */}
      <div className="relative w-full overflow-hidden" style={{ minHeight: 200 }}>
        <div
          ref={containerRef}
          className="outlined-cursors relative inline-block select-none"
          style={{
            maxWidth: "100%",
            transform: `translate(${zoom.offsetX}px, ${zoom.offsetY}px) scale(${zoom.scale})`,
            transformOrigin: "center top",
            cursor: zoom.scale > 1 ? "grab" : "default",
            imageRendering: zoom.scale >= 4 ? "pixelated" : "auto",
          }}
          onMouseDown={onPanMouseDown}
        >
          {imageUrl && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt="page"
              className="block max-w-full h-auto"
              draggable={false}
              style={{ imageRendering: zoom.scale >= 4 ? "pixelated" : "auto" }}
            />
          )}
          {showGrid && imgDims.nW > 0 && (
            <PixelGridOverlay
              displayWidth={imgDims.dW}
              displayHeight={imgDims.dH}
              naturalWidth={imgDims.nW}
              naturalHeight={imgDims.nH}
              zoomScale={zoom.scale}
            />
          )}
          {regions.map((r, i) => {
            const lowConf = r.confidence < 0.6;
            const color = r.manual ? "hsl(320 90% 60%)" : (lowConf ? "hsl(40 90% 55%)" : "hsl(120 70% 55%)");
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${r.bbox.x * 100}%`,
                  top: `${r.bbox.y * 100}%`,
                  width: `${r.bbox.w * 100}%`,
                  height: `${r.bbox.h * 100}%`,
                  border: `${borderPx}px solid ${color}`,
                  background: `${color.replace(")", " / 0.08)")}`,
                  zIndex: 6,
                  pointerEvents: "none",
                }}
              >
                <span
                  className="absolute top-0 left-0 px-1.5 py-0.5 font-semibold"
                  style={{
                    background: color,
                    color: "hsl(var(--background))",
                    fontSize: `${12 / (zoom.scale || 1)}px`,
                    transformOrigin: "top left",
                    cursor: "move",
                    pointerEvents: "auto",
                  }}
                  onMouseDown={(e) => beginDrag(e, i, r, "move")}
                  title="Drag label to move region"
                >
                  {r.label || "?"}
                  {r.isContinuationFromPrev && " ↑"}
                  {r.continuesOnNext && " ↓"}
                  {r.manual && " ✎"}
                </span>
                {/* Edge handles */}
                <div onMouseDown={(e) => beginDrag(e, i, r, "n")} style={{ ...handleBase, top: -handlePx / 2, left: "50%", marginLeft: -handlePx / 2, cursor: "ns-resize" }} />
                <div onMouseDown={(e) => beginDrag(e, i, r, "s")} style={{ ...handleBase, bottom: -handlePx / 2, left: "50%", marginLeft: -handlePx / 2, cursor: "ns-resize" }} />
                <div onMouseDown={(e) => beginDrag(e, i, r, "w")} style={{ ...handleBase, left: -handlePx / 2, top: "50%", marginTop: -handlePx / 2, cursor: "ew-resize" }} title="Left edge — linked across all pages" />
                <div onMouseDown={(e) => beginDrag(e, i, r, "e")} style={{ ...handleBase, right: -handlePx / 2, top: "50%", marginTop: -handlePx / 2, cursor: "ew-resize" }} title="Right edge — linked across all pages" />
                {/* Corner handles */}
                <div onMouseDown={(e) => beginDrag(e, i, r, "nw")} style={{ ...handleBase, top: -handlePx / 2, left: -handlePx / 2, cursor: "nwse-resize" }} />
                <div onMouseDown={(e) => beginDrag(e, i, r, "ne")} style={{ ...handleBase, top: -handlePx / 2, right: -handlePx / 2, cursor: "nesw-resize" }} />
                <div onMouseDown={(e) => beginDrag(e, i, r, "sw")} style={{ ...handleBase, bottom: -handlePx / 2, left: -handlePx / 2, cursor: "nesw-resize" }} />
                <div onMouseDown={(e) => beginDrag(e, i, r, "se")} style={{ ...handleBase, bottom: -handlePx / 2, right: -handlePx / 2, cursor: "nwse-resize" }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

