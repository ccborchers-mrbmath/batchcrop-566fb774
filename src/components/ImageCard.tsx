import { X, ImageIcon } from "lucide-react";

interface ImageCardProps {
  file: File;
  previewUrl: string;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
  onRemove: () => void;
  onSelect: () => void;
  isSelected: boolean;
  status: "idle" | "processing" | "done" | "error";
}

export function ImageCard({
  file,
  previewUrl,
  cropTop,
  cropRight,
  cropBottom,
  cropLeft,
  onRemove,
  onSelect,
  isSelected,
  status,
}: ImageCardProps) {
  const sizeKB = (file.size / 1024).toFixed(0);

  return (
    <div
      className="image-card group relative cursor-pointer"
      onClick={onSelect}
      style={
        isSelected
          ? { outline: "2px solid hsl(var(--primary))", outlineOffset: 2 }
          : undefined
      }
    >
      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}
      >
        <X size={12} />
      </button>

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
        <img
          src={previewUrl}
          alt={file.name}
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
        <CropOverlay top={cropTop} right={cropRight} bottom={cropBottom} left={cropLeft} />
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

function CropOverlay({
  top,
  right,
  bottom,
  left,
}: {
  top: number;
  right: number;
  bottom: number;
  left: number;
}) {
  const hasAnyCrop = top > 0 || right > 0 || bottom > 0 || left > 0;
  if (!hasAnyCrop) return null;

  const overlayStyle = {
    background: "hsl(var(--primary) / 0.25)",
    position: "absolute" as const,
  };

  const pct = (v: number) => `${Math.min(v, 999)}px`;

  return (
    <>
      {top > 0 && (
        <div
          style={{
            ...overlayStyle,
            top: 0, left: 0, right: 0,
            height: pct(top),
            borderBottom: "1px solid hsl(var(--primary) / 0.6)",
          }}
        />
      )}
      {bottom > 0 && (
        <div
          style={{
            ...overlayStyle,
            bottom: 0, left: 0, right: 0,
            height: pct(bottom),
            borderTop: "1px solid hsl(var(--primary) / 0.6)",
          }}
        />
      )}
      {left > 0 && (
        <div
          style={{
            ...overlayStyle,
            top: 0, left: 0, bottom: 0,
            width: pct(left),
            borderRight: "1px solid hsl(var(--primary) / 0.6)",
          }}
        />
      )}
      {right > 0 && (
        <div
          style={{
            ...overlayStyle,
            top: 0, right: 0, bottom: 0,
            width: pct(right),
            borderLeft: "1px solid hsl(var(--primary) / 0.6)",
          }}
        />
      )}
    </>
  );
}
