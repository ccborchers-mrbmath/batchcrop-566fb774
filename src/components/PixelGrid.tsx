import { Grid3X3 } from "lucide-react";

interface PixelGridOverlayProps {
  width: number;
  height: number;
}

/** Renders a subtle grid overlay across the image preview area */
export function PixelGridOverlay({ width, height }: PixelGridOverlayProps) {
  if (width <= 0 || height <= 0) return null;

  // Use a 3×3 grid (rule of thirds) plus a finer subdivided grid
  const MAJOR_COLS = 3;
  const MAJOR_ROWS = 3;
  const MINOR_COLS = 12;
  const MINOR_ROWS = 12;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {/* Minor grid lines */}
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0"
        style={{ opacity: 0.15 }}
      >
        {Array.from({ length: MINOR_COLS - 1 }, (_, i) => {
          const x = ((i + 1) / MINOR_COLS) * 100;
          return (
            <line
              key={`mv${i}`}
              x1={`${x}%`}
              y1="0"
              x2={`${x}%`}
              y2="100%"
              stroke="hsl(var(--foreground))"
              strokeWidth="0.5"
            />
          );
        })}
        {Array.from({ length: MINOR_ROWS - 1 }, (_, i) => {
          const y = ((i + 1) / MINOR_ROWS) * 100;
          return (
            <line
              key={`mh${i}`}
              x1="0"
              y1={`${y}%`}
              x2="100%"
              y2={`${y}%`}
              stroke="hsl(var(--foreground))"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>
      {/* Major grid lines (rule of thirds) */}
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0"
        style={{ opacity: 0.3 }}
      >
        {Array.from({ length: MAJOR_COLS - 1 }, (_, i) => {
          const x = ((i + 1) / MAJOR_COLS) * 100;
          return (
            <line
              key={`v${i}`}
              x1={`${x}%`}
              y1="0"
              x2={`${x}%`}
              y2="100%"
              stroke="hsl(var(--foreground))"
              strokeWidth="1"
            />
          );
        })}
        {Array.from({ length: MAJOR_ROWS - 1 }, (_, i) => {
          const y = ((i + 1) / MAJOR_ROWS) * 100;
          return (
            <line
              key={`h${i}`}
              x1="0"
              y1={`${y}%`}
              x2="100%"
              y2={`${y}%`}
              stroke="hsl(var(--foreground))"
              strokeWidth="1"
            />
          );
        })}
      </svg>
    </div>
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
