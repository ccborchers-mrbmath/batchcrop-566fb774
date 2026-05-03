import { useRef, useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react";
import { useZoom } from "@/hooks/useZoom";
import { ZoomControls } from "@/components/ZoomControls";

interface SplitEditorProps {
  imageUrl: string;
  imageName: string;
  croppedWidth: number;
  croppedHeight: number;
  splits: number[]; // y-coords in real (cropped) pixels
  onChange: (splits: number[]) => void;
  onRemove?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalImages?: number;
}

const LINE_HIT = 8; // px hit area around line

export function SplitEditor({
  imageUrl,
  imageName,
  croppedWidth,
  croppedHeight,
  splits,
  onChange,
  onRemove,
  onPrev,
  onNext,
  currentIndex,
  totalImages,
}: SplitEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const dragIdx = useRef<number | null>(null);

  const { zoom, setScale, reset, zoomIn, zoomOut, onPanMouseDown, MIN_SCALE, MAX_SCALE } =
    useZoom(containerRef);

  const updateDisplaySize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setDisplaySize({ w: img.offsetWidth, h: img.offsetHeight });
  }, []);

  useEffect(() => { setDisplaySize({ w: 0, h: 0 }); }, [imageUrl]);

  useEffect(() => {
    const observer = new ResizeObserver(updateDisplaySize);
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [updateDisplaySize]);

  const scaleY = displaySize.h > 0 ? croppedHeight / displaySize.h : 1;

  const sortedSplits = [...splits].sort((a, b) => a - b);

  const getRelativeY = useCallback((e: MouseEvent | React.MouseEvent) => {
    const img = imgRef.current;
    if (!img) return 0;
    const rect = img.getBoundingClientRect();
    return Math.max(0, Math.min(displaySize.h, (e.clientY - rect.top) / zoom.scale));
  }, [displaySize.h, zoom.scale]);

  // Click on empty image → add a split line at that y
  const onImageMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (dragIdx.current !== null) return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (!inside) {
      if (zoom.scale > 1) onPanMouseDown(e);
      return;
    }
    const yDisp = getRelativeY(e);
    const yReal = Math.round(yDisp * scaleY);
    if (yReal <= 0 || yReal >= croppedHeight) return;
    onChange([...splits, yReal]);
  }, [getRelativeY, scaleY, croppedHeight, splits, onChange, zoom.scale, onPanMouseDown]);

  // Drag a split line
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragIdx.current === null) return;
      const yDisp = getRelativeY(e);
      const yReal = Math.max(1, Math.min(croppedHeight - 1, Math.round(yDisp * scaleY)));
      const next = [...splits];
      next[dragIdx.current] = yReal;
      onChange(next);
    };
    const onUp = () => { dragIdx.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [splits, onChange, scaleY, croppedHeight, getRelativeY]);

  const removeAt = (idx: number) => onChange(splits.filter((_, i) => i !== idx));

  const lineColor = "hsl(280 80% 60%)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(onPrev || onNext) && (
            <div className="flex items-center gap-1 mr-2">
              <button onClick={onPrev} disabled={!onPrev}
                className="w-6 h-6 rounded flex items-center justify-center transition-opacity disabled:opacity-25"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                title="Previous image">
                <ChevronLeft size={14} />
              </button>
              <span className="label-mono tabular-nums" style={{ minWidth: 40, textAlign: "center" }}>
                {(currentIndex ?? 0) + 1}/{totalImages ?? 0}
              </span>
              <button onClick={onNext} disabled={!onNext}
                className="w-6 h-6 rounded flex items-center justify-center transition-opacity disabled:opacity-25"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                title="Next image">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <p className="label-mono">Click image to add a horizontal split — drag lines to move</p>
          {onRemove && (
            <button onClick={onRemove}
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-80"
              style={{ background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))" }}
              title="Remove image">
              <X size={11} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onChange([...splits, Math.round(croppedHeight / 2)])}
            className="label-mono flex items-center gap-1 hover:text-primary transition-colors"
            style={{ color: "hsl(var(--muted-foreground))" }}
            title="Add a split line at the vertical center"
          >
            <Plus size={11} /> Add split
          </button>
          <ZoomControls
            scale={zoom.scale} min={MIN_SCALE} max={MAX_SCALE}
            onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={reset}
            onSliderChange={(v) => setScale(v)}
          />
          {splits.length > 0 && (
            <button
              className="label-mono hover:text-primary transition-colors"
              style={{ color: "hsl(var(--muted-foreground))" }}
              onClick={() => onChange([])}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded"
        style={{
          border: "1px solid hsl(var(--border))",
          cursor: zoom.scale > 1 ? "grab" : "crosshair",
        }}
        onMouseDown={onImageMouseDown}
      >
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
            style={{ display: "block" }}
          />

          {displaySize.w > 0 && splits.map((y, i) => {
            const yPx = (y / croppedHeight) * displaySize.h;
            return (
              <div key={i}>
                {/* Hit/drag area */}
                <div
                  className="absolute group"
                  style={{
                    left: 0, right: 0,
                    top: yPx - LINE_HIT,
                    height: LINE_HIT * 2,
                    cursor: "ns-resize",
                    zIndex: 5,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragIdx.current = i;
                  }}
                >
                  {/* Visible line */}
                  <div
                    className="absolute left-0 right-0"
                    style={{
                      top: LINE_HIT - 1,
                      height: 2,
                      background: lineColor,
                      boxShadow: `0 0 0 1px hsl(var(--background) / 0.5)`,
                    }}
                  />
                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAt(i); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute opacity-0 group-hover:opacity-100 transition-opacity rounded-full flex items-center justify-center"
                    style={{
                      right: 4,
                      top: LINE_HIT - 8,
                      width: 16, height: 16,
                      background: "hsl(var(--destructive))",
                      color: "hsl(var(--destructive-foreground))",
                      zIndex: 6,
                    }}
                    title="Remove split"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            );
          })}

          {splits.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p
                className="label-mono text-center px-3 py-1.5 rounded"
                style={{
                  background: "hsl(var(--background) / 0.75)",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                Click anywhere on the image to add a horizontal split line
              </p>
            </div>
          )}
        </div>
      </div>

      {sortedSplits.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="label-mono">
            Will produce <span style={{ color: "hsl(var(--foreground))" }}>{sortedSplits.length + 1}</span> image{sortedSplits.length + 1 !== 1 ? "s" : ""}
          </p>
          {splits.map((y, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-3 py-1.5 rounded"
              style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
            >
              <span className="label-mono" style={{ color: lineColor }}>Line {i + 1}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={croppedHeight - 1}
                  value={y}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(croppedHeight - 1, parseInt(e.target.value, 10) || 0));
                    const next = [...splits];
                    next[i] = v;
                    onChange(next);
                  }}
                  className="w-20 bg-transparent font-mono text-xs font-semibold outline-none text-right"
                  style={{ color: "hsl(var(--foreground))" }}
                />
                <span className="label-mono">px</span>
              </div>
              <button
                onClick={() => removeAt(i)}
                className="flex items-center justify-center w-5 h-5 rounded transition-opacity opacity-60 hover:opacity-100"
                style={{ color: "hsl(var(--destructive))" }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
