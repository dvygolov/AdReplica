/**
 * Matching between the media slots of a package and the files the operator has.
 *
 * A slot is filled when the operator picked a file for it explicitly, or when a
 * file carries the expected name. Video thumbnails are cosmetic: Meta fills one
 * in, so an empty thumbnail slot is reported but never counted as missing.
 */
export function isOptionalMediaSlot(slot) {
  return /thumbnail/i.test(String(slot?.slotKind || ""));
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
    const chosen =
      overrides.get(slot.key) ||
      (slot.expectedSha256 ? fileHashes.get(slot.expectedSha256) : null) ||
      files.get(String(slot.expectedFileName || ""));
    const optional = isOptionalMediaSlot(slot);
    const status = chosen ? "matched" : optional ? "optional" : "missing";
    if (status === "matched") matched += 1;
    if (status === "missing") missing += 1;
    return { slot, chosen: chosen || null, status, optional };
  });
  return { rows, names, matched, missing, total: slots.length };
}
