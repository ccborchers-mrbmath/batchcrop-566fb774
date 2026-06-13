import { useRef, useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { CropValues, CropMode } from "@/lib/cropImage";
import { useZoom } from "@/hooks/useZoom";
import { ZoomControls } from "@/components/ZoomControls";
import { PixelGridOverlay, GridToggle } from "@/components/PixelGrid";

interface CropPreviewEditorProps {
  imageUrl: string;
  imageName: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: CropValues;
  cropMode?: CropMode;
  onChange: (crop: CropValues) => void;
  onRemove?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalImages?: number;
}

type DragEdge = "top" | "right" | "bottom" | "left" | null;

const HANDLE_THICKNESS = 6; // px hit target on each edge

export function CropPreviewEditor({
  imageUrl,
  imageName,
  naturalWidth,
  naturalHeight,
  crop,
  cropMode = "crop",
  onChange,
  onRemove,
  onPrev,
  onNext,
  currentIndex,
  totalImages,
}: CropPreviewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<DragEdge>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startCrop = useRef<CropValues>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  const imgRef = useRef<HTMLImageElement>(null);

  const { zoom, setScale, reset, zoomIn, zoomOut, onPanMouseDown, MIN_SCALE, MAX_SCALE } =
    useZoom(containerRef);

  const updateDisplaySize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setDisplaySize({ w: img.offsetWidth, h: img.offsetHeight });
  }, []);

  useEffect(() => {
    setDisplaySize({ w: 0, h: 0 });
  }, [imageUrl]);

  useEffect(() => {
    const observer = new ResizeObserver(updateDisplaySize);
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [updateDisplaySize]);

  // Scale factor: display px → real px
  const scaleX = displaySize.w > 0 ? naturalWidth / displaySize.w : 1;
  const scaleY = displaySize.h > 0 ? naturalHeight / displaySize.h : 1;

  const clamp = (value: number) => Math.max(0, Math.round(value));

  const onMouseDown = useCallback(
    (e: React.MouseEvent, edge: DragEdge) => {
      e.preventDefault();
      e.stopPropagation(); // don't trigger pan
      dragging.current = edge;
      startPos.current = { x: e.clientX, y: e.clientY };
      startCrop.current = { ...crop };
    },
    [crop]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !displaySize.w || !displaySize.h) return;
      // Adjust for zoom scale — mouse delta is in screen px, image is scaled up
      const dx = (e.clientX - startPos.current.x) / zoom.scale;
      const dy = (e.clientY - startPos.current.y) / zoom.scale;
      const edge = dragging.current;
      const next = { ...startCrop.current };

      if (edge === "top") {
        const realDelta = dy * scaleY;
        next.top = clamp(startCrop.current.top + realDelta);
        next.top = Math.min(next.top, naturalHeight - next.bottom - 1);
      } else if (edge === "bottom") {
        const realDelta = -dy * scaleY;
        next.bottom = clamp(startCrop.current.bottom + realDelta);
        next.bottom = Math.min(next.bottom, naturalHeight - next.top - 1);
      } else if (edge === "left") {
        const realDelta = dx * scaleX;
        next.left = clamp(startCrop.current.left + realDelta);
        next.left = Math.min(next.left, naturalWidth - next.right - 1);
      } else if (edge === "right") {
        const realDelta = -dx * scaleX;
        next.right = clamp(startCrop.current.right + realDelta);
        next.right = Math.min(next.right, naturalWidth - next.left - 1);
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
  }, [scaleX, scaleY, naturalWidth, naturalHeight, onChange, displaySize, zoom.scale]);

  // Convert real pixel crop values to display pixel positions
  const topPx = displaySize.h > 0 ? (crop.top / naturalHeight) * displaySize.h : 0;
  const bottomPx = displaySize.h > 0 ? (crop.bottom / naturalHeight) * displaySize.h : 0;
  const leftPx = displaySize.w > 0 ? (crop.left / naturalWidth) * displaySize.w : 0;
  const rightPx = displaySize.w > 0 ? (crop.right / naturalWidth) * displaySize.w : 0;

  const hasCrop = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;

  const overlayColor = cropMode === "whiteout" ? "white" : "hsl(var(--primary) / 0.25)";
  const handleColor = cropMode === "whiteout" ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--primary))";

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Prev / Next navigation */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={onPrev}
                disabled={!onPrev}
                className="w-6 h-6 rounded flex items-center justify-center transition-opacity disabled:opacity-25"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                title="Previous image"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="label-mono tabular-nums" style={{ minWidth: 40, textAlign: "center" }}>
                {(currentIndex ?? 0) + 1}/{totalImages ?? 0}
              </span>
              <button
                onClick={onNext}
                disabled={!onNext}
                className="w-6 h-6 rounded flex items-center justify-center transition-opacity disabled:opacity-25"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                title="Next image"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <p className="label-mono">Crop Preview — drag edges to set crop</p>
          {onRemove && (
            <button
              onClick={onRemove}
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
              style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}
              title="Remove image"
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ZoomControls
            scale={zoom.scale}
            min={MIN_SCALE}
            max={MAX_SCALE}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={reset}
            onSliderChange={(v) => setScale(v)}
          />
          <GridToggle show={showGrid} onToggle={() => setShowGrid((v) => !v)} />
          {hasCrop && (
            <button
              className="label-mono hover:text-primary transition-colors"
              style={{ color: "hsl(var(--muted-foreground))" }}
              onClick={() => onChange({ top: 0, right: 0, bottom: 0, left: 0 })}
            >
              Reset crop
            </button>
          )}
        </div>
      </div>

      {/* Image + readout side by side */}
      <div className="flex gap-4 items-start">
        {/* Image container */}
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden rounded flex-1 min-w-0"
          style={{
            border: "1px solid hsl(var(--border))",
            cursor: zoom.scale > 1 ? "grab" : "default",
          }}
          onMouseDown={onPanMouseDown}
        >
          {/* Zoomed inner wrapper */}
          <div
            className="relative"
            style={{
              transform: `scale(${zoom.scale}) translate(${zoom.offsetX / zoom.scale}px, ${zoom.offsetY / zoom.scale}px)`,
              transformOrigin: "center top",
              willChange: "transform",
            }}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt={imageName}
              draggable={false}
              className="block w-full"
              onLoad={updateDisplaySize}
              style={{ display: "block", imageRendering: zoom.scale > 1.5 ? "pixelated" : "auto" }}
            />

            {/* Pixel grid overlay */}
            {showGrid && <PixelGridOverlay displayWidth={displaySize.w} displayHeight={displaySize.h} naturalWidth={naturalWidth} naturalHeight={naturalHeight} zoomScale={zoom.scale} />}

            {/* Crop shadow overlays */}
            <div
              className="absolute left-0 right-0 top-0 pointer-events-none"
              style={{ height: topPx, background: overlayColor, borderBottom: `${1 / zoom.scale}px solid ${handleColor}` }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 pointer-events-none"
              style={{ height: bottomPx, background: overlayColor, borderTop: `${1 / zoom.scale}px solid ${handleColor}` }}
            />
            <div
              className="absolute top-0 bottom-0 left-0 pointer-events-none"
              style={{ width: leftPx, background: overlayColor, borderRight: `${1 / zoom.scale}px solid ${handleColor}` }}
            />
            <div
              className="absolute top-0 bottom-0 right-0 pointer-events-none"
              style={{ width: rightPx, background: overlayColor, borderLeft: `${1 / zoom.scale}px solid ${handleColor}` }}
            />


            {/* Draggable handles */}
            <div
              className="absolute z-10"
              style={{ top: topPx - HANDLE_THICKNESS, left: 0, right: 0, height: HANDLE_THICKNESS * 2, cursor: "ns-resize", touchAction: "none" }}
              onMouseDown={(e) => onMouseDown(e, "top")}
            />
            <div
              className="absolute z-10"
              style={{ bottom: bottomPx - HANDLE_THICKNESS, left: 0, right: 0, height: HANDLE_THICKNESS * 2, cursor: "ns-resize", touchAction: "none" }}
              onMouseDown={(e) => onMouseDown(e, "bottom")}
            />
            <div
              className="absolute z-10"
              style={{ left: leftPx - HANDLE_THICKNESS, top: 0, bottom: 0, width: HANDLE_THICKNESS * 2, cursor: "ew-resize", touchAction: "none" }}
              onMouseDown={(e) => onMouseDown(e, "left")}
            />
            <div
              className="absolute z-10"
              style={{ right: rightPx - HANDLE_THICKNESS, top: 0, bottom: 0, width: HANDLE_THICKNESS * 2, cursor: "ew-resize", touchAction: "none" }}
              onMouseDown={(e) => onMouseDown(e, "right")}
            />

            {/* Hint when no crop set */}
            {!hasCrop && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
        </div>

        {/* Pixel inputs */}
        <div className="flex flex-col gap-1.5 w-32 shrink-0">
          {(["top", "right", "bottom", "left"] as const).map((edge) => (
            <div key={edge} className="flex flex-col gap-0.5">
              <span className="label-mono capitalize">{edge}</span>
              <div
                className="flex items-center gap-1 px-2 py-1 rounded"
                style={{
                  background: "hsl(var(--muted))",
                  border: `1px solid ${crop[edge] > 0 ? "hsl(var(--primary) / 0.5)" : "hsl(var(--border))"}`,
                }}
              >
                <input
                  type="number"
                  min={0}
                  value={crop[edge]}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                    onChange({ ...crop, [edge]: val });
                  }}
                  className="w-full bg-transparent font-mono text-xs font-semibold outline-none min-w-0"
                  style={{ color: crop[edge] > 0 ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}
                />
                <span className="label-mono shrink-0">px</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
