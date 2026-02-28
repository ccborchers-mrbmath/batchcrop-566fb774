import { useRef, useCallback, useEffect, useState } from "react";
import { Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Region } from "@/lib/cropImage";
import { useZoom } from "@/hooks/useZoom";
import { ZoomControls } from "@/components/ZoomControls";
import { PixelGridOverlay, GridToggle } from "@/components/PixelGrid";

interface RegionEditorProps {
  imageUrl: string;
  imageName: string;
  naturalWidth: number;
  naturalHeight: number;
  croppedWidth: number;
  croppedHeight: number;
  regions: Region[];
  onChange: (regions: Region[]) => void;
  onRemove?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalImages?: number;
}

interface DrawState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

interface ResizeState {
  regionId: string;
  handle: ResizeHandle;
  startX: number; // display px (pre-zoom)
  startY: number;
  startRegion: { x: number; y: number; w: number; h: number }; // real px
}

const HANDLE_SIZE = 9; // px, visual size of corner/edge handles
const MIN_REGION_PX = 5; // minimum real px for width/height

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nw-resize", n: "n-resize", ne: "ne-resize",
  e: "e-resize", se: "se-resize", s: "s-resize",
  sw: "sw-resize", w: "w-resize", move: "move",
};

export function RegionEditor({
  imageUrl,
  imageName,
  naturalWidth,
  naturalHeight,
  croppedWidth,
  croppedHeight,
  regions,
  onChange,
  onRemove,
  onPrev,
  onNext,
  currentIndex,
  totalImages,
}: RegionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const isDrawing = useRef(false);
  const resizing = useRef<ResizeState | null>(null);

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

  // Scale: display px → real px on the CROPPED image
  const scaleX = displaySize.w > 0 ? croppedWidth / displaySize.w : 1;
  const scaleY = displaySize.h > 0 ? croppedHeight / displaySize.h : 1;

  const clampDisplay = (v: number, max: number) => Math.max(0, Math.min(v, max));

  // Returns position in "original display px" (before zoom scaling)
  const getRelativePos = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const img = imgRef.current;
      if (!img) return { x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      return {
        x: clampDisplay((e.clientX - rect.left) / zoom.scale, displaySize.w),
        y: clampDisplay((e.clientY - rect.top) / zoom.scale, displaySize.h),
      };
    },
    [displaySize, zoom.scale]
  );

  // ── Resize / move handlers ──────────────────────────────────────────────
  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, regionId: string, handle: ResizeHandle) => {
      e.preventDefault();
      e.stopPropagation();
      const region = regions.find((r) => r.id === regionId);
      if (!region) return;
      const { x, y } = getRelativePos(e);
      resizing.current = {
        regionId,
        handle,
        startX: x,
        startY: y,
        startRegion: { x: region.x, y: region.y, w: region.w, h: region.h },
      };
    },
    [regions, getRelativePos]
  );

  // ── Draw handlers ───────────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      isDrawing.current = true;
      const { x, y } = getRelativePos(e);
      setDrawing({ startX: x, startY: y, curX: x, curY: y });
    },
    [getRelativePos]
  );

  const onContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom;

      if (inside) {
        // Start drawing a region; panning will still work via onPanMouseDown
        // attached to the container for the zoomed-out-of-image area
        onMouseDown(e);
      }
      // Always allow pan when zoomed, regardless of where the click lands
      if (zoom.scale > 1) {
        onPanMouseDown(e);
      }
    },
    [onMouseDown, onPanMouseDown, zoom.scale]
  );

  // ── Global mouse move / up ──────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Handle resize / move
      if (resizing.current) {
        const { regionId, handle, startX, startY, startRegion } = resizing.current;
        const { x, y } = getRelativePos(e);
        const dx = (x - startX) * scaleX; // real px delta
        const dy = (y - startY) * scaleY;

        let { x: rx, y: ry, w: rw, h: rh } = startRegion;

        if (handle === "move") {
          rx = Math.max(0, Math.min(croppedWidth - rw, rx + dx));
          ry = Math.max(0, Math.min(croppedHeight - rh, ry + dy));
        }
        if (handle === "nw" || handle === "n" || handle === "ne") {
          const newY = ry + dy;
          const newH = rh - dy;
          if (newH >= MIN_REGION_PX) { ry = newY; rh = newH; }
        }
        if (handle === "sw" || handle === "s" || handle === "se") {
          rh = Math.max(MIN_REGION_PX, rh + dy);
        }
        if (handle === "nw" || handle === "w" || handle === "sw") {
          const newX = rx + dx;
          const newW = rw - dx;
          if (newW >= MIN_REGION_PX) { rx = newX; rw = newW; }
        }
        if (handle === "ne" || handle === "e" || handle === "se") {
          rw = Math.max(MIN_REGION_PX, rw + dx);
        }

        // Clamp to image bounds
        rx = Math.max(0, rx);
        ry = Math.max(0, ry);
        if (rx + rw > croppedWidth) rw = croppedWidth - rx;
        if (ry + rh > croppedHeight) rh = croppedHeight - ry;

        onChange(
          regions.map((r) =>
            r.id === regionId
              ? { ...r, x: Math.round(rx), y: Math.round(ry), w: Math.round(rw), h: Math.round(rh) }
              : r
          )
        );
        return;
      }

      // Handle drawing
      if (!isDrawing.current || !drawing) return;
      const { x, y } = getRelativePos(e);
      setDrawing((d) => (d ? { ...d, curX: x, curY: y } : null));
    };

    const onUp = () => {
      // Finish resize
      if (resizing.current) {
        resizing.current = null;
        return;
      }

      // Finish drawing
      if (!isDrawing.current || !drawing) {
        isDrawing.current = false;
        return;
      }
      isDrawing.current = false;

      const x1 = Math.min(drawing.startX, drawing.curX);
      const y1 = Math.min(drawing.startY, drawing.curY);
      const x2 = Math.max(drawing.startX, drawing.curX);
      const y2 = Math.max(drawing.startY, drawing.curY);
      const wPx = x2 - x1;
      const hPx = y2 - y1;

      if (wPx >= 5 && hPx >= 5) {
        const newRegion: Region = {
          id: `${Date.now()}-${Math.random()}`,
          x: Math.round(x1 * scaleX),
          y: Math.round(y1 * scaleY),
          w: Math.round(wPx * scaleX),
          h: Math.round(hPx * scaleY),
        };
        onChange([...regions, newRegion]);
      }
      setDrawing(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drawing, scaleX, scaleY, regions, onChange, getRelativePos, croppedWidth, croppedHeight]);

  const removeRegion = (id: string) => onChange(regions.filter((r) => r.id !== id));

  const regionDisplayRect = (r: Region) => ({
    left: r.x / scaleX,
    top: r.y / scaleY,
    width: r.w / scaleX,
    height: r.h / scaleY,
  });

  const liveRect = drawing
    ? {
        left: Math.min(drawing.startX, drawing.curX),
        top: Math.min(drawing.startY, drawing.curY),
        width: Math.abs(drawing.curX - drawing.startX),
        height: Math.abs(drawing.curY - drawing.startY),
      }
    : null;

  const regionColor = "hsl(120 70% 55%)";
  const handleBg = "hsl(var(--background))";

  // Build the 8 resize handles + 1 move handle for a region rect
  const buildHandles = (r: Region, d: ReturnType<typeof regionDisplayRect>) => {
    const hs = HANDLE_SIZE;
    const hh = hs / 2;

    const handles: Array<{ key: ResizeHandle; style: React.CSSProperties }> = [
      // corners
      { key: "nw", style: { left: -hh, top: -hh, width: hs, height: hs, cursor: "nw-resize" } },
      { key: "ne", style: { right: -hh, top: -hh, width: hs, height: hs, cursor: "ne-resize" } },
      { key: "se", style: { right: -hh, bottom: -hh, width: hs, height: hs, cursor: "se-resize" } },
      { key: "sw", style: { left: -hh, bottom: -hh, width: hs, height: hs, cursor: "sw-resize" } },
      // edges
      { key: "n", style: { left: "50%", transform: "translateX(-50%)", top: -hh, width: hs, height: hs, cursor: "n-resize" } },
      { key: "s", style: { left: "50%", transform: "translateX(-50%)", bottom: -hh, width: hs, height: hs, cursor: "s-resize" } },
      { key: "w", style: { top: "50%", transform: "translateY(-50%)", left: -hh, width: hs, height: hs, cursor: "w-resize" } },
      { key: "e", style: { top: "50%", transform: "translateY(-50%)", right: -hh, width: hs, height: hs, cursor: "e-resize" } },
    ];

    return handles;
  };

  return (
    <div className="flex flex-col gap-3">
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
          <p className="label-mono">Draw regions — click &amp; drag on the image</p>
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
          {regions.length > 0 && (
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

      {/* Image + overlay */}
      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded"
        style={{
          border: "1px solid hsl(var(--border))",
          cursor: zoom.scale > 1 ? "grab" : "crosshair",
        }}
        onMouseDown={onContainerMouseDown}
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
            style={{ display: "block" }}
          />

          {/* Pixel grid overlay */}
          {showGrid && <PixelGridOverlay displayWidth={displaySize.w} displayHeight={displaySize.h} naturalWidth={croppedWidth} naturalHeight={croppedHeight} />}

          {/* Saved regions with resize handles */}
          {displaySize.w > 0 &&
            regions.map((r, i) => {
              const d = regionDisplayRect(r);
              const handles = buildHandles(r, d);
              return (
                <div
                  key={r.id}
                  className="absolute"
                  style={{
                    left: d.left,
                    top: d.top,
                    width: d.width,
                    height: d.height,
                    border: `2px solid ${regionColor}`,
                    background: `${regionColor.replace(")", " / 0.08)")}`,
                    pointerEvents: "none",
                  }}
                >
                  {/* Label */}
                  <span
                    className="absolute top-0.5 left-1 label-mono pointer-events-none"
                    style={{ color: regionColor, fontSize: "0.6rem" }}
                  >
                    R{i + 1}
                  </span>

                  {/* Move handle (body) */}
                  <div
                    className="absolute inset-2"
                    style={{ cursor: "move", pointerEvents: "auto" }}
                    onMouseDown={(e) => onHandleMouseDown(e, r.id, "move")}
                    title="Drag to move"
                  />

                  {/* Resize handles */}
                  {handles.map(({ key, style }) => (
                    <div
                      key={key}
                      className="absolute rounded-sm"
                      style={{
                        ...style,
                        width: HANDLE_SIZE,
                        height: HANDLE_SIZE,
                        background: handleBg,
                        border: `2px solid ${regionColor}`,
                        pointerEvents: "auto",
                        zIndex: 10,
                      }}
                      onMouseDown={(e) => onHandleMouseDown(e, r.id, key)}
                    />
                  ))}
                </div>
              );
            })}

          {/* Live drawing rect */}
          {liveRect && liveRect.width > 0 && liveRect.height > 0 && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: liveRect.left,
                top: liveRect.top,
                width: liveRect.width,
                height: liveRect.height,
                border: `2px dashed ${regionColor}`,
                background: `${regionColor.replace(")", " / 0.08)")}`,
              }}
            />
          )}

          {regions.length === 0 && !drawing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p
                className="label-mono text-center px-3 py-1.5 rounded"
                style={{
                  background: "hsl(var(--background) / 0.75)",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                Click &amp; drag to define a region
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Region list */}
      {regions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {regions.map((r, i) => (
            <div
              key={r.id}
              className="flex items-center justify-between px-3 py-1.5 rounded"
              style={{
                background: "hsl(var(--muted))",
                border: "1px solid hsl(var(--border))",
              }}
            >
              <span className="label-mono" style={{ color: regionColor }}>R{i + 1}</span>
              <span className="label-mono">{r.w} × {r.h} px &nbsp;@ ({r.x}, {r.y})</span>
              <button
                onClick={() => removeRegion(r.id)}
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
