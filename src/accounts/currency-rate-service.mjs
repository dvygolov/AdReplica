import { normalizeCurrency } from "../domain/currency.mjs";

const ECB_ENDPOINT = "https://api.frankfurter.app/latest";
const FALLBACK_ENDPOINT = "https://open.er-api.com/v6/latest";

/**
 * Reference exchange rates, cached per pair. A manual rate always wins.
 *
 * Ads Manager runs under a strict Content-Security-Policy, so a plain `fetch`
 * from the page is blocked - that is the "NetworkError" the operator saw. Every
 * request goes through the extension's own fetch bridge, which is not subject to
 * the page policy, and a second provider covers ECB outages.
 */
export class CurrencyRateService {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
    this.cache = new Map();
    this.rate = this.rate.bind(this);
    this.request = this.request.bind(this);
  }

  request(url) {
    const bridge = this.dependencies.fetchImpl;
    if (typeof bridge === "function") {
      return bridge(url, { credentials: "omit" });
    }
    return fetch(url);
  }

  async readEcb(source, target) {
    const response = await this.request(
      `${ECB_ENDPOINT}?from=${encodeURIComponent(source)}&to=${encodeURIComponent(target)}`,
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const value = Number(payload?.rates?.[target]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { rate: value, source: `ECB ${payload?.date || ""}`.trim() };
  }

  async readFallback(source, target) {
    const response = await this.request(
      `${FALLBACK_ENDPOINT}/${encodeURIComponent(source)}`,
    );
    if (!response.ok) return null;
    const payload = await response.json();
    const value = Number(payload?.rates?.[target]);
    if (!Number.isFinite(value) || value <= 0) return null;
    const stamp = payload?.time_last_update_utc || "";
    return { rate: value, source: `ER-API ${stamp}`.trim() };
  }

  async rate(from, to) {
    const source = normalizeCurrency(from);
    const target = normalizeCurrency(to);
    if (!source || !target) return { ok: false, reason: "unknown currency" };
    if (source === target)
      return { ok: true, rate: 1, source: "same currency" };
    const key = `${source}:${target}`;
    if (this.cache.has(key)) return { ...this.cache.get(key), cached: true };
    const problems = [];
    for (const read of [this.readEcb, this.readFallback]) {
      try {
        const result = await read.call(this, source, target);
        if (!result) {
          problems.push(`${read.name}: no value`);
          continue;
        }
        const value = { ok: true, rate: result.rate, source: result.source };
        this.cache.set(key, value);
        return value;
      } catch (error) {
        problems.push(`${read.name}: ${String(error?.message || error)}`);
      }
    }
    return { ok: false, reason: problems.join("; ") || "rate unavailable" };
  }
}
