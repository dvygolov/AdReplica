import { deepClone } from "../utils/object.mjs";
import { normalizeAccountId, normalizeDraftId } from "./ids.mjs";

export function draftItem(field, value) {
  return { field, new_value: String(value) };
}

export function draftValueItem(field, value) {
  return { field, new_value: value };
}

export function draftJsonItem(field, value) {
  return { field, new_value: deepClone(value) };
}

export function formatGraphDraftTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absOffset / 60);
  const offsetRemainder = absOffset % 60;
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${sign}${pad(offsetHours)}${pad(offsetRemainder)}`,
  ].join("");
}

export function getDraftValueEntry(values, field) {
  return (
    (Array.isArray(values) ? values : []).find(
      (item) => String(item?.field || "") === String(field || ""),
    ) || null
  );
}

export function parseDraftStoredValue(value) {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  const first = trimmed[0];
  const looksJsonLike =
    first === "{" ||
    first === "[" ||
    first === '"' ||
    /^-?\d+(?:\.\d+)?$/.test(trimmed) ||
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null";
  if (!looksJsonLike) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return value;
  }
}

export function getDraftValue(values, field) {
  return parseDraftStoredValue(getDraftValueEntry(values, field)?.new_value);
}

export function createDraftImportTransaction(accountId, draftId) {
  return {
    accountId: normalizeAccountId(accountId),
    draftId: normalizeDraftId(draftId),
    tempIds: new Set(),
  };
}

export function filterDraftFragmentsForTransaction(
  fragments,
  draftTransaction = null,
) {
  const list = Array.isArray(fragments) ? fragments : [];
  if (!(draftTransaction?.tempIds instanceof Set)) {
    return list;
  }
  return list.filter((fragment) =>
    draftTransaction.tempIds.has(
      String(getDraftValue(fragment?.values, "tempID") ?? ""),
    ),
  );
}

export function setDraftValue(values, field, value) {
  const nextValues = Array.isArray(values)
    ? values.map((item) => deepClone(item))
    : [];
  const existing = nextValues.find(
    (item) => String(item?.field || "") === String(field || ""),
  );
  if (existing) {
    existing.new_value = deepClone(value);
  } else {
    nextValues.push({ field, new_value: deepClone(value) });
  }
  return nextValues;
}

export function ensureDraftCreativeDestinationSpec(
  creative,
  fallbackDestinationSpec = null,
) {
  if (!creative || typeof creative !== "object" || !creative.asset_feed_spec) {
    return false;
  }
  if (
    creative.destination_spec?.native_commerce_experience?.shop?.action_metadata
  ) {
    return false;
  }
  if (fallbackDestinationSpec && typeof fallbackDestinationSpec === "object") {
    creative.destination_spec = deepClone(fallbackDestinationSpec);
    return true;
  }
  creative.destination_spec = {
    native_commerce_experience: {
      shop: {
        action_metadata: {
          type: "DEFAULT_OFF",
        },
      },
    },
  };
  return true;
}
