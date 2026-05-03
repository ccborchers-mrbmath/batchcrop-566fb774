import { supabase } from "@/integrations/supabase/client";

export interface NormBBox { x: number; y: number; w: number; h: number; }
export interface DetectedRegion {
  label: string;
  bbox: NormBBox;
  isContinuationFromPrev: boolean;
  continuesOnNext: boolean;
  confidence: number;
  /** True if the user manually adjusted this bbox — skip border snapping. */
  manual?: boolean;
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
  manual?: boolean;
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

/** Extract the root question number from labels like "3", "3(a)", "3(b)(ii)". */
function rootQuestionNumber(label: string): string | null {
  const m = (label || "").trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/**
 * Group regions into logical questions.
 * - Sub-parts on the same/consecutive pages with the same root number are merged
 *   (e.g. 3(a), 3(b) → Q3).
 * - Cross-page continuations (isContinuationFromPrev / continuesOnNext / empty label
 *   following a continuesOnNext) are appended to the most recent open group.
 */
export function groupIntoQuestions(detections: PageDetection[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  let prevContinues = false;
  let lastRoot: string | null = null;

  for (const page of detections) {
    page.regions.forEach((r, idx) => {
      const isFirstOnPage = idx === 0;
      const root = rootQuestionNumber(r.label);
      const wantsContinue =
        r.isContinuationFromPrev ||
        (isFirstOnPage && !r.label && prevContinues) ||
        (root !== null && root === lastRoot);

      if (wantsContinue && groups.length > 0) {
        const last = groups[groups.length - 1];
        last.pieces.push({ pageIndex: page.pageIndex, bbox: r.bbox, manual: r.manual });
        if (r.label && (!last.label || /^p\d+_/.test(last.label))) {
          last.label = root ? `Q${root}` : r.label;
        }
        if (root) lastRoot = root;
      } else {
        groups.push({
          id: `${page.pageIndex}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
          label: root ? `Q${root}` : (r.label || `p${page.pageIndex + 1}_${idx + 1}`),
          pieces: [{ pageIndex: page.pageIndex, bbox: r.bbox, manual: r.manual }],
        });
        lastRoot = root;
      }
    });
    const lastRegion = page.regions[page.regions.length - 1];
    prevContinues = !!lastRegion?.continuesOnNext;
    // lastRoot persists across pages so cross-page subparts (e.g. 3(c) on next page) merge.
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
 * Snap bbox edges to the nearest dark horizontal/vertical line in the page image.
 * Searches a window around each edge for the row/column with the highest fraction
 * of dark pixels (a table border). Returns adjusted pixel coordinates.
 */
function snapToTableBorders(
  imageData: ImageData,
  px: { x: number; y: number; w: number; h: number },
  searchPx = 40,
  darkThreshold = 140,
  minDarkFrac = 0.55,
): { x: number; y: number; w: number; h: number } {
  const { width: W, height: H, data } = imageData;
  const isDark = (i: number) => {
    // sRGB luminance approx
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return lum < darkThreshold;
  };

  // Horizontal line score for a given y across [x0,x1)
  const rowDarkFrac = (y: number, x0: number, x1: number) => {
    if (y < 0 || y >= H) return 0;
    let dark = 0;
    let total = 0;
    const step = Math.max(1, Math.floor((x1 - x0) / 600));
    for (let x = x0; x < x1; x += step) {
      const i = (y * W + x) * 4;
      if (isDark(i)) dark++;
      total++;
    }
    return total ? dark / total : 0;
  };
  const colDarkFrac = (x: number, y0: number, y1: number) => {
    if (x < 0 || x >= W) return 0;
    let dark = 0;
    let total = 0;
    const step = Math.max(1, Math.floor((y1 - y0) / 600));
    for (let y = y0; y < y1; y += step) {
      const i = (y * W + x) * 4;
      if (isDark(i)) dark++;
      total++;
    }
    return total ? dark / total : 0;
  };

  const findBestRow = (centerY: number, x0: number, x1: number) => {
    let best = centerY;
    let bestScore = rowDarkFrac(centerY, x0, x1);
    for (let dy = 1; dy <= searchPx; dy++) {
      for (const y of [centerY - dy, centerY + dy]) {
        const s = rowDarkFrac(y, x0, x1);
        if (s > bestScore) { bestScore = s; best = y; }
      }
    }
    return bestScore >= minDarkFrac ? best : centerY;
  };
  const findBestCol = (centerX: number, y0: number, y1: number) => {
    let best = centerX;
    let bestScore = colDarkFrac(centerX, y0, y1);
    for (let dx = 1; dx <= searchPx; dx++) {
      for (const x of [centerX - dx, centerX + dx]) {
        const s = colDarkFrac(x, y0, y1);
        if (s > bestScore) { bestScore = s; best = x; }
      }
    }
    return bestScore >= minDarkFrac ? best : centerX;
  };

  const x0 = Math.max(0, px.x);
  const y0 = Math.max(0, px.y);
  const x1 = Math.min(W, px.x + px.w);
  const y1 = Math.min(H, px.y + px.h);

  const newTop = findBestRow(y0, x0, x1);
  const newBot = findBestRow(y1, x0, x1);
  const newLeft = findBestCol(x0, newTop, newBot);
  const newRight = findBestCol(x1, newTop, newBot);

  return {
    x: Math.max(0, Math.min(W - 1, newLeft)),
    y: Math.max(0, Math.min(H - 1, newTop)),
    w: Math.max(1, newRight - newLeft),
    h: Math.max(1, newBot - newTop),
  };
}

/**
 * Crop pieces from their pages and stitch vertically into a single PNG blob.
 * - Each bbox edge is snapped to the nearest table border in the page.
 * - Pieces of differing widths are padded (NOT scaled) with white so internal
 *   table columns stay aligned.
 */
export async function buildQuestionImage(
  group: QuestionGroup,
  detections: PageDetection[],
  gapPx = 0,
): Promise<Blob> {
  // Cache page imageData per pageIndex (snapping needs pixel access).
  const pageDataCache = new Map<number, { img: HTMLImageElement; data: ImageData; W: number; H: number }>();
  const getPageData = async (pageIndex: number) => {
    const cached = pageDataCache.get(pageIndex);
    if (cached) return cached;
    const page = detections[pageIndex];
    const img = await loadImage(page.pageBlob);
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H);
    const entry = { img, data, W, H };
    pageDataCache.set(pageIndex, entry);
    return entry;
  };

  // Crop each piece into its own canvas after border snapping.
  const pieceCanvases: HTMLCanvasElement[] = [];
  for (const piece of group.pieces) {
    const page = detections[piece.pageIndex];
    if (!page) continue;
    const { img, data, W, H } = await getPageData(piece.pageIndex);

    // Initial pixel rect from normalized bbox
    const rawPx = {
      x: Math.round(piece.bbox.x * W),
      y: Math.round(piece.bbox.y * H),
      w: Math.round(piece.bbox.w * W),
      h: Math.round(piece.bbox.h * H),
    };
    // Search window: 3% of page dimension is enough to find an outer table rule.
    const searchPx = Math.max(20, Math.round(Math.min(W, H) * 0.03));
    const snap = snapToTableBorders(data, rawPx, searchPx);

    const sx = Math.max(0, Math.min(W - 1, snap.x));
    const sy = Math.max(0, Math.min(H - 1, snap.y));
    const sw = Math.max(1, Math.min(W - sx, snap.w));
    const sh = Math.max(1, Math.min(H - sy, snap.h));

    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    pieceCanvases.push(c);
  }
  if (!pieceCanvases.length) throw new Error("No pieces to stitch");

  // Pad to widest (preserve original scale & column alignment)
  const targetW = Math.max(...pieceCanvases.map((c) => c.width));
  const totalH = pieceCanvases.reduce((a, c) => a + c.height, 0) + gapPx * (pieceCanvases.length - 1);

  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = totalH;
  const octx = out.getContext("2d")!;
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, targetW, totalH);

  let y = 0;
  pieceCanvases.forEach((c, i) => {
    // Center horizontally so narrower pieces don't shift the perceived column grid;
    // most mark-scheme tables share the same left margin so left-align also works,
    // but centering is safer when widths only differ by a couple of pixels.
    const dx = Math.round((targetW - c.width) / 2);
    octx.drawImage(c, dx, y);
    y += c.height + gapPx;
  });

  return await new Promise<Blob>((res, rej) =>
    out.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  );
}

export function questionFileName(label: string, idx: number): string {
  const safe = (label || `Q${idx + 1}`).replace(/[<>:"/\\|?*]/g, "_").trim() || `Q${idx + 1}`;
  return `MS_${safe}.png`;
}
