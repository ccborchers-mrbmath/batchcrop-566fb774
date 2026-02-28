

## Improve Image Quality from PDF to Download

### Problem
The PDF-to-image conversion currently renders at **2x scale** (~144 DPI for a standard 72 DPI PDF). This produces noticeably softer output compared to the original vector-based PDF, especially for text-heavy documents. Additionally, some downstream operations (crop, normalize, burn text) output JPEG at 0.95 quality even when the source is PNG.

### Changes

#### 1. Increase PDF render scale from 2x to 4x (~288 DPI)
**File: `src/lib/pdfToImages.ts`**
- Change the default `scale` parameter from `2` to `4`
- This doubles the resolution of rendered pages, producing much sharper output that closely matches the original PDF quality
- Also update the call site in `src/pages/Index.tsx` (line 118) to pass `4` explicitly

#### 2. Ensure PNG stays PNG throughout the pipeline (no lossy re-encoding)
**Files: `src/lib/cropImage.ts`, `src/lib/normalizeImages.ts`, `src/lib/burnText.ts`**
- The current code checks `file.type` to decide output format, but Blob objects created from PDF conversion may not carry the `.type` property reliably
- Add a fallback: if `file.type` is empty or unrecognized, default to `"image/png"` instead of `"image/jpeg"`
- This prevents accidental JPEG compression of what should be lossless PNG images
- For the cases that do output JPEG, increase quality from `0.95` to `1.0`

### Summary of file changes
| File | Change |
|------|--------|
| `src/lib/pdfToImages.ts` | Default scale 2 to 4 |
| `src/pages/Index.tsx` | Update pdfToImages call to use scale 4 |
| `src/lib/cropImage.ts` | Default to PNG for unknown types; JPEG quality to 1.0 |
| `src/lib/normalizeImages.ts` | Default to PNG for unknown types; JPEG quality to 1.0 |
| `src/lib/burnText.ts` | Default to PNG for unknown types; JPEG quality to 1.0 |

### Trade-off
Higher scale means larger file sizes and slightly longer PDF conversion time, but the quality improvement is significant and well worth it for your use case.
