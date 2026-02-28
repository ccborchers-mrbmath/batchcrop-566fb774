/**
 * Burn a text label onto an image blob using Canvas.
 * Returns a new Blob with the text rendered at the given position.
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

      // Box top-left is at (px, py) — same as the preview's CSS positioning.
      // Text is drawn inside the box, offset by padding.
      const px = overlay.x * canvas.width;
      const py = overlay.y * canvas.height;

      // Measure text for background
      const metrics = ctx.measureText(overlay.text);
      const textW = metrics.width;
      // Use actual measured height when available, otherwise fall back to fontSize
      const ascent = metrics.actualBoundingBoxAscent ?? fontPx * 0.8;
      const descent = metrics.actualBoundingBoxDescent ?? fontPx * 0.2;
      const textH = ascent + descent;
      const padTop = overlay.padding?.top ?? 0;
      const padRight = overlay.padding?.right ?? 0;
      const padBottom = overlay.padding?.bottom ?? 0;
      const padLeft = overlay.padding?.left ?? 0;

      // White background — box starts at (px, py), text inside at (px+padLeft, py+padTop)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px, py, padLeft + textW + padRight, padTop + textH + padBottom);

      // Black text — drawn at the padded offset inside the box
      ctx.fillStyle = "#000000";
      ctx.fillText(overlay.text, px + padLeft, py + padTop);

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
