/**
 * Generate file names for numbered images with sub-part logic.
 *
 * Rules:
 * - Each labeled image starts a new "group".
 * - If a labeled image is followed by unlabeled images before the next label,
 *   the labeled one becomes "Xa" and the unlabeled ones become "Xb", "Xc", etc.
 * - If a labeled image stands alone (next image also has a label or it's the last),
 *   it's just "X" with no sub-part suffix.
 * - Unlabeled images before any label get generic names like "image_1".
 *
 * @returns Array of individual file name parts (without batch prefix or extension).
 */
export function generateFileNames(
  images: { label: string }[]
): string[] {
  const result: string[] = new Array(images.length).fill("");

  // First pass: identify groups (label + following unlabeled images)
  let i = 0;
  let orphanCounter = 1;

  while (i < images.length) {
    if (images[i].label) {
      // Find how many unlabeled images follow this one
      let j = i + 1;
      while (j < images.length && !images[j].label) {
        j++;
      }
      const groupSize = j - i; // includes the labeled image itself

      if (groupSize === 1) {
        // Standalone labeled image — no sub-parts needed
        result[i] = images[i].label;
      } else {
        // Multi-part group: labeled + unlabeled followers
        const subParts = "abcdefghijklmnopqrstuvwxyz";
        for (let k = 0; k < groupSize && k < subParts.length; k++) {
          result[i + k] = `${images[i].label}${subParts[k]}`;
        }
      }
      i = j;
    } else {
      // Unlabeled image before any label
      result[i] = `image_${orphanCounter}`;
      orphanCounter++;
      i++;
    }
  }

  return result;
}

/**
 * Build the full file name: batchName_individualName.ext
 */
export function buildFullFileName(
  batchName: string,
  individualName: string,
  ext: string
): string {
  const sanitized = (s: string) => s.replace(/[<>:"/\\|?*]/g, "_").trim();
  const batch = sanitized(batchName);
  const individual = sanitized(individualName);

  if (batch && individual) return `${batch}_${individual}${ext}`;
  if (batch) return `${batch}${ext}`;
  if (individual) return `${individual}${ext}`;
  return `image${ext}`;
}
