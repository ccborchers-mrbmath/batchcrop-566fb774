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
