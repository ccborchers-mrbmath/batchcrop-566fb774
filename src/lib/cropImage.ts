export interface CropValues {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CropMode = "crop" | "whiteout";

export async function whiteOutImageFile(
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

      const canvas = document.createElement("canvas");
      canvas.width = srcW;
      canvas.height = srcH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Draw the full image
      ctx.drawImage(img, 0, 0);

      // White out the edges
      ctx.fillStyle = "#ffffff";
      if (crop.top > 0) ctx.fillRect(0, 0, srcW, crop.top);
      if (crop.bottom > 0) ctx.fillRect(0, srcH - crop.bottom, srcW, crop.bottom);
      if (crop.left > 0) ctx.fillRect(0, 0, crop.left, srcH);
      if (crop.right > 0) ctx.fillRect(srcW - crop.right, 0, crop.right, srcH);

      const mime =
        file.type === "image/png"  ? "image/png"  :
        file.type === "image/webp" ? "image/webp" :
        file.type && file.type !== "" ? "image/jpeg" :
        "image/png";

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        mime,
        1.0
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
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
        file.type === "image/png"  ? "image/png"  :
        file.type === "image/webp" ? "image/webp" :
        file.type && file.type !== "" ? "image/jpeg" :
        "image/png";

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        mime,
        1.0
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

      const t = (source as File).type;
      const mime =
        t === "image/png"  ? "image/png"  :
        t === "image/webp" ? "image/webp" :
        t && t !== "" ? "image/jpeg" :
        "image/png";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime,
        1.0
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export type RegionMode = "extract" | "whiteout";

/**
 * White out multiple regions on a single image (fill them with solid white).
 * Returns the full image with the specified regions painted white.
 */
export async function whiteOutRegions(source: Blob, regions: Region[]): Promise<Blob> {
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
      ctx.fillStyle = "#ffffff";
      for (const r of regions) {
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }

      const t = (source as File).type;
      const mime =
        t === "image/png"  ? "image/png"  :
        t === "image/webp" ? "image/webp" :
        t && t !== "" ? "image/jpeg" :
        "image/png";

      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")),
        mime,
        1.0
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
