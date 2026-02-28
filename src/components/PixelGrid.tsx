import { Grid3X3 } from "lucide-react";

interface PixelGridOverlayProps {
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  zoomScale: number;
}

/**
 * Multi-level grid overlay inspired by Paint.NET.
 * - Coarse grid (every N image-pixels) always visible when enabled
 * - Fine per-pixel grid appears when zoomed in enough
 */
export function PixelGridOverlay({
  displayWidth,
  displayHeight,
  naturalWidth,
  naturalHeight,
  zoomScale,
}: PixelGridOverlayProps) {
  if (displayWidth <= 0 || displayHeight <= 0 || naturalWidth <= 0 || naturalHeight <= 0)
    return null;

  // Size of one image pixel in display coordinates (before zoom)
  const pxW = displayWidth / naturalWidth;
  const pxH = displayHeight / naturalHeight;

  // Visual size of one image pixel on screen
  const visPxW = pxW * zoomScale;
  const visPxH = pxH * zoomScale;

  // Determine grid spacing: pick the largest interval whose visual cell size ≥ 8px
  const intervals = [1, 5, 10, 25, 50, 100, 250, 500];
  let spacingPx = 100; // fallback in image pixels
  for (let i = 0; i < intervals.length; i++) {
    const s = intervals[i];
    if (s * visPxW >= 8 && s * visPxH >= 8) {
      spacingPx = s;
      break;
    }
  }

  const cellW = pxW * spacingPx;
  const cellH = pxH * spacingPx;

  // Per-pixel grid: only when each pixel is ≥ 4px on screen
  const showPixelGrid = visPxW >= 4 && visPxH >= 4;

  const coarseId = `grid-coarse-${Math.round(cellW * 100)}-${Math.round(cellH * 100)}`;
  const fineId = `grid-fine-${Math.round(pxW * 1000)}-${Math.round(pxH * 1000)}`;

  return (
    <svg
      className="absolute left-0 top-0 pointer-events-none"
      width={displayWidth}
      height={displayHeight}
      style={{ zIndex: 5 }}
    >
      <defs>
        {/* Coarse grid pattern */}
        <pattern
          id={coarseId}
          width={cellW}
          height={cellH}
          patternUnits="userSpaceOnUse"
        >
          <line x1={cellW} y1="0" x2={cellW} y2={cellH} stroke="hsl(var(--primary))" strokeWidth={Math.max(0.3, 0.6 / zoomScale)} strokeOpacity="0.35" />
          <line x1="0" y1={cellH} x2={cellW} y2={cellH} stroke="hsl(var(--primary))" strokeWidth={Math.max(0.3, 0.6 / zoomScale)} strokeOpacity="0.35" />
        </pattern>
        {/* Fine per-pixel pattern */}
        {showPixelGrid && (
          <pattern
            id={fineId}
            width={pxW}
            height={pxH}
            patternUnits="userSpaceOnUse"
          >
            <line x1={pxW} y1="0" x2={pxW} y2={pxH} stroke="hsl(var(--foreground))" strokeWidth={Math.max(0.2, 0.4 / zoomScale)} strokeOpacity="0.2" />
            <line x1="0" y1={pxH} x2={pxW} y2={pxH} stroke="hsl(var(--foreground))" strokeWidth={Math.max(0.2, 0.4 / zoomScale)} strokeOpacity="0.2" />
          </pattern>
        )}
      </defs>
      {/* Coarse grid */}
      <rect width="100%" height="100%" fill={`url(#${coarseId})`} />
      {/* Fine pixel grid */}
      {showPixelGrid && <rect width="100%" height="100%" fill={`url(#${fineId})`} />}
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
      title="Toggle grid overlay"
    >
      <Grid3X3 size={12} />
      Grid
    </button>
  );
}
