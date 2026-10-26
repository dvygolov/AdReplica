import { normalizeCurrency } from "../domain/currency.mjs";

const ENDPOINT = "https://api.frankfurter.app/latest";

/** ECB reference rates, cached per pair. A manual rate always wins. */
export class CurrencyRateService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.cache = new Map();
    this.rate = this.rate.bind(this);
  }

  async rate(from, to) {
    const source = normalizeCurrency(from);
    const target = normalizeCurrency(to);
    if (!source || !target) return { ok: false, reason: "unknown currency" };
    if (source === target)
      return { ok: true, rate: 1, source: "same currency" };
    const key = `${source}:${target}`;
    if (this.cache.has(key)) return { ...this.cache.get(key), cached: true };
    try {
      const response = await fetch(
        `${ENDPOINT}?from=${encodeURIComponent(source)}&to=${encodeURIComponent(target)}`,
      );
      if (!response.ok) {
        return {
          ok: false,
          reason: `rate service answered ${response.status}`,
        };
      }
      const payload = await response.json();
      const value = Number(payload?.rates?.[target]);
      if (!Number.isFinite(value) || value <= 0) {
        return { ok: false, reason: "rate service returned no value" };
      }
      const result = {
        ok: true,
        rate: value,
        source: `ECB ${payload?.date || ""}`.trim(),
      };
      this.cache.set(key, result);
      return result;
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  }
}
