import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface ZoomControlsProps {
  scale: number;
  min: number;
  max: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onSliderChange: (value: number) => void;
}

export function ZoomControls({
  scale,
  min,
  max,
  onZoomIn,
  onZoomOut,
  onReset,
  onSliderChange,
}: ZoomControlsProps) {
  const isZoomed = scale > 1;
  const pct = Math.round(scale * 100);

  return (
    <div className="flex items-center gap-2 select-none">
      <button
        onClick={onZoomOut}
        disabled={scale <= min}
        className="flex items-center justify-center w-6 h-6 rounded transition-opacity disabled:opacity-30"
        style={{ color: "hsl(var(--muted-foreground))" }}
        title="Zoom out"
      >
        <ZoomOut size={14} />
      </button>

      <div className="w-24">
        <Slider
          min={min}
          max={max}
          step={0.05}
          value={[scale]}
          onValueChange={([v]) => onSliderChange(v)}
        />
      </div>

      <button
        onClick={onZoomIn}
        disabled={scale >= max}
        className="flex items-center justify-center w-6 h-6 rounded transition-opacity disabled:opacity-30"
        style={{ color: "hsl(var(--muted-foreground))" }}
        title="Zoom in"
      >
        <ZoomIn size={14} />
      </button>

      <span
        className="label-mono w-10 text-right tabular-nums"
        style={{ color: isZoomed ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
      >
        {pct}%
      </span>

      <button
        onClick={onReset}
        disabled={scale === 1 && true === false ? true : false}
        className="flex items-center justify-center w-6 h-6 rounded transition-opacity opacity-60 hover:opacity-100 disabled:opacity-30"
        style={{ color: isZoomed ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
        title="Reset zoom"
      >
        <Maximize2 size={12} />
      </button>
    </div>
  );
}
