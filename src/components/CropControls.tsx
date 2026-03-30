import { useState } from "react";
import { Link, Scissors, Square } from "lucide-react";
import { CropValues, CropMode } from "@/lib/cropImage";

export type { CropValues, CropMode };

interface CropControlsProps {
  values: CropValues;
  onChange: (values: CropValues) => void;
  mode: CropMode;
  onModeChange: (mode: CropMode) => void;
}

export function CropControls({ values, onChange }: CropControlsProps) {
  const [linked, setLinked] = useState(true);

  const handleChange = (edge: keyof CropValues, raw: string) => {
    const val = Math.max(0, parseInt(raw, 10) || 0);
    if (linked) {
      onChange({ top: val, right: val, bottom: val, left: val });
    } else {
      onChange({ ...values, [edge]: val });
    }
  };

  return (
    <div className="space-y-4">
      {/* Linked toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLinked(!linked)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            linked
              ? "bg-primary/20 text-primary border border-primary/30"
              : "btn-secondary text-sm"
          }`}
        >
          <Link size={12} className={linked ? "text-primary" : ""} />
          {linked ? "All edges linked" : "Edges independent"}
        </button>
      </div>

      {/* Cross layout */}
      <div className="relative flex flex-col items-center gap-2 select-none">
        {/* Top */}
        <EdgeInput label="TOP" value={values.top} onChange={(v) => handleChange("top", v)} />

        <div className="flex items-center gap-2">
          {/* Left */}
          <EdgeInput label="LEFT" value={values.left} onChange={(v) => handleChange("left", v)} />

          {/* Center indicator */}
          <div
            className="w-16 h-12 rounded flex items-center justify-center"
            style={{
              background: "hsl(var(--muted))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <div
              className="rounded-sm"
              style={{
                width: 24,
                height: 16,
                background: "hsl(var(--primary) / 0.3)",
                border: "1px solid hsl(var(--primary) / 0.5)",
              }}
            />
          </div>

          {/* Right */}
          <EdgeInput label="RIGHT" value={values.right} onChange={(v) => handleChange("right", v)} />
        </div>

        {/* Bottom */}
        <EdgeInput label="BOTTOM" value={values.bottom} onChange={(v) => handleChange("bottom", v)} />
      </div>
    </div>
  );
}

function EdgeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="label-mono">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="crop-input w-20 h-9 text-sm px-2"
        />
        <span className="label-mono">px</span>
      </div>
    </div>
  );
}
