import { useState, useRef, useCallback, useEffect } from "react";
import { Download, Type, GripVertical } from "lucide-react";

export interface NumberedImage {
  id: string;
  blob: Blob;
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  label: string;
  /** Position as fraction 0-1 of image dimensions */
  labelX: number;
  labelY: number;
}

export interface NumberingConfig {
  prefix: string;
  startNumber: number;
  fontFamily: string;
  fontSize: number; // px relative to image real pixels
  bold: boolean;
  padding: { top: number; right: number; bottom: number; left: number }; // px relative to image
  position: "top-left" | "top-center" | "top-right";
}

const FONT_OPTIONS = [
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Calibri", value: "Calibri" },
  { label: "Arial", value: "Arial" },
];

const POSITION_PRESETS: Record<string, { x: number; y: number }> = {
  "top-left": { x: 0.02, y: 0.02 },
  "top-center": { x: 0.45, y: 0.02 },
  "top-right": { x: 0.85, y: 0.02 },
};

interface NumberingEditorProps {
  images: NumberedImage[];
  config: NumberingConfig;
  onConfigChange: (config: NumberingConfig) => void;
  onImageUpdate: (id: string, updates: Partial<NumberedImage>) => void;
  onExport: () => void;
  onBack: () => void;
  isExporting: boolean;
}

