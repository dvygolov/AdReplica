import { deepClone } from "../utils/object.mjs";

export function hasPositiveBudget(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return numeric > 0;
  }
  return Boolean(String(value).trim());
}

export function hasDynamicCreativeInPackage(packageData) {
  if (!packageData || !Array.isArray(packageData.adsets)) {
    return false;
  }
  return packageData.adsets.some(
    (adset) =>
      Boolean(adset?.is_dynamic_creative) ||
      Boolean(adset?.is_dynamic_creative_optimization) ||
      Boolean(adset?.creative_sequence) ||
      Boolean(adset?.asset_feed_id),
  );
}

export function stripVolatileEntityFields(entity) {
  const next = deepClone(entity || {});
  delete next.effective_status;
  return next;
}

export function normalizeExportScheduleValue(value, options = {}) {
  const dropPast = Boolean(options.dropPast);
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  if (parsed.getUTCFullYear() <= 1970) {
    return "";
  }
  if (dropPast && parsed.getTime() < Date.now() - 60_000) {
    return "";
  }
  return value;
}

export function normalizeExportScheduleFields(entity, fields, options = {}) {
  const next = deepClone(entity || {});
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(next, field)) {
      continue;
    }
    const normalized = normalizeExportScheduleValue(next[field], options);
    if (normalized) {
      next[field] = normalized;
    } else {
      delete next[field];
    }
  }
  return next;
}

export function normalizeCreativeExportRaw(raw) {
  return deepClone(raw || {});
}

export function normalizeScheduleValue(
  value,
  fallbackFutureDays,
  options = {},
) {
  const preservePast = Boolean(options.preservePast);
  const buildFutureIso = (days) => {
    const offsetMs = days ? days * 86400000 : 5 * 60 * 1000;
    return new Date(Date.now() + offsetMs).toISOString();
  };
  if (!value) {
    if (fallbackFutureDays) {
      return buildFutureIso(fallbackFutureDays);
    }
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  if (parsed.getUTCFullYear() <= 1970) {
    return "";
  }
  if (parsed.getTime() < Date.now() - 60_000) {
    if (preservePast) {
      return value;
    }
    if (fallbackFutureDays) {
      return buildFutureIso(fallbackFutureDays);
    }
    return buildFutureIso(0);
  }
  return value;
}

export function parseScheduleDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1970) {
    return null;
  }
  return date;
}

export function buildShiftedScheduleWindow(
  sourceStart,
  sourceEnd,
  options = {},
) {
  const requireEnd = Boolean(options.requireEnd);
  const anchor =
    options.anchor instanceof Date
      ? new Date(options.anchor.getTime())
      : new Date(Date.now() + 5 * 60 * 1000);
  const start = parseScheduleDate(sourceStart);
  const end = parseScheduleDate(sourceEnd);
  const result = {
    start: "",
    end: "",
  };

  if (start || end || requireEnd) {
    result.start = anchor.toISOString();
  }

  if (end && start && end.getTime() > start.getTime()) {
    let durationMs = end.getTime() - start.getTime();
    if (requireEnd) {
      durationMs = Math.max(durationMs, 25 * 60 * 60 * 1000);
    }
    result.end = new Date(anchor.getTime() + durationMs).toISOString();
  } else if (requireEnd) {
    result.end = new Date(anchor.getTime() + 30 * 86400000).toISOString();
  } else if (end && !start) {
    result.end = new Date(anchor.getTime() + 30 * 86400000).toISOString();
  }

  return result;
}
