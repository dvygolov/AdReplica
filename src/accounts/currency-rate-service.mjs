import { normalizeCurrency } from "../domain/currency.mjs";

const ECB_ENDPOINT = "https://api.frankfurter.app/latest";
const FALLBACK_ENDPOINT = "https://open.er-api.com/v6/latest";

/**
 * Exchange rates, cached per pair. A manual rate always wins.
 *
 * Meta exposes an internal `account_currency_ratio_to_usd` on AdAccount: the
 * number of account-currency units per 1 USD. It is reachable only with an Ads
 * Manager token, which is exactly what the payload holds, and it is the rate
 * Meta itself applies to budgets - so it is the primary source. A pair is
 * converted as ratio(target) / ratio(source).
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
    this.ratios = new Map();
    this.rate = this.rate.bind(this);
    this.request = this.request.bind(this);
  }

  /** Account-currency units per 1 USD, straight from the ad account. */
  async ratioToUsd(accountId) {
    const id = String(accountId || "").replace(/^act_/, "");
    if (!id) return null;
    if (this.ratios.has(id)) return this.ratios.get(id);
    const client = this.dependencies.graphClient;
    if (!client?.graphFetch) return null;
    let row = null;
    try {
      row = await client.graphFetch(`act_${id}`, {
        query: { fields: "currency,account_currency_ratio_to_usd" },
      });
    } catch {
      this.ratios.set(id, null);
      return null;
    }
    if (Array.isArray(row)) row = row[0] || null;
    const ratio = Number(row?.account_currency_ratio_to_usd);
    const value =
      Number.isFinite(ratio) && ratio > 0
        ? { ratio, currency: normalizeCurrency(row?.currency) || "" }
        : null;
    this.ratios.set(id, value);
    return value;
  }

  /** Rate between two ad accounts, taken from Meta's own conversion. */
  async metaRate(sourceAccountId, targetAccountId) {
    if (!sourceAccountId || !targetAccountId) return null;
    const [source, target] = await Promise.all([
      this.ratioToUsd(sourceAccountId),
      this.ratioToUsd(targetAccountId),
    ]);
    if (!source?.ratio || !target?.ratio) return null;
    const rate = target.ratio / source.ratio;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return {
      rate,
      source: `Meta ${source.currency || "?"}→${target.currency || "?"}`,
    };
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
