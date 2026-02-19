import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, Scissors, Trash2 } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { CropControls } from "@/components/CropControls";
import { ImageCard } from "@/components/ImageCard";
import { CropPreviewEditor } from "@/components/CropPreviewEditor";
import { cropImageFile, croppedFileName, CropValues } from "@/lib/cropImage";

type FileStatus = "idle" | "processing" | "done" | "error";

interface ImageEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: FileStatus;
}

export default function Index() {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [crop, setCrop] = useState<CropValues>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [firstImageNaturalSize, setFirstImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;

    const entries: ImageEntry[] = arr.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "idle",
    }));

    setImages((prev) => {
      const wasEmpty = prev.length === 0;
      if (wasEmpty && entries.length > 0) {
        const measureUrl = URL.createObjectURL(entries[0].file);
        const img = new Image();
        img.onload = () => {
          setFirstImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          URL.revokeObjectURL(measureUrl);
        };
        img.onerror = () => URL.revokeObjectURL(measureUrl);
        img.src = measureUrl;
      }
      return [...prev, ...entries];
    });
  }, []);

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
      return prev.filter((img) => img.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setFirstImageNaturalSize(null);
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

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--background))" }}>
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

        {/* Action buttons in header when images loaded */}
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
        {images.length > 0 && firstImageNaturalSize ? (
          /* ── WITH IMAGES: full-width crop preview + grid below ── */
          <div className="flex flex-col">
            {/* Full-width crop preview */}
            <div
              className="border-b px-6 py-5"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <CropPreviewEditor
                imageUrl={images[0].previewUrl}
                imageName={images[0].file.name}
                naturalWidth={firstImageNaturalSize.w}
                naturalHeight={firstImageNaturalSize.h}
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
                  {isDragging ? "Drop images here" : "Add more images"}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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
                      cropTop={crop.top}
                      cropRight={crop.right}
                      cropBottom={crop.bottom}
                      cropLeft={crop.left}
                      onRemove={() => removeImage(img.id)}
                      status={img.status}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── EMPTY STATE: centered drop zone ── */
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-61px)] p-8 gap-6">
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
                  {isDragging ? "Drop images here" : "Drop images or click to browse"}
                </p>
                <p className="label-mono mt-1">JPG · PNG · WEBP · GIF</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
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
