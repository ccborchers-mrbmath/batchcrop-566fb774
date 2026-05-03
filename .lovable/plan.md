## Goal

Add a new **Auto Mark Scheme** tool: load a mark scheme PDF, and the app returns one image per question — with each image already cropped to that question's bounding box and, when a question spans multiple pages, vertically stitched together into a single combined image.

Uses Gemini vision (via Lovable AI gateway) to detect question numbers and bounding boxes on each page. All cropping/stitching stays client-side using the existing Canvas pipeline.

## How it works (user flow)

1. New entry button on the landing screen / sidebar: **"Auto Mark Scheme (AI)"** — sits next to the existing PDF upload.
2. User drops a mark scheme PDF.
3. App renders each page to a high-res image (reusing `pdfToImages` at 4x).
4. Each page image is sent to Gemini via an edge function. Gemini returns, per page, a list of `{ questionLabel, bbox, isContinuationFromPrev, continuesOnNext }`.
5. App walks pages in order and groups regions sharing the same question label (or marked as continuations) into one logical question.
6. For each question:
   - Crop each page-region to a blob (existing `extractRegion`).
   - If multiple pieces, stitch them top-to-bottom on a new canvas (max width of pieces; white padding between).
   - Output blob named e.g. `MS_Q3.png`.
7. Results land in the existing image queue as a normal batch — user can review, re-crop, renumber, or download as zip. A small toast shows "Detected N questions across M pages".

## UX details

- **Review step before export**: after detection, show an overlay on each page with the detected boxes + labels and a sidebar list of detected questions. User can:
  - Drag box edges to fine-tune (reuse `RegionEditor` interaction pattern).
  - Merge / split groups (e.g. "Q3 actually continues into Q4's box on p.5").
  - Rename a question label.
  - Re-run detection on a single page.
- **Confidence**: each box gets a confidence score; low-confidence boxes are highlighted amber.
- **Cost guard**: show an estimate ("12 pages → 12 AI calls") and a confirm button before sending.

## Technical plan

### 1. Edge function `supabase/functions/detect-questions/index.ts`
- Input: `{ pageImageBase64, pageIndex, totalPages, hint?: string }`.
- Calls Lovable AI gateway with model `google/gemini-2.5-pro` (better at spatial reasoning than flash for this).
- Uses **tool calling** for structured output — schema:
  ```
  detect_questions({
    regions: [{
      label: string,            // e.g. "1", "2(a)", "3(b)(ii)"
      bbox: { x, y, w, h },     // normalized 0..1 of page
      isContinuationFromPrev: boolean,
      continuesOnNext: boolean,
      confidence: number
    }]
  })
  ```
- System prompt explains: "This is one page of a Cambridge mark scheme. Identify each question's answer region. A region starts at the question number and ends just before the next question number or page boundary. Mark `continuesOnNext: true` if the region runs to the bottom edge with no clear end. Mark `isContinuationFromPrev: true` if the page begins mid-answer (no question number at top)."
- Handles 429/402 with friendly errors (per Lovable AI guidelines).

### 2. New library `src/lib/autoMarkScheme.ts`
- `detectAllPages(pdfImages)` — sequentially calls the edge function (rate-limit friendly), returns `PageDetections[]`.
- `groupIntoQuestions(detections)` — walks pages in order:
  - New question when a region has a label and is not a continuation.
  - Append next page's first region to current question if `continuesOnNext` was true on prev page AND first region of next page is `isContinuationFromPrev` (or has same/blank label).
- `stitchQuestionImages(pieces)` — for each question, crops each piece (reuse `extractRegion` after denormalizing bbox to real pixels) and draws them top-to-bottom on a single canvas. White separator (~8px). Returns a single PNG blob.

### 3. New page / component `src/components/AutoMarkScheme.tsx`
- Owns: pdf file, pageImages, detections, groupedQuestions, edit state.
- Steps state machine: `idle → rendering → detecting → review → exporting`.
- Reuses `PixelGrid`, `RegionEditor`-style box editing, `ZoomControls`.
- "Send to queue" button feeds resulting blobs into the existing `Index.tsx` image list (so numbering / further cropping still works).

### 4. Routing / entry
- Add a small mode switcher on `Index.tsx` header: **Manual Crop** | **Auto Mark Scheme (AI)**. Defaults to Manual.

### 5. Backend setup required
- Enable **Lovable Cloud** (needed for edge function + LOVABLE_API_KEY).
- No DB tables, no auth — all stateless.

## Constraints / decisions

- **Model**: `google/gemini-2.5-pro` for detection (spatial accuracy matters more than speed); ~1 call per page. Will warn user about cost.
- **Sequential calls** with small delay to avoid 429.
- **Bbox coordinates** stored normalized (0..1) in state; converted to real pixels only at crop time — keeps things robust if user later rescales.
- **No cross-PDF stitching in v1** — one PDF per session.
- **Stitching strategy**: simple vertical concat with white gap. If pieces have different widths, scale to the widest (preserving aspect). Good enough for mark schemes which are single-column.
- **Fallback**: if AI fails on a page, that page becomes an empty "needs manual" entry the user can box themselves before continuing.

## Open question (will ask after approval if needed)

- Should the output always be one PNG per question, or also offer **per-page slices kept separate but named `Q3_part1of2.png`** (i.e. skip stitching)? Stitched-into-one is what you described, so that's the default.

## Files to add / change

- `supabase/functions/detect-questions/index.ts` (new)
- `src/lib/autoMarkScheme.ts` (new)
- `src/components/AutoMarkScheme.tsx` (new)
- `src/components/AutoQuestionReview.tsx` (new — review/edit UI)
- `src/pages/Index.tsx` (add mode switch + ingestion of resulting blobs)
- Enable Lovable Cloud (one-time)
