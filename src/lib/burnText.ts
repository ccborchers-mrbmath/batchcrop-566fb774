/**
 * Burn a text label onto an image blob using Canvas.
 * Returns a new Blob with the text rendered at the given position.
 *
 * The coordinate system matches the CSS preview:
 *   (x, y) is a 0–1 fraction marking the top-left corner of the
 *   entire label **box** (padding included). Text is drawn inside
 *   the box offset by padding.
 */
export interface TextOverlay {
  text: string;
  x: number; // fraction 0–1 of image width (left edge of box)
  y: number; // fraction 0–1 of image height (top edge of box)
  fontFamily: string;
  fontSize: number; // in px, relative to the image's real pixel dimensions
  bold?: boolean;
  padding?: { top: number; right: number; bottom: number; left: number }; // px
}

export async function burnTextOntoImage(
  source: Blob,
  overlay: TextOverlay
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Configure text
      const fontPx = overlay.fontSize;
      const weight = overlay.bold ? "bold" : "normal";
      ctx.font = `${weight} ${fontPx}px "${overlay.fontFamily}", sans-serif`;
      ctx.textBaseline = "top";

      const padTop = overlay.padding?.top ?? 0;
      const padRight = overlay.padding?.right ?? 0;
      const padBottom = overlay.padding?.bottom ?? 0;
      const padLeft = overlay.padding?.left ?? 0;

      // Box top-left in image-pixel coordinates
      const boxX = overlay.x * canvas.width;
      const boxY = overlay.y * canvas.height;

      // Text origin inside the box (top-left of the text itself)
      const textX = boxX + padLeft;
      // CSS lineHeight:1 adds a small amount of internal leading above
      // the glyph that canvas textBaseline:"top" does not. Compensate by
      // shifting text down by ~12% of fontSize to match the CSS position.
      const cssLeadingOffset = fontPx * 0.12;
      const textY = boxY + padTop + cssLeadingOffset;

      // Measure text
      const metrics = ctx.measureText(overlay.text);
      const textW = metrics.width;

      // The preview CSS div also contains the GripVertical drag icon which
      // makes the white background wider than just the text. Account for
      // the icon width: max(10, fontSize * 0.6) + ~4px margin-left.
      const gripWidth = Math.max(10, fontPx * 0.6) + 4;

      // Height: use fontSize * 1.2 to cover full glyph including descenders
      const textH = fontPx * 1.2;

      // Draw white background covering the full box (including grip area)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        boxX,
        boxY,
        padLeft + textW + gripWidth + padRight,
        padTop + textH + padBottom
      );

      // Draw text
      ctx.fillStyle = "#000000";
      ctx.fillText(overlay.text, textX, textY);

      console.log(`[burn] canvas=${canvas.width}x${canvas.height} box=(${boxX.toFixed(1)},${boxY.toFixed(1)}) text=(${textX.toFixed(1)},${textY.toFixed(1)}) textW=${textW.toFixed(1)} gripW=${gripWidth.toFixed(1)} textH=${textH.toFixed(1)} pad=(${padTop},${padRight},${padBottom},${padLeft}) font=${fontPx}px rectW=${(padLeft+textW+gripWidth+padRight).toFixed(1)} rectH=${(padTop+textH+padBottom).toFixed(1)}`);

      const t = (source as File).type;
      const mime =
        t === "image/png"  ? "image/png"  :
        t === "image/webp" ? "image/webp" :
        t && t !== "" ? "image/jpeg" :
        "image/png";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime, 1.0
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ─── Auto-detect & replace: scan for original number, erase, redraw ─────

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detect the bounding box of dark content (the original question number)
 * in the top-left region of the image.
 */
