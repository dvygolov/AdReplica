export function getFacebookModule(name) {
  const runtimeRequire = globalThis?.require || globalThis?.window?.require;
  return typeof runtimeRequire === "function" ? runtimeRequire(name) : null;
}
