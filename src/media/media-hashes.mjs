const SHA256_HEX = /^[a-f0-9]{64}$/i;

/** Hash the actual bytes, not the file name or the format advertised by Meta. */
export async function sha256Blob(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") {
    throw new Error("Cannot hash media: the value is not a Blob or File.");
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SHA-256 is unavailable in this browser context.");
  }
  const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Build a content-addressed index sequentially so several large videos do not
 * get read into memory at once. Duplicate bytes intentionally share one entry.
 */
export async function indexMediaFilesBySha256(files, options = {}) {
  const index = new Map();
  for (const file of files || []) {
    try {
      const hash = await sha256Blob(file);
      if (!index.has(hash)) index.set(hash, file);
    } catch (error) {
      options.onError?.(file, error);
    }
  }
  return index;
}

export function normalizeMediaSha256(value) {
  const hash = String(value || "").trim().toLowerCase();
  return SHA256_HEX.test(hash) ? hash : "";
}

/** Find the hash belonging to either the current or pre-MIME-rename file name. */
export function getPackageMediaSha256(packageData, fileName) {
  const wanted = String(fileName || "");
  if (!wanted) return "";
  const entry = (packageData?.files || []).find(
    (file) =>
      String(file?.fileName || "") === wanted ||
      String(file?.originalFileName || "") === wanted,
  );
  return normalizeMediaSha256(entry?.sha256);
}
