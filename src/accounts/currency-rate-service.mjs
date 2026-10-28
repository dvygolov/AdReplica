import { normalizeCurrency } from "../domain/currency.mjs";

/**
 * Currency conversion for budgets, taken only from Meta.
 *
 * Meta exposes `account_currency_ratio_to_usd` on AdAccount: the number of
 * account-currency units per 1 USD. It is undocumented but reachable with the
 * Ads Manager token the payload already holds, and it is the exact ratio Meta
 * applies to budgets, so no third-party service can do better.
 *
 * There is deliberately no fallback to public FX APIs: Ads Manager runs under a
 * Content-Security-Policy that allows only Facebook origins, so any request to
 * an external host dies with a NetworkError before it leaves the page.
 */
export class CurrencyRateService {
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
    this.ratios = new Map();
    this.ratioToUsd = this.ratioToUsd.bind(this);
    this.metaRate = this.metaRate.bind(this);
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
}
