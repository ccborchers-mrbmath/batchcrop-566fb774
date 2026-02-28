import { Grid3X3 } from "lucide-react";

interface PixelGridOverlayProps {
  /** Displayed width of the image element in CSS px */
  displayWidth: number;
  /** Displayed height of the image element in CSS px */
  displayHeight: number;
  /** Natural width of the source image in real pixels */
  naturalWidth: number;
  /** Natural height of the source image in real pixels */
  naturalHeight: number;
}

/**
 * Renders a true pixel-level grid overlay like Paint.NET.
 * Each cell corresponds to one pixel of the source image.
 * Only renders when cells are large enough to be visible (≥4px).
 */
export function PixelGridOverlay({
  displayWidth,
  displayHeight,
  naturalWidth,
  naturalHeight,
}: PixelGridOverlayProps) {
  if (displayWidth <= 0 || displayHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0)
    return null;

  // Size of one image pixel in display coordinates
  const cellW = displayWidth / naturalWidth;
  const cellH = displayHeight / naturalHeight;

  // Don't render if cells are too small to see
  if (cellW < 4 || cellH < 4) return null;

  const patternId = `pixel-grid-${Math.round(cellW * 100)}`;

  return (
    <svg
      className="absolute left-0 top-0 pointer-events-none"
      width={displayWidth}
      height={displayHeight}
      style={{ zIndex: 5 }}
    >
      <defs>
        <pattern
          id={patternId}
          width={cellW}
          height={cellH}
          patternUnits="userSpaceOnUse"
        >
          <rect
            x={0}
            y={0}
            width={cellW}
            height={cellH}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeWidth="0.5"
            strokeOpacity="0.25"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}

/** Small toggle button for showing/hiding the grid */
export function GridToggle({
  show,
  onToggle,
}: {
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors"
      style={{
        background: show ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
        border: `1px solid ${show ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}`,
        color: show ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
      }}
      title="Toggle pixel grid (visible when zoomed in)"
    >
      <Grid3X3 size={12} />
      Grid
    </button>
  );
}
