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
      ctx.font = `${fontPx}px "${overlay.fontFamily}", sans-serif`;
      ctx.textBaseline = "top";

      const px = overlay.x * canvas.width;
      const py = overlay.y * canvas.height;

      // Measure text for background
      const metrics = ctx.measureText(overlay.text);
      const textW = metrics.width;
      const textH = fontPx * 1.25; // approximate line-height
      const pad = fontPx * 0.3;

      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px - pad, py - pad, textW + pad * 2, textH + pad * 2);

      // Black text
      ctx.fillStyle = "#000000";
      ctx.fillText(overlay.text, px, py);

      // Debug: verify pixels at expected text position
      const checkX = Math.max(0, Math.min(canvas.width - 1, Math.round(px + textW / 2)));
      const checkY = Math.max(0, Math.min(canvas.height - 1, Math.round(py + fontPx / 2)));
      const pixel = ctx.getImageData(checkX, checkY, 1, 1).data;
      console.log(`[burn-debug] canvas=${canvas.width}x${canvas.height} px=${px.toFixed(1)} py=${py.toFixed(1)} textW=${textW.toFixed(1)} checkPixel@(${checkX},${checkY})=[${pixel[0]},${pixel[1]},${pixel[2]}]`);

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
