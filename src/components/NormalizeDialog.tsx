import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { ASPECT_PRESETS, AspectPreset } from "@/lib/normalizeImages";

interface NormalizeDialogProps {
  /** IDs and current dimensions of images in the batch */
  sizes: Record<string, { w: number; h: number }>;
  /** Called with the chosen target dimensions — parent handles the actual resize */
  onConfirm: (preset: AspectPreset) => Promise<void>;
  /** Called when the user chooses to skip normalisation */
  onSkip: () => void;
}

export function NormalizeDialog({ sizes, onConfirm, onSkip }: NormalizeDialogProps) {
  const [selected, setSelected] = useState<AspectPreset>(ASPECT_PRESETS[0]);
  const [busy, setBusy] = useState(false);

  // Summarise the distinct sizes found in the batch
  const distinct = Object.values(sizes).reduce<Map<string, { w: number; h: number; count: number }>>(
    (acc, s) => {
      const sig = `${s.w}×${s.h}`;
      const existing = acc.get(sig);
      acc.set(sig, { w: s.w, h: s.h, count: (existing?.count ?? 0) + 1 });
      return acc;
    },
    new Map()
  );

  const handleConfirm = async () => {
    setBusy(true);
    await onConfirm(selected);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "hsl(var(--background) / 0.85)", backdropFilter: "blur(4px)" }}>
      <div
        className="w-full max-w-md rounded-xl p-6 flex flex-col gap-5"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 20px 60px hsl(0 0% 0% / 0.4)" }}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.3)" }}
          >
            <AlertTriangle size={16} style={{ color: "hsl(var(--primary))" }} />
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>
              Mixed image dimensions detected
            </h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              Your batch contains images with different sizes. Normalise them to a
              common size so the crop area is applied consistently.
            </p>
          </div>
        </div>

        {/* Distinct sizes found */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid hsl(var(--border))" }}>
          <div className="px-3 py-2" style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
            <span className="label-mono">Sizes found in batch</span>
          </div>
          <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {Array.from(distinct.values()).map((d) => (
              <div key={`${d.w}x${d.h}`} className="flex items-center justify-between px-3 py-2">
                <span className="font-mono text-xs" style={{ color: "hsl(var(--foreground))" }}>
                  {d.w} × {d.h} px
                </span>
                <span className="label-mono">{d.count} image{d.count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Preset picker */}
        <div className="flex flex-col gap-2">
          <span className="label-mono">Normalise all images to:</span>
          <div className="flex flex-col gap-1.5">
            {ASPECT_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setSelected(p)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all"
                style={{
                  background: selected.label === p.label ? "hsl(var(--primary) / 0.1)" : "hsl(var(--muted))",
                  border: selected.label === p.label ? "1px solid hsl(var(--primary) / 0.5)" : "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    background: selected.label === p.label ? "hsl(var(--primary))" : "transparent",
                    border: `2px solid ${selected.label === p.label ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}`,
                  }}
                />
                <span className="text-xs font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onSkip}
            disabled={busy}
            className="btn-secondary px-4 py-1.5 text-sm"
          >
            Skip — keep originals
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? "Normalising…" : "Normalise & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
