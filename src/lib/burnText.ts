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

      const padTop = overlay.padding?.top ?? 0;
      const padRight = overlay.padding?.right ?? 0;
      const padBottom = overlay.padding?.bottom ?? 0;
      const padLeft = overlay.padding?.left ?? 0;

      // Box top-left in image-pixel coordinates
      const boxX = overlay.x * canvas.width;
      const boxY = overlay.y * canvas.height;

      // Text origin inside the box (top-left of the text itself)
      const textX = boxX + padLeft;
      const textY = boxY + padTop;

      // Measure text
      const metrics = ctx.measureText(overlay.text);
      const textW = metrics.width;

      // CSS lineHeight:1 means the line box = fontSize, with the glyph
      // roughly centred inside it.  Canvas textBaseline:"top" places the
      // top of the em-square at the drawn coordinate, which matches CSS
      // line-height:1 closely.  But the white background must cover the
      // full area the CSS box covers, which is fontSize tall plus padding.
      const textH = fontPx * 1.2; // generous to cover descenders & accents

      // Draw white background covering the full box
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        boxX,
        boxY,
        padLeft + textW + padRight,
        padTop + textH + padBottom
      );

      // Draw text using alphabetic baseline for precise vertical control.
      // CSS positions the top of the text at (boxY + padTop).
      // With textBaseline:"alphabetic", we need to add the ascent.
      // The ascent from "top" to "alphabetic" ≈ fontSize * 0.8 for most fonts.
      const ascent = metrics.actualBoundingBoxAscent ?? fontPx * 0.8;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#000000";
      ctx.fillText(overlay.text, textX, textY + ascent);

      console.log(`[burn] canvas=${canvas.width}x${canvas.height} box=(${boxX.toFixed(1)},${boxY.toFixed(1)}) text=(${textX.toFixed(1)},${(textY+ascent).toFixed(1)}) textW=${textW.toFixed(1)} textH=${textH.toFixed(1)} ascent=${ascent.toFixed(1)} pad=(${padTop},${padRight},${padBottom},${padLeft}) font=${fontPx}px rectW=${(padLeft+textW+padRight).toFixed(1)} rectH=${(padTop+textH+padBottom).toFixed(1)}`);

      const mime =
        (source as File).type === "image/png" ? "image/png" :
        (source as File).type === "image/webp" ? "image/webp" :
        "image/jpeg";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime, 0.95
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}
