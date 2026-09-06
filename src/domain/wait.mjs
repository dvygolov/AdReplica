import { sleep } from "../utils/object.mjs";

export async function waitForCondition(
  label,
  predicate,
  timeoutMs = 120000,
  intervalMs = 1000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await predicate();
      if (result) {
        return result;
      }
    } catch (_error) {
      // noop
    }
    await sleep(intervalMs);
  }
  throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`);
}
