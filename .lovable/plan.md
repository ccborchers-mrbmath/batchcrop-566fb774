## Goal

Add a **Split** tool, nested inside the per-image (Image tab) tools, that lets the user draw one or more horizontal lines on an image. Each line can be clicked, dragged vertically, and removed. On export, the image is sliced into N+1 pieces along those lines.

## UX

1. **Location**: New "Split" sub-section in the **Image tab sidebar**, alongside the existing per-image Region/Numbering controls. Not shown in the Batch tab.
2. **Activate**: Toggle "Split mode" button. When active, the `CropPreviewEditor` shows split-line interactions.
3. **Add a line**: Click anywhere on the image (in split mode) → a horizontal line is added at that y. Or click "+ Add split" in the sidebar to add one at the vertical center.
4. **Multiple lines**: Unlimited. Each line is independent. Sidebar lists them with their y-pixel values, sorted top-to-bottom.
5. **Drag**: Click and hold any existing line → drag vertically to reposition. Cursor changes to `ns-resize` on hover. Position updates live.
6. **Remove**: Hover a line → an × handle appears at the right edge. Click it to delete that line. Sidebar also has a trash icon per line and a "Clear all splits" button.
7. **Visual badge**: The image card in the queue shows a small badge (e.g. `2↕`) when split lines exist, mirroring the existing region count badge.
8. **Export**: Each image with N split lines produces N+1 output files named `name_part1of3.ext`, `name_part2of3.ext`, … inside the existing zip.

## Technical Plan

### Data model (`src/pages/Index.tsx`)
- Extend `ImageEntry` with `splits: number[]` — sorted y-coordinates in real pixels of the **batch-cropped** image (same coordinate space as `Region`).
- Add `updateSplits(id, splits)` callback mirroring `updateRegions`.

### New library helpers (`src/lib/cropImage.ts`)
- `splitImageHorizontally(source: Blob, splitYs: number[]): Promise<Blob[]>` — sorts/clamps the y values, draws each horizontal slice onto its own canvas, returns blobs top-to-bottom. Reuses the same MIME-type logic as `extractRegion`.
- `splitFileName(original: string, index: number, total: number): string` → `name_part{index+1}of{total}.ext`.

### Editor UI (`src/components/CropPreviewEditor.tsx`)
- New props: `splitMode: boolean`, `splits: number[]`, `onSplitsChange(next: number[])`.
- When `splitMode` is on:
  - Render each split as an absolutely-positioned horizontal line (full image width, 2px, primary color).
  - On image click (empty area) → append a new y to `splits`.
  - On line `mousedown` → start drag; `mousemove` updates that line's y (clamped within image, deduped); `mouseup` ends drag and re-sorts.
  - Hover handle (×) on the right edge of each line removes it.
  - Use the existing display↔real pixel scaling pattern (see `ImageCard.tsx` `scaleY`) so positions stay correct on resize.
- Disable region drawing while split mode is on (and vice versa) to avoid conflicting click handlers.

### Sidebar controls (in the existing Image-tab section, near Region controls)
- "Split" panel with: mode toggle, list of split y-values (each row: y-input + trash), "+ Add split" button, "Clear all" button.

### Image card badge (`src/components/ImageCard.tsx`)
- Accept optional `splitCount` prop and render a second small badge next to the region badge. Also draw faint horizontal overlay lines on the thumbnail (using the same scale logic as the crop overlays) so the user sees splits at a glance.

### Export pipeline (`handleCropAndDownload` in `src/pages/Index.tsx`)
- After producing `croppedBlob`, branch:
  - If `entry.splits.length > 0` → call `splitImageHorizontally(croppedBlob, entry.splits)` → write each result with `splitFileName`.
  - Else fall through to existing region/single logic.
- Update the single-output fast path to skip the zip when only one file is produced overall.

### Numbering pipeline (`enterNumberingMode`)
- Mirror the split branch so each slice becomes its own `NumberedImage` and gets its own auto-incremented label.

## Constraints / Decisions

- **v1 scope**: Splits and Regions are mutually exclusive per image (toggling one clears/disables the other). This keeps coordinate handling simple. Combined use can come later.
- Splits are applied **after** batch crop, so y-values stored in `splits` are relative to the cropped image — same convention as `Region`.

## Open Question (optional follow-up, not in v1)

- Should the split line offer a "snap to nearest blank row" helper, similar to the auto-detect numbering scanner? Easy to add later on top of the same data model.
