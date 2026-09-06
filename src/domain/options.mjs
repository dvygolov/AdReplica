export function normalizeImportOptions(options) {
  if (
    !options ||
    typeof options !== "object" ||
    typeof options.preventDefault === "function"
  ) {
    return {};
  }
  return options;
}
