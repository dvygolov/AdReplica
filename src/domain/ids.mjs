export function normalizeDraftId(value) {
  return String(value ?? "").replace(/^addraft_/, "");
}

export function normalizeAccountId(value) {
  return String(value || "")
    .replace(/^act_/, "")
    .replace(/[^\d]/g, "");
}
