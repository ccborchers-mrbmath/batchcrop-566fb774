import { useRef, useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Region } from "@/lib/cropImage";
import { useZoom } from "@/hooks/useZoom";
import { ZoomControls } from "@/components/ZoomControls";

interface RegionEditorProps {
  imageUrl: string;
  imageName: string;
  naturalWidth: number;
  naturalHeight: number;
  croppedWidth: number;
  croppedHeight: number;
  regions: Region[];
  onChange: (regions: Region[]) => void;
}

interface DrawState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export function RegionEditor({
  imageUrl,
  imageName,
  naturalWidth,
  naturalHeight,
  croppedWidth,
  croppedHeight,
  regions,
  onChange,
}: RegionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const isDrawing = useRef(false);

  const { zoom, setScale, reset, zoomIn, zoomOut, onPanMouseDown, MIN_SCALE, MAX_SCALE } =
    useZoom(containerRef as React.RefObject<HTMLElement>);

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

  // Scale: display px → real px on the CROPPED image
  const scaleX = displaySize.w > 0 ? croppedWidth / displaySize.w : 1;
  const scaleY = displaySize.h > 0 ? croppedHeight / displaySize.h : 1;

  const clampDisplay = (v: number, max: number) => Math.max(0, Math.min(v, max));

  const getRelativePos = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const img = imgRef.current;
      if (!img) return { x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      // getBoundingClientRect already accounts for CSS transform scale
      return {
        x: clampDisplay((e.clientX - rect.left) / zoom.scale, displaySize.w),
        y: clampDisplay((e.clientY - rect.top) / zoom.scale, displaySize.h),
      };
    },
    [displaySize, zoom.scale]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only draw with left button; if zoomed and not drawing, let pan take over
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
      // If we're inside the image, start drawing; otherwise pan
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (inside) {
        onMouseDown(e);
      } else if (zoom.scale > 1) {
        onPanMouseDown(e);
      }
    },
    [onMouseDown, onPanMouseDown, zoom.scale]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDrawing.current || !drawing) return;
      const { x, y } = getRelativePos(e);
      setDrawing((d) => (d ? { ...d, curX: x, curY: y } : null));
    };

    const onUp = () => {
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
  }, [drawing, scaleX, scaleY, regions, onChange, getRelativePos]);

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="label-mono">Draw regions — click &amp; drag on the image</p>
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
          cursor: zoom.scale > 1 ? "crosshair" : "crosshair",
        }}
        onMouseDown={onContainerMouseDown}
      >
        {/* Zoomed inner wrapper */}
        <div
          style={{
            transform: `scale(${zoom.scale}) translate(${zoom.offsetX / zoom.scale}px, ${zoom.offsetY / zoom.scale}px)`,
            transformOrigin: "center center",
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

          {/* Saved regions */}
          {displaySize.w > 0 &&
            regions.map((r, i) => {
              const d = regionDisplayRect(r);
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
                    background: `${regionColor.replace(")", " / 0.12)")}`,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    className="absolute top-0.5 left-1 label-mono"
                    style={{ color: regionColor, pointerEvents: "none", fontSize: "0.6rem" }}
                  >
                    R{i + 1}
                  </span>
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
              <span className="label-mono" style={{ color: regionColor }}>
                R{i + 1}
              </span>
              <span className="label-mono">
                {r.w} × {r.h} px &nbsp;@ ({r.x}, {r.y})
              </span>
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
