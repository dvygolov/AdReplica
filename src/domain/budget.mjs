import { hasPositiveBudget } from "./schedule.mjs";
import { draftItem, draftJsonItem } from "./draft-values.mjs";

export function hasAdsetDayParting(adset) {
  if (Array.isArray(adset?.adset_schedule)) {
    return adset.adset_schedule.length > 0;
  }
  if (
    typeof adset?.adset_schedule === "string" &&
    adset.adset_schedule.trim()
  ) {
    try {
      const parsed = JSON.parse(adset.adset_schedule);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch (_error) {
      return true;
    }
  }
  return false;
}

export function packageHasDayParting(pkg) {
  return (
    Array.isArray(pkg?.adsets) &&
    pkg.adsets.some((adset) => hasAdsetDayParting(adset))
  );
}

export function hasCampaignLevelBudget(campaign) {
  return (
    hasPositiveBudget(campaign?.daily_budget) ||
    hasPositiveBudget(campaign?.lifetime_budget)
  );
}

export function shouldIncludeCampaignBidStrategy(campaign) {
  return Boolean(campaign?.bid_strategy) && hasCampaignLevelBudget(campaign);
}

export function getEffectiveAdsetBidStrategy(adset, options = {}) {
  if (adset?.bid_strategy) {
    return adset.bid_strategy;
  }
  if (!options.hasCampaignBudget && options.campaignBidStrategy) {
    return options.campaignBidStrategy;
  }
  return "";
}

export function hasBidConstraints(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

export function applyBidFields(body, adset, options = {}) {
  const bidStrategy = getEffectiveAdsetBidStrategy(adset, options);
  if (bidStrategy) {
    body.bid_strategy = bidStrategy;
  }
  if (adset?.bid_amount) {
    body.bid_amount = adset.bid_amount;
  }
  if (hasBidConstraints(adset?.bid_constraints)) {
    body.bid_constraints = adset.bid_constraints;
  }
}

export function pushDraftBidFields(values, adset, options = {}) {
  const bidStrategy = getEffectiveAdsetBidStrategy(adset, options);
  if (bidStrategy) {
    values.push(draftItem("bid_strategy", bidStrategy));
  }
  if (adset?.bid_amount) {
    values.push(draftItem("bid_amount", adset.bid_amount));
  }
  if (hasBidConstraints(adset?.bid_constraints)) {
    values.push(draftJsonItem("bid_constraints", adset.bid_constraints));
  }
}

export function shouldIncludeAdsetSchedule(adset, options = {}) {
  return (
    Boolean(adset?.adset_schedule) &&
    !(options.hasCampaignBudget && hasAdsetDayParting(adset))
  );
}
