/**
 * Deterministic splitting of a Cambridge question paper PDF into one PNG per question.
 *
 * Ported from the reference Python implementation (SPEC_one_shot_paper_splitting.md).
 * The key idea is that nothing is rasterised before deciding: the PDF's own text
 * layer tells us where each question starts and ends, in page coordinates. Only
 * then are the chosen regions rendered and joined.
 *
 * Two deliberate departures from the reference, both forced by running in the
 * browser rather than under PyMuPDF:
 *
 *  1. `get_drawings()` has no clean pdf.js equivalent, so content extents come
 *     from scanning the *rendered* page for rows containing ink. This catches
 *     vector diagrams natively (the reference notes a text-only pass silently
 *     crops them off) and, being taken from the same raster that gets cropped,
 *     cannot disagree with it.
 *  2. Because an ink scan sees the dotted answer lines as content, the dotted
 *     lines are located via the text layer and masked out of the scan before
 *     bands are formed. Without this the 48pt gap clamp has nothing to collapse.
 *
 * Everything else follows the spec: the content window, the merge/clamp/pad
 * constants, the terminator set, the ascending-sequence filter and the margin
 * whiteout.
 */

import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

// Keep API + worker on the exact same runtime version to avoid mismatch errors.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/** 4x 72dpi = 288 dpi. A4 portrait -> 2381 px wide, matching the existing image bank. */
export const SCALE = 4.0;

/**
 * Live text area of a 9709 question paper, in points (x0, y0, x1, y1).
 * Everything outside is page furniture: page number, footer, candidate barcodes,
 * corner crop marks and the rotated "DO NOT WRITE IN THIS MARGIN" strips.
 *
 * y0 = 60.5 rather than 58 keeps out a barcode block at y 54.1-59.1 that would
 * otherwise register as content on the following page. x1 = 556 rather than 560
 * keeps out corner crop marks at x = 558.4.
 */
export const QP_CONTENT: [number, number, number, number] = [44, 60.5, 556, 789];

export const QP_MAX_GAP_PT = 48; // a run of answer lines collapses to at most this
export const QP_PAD_PT = 26;     // white space above and below each question
export const QP_MERGE_PT = 6;    // content bands closer than this are treated as one

/** Anything at or above this luminance counts as blank page. */
const INK_LUMA_THRESHOLD = 250;

const TERMINATORS =
  /(Additional page|BLANK PAGE|Permission to reproduce|Cambridge Assessment International Education is part)/i;

const QUESTION_START = /^\s*(\d{1,2})\s/;

/** Max rendered pages held in memory at once (a 288dpi A4 page is ~32MB). */
const PAGE_CACHE_SIZE = 3;

export interface SplitQuestion {
  n: number;
  blob: Blob;
  width: number;
  height: number;
  /** Sum of the [n] mark allocations found inside this question, or null if none. */
  marks: number | null;
  /** Structural problems worth a human look. Empty means the image looked sane. */
  warnings: string[];
}

export interface SplitProgress {
  phase: "reading" | "scanning" | "building";
  done: number;
  total: number;
}

/** A run of text on one baseline, assembled from pdf.js text items. */
interface TextLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
}

interface PageInfo {
  widthPt: number;
  heightPt: number;
  lines: TextLine[];
  /** Content bands in points, dotted answer lines already removed. */
  bands: [number, number][];
}

/**
 * True for the dotted answer-writing lines (and for empty text).
 *
 * The 0.45 threshold is deliberately loose because these blocks carry stray
 * spaces and the occasional trailing mark. No real question text comes close.
 */
export function isDotLine(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  let dots = 0;
  for (const ch of s) if (ch === ".") dots++;
  return dots / s.length > 0.45;
}

/** Merge bands closer than QP_MERGE_PT, rejoining the lines of one paragraph. */
export function mergeBands(
  bands: [number, number][],
  mergePt = QP_MERGE_PT,
): [number, number][] {
  const out: [number, number][] = [];
  for (const [y0, y1] of [...bands].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = out[out.length - 1];
    if (last && y0 - last[1] <= mergePt) last[1] = Math.max(last[1], y1);
    else out.push([y0, y1]);
  }
  return out;
}

/**
 * Keep the first occurrence of each question number, requiring the sequence to
 * start at 1 and increase by exactly 1.
 *
 * Mark allocations, coordinate labels and years all produce digits, but almost
 * never at the left margin *and* in ascending sequence.
 */