export function NumberingEditor({
  images,
  config,
  onConfigChange,
  onImageUpdate,
  onExport,
  onBack,
  isExporting,
}: NumberingEditorProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = images[selectedIdx] ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div
        className="border-b px-6 py-3 flex items-center justify-between shrink-0"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-secondary px-3 py-1.5 text-sm">
            ← Back to crop
          </button>
          <div className="flex items-center gap-1.5">
            <Type size={14} style={{ color: "hsl(var(--primary))" }} />
            <span className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>
              Number Images
            </span>
          </div>
          <span className="label-mono">{images.length} image{images.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          onClick={onExport}
          disabled={isExporting || images.length === 0}
          className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
        >
          <Download size={13} />
          {isExporting ? "Exporting…" : images.length > 1 ? `Download ZIP (${images.length})` : "Download"}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Config sidebar */}
        <aside
          className="w-72 shrink-0 border-r flex flex-col overflow-y-auto p-5 gap-5"
          style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--card))" }}
        >
          {/* Prefix + start */}
          <div className="flex flex-col gap-2">
            <label className="label-mono">Prefix</label>
            <input
              type="text"
              value={config.prefix}
              onChange={(e) => {
                const newPrefix = e.target.value;
                onConfigChange({ ...config, prefix: newPrefix });
                images.forEach((img, i) => {
                  onImageUpdate(img.id, { label: `${newPrefix}${config.startNumber + i}` });
                });
              }}
              placeholder="e.g. Q"
              className="crop-input w-full px-3 py-2 text-sm"
              style={{ textAlign: "left" }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="label-mono">Start Number</label>
            <input
              type="number"
              min={0}
              value={config.startNumber}
              onChange={(e) => {
                const newStart = parseInt(e.target.value) || 0;
                onConfigChange({ ...config, startNumber: newStart });
                images.forEach((img, i) => {
                  onImageUpdate(img.id, { label: `${config.prefix}${newStart + i}` });
                });
              }}
              className="crop-input w-full px-3 py-2 text-sm"
            />
          </div>

          {/* Font */}
          <div className="flex flex-col gap-2">
            <label className="label-mono">Font</label>
            <select
              value={config.fontFamily}
              onChange={(e) => onConfigChange({ ...config, fontFamily: e.target.value })}
              className="crop-input w-full px-3 py-2 text-sm"
              style={{ textAlign: "left" }}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div className="flex flex-col gap-2">
            <label className="label-mono">Font Size (px)</label>
            <input
              type="number"
              min={8}
              max={200}
              value={config.fontSize}
              onChange={(e) => onConfigChange({ ...config, fontSize: Math.max(8, parseInt(e.target.value) || 24) })}
              className="crop-input w-full px-3 py-2 text-sm"
            />
          </div>

          {/* Bold toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bold-toggle"
              checked={config.bold}
              onChange={(e) => onConfigChange({ ...config, bold: e.target.checked })}
              className="accent-[hsl(var(--primary))]"
            />
            <label htmlFor="bold-toggle" className="label-mono cursor-pointer">Bold</label>
          </div>

          {/* Padding */}
          <div className="flex flex-col gap-2">
            <label className="label-mono">Padding (px)</label>
            <div className="grid grid-cols-2 gap-2">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>{side}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={config.padding[side]}
                    onChange={(e) => onConfigChange({
                      ...config,
                      padding: { ...config.padding, [side]: Math.max(0, parseInt(e.target.value) || 0) },
                    })}
                    className="crop-input w-full px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Default position */}
          <div className="flex flex-col gap-2">
            <label className="label-mono">Default Position</label>
            <div className="flex gap-1.5">
              {(["top-left", "top-center", "top-right"] as const).map((pos) => (
                <button
                  key={pos}
                  onClick={() => {
                    onConfigChange({ ...config, position: pos });
                    // Apply to all images
                    const preset = POSITION_PRESETS[pos];
                    images.forEach((img) => {
                      onImageUpdate(img.id, { labelX: preset.x, labelY: preset.y });
                    });
                  }}
                  className="flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    background: config.position === pos ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
                    border: `1px solid ${config.position === pos ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}`,
                    color: config.position === pos ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {pos === "top-left" ? "Left" : pos === "top-center" ? "Center" : "Right"}
                </button>
              ))}
            </div>
          </div>

          {/* Apply numbering button */}
          <button
            onClick={() => {
              const preset = POSITION_PRESETS[config.position];
              images.forEach((img, i) => {
                onImageUpdate(img.id, {
                  label: `${config.prefix}${config.startNumber + i}`,
                  labelX: preset.x,
                  labelY: preset.y,
                });
              });
            }}
            className="btn-primary px-3 py-2 text-sm w-full"
          >
            Apply Numbering to All
          </button>

          {/* Thumbnail list */}
          <div className="flex flex-col gap-2 mt-2">
            <label className="label-mono">Images</label>
            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedIdx(i)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-colors text-left"
                  style={{
                    background: i === selectedIdx ? "hsl(var(--primary) / 0.1)" : "hsl(var(--muted))",
                    border: `1px solid ${i === selectedIdx ? "hsl(var(--primary) / 0.3)" : "hsl(var(--border))"}`,
                    color: "hsl(var(--foreground))",
                  }}
                >
                  <img
                    src={img.previewUrl}
                    alt=""
                    className="w-10 h-8 object-cover rounded"
                    style={{ border: "1px solid hsl(var(--border))" }}
                  />
                  <span className="font-medium truncate flex-1">{img.label || `(no label)`}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main preview */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected ? (
            <NumberedImagePreview
              image={selected}
              config={config}
              onUpdate={(updates) => onImageUpdate(selected.id, updates)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="label-mono">No images to number</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Per-image preview with draggable text box ──────────────────────

interface NumberedImagePreviewProps {
  image: NumberedImage;
  config: NumberingConfig;
  onUpdate: (updates: Partial<NumberedImage>) => void;
}

function NumberedImagePreview({ image, config, onUpdate }: NumberedImagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [editingLabel, setEditingLabel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateImgSize = useCallback(() => {
    const el = imgRef.current;
    if (el) setImgSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver(updateImgSize);
    if (imgRef.current) obs.observe(imgRef.current);
    return () => obs.disconnect();
  }, [updateImgSize]);

  // Font size scaled to display
  const displayFontSize = imgSize.w > 0
    ? (config.fontSize / image.naturalWidth) * imgSize.w
    : config.fontSize;

  const boxLeft = image.labelX * imgSize.w;
  const boxTop = image.labelY * imgSize.h;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left - dragOffset.current.x) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top - dragOffset.current.y) / rect.height));
      onUpdate({ labelX: x, labelY: y });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, onUpdate]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="label-mono">
          Drag the label to reposition · double-click to edit text
        </p>
        <p className="label-mono">{image.naturalWidth} × {image.naturalHeight} px</p>
      </div>
      <div
        ref={containerRef}
        className="relative inline-block select-none rounded overflow-hidden"
        style={{ border: "1px solid hsl(var(--border))" }}
      >
        <img
          ref={imgRef}
          src={image.previewUrl}
          alt=""
          draggable={false}
          className="block w-full"
          onLoad={updateImgSize}
        />
        {/* Text box overlay */}
        {imgSize.w > 0 && image.label && (
          <div
            className="absolute flex items-start"
            style={{
              left: boxLeft,
              top: boxTop,
              cursor: dragging ? "grabbing" : "grab",
            }}
            onMouseDown={onMouseDown}
            onDoubleClick={() => {
              setEditingLabel(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
          >
            <div
              style={{
                background: "#ffffff",
                padding: `${(config.padding.top / image.naturalWidth) * imgSize.w}px ${(config.padding.right / image.naturalWidth) * imgSize.w}px ${(config.padding.bottom / image.naturalWidth) * imgSize.w}px ${(config.padding.left / image.naturalWidth) * imgSize.w}px`,
                fontFamily: `"${config.fontFamily}", sans-serif`,
                fontSize: displayFontSize,
                lineHeight: 1.25,
                color: "#000000",
                fontWeight: config.bold ? 700 : 400,
                whiteSpace: "nowrap",
                userSelect: "none",
                border: "1px dashed hsl(var(--primary) / 0.5)",
              }}
            >
              {editingLabel ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={image.label}
                  onChange={(e) => onUpdate({ label: e.target.value })}
                  onBlur={() => setEditingLabel(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditingLabel(false); }}
                  className="bg-transparent outline-none border-none p-0 m-0"
                  style={{
                    fontFamily: `"${config.fontFamily}", sans-serif`,
                    fontSize: displayFontSize,
                    lineHeight: 1.25,
                    color: "#000000",
                    width: `${Math.max(2, image.label.length + 1)}ch`,
                  }}
                />
              ) : (
                <span>
                  {image.label}
                  <GripVertical
                    size={Math.max(10, displayFontSize * 0.6)}
                    className="inline-block ml-1 opacity-40"
                    style={{ verticalAlign: "text-bottom" }}
                  />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
