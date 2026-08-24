export type DocType = "markscheme" | "questionpaper";

interface Props {
  value: DocType;
  onChange: (v: DocType) => void;
}

/** Shared switch between the two extraction paths (AI mark schemes / exact question papers). */
export function DocTypeToggle({ value, onChange }: Props) {
  const options: { key: DocType; label: string }[] = [
    { key: "markscheme", label: "Mark Scheme" },
    { key: "questionpaper", label: "Question Paper" },
  ];
  return (
    <div
      className="inline-flex rounded-lg p-1"
      style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className="px-4 py-1.5 text-sm rounded-md transition-colors"
          style={{
            background: value === opt.key ? "hsl(var(--primary))" : "transparent",
            color: value === opt.key ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
            fontWeight: value === opt.key ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
