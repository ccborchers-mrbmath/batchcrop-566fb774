import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, Scissors, Trash2, FileText } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { ImageCard } from "@/components/ImageCard";
import { CropPreviewEditor } from "@/components/CropPreviewEditor";
import { NormalizeDialog } from "@/components/NormalizeDialog";
import { cropImageFile, croppedFileName, CropValues } from "@/lib/cropImage";
import { hasMixedDimensions, stretchImageToSize, AspectPreset } from "@/lib/normalizeImages";
import { pdfToImages } from "@/lib/pdfToImages";

type FileStatus = "idle" | "processing" | "done" | "error";

interface ImageEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: FileStatus;
}

export default function Index() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropValues>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [showNormalizeDialog, setShowNormalizeDialog] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  /** Register image File objects as entries and measure their dimensions. */
  const addImageFiles = useCallback((imageFiles: File[], selectFirst = false) => {
    if (!imageFiles.length) return;

    const entries: ImageEntry[] = imageFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "idle",
    }));

    setImages((prev) => {
      const isFirst = selectFirst && prev.length === 0;
      let loadedCount = 0;

      entries.forEach((entry, i) => {
        const measureUrl = URL.createObjectURL(entry.file);
        const img = new Image();
        img.onload = () => {
          setNaturalSizes((s) => {
            const next = { ...s, [entry.id]: { w: img.naturalWidth, h: img.naturalHeight } };
            loadedCount++;
            if (loadedCount === entries.length) {
              setImages((current) => {
                const allIds = current.map((im) => im.id);
                const allSizes: Record<string, { w: number; h: number }> = {};
                allIds.forEach((id) => { if (next[id]) allSizes[id] = next[id]; });
                if (hasMixedDimensions(allSizes)) {
                  setShowNormalizeDialog(true);
                }
                return current;
              });
            }
            return next;
          });
          URL.revokeObjectURL(measureUrl);
          if (isFirst && i === 0) setSelectedId(entry.id);
        };
        img.onerror = () => URL.revokeObjectURL(measureUrl);
        img.src = measureUrl;
      });
      return [...prev, ...entries];
    });
  }, []);

  /** Handle any mix of image and PDF files dropped or selected. */
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const imageFiles = arr.filter((f) => f.type.startsWith("image/"));
    const pdfFiles = arr.filter((f) => f.type === "application/pdf");

    // Add plain images immediately
    const isFirstBatch = imageFiles.length > 0;
    addImageFiles(imageFiles, true);

    // Convert each PDF sequentially, showing progress
    for (const pdf of pdfFiles) {
      setPdfProgress({ done: 0, total: 0, name: pdf.name });
      try {
        const pages = await pdfToImages(pdf, 2, (done, total) => {
          setPdfProgress({ done, total, name: pdf.name });
        });
        const convertedFiles = pages.map(
          ({ blob, name }) => new File([blob], name, { type: "image/png" })
        );
        addImageFiles(convertedFiles, !isFirstBatch);
      } catch (err) {
        console.error("PDF conversion failed:", err);
      }
      setPdfProgress(null);
    }
  }, [addImageFiles]);

  /** Stretch every image in the batch that doesn't match the chosen preset. */
  const handleNormalize = useCallback(async (preset: AspectPreset) => {
    setImages((prev) =>
      prev.map((img) => ({ ...img, status: "processing" as const }))
    );

    const updated = await Promise.all(
      images.map(async (entry) => {
        const size = naturalSizes[entry.id];
        if (size && size.w === preset.w && size.h === preset.h) {
          // Already the right size — nothing to do
          return entry;
        }
        try {
          const blob = await stretchImageToSize(entry.file, preset.w, preset.h);
          const newFile = new File([blob], entry.file.name, { type: entry.file.type });
          URL.revokeObjectURL(entry.previewUrl);
          return {
            ...entry,
            file: newFile,
            previewUrl: URL.createObjectURL(blob),
            status: "idle" as const,
          };
        } catch {
          return { ...entry, status: "idle" as const };
        }
      })
    );

    // Update natural sizes to the preset dimensions for all entries
    const newSizes: Record<string, { w: number; h: number }> = {};
    updated.forEach((e) => { newSizes[e.id] = { w: preset.w, h: preset.h }; });

    setNaturalSizes((s) => ({ ...s, ...newSizes }));
    setImages(updated);
    setShowNormalizeDialog(false);
  }, [images, naturalSizes]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removeImage = (id: string) => {
    setImages((prev) => {
      const entry = prev.find((img) => img.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      const next = prev.filter((img) => img.id !== id);
      // If the removed image was selected, select the first remaining
      if (id === selectedId && next.length > 0) {
        setSelectedId(next[0].id);
      } else if (next.length === 0) {
        setSelectedId(null);
      }
      return next;
    });
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setNaturalSizes({});
    setSelectedId(null);
  };

  const hasCrop =
    crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;

  const handleCropAndDownload = async () => {
    if (!images.length || !hasCrop) return;
    setIsProcessing(true);

    setImages((prev) => prev.map((img) => ({ ...img, status: "processing" })));

    const zip = new JSZip();
    const folder = zip.folder("cropped");

    const results = await Promise.allSettled(
      images.map(async (entry) => {
        const blob = await cropImageFile(entry.file, crop);
        return { id: entry.id, blob, name: croppedFileName(entry.file.name) };
      })
    );

    const updatedStatuses: Record<string, FileStatus> = {};

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const { id, blob, name } = result.value;
        folder?.file(name, blob);
        updatedStatuses[id] = "done";
      } else {
        updatedStatuses[images[i].id] = "error";
      }
    });

    setImages((prev) =>
      prev.map((img) => ({ ...img, status: updatedStatuses[img.id] ?? "error" }))
    );

    if (images.length === 1) {
      const result = results[0];
      if (result.status === "fulfilled") {
        saveAs(result.value.blob, result.value.name);
      }
    } else {
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, "cropped_images.zip");
    }

    setIsProcessing(false);

    setTimeout(() => {
      setImages((prev) => prev.map((img) => ({ ...img, status: "idle" })));
    }, 3000);
  };

  const selectedEntry = images.find((i) => i.id === selectedId);
  const selectedSize = selectedId ? naturalSizes[selectedId] : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* PDF conversion progress overlay */}
      {pdfProgress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "hsl(var(--background) / 0.85)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="flex flex-col items-center gap-4 rounded-xl px-8 py-7"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", minWidth: 300 }}
          >
            <div className="flex items-center gap-2.5">
              <FileText size={18} style={{ color: "hsl(var(--primary))" }} />
              <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
                Converting PDF…
              </span>
            </div>
            <p className="label-mono text-center" style={{ maxWidth: 240 }}>{pdfProgress.name}</p>
            {pdfProgress.total > 0 && (
              <>
                <div
                  className="w-full h-1.5 rounded-full overflow-hidden"
                  style={{ background: "hsl(var(--muted))" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((pdfProgress.done / pdfProgress.total) * 100)}%`,
                      background: "hsl(var(--primary))",
                    }}
                  />
                </div>
                <span className="label-mono">
                  Page {pdfProgress.done} / {pdfProgress.total}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {showNormalizeDialog && (
        <NormalizeDialog
          sizes={naturalSizes}
          onConfirm={handleNormalize}
          onSkip={() => setShowNormalizeDialog(false)}
        />
      )}

      {/* Header */}
      <header
        className="border-b px-6 py-4 flex items-center gap-3 shrink-0"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center"
          style={{ background: "hsl(var(--primary) / 0.15)", border: "1px solid hsl(var(--primary) / 0.3)" }}
        >
          <Scissors size={16} style={{ color: "hsl(var(--primary))" }} />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold tracking-tight" style={{ color: "hsl(var(--foreground))" }}>
            BatchCrop
          </h1>
          <p className="label-mono" style={{ marginTop: 1 }}>
            pixel-perfect edge cropping
          </p>
        </div>

        {images.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2"
            >
              <Trash2 size={13} />
              Clear all
            </button>
            <button
              onClick={handleCropAndDownload}
              disabled={!hasCrop || isProcessing}
              className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
            >
              <Download size={13} />
              {isProcessing
                ? "Processing…"
                : images.length > 1
                ? `Crop & Download ZIP (${images.length})`
                : "Crop & Download"}
            </button>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {images.length > 0 && selectedEntry && selectedSize ? (
          <div className="flex flex-col">
            {/* Full-width crop preview */}
            <div
              className="border-b px-6 py-5"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <CropPreviewEditor
                imageUrl={selectedEntry.previewUrl}
                imageName={selectedEntry.file.name}
                naturalWidth={selectedSize.w}
                naturalHeight={selectedSize.h}
                crop={crop}
                onChange={setCrop}
              />
            </div>

            {/* Drop zone (compact) + image grid */}
            <div className="p-6 space-y-5">
              <div
                className={`drop-zone rounded-lg flex items-center justify-center gap-3 cursor-pointer transition-all px-4 ${isDragging ? "active" : ""}`}
                style={{ minHeight: 72 }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload
                  size={15}
                  style={{ color: isDragging ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                />
                <p
                  className="text-sm"
                  style={{ color: isDragging ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                >
                  {isDragging ? "Drop files here" : "Add more images or PDFs"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
              </div>

              <div>
                <p className="label-mono mb-3">
                  {images.length} image{images.length !== 1 ? "s" : ""} loaded
                </p>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                  {images.map((img) => (
                    <ImageCard
                      key={img.id}
                      file={img.file}
                      previewUrl={img.previewUrl}
                      naturalWidth={naturalSizes[img.id]?.w ?? 0}
                      naturalHeight={naturalSizes[img.id]?.h ?? 0}
                      cropTop={crop.top}
                      cropRight={crop.right}
                      cropBottom={crop.bottom}
                      cropLeft={crop.left}
                      onRemove={() => removeImage(img.id)}
                      onSelect={() => setSelectedId(img.id)}
                      isSelected={img.id === selectedId}
                      status={img.status}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── EMPTY STATE: centered drop zone ── */
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-61px)] p-8 gap-8">
            {/* Hero copy */}
            <div className="text-center max-w-lg">
              <h2 className="text-2xl font-semibold tracking-tight mb-3" style={{ color: "hsl(var(--foreground))" }}>
                Crop dozens of images in seconds
              </h2>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "hsl(var(--muted-foreground))" }}>
                BatchCrop lets you trim a precise number of pixels from every edge of a batch of images — all at once.
                Upload a stack of JPGs, PNGs, or <strong style={{ color: "hsl(var(--foreground))" }}>PDF pages</strong>,
                drag the crop handles or type exact pixel values, then download everything as a ZIP.
                No account needed. Runs entirely in your browser.
              </p>
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-1.5">
                {[
                  "Batch-crop entire PDF documents",
                  "Pixel-precise edge control",
                  "Works offline — no uploads to a server",
                  "Free, no sign-up required",
                ].map((point) => (
                  <span key={point} className="label-mono flex items-center gap-1.5">
                    <span style={{ color: "hsl(var(--primary))" }}>✓</span>
                    {point}
                  </span>
                ))}
              </div>
            </div>
            <div
              className={`drop-zone w-full max-w-xl rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${isDragging ? "active" : ""}`}
              style={{ minHeight: 280 }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: isDragging ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <Upload
                  size={20}
                  style={{ color: isDragging ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                />
              </div>
              <div className="text-center">
                <p
                  className="text-sm font-medium"
                  style={{ color: isDragging ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}
                >
                  {isDragging ? "Drop files here" : "Drop images or PDFs · click to browse"}
                </p>
                <p className="label-mono mt-1">JPG · PNG · WEBP · PDF</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addFiles(e.target.files)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
