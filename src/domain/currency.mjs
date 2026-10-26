/** Currency helpers for cloning between accounts with different currencies. */

const BUDGET_FIELDS = ["daily_budget", "lifetime_budget", "bid_amount"];

export function normalizeCurrency(value) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

/** Meta stores budgets in minor units, so a rate is enough to rescale them. */
export function convertBudgets(packageData, rate) {
  const numeric = Number(rate);
  if (!packageData || !Number.isFinite(numeric) || numeric <= 0) return 0;
  if (Math.abs(numeric - 1) < 1e-9) return 0;
  let converted = 0;
  const scale = (holder) => {
    if (!holder) return;
    for (const field of BUDGET_FIELDS) {
      const value = Number(holder[field]);
      if (Number.isFinite(value) && value > 0) {
        holder[field] = Math.max(1, Math.round(value * numeric));
        converted += 1;
      }
    }
  };
  scale(packageData.campaign);
  for (const adset of Array.isArray(packageData.adsets)
    ? packageData.adsets
    : []) {
    scale(adset);
  }
  return converted;
}

/** Deep-enough copy so a cached package is never rescaled twice. */
export function withConvertedBudgets(packageData, rate) {
  const numeric = Number(rate);
  if (!packageData || !Number.isFinite(numeric) || numeric <= 0) {
    return packageData;
  }
  if (Math.abs(numeric - 1) < 1e-9) return packageData;
  const copy = {
    ...packageData,
    campaign: { ...(packageData.campaign || {}) },
    adsets: (packageData.adsets || []).map((adset) => ({ ...adset })),
  };
  convertBudgets(copy, numeric);
  return copy;
}
