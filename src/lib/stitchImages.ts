/**
 * Stitch a sequence of image blobs vertically into a single PNG.
 *
 * - Pieces are scaled to the widest piece's natural width (aspect ratio preserved).
 * - Output canvas height = sum of scaled heights; pieces abut with no gap.
 * - Background is filled white before drawing.
 * - Output format is image/png (lossless regardless of source types).
 *
 * Order of `blobs` is preserved top-to-bottom.
 */
export async function stitchVertically(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    throw new Error("stitchVertically: no blobs provided");
  }

  const loadImage = (blob: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });

  const imgs = await Promise.all(blobs.map(loadImage));

  const targetW = imgs.reduce((m, i) => Math.max(m, i.naturalWidth), 0);
  const scaledHeights = imgs.map((i) =>
    Math.round((i.naturalHeight * targetW) / i.naturalWidth)
  );
  const totalH = scaledHeights.reduce((a, b) => a + b, 0);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("stitchVertically: failed to get 2D context");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, totalH);

  let y = 0;
  for (let i = 0; i < imgs.length; i++) {
    const h = scaledHeights[i];
    ctx.drawImage(imgs[i], 0, y, targetW, h);
    y += h;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("stitchVertically: toBlob returned null"));
      else resolve(blob);
    }, "image/png");
  });
}
