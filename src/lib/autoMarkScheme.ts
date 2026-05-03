import { supabase } from "@/integrations/supabase/client";

export interface NormBBox { x: number; y: number; w: number; h: number; }
export interface DetectedRegion {
  label: string;
  bbox: NormBBox;
  isContinuationFromPrev: boolean;
  continuesOnNext: boolean;
  confidence: number;
}
export interface PageDetection {
  pageIndex: number;
  pageBlob: Blob;
  pageWidth: number;
  pageHeight: number;
  regions: DetectedRegion[];
}

export interface QuestionPiece {
  pageIndex: number;
  bbox: NormBBox; // normalized to that page
}
export interface QuestionGroup {
  id: string;
  label: string;
  pieces: QuestionPiece[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

async function loadDims(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
    img.src = url;
  });
}

export async function detectPage(
  pageBlob: Blob,
  pageIndex: number,
  totalPages: number,
): Promise<DetectedRegion[]> {
  const base64 = await blobToBase64(pageBlob);
  const { data, error } = await supabase.functions.invoke("detect-questions", {
    body: {
      imageBase64: base64,
      mimeType: pageBlob.type || "image/png",
      pageIndex,
      totalPages,
    },
  });
  if (error) throw new Error(error.message || "detect-questions failed");
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.regions) ? data.regions : [];
}

export async function detectAllPages(
  pages: Blob[],
  onProgress?: (done: number, total: number) => void,
  delayMs = 400,
): Promise<PageDetection[]> {
  const out: PageDetection[] = [];
  for (let i = 0; i < pages.length; i++) {
    const dims = await loadDims(pages[i]);
    let regions: DetectedRegion[] = [];
    try {
      regions = await detectPage(pages[i], i, pages.length);
    } catch (e) {
      console.error(`Page ${i + 1} detection failed`, e);
    }
    out.push({
      pageIndex: i,
      pageBlob: pages[i],
      pageWidth: dims.w,
      pageHeight: dims.h,
      regions,
    });
    onProgress?.(i + 1, pages.length);
    if (i < pages.length - 1 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return out;
}

/**
 * Walk pages and group regions into logical questions.
 * Rules:
 * - A region starts a new group when it has a non-empty label AND isContinuationFromPrev=false.
 * - A region with isContinuationFromPrev=true (or empty label) appended to the most recent open group,
 *   provided the previous page's last region had continuesOnNext=true OR labels match.
 */
export function groupIntoQuestions(detections: PageDetection[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  let prevContinues = false;

  for (const page of detections) {
    page.regions.forEach((r, idx) => {
      const isFirstOnPage = idx === 0;
      const wantsContinue = r.isContinuationFromPrev || (isFirstOnPage && !r.label && prevContinues);

      if (wantsContinue && groups.length > 0) {
        const last = groups[groups.length - 1];
        last.pieces.push({ pageIndex: page.pageIndex, bbox: r.bbox });
        if (r.label && !last.label) last.label = r.label;
      } else {
        groups.push({
          id: `${page.pageIndex}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          label: r.label || `p${page.pageIndex + 1}_${idx + 1}`,
          pieces: [{ pageIndex: page.pageIndex, bbox: r.bbox }],
        });
      }
    });
    const lastRegion = page.regions[page.regions.length - 1];
    prevContinues = !!lastRegion?.continuesOnNext;
  }
  return groups;
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
    img.src = url;
  });
}

/**
 * Crop pieces from their pages and stitch vertically into a single PNG blob.
 * If a piece is wider/narrower than others it's scaled to match the widest.
 */
export async function buildQuestionImage(
  group: QuestionGroup,
  detections: PageDetection[],
  gapPx = 8,
): Promise<Blob> {
  // Crop each piece into its own canvas first
  const pieceCanvases: HTMLCanvasElement[] = [];
  for (const piece of group.pieces) {
    const page = detections[piece.pageIndex];
    if (!page) continue;
    const img = await loadImage(page.pageBlob);
    const W = page.pageWidth;
    const H = page.pageHeight;
    const sx = Math.max(0, Math.round(piece.bbox.x * W));
    const sy = Math.max(0, Math.round(piece.bbox.y * H));
    const sw = Math.max(1, Math.min(W - sx, Math.round(piece.bbox.w * W)));
    const sh = Math.max(1, Math.min(H - sy, Math.round(piece.bbox.h * H)));
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    pieceCanvases.push(c);
  }
  if (!pieceCanvases.length) throw new Error("No pieces to stitch");

  const targetW = Math.max(...pieceCanvases.map((c) => c.width));
  const scaledHeights = pieceCanvases.map((c) => Math.round((c.height * targetW) / c.width));
  const totalH = scaledHeights.reduce((a, b) => a + b, 0) + gapPx * (pieceCanvases.length - 1);

  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = totalH;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, targetW, totalH);

  let y = 0;
  pieceCanvases.forEach((c, i) => {
    const h = scaledHeights[i];
    octx.drawImage(c, 0, 0, c.width, c.height, 0, y, targetW, h);
    y += h + gapPx;
  });

  return await new Promise<Blob>((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  );
}

export function questionFileName(label: string, idx: number): string {
  const safe = (label || `Q${idx + 1}`).replace(/[<>:"/\\|?*]/g, "_").trim() || `Q${idx + 1}`;
  return `MS_Q${safe}.png`;
}
