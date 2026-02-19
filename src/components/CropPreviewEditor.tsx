import { useRef, useCallback, useEffect, useState } from "react";
import { CropValues } from "@/lib/cropImage";

interface CropPreviewEditorProps {
  imageUrl: string;
  imageName: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropValues;
  onChange: (crop: CropValues) => void;
}

type DragEdge = "top" | "right" | "bottom" | "left" | null;

const HANDLE_THICKNESS = 6; // px hit target on each edge

export function CropPreviewEditor({
  imageUrl,
  imageName,
  naturalWidth,
  naturalHeight,
  crop,
  onChange,
}: CropPreviewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<DragEdge>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startCrop = useRef<CropValues>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  // Track the rendered image size so we can convert pixels accurately
  const imgRef = useRef<HTMLImageElement>(null);

  const updateDisplaySize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setDisplaySize({ w: img.offsetWidth, h: img.offsetHeight });
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(updateDisplaySize);
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [updateDisplaySize]);

  // Scale factor: display px → real px
  const scaleX = displaySize.w > 0 ? naturalWidth / displaySize.w : 1;
  const scaleY = displaySize.h > 0 ? naturalHeight / displaySize.h : 1;

  // Clamp so opposite edges don't overlap (leave at least 1 real px in the middle)
  const clamp = (value: number) => Math.max(0, Math.round(value));

  const onMouseDown = useCallback(
    (e: React.MouseEvent, edge: DragEdge) => {
      e.preventDefault();
      dragging.current = edge;
      startPos.current = { x: e.clientX, y: e.clientY };
      startCrop.current = { ...crop };
    },
    [crop]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !displaySize.w || !displaySize.h) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      const edge = dragging.current;
      const next = { ...startCrop.current };

      if (edge === "top") {
        const realDelta = dy * scaleY;
        next.top = clamp(startCrop.current.top + realDelta);
        // prevent overlap
        const maxTop = naturalHeight - next.bottom - 1;
        next.top = Math.min(next.top, maxTop);
      } else if (edge === "bottom") {
        const realDelta = -dy * scaleY;
        next.bottom = clamp(startCrop.current.bottom + realDelta);
        const maxBottom = naturalHeight - next.top - 1;
        next.bottom = Math.min(next.bottom, maxBottom);
      } else if (edge === "left") {
        const realDelta = dx * scaleX;
        next.left = clamp(startCrop.current.left + realDelta);
        const maxLeft = naturalWidth - next.right - 1;
        next.left = Math.min(next.left, maxLeft);
      } else if (edge === "right") {
        const realDelta = -dx * scaleX;
        next.right = clamp(startCrop.current.right + realDelta);
        const maxRight = naturalWidth - next.left - 1;
        next.right = Math.min(next.right, maxRight);
      }

      onChange(next);
    };

    const onUp = () => {
      dragging.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scaleX, scaleY, naturalWidth, naturalHeight, onChange, displaySize]);

  // Convert real pixel crop values to display pixel positions
  const topPx = displaySize.h > 0 ? (crop.top / naturalHeight) * displaySize.h : 0;
  const bottomPx = displaySize.h > 0 ? (crop.bottom / naturalHeight) * displaySize.h : 0;
  const leftPx = displaySize.w > 0 ? (crop.left / naturalWidth) * displaySize.w : 0;
  const rightPx = displaySize.w > 0 ? (crop.right / naturalWidth) * displaySize.w : 0;

  const hasCrop = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;

  const overlayColor = "hsl(var(--primary) / 0.25)";
  const handleColor = "hsl(var(--primary))";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="label-mono">Crop Preview</p>
        {hasCrop && (
          <button
            className="label-mono hover:text-primary transition-colors"
            style={{ color: "hsl(var(--muted-foreground))" }}
            onClick={() => onChange({ top: 0, right: 0, bottom: 0, left: 0 })}
          >
            Reset
          </button>
        )}
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded"
        style={{ border: "1px solid hsl(var(--border))" }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={imageName}
          draggable={false}
          className="block w-full"
          onLoad={updateDisplaySize}
          style={{ display: "block" }}
        />

        {/* Crop shadow overlays */}
        {/* Top */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{ height: topPx, background: overlayColor, borderBottom: `1px solid ${handleColor}` }}
        />
        {/* Bottom */}
        <div
          className="absolute left-0 right-0 bottom-0 pointer-events-none"
          style={{ height: bottomPx, background: overlayColor, borderTop: `1px solid ${handleColor}` }}
        />
        {/* Left */}
        <div
          className="absolute top-0 bottom-0 left-0 pointer-events-none"
          style={{ width: leftPx, background: overlayColor, borderRight: `1px solid ${handleColor}` }}
        />
        {/* Right */}
        <div
          className="absolute top-0 bottom-0 right-0 pointer-events-none"
          style={{ width: rightPx, background: overlayColor, borderLeft: `1px solid ${handleColor}` }}
        />

        {/* Draggable handles — inlined divs, no component to avoid ref warnings */}
        {/* Top handle */}
        <div
          className="absolute z-10"
          style={{ top: topPx - HANDLE_THICKNESS, left: 0, right: 0, height: HANDLE_THICKNESS * 2, cursor: "ns-resize", touchAction: "none" }}
          onMouseDown={(e) => onMouseDown(e, "top")}
        />
        {/* Bottom handle */}
        <div
          className="absolute z-10"
          style={{ bottom: bottomPx - HANDLE_THICKNESS, left: 0, right: 0, height: HANDLE_THICKNESS * 2, cursor: "ns-resize", touchAction: "none" }}
          onMouseDown={(e) => onMouseDown(e, "bottom")}
        />
        {/* Left handle */}
        <div
          className="absolute z-10"
          style={{ left: leftPx - HANDLE_THICKNESS, top: 0, bottom: 0, width: HANDLE_THICKNESS * 2, cursor: "ew-resize", touchAction: "none" }}
          onMouseDown={(e) => onMouseDown(e, "left")}
        />
        {/* Right handle */}
        <div
          className="absolute z-10"
          style={{ right: rightPx - HANDLE_THICKNESS, top: 0, bottom: 0, width: HANDLE_THICKNESS * 2, cursor: "ew-resize", touchAction: "none" }}
          onMouseDown={(e) => onMouseDown(e, "right")}
        />

        {/* Drag-to-crop hint when no crop set */}
        {!hasCrop && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <p
              className="label-mono text-center px-3 py-1.5 rounded"
              style={{
                background: "hsl(var(--background) / 0.75)",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              Drag the edges to set crop
            </p>
          </div>
        )}
      </div>

      {/* Pixel readout */}
      <div className="grid grid-cols-2 gap-1.5">
        {(["top", "right", "bottom", "left"] as const).map((edge) => (
          <div
            key={edge}
            className="flex items-center justify-between px-2 py-1 rounded"
            style={{
              background: "hsl(var(--muted))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <span className="label-mono">{edge}</span>
            <span
              className="font-mono text-xs font-semibold"
              style={{ color: crop[edge] > 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
            >
              {crop[edge]}px
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

