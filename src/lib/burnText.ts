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
  canvasWidth: number
): BoundingBox | null {
  const scanWidth = Math.min(250, canvasWidth);
  const scanHeight = 160;
  const darkThreshold = 180;

  try {
    const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
    const data = imageData.data;

    let minX = scanWidth, minY = scanHeight, maxX = 0, maxY = 0;
    let foundDark = false;

    for (let y = 0; y < scanHeight; y++) {
      for (let x = 0; x < scanWidth; x++) {
        const idx = (y * scanWidth + x) * 4;
        if (data[idx] < darkThreshold && data[idx + 1] < darkThreshold && data[idx + 2] < darkThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          foundDark = true;
        }
      }
    }

    if (!foundDark || (maxX - minX) < 5 || (maxY - minY) < 5) return null;

    const width = maxX - minX;
    const height = maxY - minY;

    if (width > 200 || height > 120) {
      return detectNumberCluster(data, scanWidth, scanHeight, darkThreshold);
    }

    return { x: minX, y: minY, width, height };
  } catch {
    return null;
  }
}

function detectNumberCluster(
  data: Uint8ClampedArray,
  scanWidth: number,
  scanHeight: number,
  darkThreshold: number
): BoundingBox | null {
  const rowCounts: number[] = [];
  for (let y = 0; y < scanHeight; y++) {
    let count = 0;
    for (let x = 0; x < Math.min(scanWidth, 200); x++) {
      const idx = (y * scanWidth + x) * 4;
      if (data[idx] < darkThreshold && data[idx + 1] < darkThreshold && data[idx + 2] < darkThreshold) count++;
    }
    rowCounts.push(count);
  }

  const windowSize = 50;
  let bestStart = 0, bestSum = 0;
  for (let start = 0; start < scanHeight - windowSize; start++) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) sum += rowCounts[i];
    if (sum > bestSum) { bestSum = sum; bestStart = start; }
  }
  if (bestSum < 20) return null;

  let minX = scanWidth, maxX = 0, minY = scanHeight, maxY = 0;
  for (let y = bestStart; y < bestStart + windowSize && y < scanHeight; y++) {
    for (let x = 0; x < Math.min(scanWidth, 200); x++) {
      const idx = (y * scanWidth + x) * 4;
      if (data[idx] < darkThreshold && data[idx + 1] < darkThreshold && data[idx + 2] < darkThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

      const bbox = detectNumberBoundingBox(ctx, img.width);

      let eraseWidth: number, eraseHeight: number;
      let numberX: number, numberBaseline: number;
      const fontSize = 48;

      if (bbox) {
        const padX = 15, padY = 10;
        eraseWidth = bbox.x + bbox.width + padX;
        eraseHeight = bbox.y + bbox.height + padY;
        numberX = bbox.x + bbox.width + 4;
        numberBaseline = bbox.y + bbox.height + 10;
      } else {
        eraseWidth = 255;
        eraseHeight = 155;
        numberX = 228;
        numberBaseline = 105;
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
