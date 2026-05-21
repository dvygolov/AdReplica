export function isPermissionDeniedGraphError(error) {
  const text = String(error || "");
  return /Permission Denied|OAuthException|["']code["']\s*:\s*10\b/i.test(text);
}

export function isCatalogCreateAdminPermissionError(error) {
  const text = String(error || "");
  return /Permission Required to Create Catalogue|you aren't an admin of this business|you are not an admin of this business|don't have permission to create a catalogue/i.test(text);
}
