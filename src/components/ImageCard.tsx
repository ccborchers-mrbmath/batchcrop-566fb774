import { useRef, useState, useEffect } from "react";
import { X, ImageIcon } from "lucide-react";
import { CropMode } from "@/lib/cropImage";

interface ImageCardProps {
  file: File;
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
  onRemove: () => void;
  onSelect: () => void;
  isSelected: boolean;
  status: "idle" | "processing" | "done" | "error";
  regionCount?: number;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
  cropMode?: CropMode;
}

export function ImageCard({
  file,
  previewUrl,
  naturalWidth,
  naturalHeight,
  cropTop,
  cropRight,
  cropBottom,
  cropLeft,
  onRemove,
  onSelect,
  isSelected,
  status,
  regionCount = 0,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver = false,
}: ImageCardProps) {

  const sizeKB = (file.size / 1024).toFixed(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setDisplaySize({ w: 0, h: 0 });
  }, [previewUrl]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setDisplaySize({ w: img.offsetWidth, h: img.offsetHeight });
    const observer = new ResizeObserver(update);
    observer.observe(img);
    return () => observer.disconnect();
  }, []);

  // Convert real pixel crop values → display pixel positions proportionally,
  // identical logic to the main CropPreviewEditor so overlays are always accurate.
  const scaleX = naturalWidth > 0 && displaySize.w > 0 ? displaySize.w / naturalWidth : 0;
  const scaleY = naturalHeight > 0 && displaySize.h > 0 ? displaySize.h / naturalHeight : 0;
  const topPx    = cropTop    * scaleY;
  const bottomPx = cropBottom * scaleY;
  const leftPx   = cropLeft   * scaleX;
  const rightPx  = cropRight  * scaleX;
  const hasAnyCrop = cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0;

  const overlayBase: React.CSSProperties = {
    background: "hsl(var(--primary) / 0.35)",
    position: "absolute",
    pointerEvents: "none",
  };

  return (
    <div
      className="image-card group relative cursor-pointer transition-all"
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver?.(e);
      }}
      onDragEnd={() => onDragEnd?.()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(e);
      }}
      style={{
        ...(isSelected
          ? { outline: "2px solid hsl(var(--primary))", outlineOffset: 2 }
          : undefined),
        ...(isDragOver
          ? { boxShadow: "inset 0 0 0 2px hsl(var(--primary) / 0.5)" }
          : undefined),
        opacity: isDragOver ? 0.7 : 1,
      }}
    >
      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}
      >
        <X size={12} />
      </button>

      {/* Region count badge */}
      {regionCount > 0 && (
        <div
          className="absolute bottom-2 left-2 z-10 px-1.5 py-0.5 rounded text-xs font-semibold"
          style={{
            background: "hsl(120 70% 55% / 0.2)",
            border: "1px solid hsl(120 70% 55% / 0.4)",
            color: "hsl(120 70% 55%)",
            fontSize: "0.6rem",
          }}
        >
          {regionCount}R
        </div>
      )}

      {/* Status badge */}
      {status !== "idle" && (

        <div
          className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-xs font-medium"
          style={{
            background:
              status === "done"
                ? "hsl(var(--primary) / 0.2)"
                : status === "error"
                ? "hsl(var(--destructive) / 0.2)"
                : "hsl(var(--muted))",
            color:
              status === "done"
                ? "hsl(var(--primary))"
                : status === "error"
                ? "hsl(var(--destructive))"
                : "hsl(var(--muted-foreground))",
            border: `1px solid ${
              status === "done"
                ? "hsl(var(--primary) / 0.3)"
                : status === "error"
                ? "hsl(var(--destructive) / 0.3)"
                : "hsl(var(--border))"
            }`,
          }}
        >
          {status === "processing" ? "Processing…" : status === "done" ? "✓ Done" : "Error"}
        </div>
      )}

      {/* Preview image — full image visible with contain */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{ height: 140, background: "hsl(var(--muted))" }}
      >
        {/* Inner wrapper sized to the rendered image so overlays sit exactly on it */}
        <div className="relative" style={{ lineHeight: 0 }}>
          <img
            ref={imgRef}
            src={previewUrl}
            alt={file.name}
            className="block"
            style={{ maxWidth: "100%", maxHeight: 140, display: "block" }}
            draggable={false}
            onLoad={() => {
              const img = imgRef.current;
              if (img) setDisplaySize({ w: img.offsetWidth, h: img.offsetHeight });
            }}
          />
          {/* Scaled crop overlays — proportional to each image's own dimensions */}
          {hasAnyCrop && displaySize.w > 0 && (
            <>
              {cropTop > 0 && (
                <div style={{ ...overlayBase, top: 0, left: 0, right: 0, height: topPx, borderBottom: "1px solid hsl(var(--primary) / 0.7)" }} />
              )}
              {cropBottom > 0 && (
                <div style={{ ...overlayBase, bottom: 0, left: 0, right: 0, height: bottomPx, borderTop: "1px solid hsl(var(--primary) / 0.7)" }} />
              )}
              {cropLeft > 0 && (
                <div style={{ ...overlayBase, top: 0, left: 0, bottom: 0, width: leftPx, borderRight: "1px solid hsl(var(--primary) / 0.7)" }} />
              )}
              {cropRight > 0 && (
                <div style={{ ...overlayBase, top: 0, right: 0, bottom: 0, width: rightPx, borderLeft: "1px solid hsl(var(--primary) / 0.7)" }} />
              )}
            </>
          )}
        </div>
      </div>

      {/* File info */}
      <div className="p-3 space-y-0.5">
        <p
          className="text-xs font-medium truncate"
          style={{ color: "hsl(var(--foreground))" }}
          title={file.name}
        >
          {file.name}
        </p>
        <div className="flex items-center gap-1.5">
          <ImageIcon size={10} style={{ color: "hsl(var(--muted-foreground))" }} />
          <span className="label-mono">{sizeKB} KB</span>
        </div>
      </div>
    </div>
  );
}
