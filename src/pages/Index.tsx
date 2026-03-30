import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, Scissors, Trash2, FileText, Layers, ImageIcon, Type } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { ImageCard } from "@/components/ImageCard";
import { CropPreviewEditor } from "@/components/CropPreviewEditor";
import { RegionEditor } from "@/components/RegionEditor";
import { NormalizeDialog } from "@/components/NormalizeDialog";
import { CropControls } from "@/components/CropControls";
import { NumberingEditor, NumberedImage, NumberingConfig } from "@/components/NumberingEditor";
import { cropImageFile, croppedFileName, extractRegion, regionFileName, CropValues, Region, CropMode, RegionMode, whiteOutImageFile, whiteOutRegions } from "@/lib/cropImage";
import { hasMixedDimensions, stretchImageToSize, AspectPreset } from "@/lib/normalizeImages";
import { pdfToImages } from "@/lib/pdfToImages";
import { burnTextOntoImage } from "@/lib/burnText";
import { generateFileNames, buildFullFileName } from "@/lib/generateFileNames";

type FileStatus = "idle" | "processing" | "done" | "error";
type SidebarTab = "batch" | "image";

interface ImageEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: FileStatus;
  regions: Region[];
}

export default function Index() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropValues>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [cropMode, setCropMode] = useState<CropMode>("crop");
  const [regionMode, setRegionMode] = useState<RegionMode>("extract");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [naturalSizes, setNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [showNormalizeDialog, setShowNormalizeDialog] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("batch");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [numberingMode, setNumberingMode] = useState(false);
  const [numberedImages, setNumberedImages] = useState<NumberedImage[]>([]);
  const [numberingConfig, setNumberingConfig] = useState<NumberingConfig>({
    prefix: "",
    startNumber: 1,
    fontFamily: "Times New Roman",
    fontSize: 28,
    bold: true,
    padding: { top: 0, right: 8, bottom: 6, left: 0 },
    position: "top-left",
  });
  const [isNumberExporting, setIsNumberExporting] = useState(false);
  const [batchName, setBatchName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  const addImageFiles = useCallback((imageFiles: File[], selectFirst = false) => {
    if (!imageFiles.length) return;

    const entries: ImageEntry[] = imageFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "idle",
      regions: [],
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
                if (hasMixedDimensions(allSizes)) setShowNormalizeDialog(true);
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

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const isImageFile = (f: File) =>
      f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|tiff?)$/i.test(f.name);
    const isPdfFile = (f: File) =>
      f.type === "application/pdf" || /\.pdf$/i.test(f.name);

    const imageFiles = arr.filter(isImageFile);
    const pdfFiles = arr.filter(isPdfFile);

    const hasImageUpload = imageFiles.length > 0;
    addImageFiles(imageFiles, true);

    for (const pdf of pdfFiles) {
      setPdfProgress({ done: 0, total: 0, name: pdf.name });
      try {
        const pages = await pdfToImages(pdf, 4, (done, total) => {
          setPdfProgress({ done, total, name: pdf.name });
        });
        const convertedFiles = pages.map(
          ({ blob, name }) => new File([blob], name, { type: "image/png" })
        );
        addImageFiles(convertedFiles, !hasImageUpload);
      } catch (err) {
        console.error("PDF conversion failed:", err);
      }
      setPdfProgress(null);
    }
  }, [addImageFiles]);

  const handleNormalize = useCallback(async (preset: AspectPreset) => {
    setImages((prev) => prev.map((img) => ({ ...img, status: "processing" as const })));

    const updated = await Promise.all(
      images.map(async (entry) => {
        const size = naturalSizes[entry.id];
        if (size && size.w === preset.w && size.h === preset.h) return entry;
        try {
          const blob = await stretchImageToSize(entry.file, preset.w, preset.h);
          const newFile = new File([blob], entry.file.name, { type: entry.file.type });
          URL.revokeObjectURL(entry.previewUrl);
          return { ...entry, file: newFile, previewUrl: URL.createObjectURL(blob), status: "idle" as const };
        } catch {
          return { ...entry, status: "idle" as const };
        }
      })
    );

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

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const removeImage = (id: string) => {
    setImages((prev) => {
      const idx = prev.findIndex((img) => img.id === id);
      const entry = idx >= 0 ? prev[idx] : null;
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      const next = prev.filter((img) => img.id !== id);
      if (id === selectedId) {
        if (next.length === 0) {
          setSelectedId(null);
        } else {
          // Select the next image in queue (or the last one if we removed the tail)
          const nextIdx = Math.min(idx, next.length - 1);
          setSelectedId(next[nextIdx].id);
        }
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

  const updateRegions = useCallback((id: string, regions: Region[]) => {
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, regions } : img));
  }, []);

  const hasCrop = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;

  const handleCropAndDownload = async () => {
    if (!images.length) return;
    setIsProcessing(true);
    setImages((prev) => prev.map((img) => ({ ...img, status: "processing" })));

    const zip = new JSZip();
    const folder = zip.folder("cropped");

    const updatedStatuses: Record<string, FileStatus> = {};

    // Process each image
    const results = await Promise.allSettled(
      images.map(async (entry) => {
        // Step 1: Apply batch crop
        const croppedBlob = hasCrop
          ? (cropMode === "whiteout" ? await whiteOutImageFile(entry.file, crop) : await cropImageFile(entry.file, crop))
          : entry.file;

        if (entry.regions.length > 0) {
          // Extract each region from the batch-cropped result
          const regionBlobs = await Promise.all(
            entry.regions.map((r) => extractRegion(croppedBlob, r))
          );
          return { id: entry.id, type: "regions" as const, blobs: regionBlobs, file: entry.file };
        } else {
          // No regions — just the batch crop
          return {
            id: entry.id,
            type: "single" as const,
            blob: croppedBlob,
            name: croppedFileName(entry.file.name),
          };
        }
      })
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const val = result.value;
        if (val.type === "regions") {
          val.blobs.forEach((blob, idx) => {
            folder?.file(regionFileName(val.file.name, idx), blob);
          });
        } else {
          folder?.file(val.name, val.blob);
        }
        updatedStatuses[val.id] = "done";
      } else {
        updatedStatuses[images[i].id] = "error";
      }
    });

    setImages((prev) =>
      prev.map((img) => ({ ...img, status: updatedStatuses[img.id] ?? "error" }))
    );

    // Single image single region — skip zip
    if (images.length === 1) {
      const result = results[0];
      if (result.status === "fulfilled") {
        const val = result.value;
        if (val.type === "regions" && val.blobs.length === 1) {
          saveAs(val.blobs[0], regionFileName(val.file.name, 0));
        } else if (val.type === "single") {
          saveAs(val.blob, val.name);
        } else {
          const zipBlob = await zip.generateAsync({ type: "blob" });
          saveAs(zipBlob, "cropped_images.zip");
        }
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
  const selectedIdx = images.findIndex((i) => i.id === selectedId);
  const selectedSize = selectedId ? naturalSizes[selectedId] : null;

  const goPrev = useCallback(() => {
    if (selectedIdx > 0) setSelectedId(images[selectedIdx - 1].id);
  }, [selectedIdx, images]);

  const goNext = useCallback(() => {
    if (selectedIdx >= 0 && selectedIdx < images.length - 1) setSelectedId(images[selectedIdx + 1].id);
  }, [selectedIdx, images]);

  // Compute cropped dimensions for the region editor
  const croppedW = selectedSize ? Math.max(1, selectedSize.w - crop.left - crop.right) : 0;
  const croppedH = selectedSize ? Math.max(1, selectedSize.h - crop.top - crop.bottom) : 0;

  const handleReorder = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setImages((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((img) => img.id === fromId);
      const toIdx = next.findIndex((img) => img.id === toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  // ── Enter numbering mode ──
  const enterNumberingMode = useCallback(async () => {
    // Extract all regions (or whole cropped images) into individual blobs
    const numbered: NumberedImage[] = [];
    let counter = numberingConfig.startNumber;

    for (const entry of images) {
      const croppedBlob = hasCrop
        ? (cropMode === "whiteout" ? await whiteOutImageFile(entry.file, crop) : await cropImageFile(entry.file, crop))
        : entry.file;

      if (entry.regions.length > 0) {
        for (const region of entry.regions) {
          const blob = await extractRegion(croppedBlob, region);
          const url = URL.createObjectURL(blob);
          numbered.push({
            id: `${entry.id}-${region.id}`,
            blob,
            previewUrl: url,
            naturalWidth: region.w,
            naturalHeight: region.h,
            label: `${numberingConfig.prefix}${counter}`,
            labelX: 0.02,
            labelY: 0.02,
            fileLabel: `${numberingConfig.prefix}${counter}`,
            fileName: "",
          });
          counter++;
        }
      } else {
        const size = naturalSizes[entry.id];
        const w = size ? Math.max(1, size.w - crop.left - crop.right) : 800;
        const h = size ? Math.max(1, size.h - crop.top - crop.bottom) : 600;
        const url = URL.createObjectURL(croppedBlob);
        numbered.push({
          id: entry.id,
          blob: croppedBlob,
          previewUrl: url,
          naturalWidth: w,
          naturalHeight: h,
          label: `${numberingConfig.prefix}${counter}`,
          labelX: 0.02,
          labelY: 0.02,
          fileLabel: `${numberingConfig.prefix}${counter}`,
          fileName: "",
        });
        counter++;
      }
    }

    // Auto-generate file names based on labels
    const fileNames = generateFileNames(numbered);
    numbered.forEach((img, i) => { img.fileName = fileNames[i]; });

    setNumberedImages(numbered);
    setNumberingMode(true);
  }, [images, crop, hasCrop, naturalSizes, numberingConfig]);

  const handleNumberedExport = useCallback(async () => {
    setIsNumberExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("numbered");

      const burnedBlobs: Blob[] = [];
      for (let i = 0; i < numberedImages.length; i++) {
        const img = numberedImages[i];
        let blob = img.blob;
        if (img.label) {
          console.log(`Burning label "${img.label}" at (${img.labelX}, ${img.labelY}) fontSize=${numberingConfig.fontSize}`);
          try {
            blob = await burnTextOntoImage(blob, {
              text: img.label,
              x: img.labelX,
              y: img.labelY,
              fontFamily: numberingConfig.fontFamily,
              fontSize: numberingConfig.fontSize,
              bold: numberingConfig.bold,
              padding: numberingConfig.padding,
            });
            console.log(`Burn succeeded, blob size: ${blob.size}`);
          } catch (err) {
            console.error(`Burn failed for image ${i}:`, err);
          }
        }
        burnedBlobs.push(blob);
        const ext = img.blob.type === "image/png" ? ".png" : img.blob.type === "image/webp" ? ".webp" : ".jpg";
        const fullName = buildFullFileName(batchName, img.fileName, ext);
        folder?.file(fullName, blob);
      }

      if (numberedImages.length === 1) {
        const ext = burnedBlobs[0].type === "image/png" ? ".png" : burnedBlobs[0].type === "image/webp" ? ".webp" : ".jpg";
        const fullName = buildFullFileName(batchName, numberedImages[0].fileName, ext);
        saveAs(burnedBlobs[0], fullName);
      } else {
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = batchName ? `${batchName}.zip` : "numbered_images.zip";
        saveAs(zipBlob, zipName);
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
    setIsNumberExporting(false);
  }, [numberedImages, numberingConfig, batchName]);

  const exitNumberingMode = useCallback(() => {
    numberedImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setNumberedImages([]);
    setNumberingMode(false);
  }, [numberedImages]);

  const updateNumberedImage = useCallback((id: string, updates: Partial<NumberedImage>) => {
    setNumberedImages((prev) =>
      prev.map((img) => img.id === id ? { ...img, ...updates } : img)
    );
  }, []);

  const totalRegions = images.reduce((acc, img) => acc + img.regions.length, 0);
  const imagesWithRegions = images.filter((img) => img.regions.length > 0).length;

  const downloadLabel = () => {
    if (isProcessing) return "Processing…";
    if (!hasCrop && totalRegions === 0) return images.length > 1 ? `Download ZIP (${images.length})` : "Download";
    if (images.length > 1) return `Crop & Download ZIP (${images.length})`;
    return "Crop & Download";
  };

  return (
    <div className={`flex flex-col ${images.length > 0 ? 'h-screen overflow-hidden' : 'min-h-screen'}`} style={{ background: "hsl(var(--background))" }}>
      {/* PDF progress overlay */}
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
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--muted))" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((pdfProgress.done / pdfProgress.total) * 100)}%`,
                      background: "hsl(var(--primary))",
                    }}
                  />
                </div>
                <span className="label-mono">Page {pdfProgress.done} / {pdfProgress.total}</span>
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
          <p className="label-mono" style={{ marginTop: 1 }}>pixel-perfect edge cropping</p>
        </div>

        {images.length > 0 && !numberingMode && (
          <div className="flex items-center gap-2">
            <button onClick={clearAll} className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2">
              <Trash2 size={13} />
              Clear all
            </button>
            <button
              onClick={enterNumberingMode}
              disabled={images.length === 0}
              className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-2"
            >
              <Type size={13} />
              Number Images
            </button>
            <button
              onClick={handleCropAndDownload}
              disabled={(!hasCrop && totalRegions === 0) || isProcessing}
              className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
            >
              <Download size={13} />
              {downloadLabel()}
            </button>
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {numberingMode ? (
          <NumberingEditor
            images={numberedImages}
            config={numberingConfig}
            onConfigChange={setNumberingConfig}
            onImageUpdate={updateNumberedImage}
            onReorder={(reordered) => setNumberedImages(reordered)}
            onExport={handleNumberedExport}
            onBack={exitNumberingMode}
            isExporting={isNumberExporting}
            batchName={batchName}
            onBatchNameChange={setBatchName}
            onRegenerateFileNames={() => {
              const fileNames = generateFileNames(numberedImages);
              numberedImages.forEach((img, i) => {
                updateNumberedImage(img.id, { fileName: fileNames[i] });
              });
            }}
          />
        ) : images.length > 0 && selectedEntry && selectedSize ? (
          <>
            {/* ── LEFT SIDEBAR ── */}
            <aside
              className="w-72 shrink-0 border-r flex flex-col overflow-y-auto"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
            >
              {/* Tab bar */}
              <div
                className="flex border-b shrink-0"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                <button
                  onClick={() => setSidebarTab("batch")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium transition-colors ${
                    sidebarTab === "batch" ? "border-b-2" : ""
                  }`}
                  style={{
                    borderColor: sidebarTab === "batch" ? "hsl(var(--primary))" : "transparent",
                    color: sidebarTab === "batch" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  <Layers size={13} />
                  Batch Tools
                </button>
                <button
                  onClick={() => setSidebarTab("image")}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium transition-colors ${
                    sidebarTab === "image" ? "border-b-2" : ""
                  }`}
                  style={{
                    borderColor: sidebarTab === "image" ? "hsl(var(--primary))" : "transparent",
                    color: sidebarTab === "image" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  <ImageIcon size={13} />
                  Image Tools
                  {selectedEntry.regions.length > 0 && (
                    <span
                      className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold"
                      style={{
                        background: "hsl(120 70% 55% / 0.2)",
                        color: "hsl(120 70% 55%)",
                        fontSize: "0.6rem",
                      }}
                    >
                      {selectedEntry.regions.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 p-5 overflow-y-auto">
                {sidebarTab === "batch" ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="label-mono mb-4">Apply to all {images.length} image{images.length !== 1 ? "s" : ""}</p>
                      <CropControls values={crop} onChange={setCrop} mode={cropMode} onModeChange={setCropMode} />
                    </div>

                    {imagesWithRegions > 0 && (
                      <div
                        className="rounded-lg px-3 py-2.5 text-xs"
                        style={{
                          background: "hsl(120 70% 55% / 0.08)",
                          border: "1px solid hsl(120 70% 55% / 0.25)",
                          color: "hsl(120 70% 55%)",
                        }}
                      >
                        <span className="font-semibold">{imagesWithRegions} image{imagesWithRegions !== 1 ? "s" : ""}</span> ha{imagesWithRegions !== 1 ? "ve" : "s"} individual regions — those will download as region files only.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="label-mono">
                      Regions for: <span style={{ color: "hsl(var(--foreground))" }}>{selectedEntry.file.name}</span>
                    </p>
                    {selectedEntry.regions.length > 0 && (
                      <div
                        className="rounded px-3 py-2 text-xs"
                        style={{
                          background: "hsl(120 70% 55% / 0.08)",
                          border: "1px solid hsl(120 70% 55% / 0.25)",
                          color: "hsl(120 70% 55%)",
                        }}
                      >
                        {selectedEntry.regions.length} region{selectedEntry.regions.length !== 1 ? "s" : ""} drawn — batch crop will NOT be downloaded for this image.
                      </div>
                    )}

                    {/* Region list (compact) */}
                    {selectedEntry.regions.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {selectedEntry.regions.map((r, i) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded text-xs"
                            style={{
                              background: "hsl(var(--muted))",
                              border: "1px solid hsl(var(--border))",
                            }}
                          >
                            <span className="font-medium" style={{ color: "hsl(120 70% 55%)" }}>R{i + 1}</span>
                            <span className="label-mono">{r.w}×{r.h}px</span>
                            <button
                              onClick={() =>
                                updateRegions(
                                  selectedEntry.id,
                                  selectedEntry.regions.filter((x) => x.id !== r.id)
                                )
                              }
                              className="opacity-60 hover:opacity-100 transition-opacity"
                              style={{ color: "hsl(var(--destructive))" }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateRegions(selectedEntry.id, [])}
                          className="label-mono hover:text-primary transition-colors text-left mt-1"
                          style={{ color: "hsl(var(--muted-foreground))" }}
                        >
                          Clear all regions
                        </button>
                      </div>
                    )}
                    {selectedEntry.regions.length === 0 && (
                      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        No regions yet. Use the preview to click &amp; drag a rectangle on the image.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
              {/* Preview panel */}
              <div
                className="border-b px-6 py-5"
                style={{ borderColor: "hsl(var(--border))" }}
              >
                {sidebarTab === "batch" ? (
                  <CropPreviewEditor
                    imageUrl={selectedEntry.previewUrl}
                    imageName={selectedEntry.file.name}
                    naturalWidth={selectedSize.w}
                    naturalHeight={selectedSize.h}
                    crop={crop}
                    cropMode={cropMode}
                    onChange={setCrop}
                    onRemove={() => removeImage(selectedEntry.id)}
                    onPrev={selectedIdx > 0 ? goPrev : undefined}
                    onNext={selectedIdx < images.length - 1 ? goNext : undefined}
                    currentIndex={selectedIdx}
                    totalImages={images.length}
                  />
                ) : (
                  <RegionEditor
                    imageUrl={selectedEntry.previewUrl}
                    imageName={selectedEntry.file.name}
                    naturalWidth={selectedSize.w}
                    naturalHeight={selectedSize.h}
                    croppedWidth={croppedW}
                    croppedHeight={croppedH}
                    regions={selectedEntry.regions}
                    onChange={(r) => updateRegions(selectedEntry.id, r)}
                    onRemove={() => removeImage(selectedEntry.id)}
                    onPrev={selectedIdx > 0 ? goPrev : undefined}
                    onNext={selectedIdx < images.length - 1 ? goNext : undefined}
                    currentIndex={selectedIdx}
                    totalImages={images.length}
                  />
                )}
              </div>

              {/* Drop zone + image grid */}
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
                  <p className="text-sm" style={{ color: isDragging ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                    {isDragging ? "Drop files here" : "Add more images or PDFs"}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (!e.target.files) return;
                      void addFiles(e.target.files);
                      e.currentTarget.value = "";
                    }}
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
                        onSelect={() => {
                          setSelectedId(img.id);
                          if (img.regions.length > 0) setSidebarTab("image");
                        }}
                        isSelected={img.id === selectedId}
                        status={img.status}
                        regionCount={img.regions.length}
                        onDragStart={() => setDraggedId(img.id)}
                        onDragOver={() => setDragOverId(img.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                        onDrop={() => {
                          if (draggedId && draggedId !== img.id) handleReorder(draggedId, img.id);
                          setDraggedId(null);
                          setDragOverId(null);
                        }}
                        isDragOver={dragOverId === img.id && draggedId !== img.id}
                        cropMode={cropMode}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── EMPTY STATE ── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
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
                  "Draw individual regions per image",
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
                onChange={(e) => {
                  if (!e.target.files) return;
                  void addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
