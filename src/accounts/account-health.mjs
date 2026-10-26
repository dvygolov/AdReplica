/**
 * Ad-account health helpers.
 *
 * Meta only lets a settled, active account create new creatives. On an unsettled
 * account (account_status 3) draft creation still succeeds, but every ad
 * fragment comes back from Meta as `AD_DRAFT_PUBLISHING / Permission Error`
 * (code 1487194). AdReplica used to report that as "N invalid fragments", which
 * hides the real cause, so the clone is checked up front instead.
 */

const STATUS_LABELS = new Map([
  [1, "active"],
  [2, "disabled"],
  [3, "unsettled"],
  [7, "pending risk review"],
  [8, "pending settlement"],
  [9, "in grace period"],
  [100, "pending closure"],
  [101, "closed"],
  [201, "any active"],
  [202, "any closed"],
]);

export function describeAccountStatus(code) {
  const numeric = Number(code);
  if (!Number.isFinite(numeric)) return "unknown";
  return STATUS_LABELS.get(numeric) || `status ${numeric}`;
}

/** Reads `account_status` off the loaded account rows. Returns null when unknown. */
export function findAccountStatus(accounts, accountId) {
  const wanted = String(accountId || "").replace(/^act_/, "");
  if (!wanted || !Array.isArray(accounts)) return null;
  const row = accounts.find(
    (account) => String(account?.id || "").replace(/^act_/, "") === wanted,
  );
  const raw = row?.raw?.account_status ?? row?.accountStatus;
  const code = Number(raw);
  return Number.isFinite(code) && code > 0 ? code : null;
}

/**
 * @returns {{ok: boolean, unknown: boolean, code: number|null, status: string, message: string}}
 */
export function assessAccountHealth(accounts, accountId) {
  const normalized = String(accountId || "").replace(/^act_/, "");
  const code = findAccountStatus(accounts, accountId);
  if (code === null) {
    return {
      ok: true,
      unknown: true,
      code: null,
      status: "unknown",
      message: `Account status for act_${normalized} is unknown; continuing.`,
    };
  }
  const status = describeAccountStatus(code);
  if (code === 1) {
    return {
      ok: true,
      unknown: false,
      code,
      status,
      message: `act_${normalized} is active.`,
    };
  }
  return {
    ok: false,
    unknown: false,
    code,
    status,
    message:
      `act_${normalized} is not active (account_status ${code} — ${status}). ` +
      "Meta rejects creative creation on such accounts, so the clone would only " +
      "produce draft fragments with Permission Error 1487194. " +
      "Settle or re-enable the account, or pick another target.",
  };
}

const FRAGMENT_ERROR_HINTS = new Map([
  [
    1487194,
    {
      label: "Permission Error 1487194",
      advice: "Settle or re-enable the ad account, then retry.",
    },
  ],
  [
    1359188,
    {
      label: "ad account has no payment method (Meta error 1359188)",
      advice: "Add a payment method in Billing, then retry the clone.",
    },
  ],
]);

/**
 * Meta sometimes flags a freshly written draft ad with a publishing error
 * (for example `No Payment Method`, code 1359188) that clears on the next
 * validation pass. Those are worth one re-check; permission errors are not.
 */
export function isTransientFragmentFailure(fragments) {
  const list = Array.isArray(fragments) ? fragments : [];
  if (!list.length) return false;
  return list.every((fragment) => {
    const errors = Array.isArray(fragment?.active_errors)
      ? fragment.active_errors
      : [];
    if (!errors.length) return false;
    return errors.every((error) => {
      const code = Number(error?.error_code);
      const type = String(error?.error_type || "");
      if (code === 1487194) return false;
      return type === "AD_DRAFT_PUBLISHING" || code === 1359188;
    });
  });
}

/**
 * Turns Meta draft-fragment errors into readable sentences.
 * Without this the UI only says "N invalid fragments" and the operator cannot
 * tell a billing problem from a creative problem.
 */
export function explainDraftFragmentErrors(fragments) {
  const messages = [];
  for (const fragment of Array.isArray(fragments) ? fragments : []) {
    const kind = fragment?.ad_object_type || "draft";
    const errors = Array.isArray(fragment?.active_errors)
      ? fragment.active_errors
      : [];
    for (const error of errors) {
      const code = Number(error?.error_code);
      const hint = FRAGMENT_ERROR_HINTS.get(code);
      const summary = String(
        error?.error_summary || error?.error_description || "",
      ).trim();
      if (hint) {
        messages.push(
          `${hint.label}${summary ? `: ${summary}` : ""}. ${hint.advice}`,
        );
      } else {
        messages.push(
          `Meta rejected the ${kind} fragment: ${summary || "unknown error"}${
            Number.isFinite(code) && code ? ` (code ${code})` : ""
          }.`,
        );
      }
    }
    const publishError = String(fragment?.publish_error || "").trim();
    if (publishError) {
      messages.push(`Meta rejected the ${kind} fragment: ${publishError}.`);
    }
  }
  return [...new Set(messages)];
}
