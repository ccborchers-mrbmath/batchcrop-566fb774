import { Check, X, FileText } from "lucide-react";

interface Props {
  pdfName: string;
  thumbnails: string[];
  excluded: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PdfPageSelector({
  pdfName,
  thumbnails,
  excluded,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onConfirm,
  onCancel,
}: Props) {
  const total = thumbnails.length;
  const selectedCount = total - excluded.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "hsl(var(--background) / 0.85)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex flex-col rounded-xl"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          width: "min(1100px, 100%)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-4 px-6 py-4"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={18} style={{ color: "hsl(var(--primary))" }} />
            <div className="min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{ color: "hsl(var(--foreground))" }}
              >
                Select pages from {pdfName}
              </div>
              <div className="label-mono mt-0.5">
                {selectedCount} of {total} pages selected
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={onSelectAll}>
              Select all
            </button>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={onDeselectAll}>
              Deselect all
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
          >
            {thumbnails.map((url, i) => {
              const isExcluded = excluded.has(i);
              return (
                <button
                  key={i}
                  onClick={() => onToggle(i)}
                  className="relative rounded-md overflow-hidden transition-all"
                  style={{
                    border: `2px solid ${
                      isExcluded ? "hsl(var(--border))" : "hsl(var(--primary))"
                    }`,
                    background: "hsl(var(--background))",
                    opacity: isExcluded ? 0.45 : 1,
                  }}
                >
                  <img
                    src={url}
                    alt={`Page ${i + 1}`}
                    className="w-full h-auto block"
                    style={{ aspectRatio: "1 / 1.3", objectFit: "contain" }}
                  />
                  <div
                    className="absolute top-1.5 right-1.5 rounded-full flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      background: isExcluded
                        ? "hsl(var(--muted))"
                        : "hsl(var(--primary))",
                      color: isExcluded
                        ? "hsl(var(--muted-foreground))"
                        : "hsl(var(--primary-foreground))",
                    }}
                  >
                    {isExcluded ? <X size={13} /> : <Check size={13} />}
                  </div>
                  <div
                    className="label-mono text-center py-1"
                    style={{
                      background: "hsl(var(--card))",
                      borderTop: "1px solid hsl(var(--border))",
                    }}
                  >
                    Page {i + 1}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: "1px solid hsl(var(--border))" }}
        >
          <button className="btn-secondary px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary px-4 py-2 text-sm"
            disabled={selectedCount === 0}
            onClick={onConfirm}
          >
            Add {selectedCount} page{selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