export function filterQuestionStarts<T extends { n: number }>(candidates: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const c of candidates) {
    if (seen.has(c.n)) continue;
    const expected = out.length === 0 ? 1 : out[out.length - 1].n + 1;
    if (c.n !== expected) continue;
    seen.add(c.n);
    out.push(c);
  }
  return out;
}

/** Group pdf.js text items into baseline-aligned lines, in reading order. */
function groupIntoLines(items: TextItem[], viewportTransform: number[]): TextLine[] {
  interface Piece { x0: number; y0: number; x1: number; y1: number; text: string; }
  const pieces: Piece[] = [];

  for (const it of items) {
    if (!it.str) continue;
    // Map text-space to viewport space so y runs top-down like the spec's geometry.
    const tx = pdfjsLib.Util.transform(viewportTransform, it.transform);
    const height = Math.hypot(tx[2], tx[3]) || it.height || 0;
    const x0 = tx[4];
    const baseline = tx[5];
    pieces.push({
      x0,
      y0: baseline - height,
      y1: baseline,
      x1: x0 + (it.width ?? 0),
      text: it.str,
    });
  }

  pieces.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const lines: TextLine[] = [];
  let bucket: Piece[] = [];
  const flush = () => {
    if (!bucket.length) return;
    const ordered = [...bucket].sort((a, b) => a.x0 - b.x0);
    let text = "";
    let prevX1: number | null = null;
    for (const p of ordered) {
      // pdf.js splits runs mid-word; only insert a space where there is a real gap.
      if (prevX1 !== null && p.x0 - prevX1 > 1) text += " ";
      text += p.text;
      prevX1 = p.x1;
    }
    lines.push({
      x0: Math.min(...ordered.map((p) => p.x0)),
      y0: Math.min(...ordered.map((p) => p.y0)),
      x1: Math.max(...ordered.map((p) => p.x1)),
      y1: Math.max(...ordered.map((p) => p.y1)),
      text,
    });
    bucket = [];
  };

  for (const p of pieces) {
    if (!bucket.length) { bucket.push(p); continue; }
    const centre = (p.y0 + p.y1) / 2;
    const bucketCentre =
      bucket.reduce((a, q) => a + (q.y0 + q.y1) / 2, 0) / bucket.length;
    if (Math.abs(centre - bucketCentre) < 3) bucket.push(p);
    else { flush(); bucket.push(p); }
  }
  flush();

  return lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/**
 * Rows of the rendered page that contain ink, restricted to the content window.
 * Returns a flag per device pixel row.
 */
function inkRows(data: ImageData, widthPx: number, heightPx: number): Uint8Array {
  const rows = new Uint8Array(heightPx);
  const px = data.data;
  const xStart = Math.max(0, Math.round(QP_CONTENT[0] * SCALE));
  const xEnd = Math.min(widthPx, Math.round(QP_CONTENT[2] * SCALE));
  const yStart = Math.max(0, Math.round(QP_CONTENT[1] * SCALE));
  const yEnd = Math.min(heightPx, Math.round(QP_CONTENT[3] * SCALE));

  for (let y = yStart; y < yEnd; y++) {
    const rowBase = y * widthPx;
    for (let x = xStart; x < xEnd; x++) {
      const i = (rowBase + x) * 4;
      const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (luma < INK_LUMA_THRESHOLD) { rows[y] = 1; break; }
    }
  }
  return rows;
}

/** Convert a per-pixel-row ink flag array into bands in points. */
function rowsToBands(rows: Uint8Array): [number, number][] {
  const bands: [number, number][] = [];
  let start = -1;
  for (let y = 0; y < rows.length; y++) {
    if (rows[y] && start < 0) start = y;
    else if (!rows[y] && start >= 0) { bands.push([start / SCALE, y / SCALE]); start = -1; }
  }
  if (start >= 0) bands.push([start / SCALE, rows.length / SCALE]);
  return bands;
}

/** Render one page at SCALE, with a small LRU so memory stays bounded. */
function makePageRenderer(pdf: pdfjsLib.PDFDocumentProxy) {
  const cache = new Map<number, HTMLCanvasElement>();
  return async (pageNo: number): Promise<HTMLCanvasElement> => {
    const hit = cache.get(pageNo);
    if (hit) return hit;

    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    if (cache.size >= PAGE_CACHE_SIZE) {
      const oldest = cache.keys().next().value as number | undefined;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(pageNo, canvas);
    return canvas;
  };
}

/**
 * Split a question paper PDF into one PNG per question.
 *
 * Throws if the PDF has no usable text layer — scanned papers must use the
 * manual cropping path instead.
 */
export async function splitQuestionPaper(
  file: File,
  onProgress?: (p: SplitProgress) => void,
): Promise<SplitQuestion[]> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const total = pdf.numPages;
  const renderPage = makePageRenderer(pdf);

  // ── Pass 1: read the text layer and scan each page for content bands ────────
  const pages: PageInfo[] = [];
  for (let p = 1; p <= total; p++) {
    onProgress?.({ phase: "scanning", done: p - 1, total });

    const page = await pdf.getPage(p);
    const unit = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines = groupIntoLines(
      content.items.filter((i): i is TextItem => "str" in i),
      unit.transform,
    );

    const canvas = await renderPage(p);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rows = inkRows(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
      canvas.width,
      canvas.height,
    );

    // Mask out the dotted answer lines so the gap clamp has room to work.
    for (const line of lines) {
      if (!isDotLine(line.text)) continue;
      const from = Math.max(0, Math.floor(line.y0 * SCALE));
      const to = Math.min(rows.length, Math.ceil(line.y1 * SCALE));
      for (let y = from; y < to; y++) rows[y] = 0;
    }

    pages.push({
      widthPt: unit.width,
      heightPt: unit.height,
      lines,
      bands: mergeBands(rowsToBands(rows)),
    });
  }

  const hasText = pages.some((pg) => pg.lines.some((l) => l.text.trim().length > 2));
  if (!hasText) {
    throw new Error(
      "This PDF has no text layer (it is probably scanned). Use the manual crop tools instead.",
    );
  }

  // ── Locate question starts ─────────────────────────────────────────────────
  const candidates: { n: number; page: number; y: number }[] = [];
  for (let i = 0; i < pages.length; i++) {
    for (const line of pages[i].lines) {
      if (line.x0 > 55) continue;
      if (line.y1 < QP_CONTENT[1] || line.y0 > QP_CONTENT[3]) continue;
      const m = QUESTION_START.exec(line.text);
      if (m) candidates.push({ n: parseInt(m[1], 10), page: i, y: line.y0 });
    }
  }
  candidates.sort((a, b) => a.page - b.page || a.y - b.y);
  const starts = filterQuestionStarts(candidates);

  if (!starts.length) {
    throw new Error("No question numbers found — this may not be a question paper.");
  }

  // ── Pass 2: build one image per question ───────────────────────────────────
  const out: SplitQuestion[] = [];
  const marksByQuestion = collectMarks(pages, starts);

  for (let i = 0; i < starts.length; i++) {
    onProgress?.({ phase: "building", done: i, total: starts.length });
    const { n, page: startPage, y: startY } = starts[i];

    // A question ends where the next begins; the last one ends at the end-matter.
    let endPage: number;
    let endY: number;
    if (i + 1 < starts.length) {
      endPage = starts[i + 1].page;
      endY = starts[i + 1].y;
    } else {
      endPage = pages.length - 1;
      endY = QP_CONTENT[3];
      for (let p = startPage; p < pages.length; p++) {
        const hits = pages[p].lines
          .filter((l) => TERMINATORS.test(l.text) && (p > startPage || l.y0 > startY))
          .map((l) => l.y0);
        if (hits.length) { endPage = p; endY = Math.min(...hits); break; }
      }
    }

    // Collect the surviving bands page by page, clipped to the question's extent.
    const segments: { page: number; y0: number; y1: number }[] = [];
    for (let p = startPage; p <= endPage; p++) {
      const lo = p === startPage ? startY : QP_CONTENT[1];
      const hi = p === endPage ? endY : QP_CONTENT[3];
      const clipped = pages[p].bands
        .filter(([a, b]) => b > lo + 0.5 && a < hi - 0.5)
        .map(([a, b]): [number, number] => [Math.max(a, lo), Math.min(b, hi)])
        .filter(([a, b]) => b - a > 0.5);
      for (const [a, b] of mergeBands(clipped)) segments.push({ page: p, y0: a, y1: b });
    }
    if (!segments.length) continue;

    const blob = await composeQuestion(renderPage, pages, segments);
    const dims = await blobDimensions(blob);
    out.push({
      n,
      blob,
      width: dims.w,
      height: dims.h,
      marks: marksByQuestion.get(n) ?? null,
      warnings: structuralWarnings(dims),
    });
  }

  onProgress?.({ phase: "building", done: starts.length, total: starts.length });
  return out;
}

/**
 * Paste the question's bands onto one canvas, clamping the gaps between them.
 *
 * The clamp is what makes this readable: real spacing (the ~19pt between a stem
 * and part (a)) passes through untouched, while the ~46pt of answer lines
 * collapses to a constant, so a question spread over three pages reads as one.
 */
async function composeQuestion(
  renderPage: (pageNo: number) => Promise<HTMLCanvasElement>,
  pages: PageInfo[],
  segments: { page: number; y0: number; y1: number }[],
): Promise<Blob> {
  const widthPx = Math.round(pages[segments[0].page].widthPt * SCALE);
  const padPx = Math.round(QP_PAD_PT * SCALE);

  type Strip = { kind: "gap"; height: number } | { kind: "img"; page: number; y0: number; y1: number };
  const strips: Strip[] = [];
  let prev: { page: number; y1: number } | null = null;
  for (const s of segments) {
    if (prev) {
      const gap = prev.page === s.page
        ? Math.min(s.y0 - prev.y1, QP_MAX_GAP_PT)
        : QP_MAX_GAP_PT;
      strips.push({ kind: "gap", height: Math.max(0, Math.round(gap * SCALE)) });
    }
    strips.push({ kind: "img", page: s.page, y0: s.y0, y1: s.y1 });
    prev = { page: s.page, y1: s.y1 };
  }

  const heights = strips.map((s) =>
    s.kind === "gap" ? s.height : Math.round((s.y1 - s.y0) * SCALE),
  );
  const totalHeight = heights.reduce((a, b) => a + b, 0) + padPx * 2;

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, widthPx, totalHeight);

  let y = padPx;
  for (let i = 0; i < strips.length; i++) {
    const strip = strips[i];
    const h = heights[i];
    if (strip.kind === "img" && h > 0) {
      const src = await renderPage(strip.page + 1);
      const top = Math.round(strip.y0 * SCALE);
      const clipped = Math.min(h, src.height - top);
      if (clipped > 0) {
        ctx.drawImage(src, 0, top, widthPx, clipped, 0, y, widthPx, clipped);
      }
    }
    y += h;
  }

  // The bands are chosen by their bounding boxes but the crop takes the full page
  // width, so the rotated margin text is still in the pixels until painted over.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, Math.round(QP_CONTENT[0] * SCALE) - 1, totalHeight);
  ctx.fillRect(Math.round(QP_CONTENT[2] * SCALE) + 1, 0, widthPx, totalHeight);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

/** Sum the [n] mark allocations, attributed to whichever question is open. */
function collectMarks(
  pages: PageInfo[],
  starts: { n: number; page: number; y: number }[],
): Map<number, number> {
  const totals = new Map<number, number>();
  const startAt = (page: number, y: number): number | null => {
    let current: number | null = null;
    for (const s of starts) {
      if (s.page < page || (s.page === page && s.y <= y + 0.5)) current = s.n;
      else break;
    }
    return current;
  };

  for (let p = 0; p < pages.length; p++) {
    for (const line of pages[p].lines) {
      if (TERMINATORS.test(line.text)) break;
      const q = startAt(p, line.y0);
      if (q === null) continue;
      for (const m of line.text.matchAll(/\[(\d+)\]/g)) {
        totals.set(q, (totals.get(q) ?? 0) + parseInt(m[1], 10));
      }
    }
  }
  return totals;
}

/**
 * Cheap structural sweep over the output. Marks reconciliation would catch
 * mis-assigned content; this catches a crop that is simply wrong-looking.
 */
function structuralWarnings(dims: { w: number; h: number }): string[] {
  const warnings: string[] = [];
  if (dims.h < 250) warnings.push("Very short image — the question may have been cut off.");
  if (dims.h > 12000) warnings.push("Unusually tall — it may have swallowed following content.");
  return warnings;
}

async function blobDimensions(blob: Blob): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("could not measure output image"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `9709_m25_qp62_q01.png` style name, following the existing bank convention. */
export function questionPaperFileName(base: string, n: number): string {
  const safe = base.replace(/[<>:"/\\|?*]/g, "_").trim() || "question_paper";
  return `${safe}_q${String(n).padStart(2, "0")}.png`;
}
