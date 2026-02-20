export interface CropValues {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export async function cropImageFile(
  file: File,
  crop: CropValues
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;

      const newW = Math.max(1, srcW - crop.left - crop.right);
      const newH = Math.max(1, srcH - crop.top - crop.bottom);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(
        img,
        Math.min(crop.left, srcW - 1), // sx
        Math.min(crop.top, srcH - 1),  // sy
        newW,                           // sw
        newH,                           // sh
        0,                              // dx
        0,                              // dy
        newW,                           // dw
        newH                            // dh
      );

      // Determine mime type
      const mime =
        file.type === "image/png"
          ? "image/png"
          : file.type === "image/webp"
          ? "image/webp"
          : "image/jpeg";

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        mime,
        0.95
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

export function croppedFileName(original: string): string {
  const dot = original.lastIndexOf(".");
  if (dot === -1) return original + "_cropped";
  return original.slice(0, dot) + "_cropped" + original.slice(dot);
}

export interface Region {
  id: string;
  x: number; // real pixels from left of (batch-cropped) image
  y: number; // real pixels from top of (batch-cropped) image
  w: number;
  h: number;
}

/**
 * Extract a rectangular region (in real pixels) from a Blob/File.
 * The source blob is assumed to already have any batch crop applied.
 */
export async function extractRegion(source: Blob, region: Region): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, region.w);
      canvas.height = Math.max(1, region.h);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }

      ctx.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);

      const mime =
        (source as File).type === "image/png" ? "image/png" :
        (source as File).type === "image/webp" ? "image/webp" :
        "image/jpeg";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime,
        0.95
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export function regionFileName(original: string, index: number): string {
  const dot = original.lastIndexOf(".");
  const base = dot === -1 ? original : original.slice(0, dot);
  const ext  = dot === -1 ? "" : original.slice(dot);
  return `${base}_region${index + 1}${ext}`;
}
