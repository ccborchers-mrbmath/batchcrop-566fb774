/**
 * Stretch an image File to exactly targetW × targetH pixels using canvas.
 * Returns a new Blob with the same MIME type as the source.
 */
export async function stretchImageToSize(
  file: File,
  targetW: number,
  targetH: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }

      ctx.drawImage(img, 0, 0, targetW, targetH);

      const mime =
        file.type === "image/png"  ? "image/png"  :
        file.type === "image/webp" ? "image/webp" :
        "image/jpeg";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime,
        0.95
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export interface AspectPreset {
  label: string;
  w: number;
  h: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { label: "A4 Portrait  (2480 × 3508)",  w: 2480, h: 3508 },
  { label: "A4 Landscape (3508 × 2480)",  w: 3508, h: 2480 },
  { label: "Letter Portrait  (2550 × 3300)", w: 2550, h: 3300 },
  { label: "Letter Landscape (3300 × 2550)", w: 3300, h: 2550 },
  { label: "Square (1:1)",                w: 2000, h: 2000 },
];

/** Returns true if the batch contains more than one unique WxH combination. */
export function hasMixedDimensions(
  sizes: Record<string, { w: number; h: number }>
): boolean {
  const keys = Object.keys(sizes);
  if (keys.length < 2) return false;
  const first = sizes[keys[0]];
  return keys.some((k) => sizes[k].w !== first.w || sizes[k].h !== first.h);
}

/** Returns the most common dimension in the batch, for display purposes. */
export function majorityDimension(
  sizes: Record<string, { w: number; h: number }>
): { w: number; h: number } | null {
  const keys = Object.keys(sizes);
  if (!keys.length) return null;
  const counts = new Map<string, number>();
  for (const k of keys) {
    const sig = `${sizes[k].w}x${sizes[k].h}`;
    counts.set(sig, (counts.get(sig) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  counts.forEach((n, sig) => { if (n > bestN) { bestN = n; best = sig; } });
  const [w, h] = best.split("x").map(Number);
  return { w, h };
}