function detectNumberBoundingBox(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
): BoundingBox | null {
  // Scan a generous top-left region
  const scanWidth = Math.min(Math.round(canvasWidth * 0.25), canvasWidth);
  const scanHeight = Math.min(Math.round(canvasHeight * 0.15), canvasHeight);
  const darkThreshold = 180;

  try {
    const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
    const data = imageData.data;

    const isDark = (x: number, y: number) => {
      const idx = (y * scanWidth + x) * 4;
      return data[idx] < darkThreshold && data[idx + 1] < darkThreshold && data[idx + 2] < darkThreshold;
    };

    // Build per-column dark pixel counts and row ranges
    const colInfo: { count: number; minY: number; maxY: number }[] = [];
    for (let x = 0; x < scanWidth; x++) {
      let count = 0, minY = scanHeight, maxY = 0;
      for (let y = 0; y < scanHeight; y++) {
        if (isDark(x, y)) {
          count++;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      colInfo.push({ count, minY, maxY });
    }

    // Find the first column with dark pixels (start of number)
    let startCol = -1;
    for (let x = 0; x < scanWidth; x++) {
      if (colInfo[x].count > 0) { startCol = x; break; }
    }
    if (startCol < 0) return null;

    // Walk right from startCol, allowing small gaps (up to gapTolerance empty columns)
    // but stopping at a large gap which indicates transition to body text
    const gapTolerance = Math.max(8, Math.round(canvasWidth * 0.008));
    let endCol = startCol;
    let gapRun = 0;

    for (let x = startCol + 1; x < scanWidth; x++) {
      if (colInfo[x].count > 0) {
        endCol = x;
        gapRun = 0;
      } else {
        gapRun++;
        if (gapRun > gapTolerance) break;
      }
    }

    // Compute bounding box from startCol..endCol
    let minY = scanHeight, maxY = 0;
    for (let x = startCol; x <= endCol; x++) {
      if (colInfo[x].count > 0) {
        if (colInfo[x].minY < minY) minY = colInfo[x].minY;
        if (colInfo[x].maxY > maxY) maxY = colInfo[x].maxY;
      }
    }

    const width = endCol - startCol;
    const height = maxY - minY;
    if (width < 3 || height < 3) return null;

    // Sanity: if the detected region is wider than ~5% of canvas, it's probably
    // picking up body text. Try to narrow using row-gap analysis.
    const maxNumberWidth = canvasWidth * 0.05;
    if (width > maxNumberWidth) {
      return narrowByRowGap(data, scanWidth, startCol, endCol, minY, maxY, darkThreshold, canvasWidth);
    }

    return { x: startCol, y: minY, width, height };
  } catch {
    return null;
  }
}

/**
 * If the column-gap approach captured too wide a region (number + nearby text),
 * try to find just the number by looking for vertical row-density clusters.
 */
function narrowByRowGap(
  data: Uint8ClampedArray,
  scanWidth: number,
  startCol: number,
  endCol: number,
  minY: number,
  maxY: number,
  darkThreshold: number,
  canvasWidth: number
): BoundingBox | null {
  // Look only at the first ~3% of canvas width from startCol
  const narrowEnd = Math.min(startCol + Math.round(canvasWidth * 0.03), endCol);

  let nMinY = maxY, nMaxY = minY, nMaxX = startCol;
  for (let y = minY; y <= maxY; y++) {
    for (let x = startCol; x <= narrowEnd; x++) {
      const idx = (y * scanWidth + x) * 4;
      if (data[idx] < darkThreshold && data[idx + 1] < darkThreshold && data[idx + 2] < darkThreshold) {
        if (y < nMinY) nMinY = y;
        if (y > nMaxY) nMaxY = y;
        if (x > nMaxX) nMaxX = x;
      }
    }
  }

  const w = nMaxX - startCol;
  const h = nMaxY - nMinY;
  if (w < 3 || h < 3) return null;

  return { x: startCol, y: nMinY, width: w, height: h };
}

/**
 * Auto-detect the original question number in the top-left of the image,
 * erase it with white, and draw the new number in the same position.
 */
export async function detectAndReplaceNumber(
  source: Blob,
  newLabel: string,
  fontFamily: string,
  bold: boolean
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }

      ctx.drawImage(img, 0, 0);

      const bbox = detectNumberBoundingBox(ctx, canvas.width, canvas.height);

      let eraseWidth: number, eraseHeight: number;
      let numberX: number, numberBaseline: number;
      // Scale font size relative to image height (targeting ~1.4% of height)
      const fontSize = Math.round(canvas.height * 0.014);

      if (bbox) {
        const padX = Math.round(fontSize * 0.3), padY = Math.round(fontSize * 0.2);
        eraseWidth = bbox.x + bbox.width + padX;
        eraseHeight = bbox.y + bbox.height + padY;
        numberX = bbox.x + bbox.width + Math.round(fontSize * 0.08);
        numberBaseline = bbox.y + bbox.height + Math.round(fontSize * 0.2);
      } else {
        // Fallback: scale to image dimensions
        eraseWidth = Math.round(canvas.width * 0.1);
        eraseHeight = Math.round(canvas.height * 0.045);
        numberX = Math.round(eraseWidth * 0.9);
        numberBaseline = Math.round(eraseHeight * 0.7);
      }

      // Erase original number
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, eraseWidth, eraseHeight);

      // Draw new number
      const weight = bold ? "bold" : "normal";
      ctx.fillStyle = "#000000";
      ctx.font = `${weight} ${fontSize}px "${fontFamily}", Times, serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(newLabel, numberX, numberBaseline);

      console.log(`[auto-detect] canvas=${canvas.width}x${canvas.height} bbox=${bbox ? `(${bbox.x},${bbox.y},${bbox.width},${bbox.height})` : 'null'} erase=(${eraseWidth},${eraseHeight}) draw=(${numberX},${numberBaseline})`);

      const t = (source as File).type;
      const mime =
        t === "image/png" ? "image/png" :
        t === "image/webp" ? "image/webp" :
        t && t !== "" ? "image/jpeg" :
        "image/png";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime, 1.0
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
