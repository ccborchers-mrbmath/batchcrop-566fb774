import * as pdfjsLib from "pdfjs-dist";

// Keep API + worker on the exact same runtime version to avoid mismatch errors.
const pdfjsVersion = pdfjsLib.version;
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

/**
 * Convert every page of a PDF file into PNG Blobs.
 * @param file  The PDF File object
 * @param scale Render scale (2 = 2×, gives ~150dpi for A4)
 * @param onProgress Called after each page with (pageIndex, totalPages)
 */
export async function pdfToImages(
  file: File,
  scale = 2,
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; name: string }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const total = pdf.numPages;
  const results: { blob: Blob; name: string }[] = [];

  const baseName = file.name.replace(/\.pdf$/i, "");

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))),
        "image/png"
      );
    });

    const pageNum = String(i).padStart(String(total).length, "0");
    results.push({ blob, name: `${baseName}_p${pageNum}.png` });

    onProgress?.(i, total);
  }

  return results;
}
