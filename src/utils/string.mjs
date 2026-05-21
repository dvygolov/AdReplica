export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function stripFacebookPrelude(text) {
  return typeof text === "string" && text.startsWith("for (;;);") ? text.slice(9) : text;
}

export function sanitizeFileName(value) {
  return String(value || "adreplica")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "adreplica";
}
