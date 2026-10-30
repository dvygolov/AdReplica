/**
 * Matching between the media slots of a package and the files the operator has.
 *
 * A slot is filled when the operator picked a file for it explicitly, when a
 * file carries the expected name, or when its name matches ignoring the
 * extension: an export says `tel__image_01.jpg` while Meta serves WebP, so
 * `tel__image_01.webp` belongs to the same slot. Video thumbnails are cosmetic:
 * Meta fills one in, so an empty thumbnail slot is reported but never counted
 * as missing.
 */
export function isOptionalMediaSlot(slot) {
  return /thumbnail/i.test(String(slot?.slotKind || ""));
}

/** Lower-cased name without the extension: `tel__image_01.jpg` -> `tel__image_01`. */
export function baseMediaName(fileName) {
  return String(fileName || "")
    .replace(/\.[^./\\]+$/, "")
    .trim()
    .toLowerCase();
}

/** A file from the map whose name matches the expected name ignoring the extension. */
export function findFileByBaseName(files, fileName) {
  if (!files || typeof files.keys !== "function") return null;
  const base = baseMediaName(fileName);
  if (!base) return null;
  for (const key of files.keys()) {
    if (baseMediaName(key) === base) return files.get(key);
  }
  return null;
}

/**
 * Picks a local file for every expected file name.
 *
 * Names win. Whatever is left is paired by position only when the counts line
 * up exactly, so one dropped creative still fills the one slot the package
 * needs even if the operator renamed the file.
 */
export function assignLocalFiles(expectedNames = [], files = new Map()) {
  const picked = new Map();
  const used = new Set();
  const byBase = new Map();
  for (const [name, file] of files || []) {
    if (!byBase.has(baseMediaName(name))) {
      byBase.set(baseMediaName(name), { name, file });
    }
  }
  for (const expected of expectedNames) {
    const hit = byBase.get(baseMediaName(expected));
    if (hit && !used.has(hit.name)) {
      picked.set(expected, hit.file);
      used.add(hit.name);
    }
  }
  const missingNames = expectedNames.filter((name) => !picked.has(name));
  const leftovers = [...(files || [])].filter(([name]) => !used.has(name));
  if (missingNames.length > 0 && missingNames.length === leftovers.length) {
    missingNames.forEach((expected, index) => {
      picked.set(expected, leftovers[index][1]);
      used.add(leftovers[index][0]);
    });
  }
  return { picked, used };
}

export function matchMediaSlots({
  slots = [],
  files = new Map(),
  overrides = new Map(),
  fileHashes = new Map(),
} = {}) {
  const names = [...files.keys()].sort();
  let matched = 0;
  let missing = 0;
  const rows = slots.map((slot) => {
    const expectedName = String(slot.expectedFileName || "");
    const chosen =
      overrides.get(slot.key) ||
      (slot.expectedSha256 ? fileHashes.get(slot.expectedSha256) : null) ||
      files.get(expectedName) ||
      findFileByBaseName(files, expectedName);
    const optional = isOptionalMediaSlot(slot);
    const status = chosen ? "matched" : optional ? "optional" : "missing";
    if (status === "matched") matched += 1;
    if (status === "missing") missing += 1;
    return { slot, chosen: chosen || null, status, optional };
  });
  return { rows, names, matched, missing, total: slots.length };
}
