import {
  assessAccountHealth,
  isTransientFragmentFailure,
} from "../accounts/account-health.mjs";
import {
  getSourceCatalogsFromPackage,
  getSourcePagesFromPackage,
  getSourcePixelsFromPackage,
} from "../domain/package.mjs";
import { normalizeCurrency } from "../domain/currency.mjs";
import { sleep } from "../utils/object.mjs";

/**
 * Sequential mass clone: one source campaign into many target accounts.
 *
 * Meta allows a single draft per account, so the run is strictly sequential. A
 * target that fails is rolled back (its created ads, ad sets and campaign are
 * deleted) and the loop continues with the next account, so one broken account
 * never costs the operator the rest of the batch.
 */
export class MassCloneWorkflow {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.run = this.run.bind(this);
    this.runTarget = this.runTarget.bind(this);
    this.rollbackTarget = this.rollbackTarget.bind(this);
    this.selectedTargets = this.selectedTargets.bind(this);
  }

  selectedTargets() {
    const { state } = this.dependencies;
    const selection = state.massTargets || {};
    return (state.accounts || [])
      .filter((account) => selection[account.id]?.selected)
      .map((account) => ({
        accountId: String(account.id),
        name: account.name || String(account.id),
        pixelId: String(selection[account.id]?.pixelId || ""),
        pageId: String(selection[account.id]?.pageId || ""),
        catalogId: String(selection[account.id]?.catalogId || ""),
      }));
  }

  /** Monotonic counter behind the {n} macro: grows with every processed target. */
  nextSequence() {
    const { state } = this.dependencies;
    state.massSequence = (Number(state.massSequence) || 0) + 1;
    return state.massSequence;
  }

  /** Renders the campaign name template. Unknown macros stay untouched. */
  buildCampaignName(template, sourceName, account, context = {}) {
    const fallback = sourceName || "Cloned campaign";
    const raw = String(template || "").trim() || `${fallback} — {account}`;
    const vars = {
      source: fallback,
      account: account?.name || account?.accountId || "",
      account_id: String(account?.accountId || account?.id || ""),
      currency: context.currency || "",
      mode: context.mode || "",
      n: context.index ? String(context.index) : "",
      date: context.date || new Date().toISOString().slice(0, 10),
    };
    const rendered = raw
      .replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(vars, key)
          ? String(vars[key] ?? "")
          : match,
      )
      .trim();
    return rendered || fallback;
  }

  /** Pins every source pixel in the package to the pixel chosen for this target. */
  applyPixelChoice(packageData, pixelId) {
    const { state } = this.dependencies;
    if (!pixelId) return;
    const sourceIds = new Set([
      ...getSourcePixelsFromPackage(packageData).map((pixel) => pixel.id),
      ...Object.keys(state.clonePixelMappings || {}),
    ]);
    const mapping = { ...(state.clonePixelMappings || {}) };
    for (const id of sourceIds) mapping[id] = pixelId;
    state.clonePixelMappings = mapping;
  }

  /** Pins every source page in the package to the fan page chosen for this target. */
  applyPageChoice(packageData, pageId) {
    const { state } = this.dependencies;
    if (!pageId) return;
    const mapping = { ...(state.clonePageMappings || {}) };
    for (const page of getSourcePagesFromPackage(packageData)) {
      mapping[page.id] = pageId;
    }
    state.clonePageMappings = mapping;
  }

  /** Pins every source catalog to the catalog chosen for this target. */
  applyCatalogChoice(packageData, catalogId) {
    const { state } = this.dependencies;
    if (!catalogId) return;
    const mapping = { ...(state.cloneCatalogMappings || {}) };
    for (const catalog of getSourceCatalogsFromPackage(packageData)) {
      mapping[catalog.id] = catalogId;
    }
    state.cloneCatalogMappings = mapping;
  }

  accountCurrency(accountId) {
    const { state } = this.dependencies;
    const wanted = String(accountId || "").replace(/^act_/, "");
    const row = (state.accounts || []).find(
      (account) => String(account?.id) === wanted,
    );
    return normalizeCurrency(row?.raw?.currency || row?.currency);
  }

  /**
   * Budgets are stored in the account currency, so a clone across currencies
   * must rescale them. With no usable rate the target is refused instead of
   * silently copying a wrong budget.
   */
  async resolveCurrencyRate(target) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const from =
      this.accountCurrency(state.cloneSourceAccountId) ||
      normalizeCurrency(state.clonePackage?.source?.currency);
    const to = this.accountCurrency(target.accountId);
    state.cloneCurrency = from;
    if (!from || !to || from === to) {
      state.cloneCurrencyRate = 1;
      state.massCurrencyNote = from
        ? `${from} → ${to || from}: no conversion`
        : "source currency unknown: no conversion";
      return { ok: true, rate: 1, from, to };
    }
    const manual = Number(
      state.massRates?.[target.accountId] || state.massRateOverride,
    );
    if (Number.isFinite(manual) && manual > 0) {
      state.cloneCurrencyRate = manual;
      state.massRates ||= {};
      state.massRates[target.accountId] = manual;
      state.massCurrencyNote = `${from} → ${to} at manual rate ${manual}`;
      log("info", `Mass clone: using manual ${from}→${to} rate ${manual}.`);
      return { ok: true, rate: manual, from, to };
    }
    const service = this.dependencies.currencyRateService;
    const metaRate =
      (await service?.metaRate?.(
        state.cloneSourceAccountId,
        target.accountId,
      )) || (await service?.rate?.(from, to));
    const result = metaRate;
    if (!result?.ok) {
      state.cloneCurrencyRate = 1;
      state.massCurrencyNote = `${from} → ${to}: rate unavailable`;
      return {
        ok: false,
        from,
        to,
        message:
          `Meta did not return a ${from}→${to} rate for this cabinet. ` +
          "Type the rate in the currency column, or use a cabinet with the " +
          "same currency.",
      };
    }
    state.cloneCurrencyRate = result.rate;
    state.massAutoRates ||= {};
    state.massAutoRates[target.accountId] = result.rate;
    state.massCurrencyNote = `${from} → ${to} at ${result.rate} (${result.source})`;
    log(
      "info",
      `Mass clone: ${from}→${to} rate ${result.rate} (${result.source}).`,
    );
    return { ok: true, rate: result.rate, from, to };
  }

  async rollbackTarget(report, accountId) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const created = Array.isArray(report?.created) ? report.created : [];
    // Draft-mode clones live inside a draft: deleting its fragments removes the
    // campaign, adset and ad in one step. Deleting the ad objects directly fails
    // because draft objects share the resolved ids of their fragments.
    const draftId = created.find((item) => item.draftId)?.draftId;
    if (draftId && this.dependencies.draftRepository && accountId) {
      try {
        const summary = await this.dependencies.draftRepository.clearDraftById(
          accountId,
          draftId,
        );
        if (summary.draftFound) {
          log(
            "info",
            `Rollback deleted draft ${draftId}: ${summary.deletedCount} fragment(s).`,
          );
          return { deleted: summary.deletedCount, failed: summary.failedCount };
        }
      } catch (error) {
        log(
          "warn",
          `Rollback could not clear draft ${draftId}; check the account manually.`,
          String(error),
        );
      }
    }
    let deleted = 0;
    let failed = 0;
    for (const type of ["ad", "adset", "campaign"]) {
      const rows = created.filter(
        (item) => item.type === type && !item.removed,
      );
      for (const row of rows) {
        try {
          await graphFetch(String(row.id), { method: "DELETE" });
          deleted += 1;
          log("info", `Rollback deleted ${type} ${row.id}.`);
        } catch (error) {
          failed += 1;
          log(
            "warn",
            `Rollback could not delete ${type} ${row.id}; check the account manually.`,
            String(error),
          );
        }
      }
    }
    return { deleted, failed };
  }

  /**
   * One clone attempt. A `false` with no fresh report means the coordinator
   * refused to start (session or another operation not settled yet), so it is
   * retried briefly instead of dropping the account.
   */
  async runOneClone() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { runOperation } = this.dependencies;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      state.lastOperationReport = null;
      const success = await runOperation("clone", { reloadOnSuccess: false });
      if (success || state.lastOperationReport) return success;
      await sleep(2000);
    }
    log(
      "warn",
      "Mass clone: the clone did not start; the session is not ready.",
    );
    return false;
  }

  async runTarget(target, { packageData, sourceName, index }) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const row = state.massResults[index];
    const health = assessAccountHealth(state.accounts, target.accountId);
    if (!health.ok) {
      row.status = "skipped";
      row.message = health.message;
      log("warn", `Mass clone: ${target.name} skipped. ${health.message}`);
      return false;
    }
    state.massActiveAccountId = target.accountId;
    row.status = "running";
    row.message = "";
    const currency = await this.resolveCurrencyRate(target);
    row.currency = currency?.to
      ? { from: currency.from, to: currency.to, rate: currency.rate }
      : null;
    if (currency && currency.ok === false) {
      row.status = "failed";
      row.message = currency.message;
      state.massActiveAccountId = "";
      log("warn", `Mass clone: ${target.name} not cloned. ${currency.message}`);
      this.dependencies.renderMassClone?.();
      return false;
    }
    this.applyPixelChoice(packageData, target.pixelId);
    this.applyPageChoice(packageData, target.pageId);
    this.applyCatalogChoice(packageData, target.catalogId);
    state.cloneTargetAccountId = target.accountId;
    state.cloneAsDraft =
      state.massMode !== "PAUSED" && state.massMode !== "ACTIVE";
    state.cloneStatus = state.cloneAsDraft ? "PAUSED" : state.massMode;
    state.cloneCampaignName = this.buildCampaignName(
      state.massNameTemplate || state.cloneCampaignName,
      sourceName,
      target,
      {
        currency: this.accountCurrency(target.accountId),
        mode: state.massMode,
        // Monotonic across the whole batch and across retries: a failed cabinet
        // still consumes its number, so names are never reused.
        index: this.nextSequence(),
      },
    );
    log(
      "info",
      `Mass clone ${index + 1}/${state.massResults.length}: ${sourceName} -> ${target.name} (${target.accountId}).`,
    );
    const success = await this.runOneClone();
    let report = state.lastOperationReport || null;
    row.counts = report?.counts || null;
    if (success) {
      row.status = "success";
      log("info", `Mass clone: ${target.name} cloned.`);
      return true;
    }
    // Meta sometimes rejects a freshly written draft ad with a publishing error
    // that clears once the ad is written again. Roll the draft back and retry
    // the target once instead of dropping it from the batch.
    const transient = isTransientFragmentFailure(report?.validation?.errors);
    if (!transient && report?.validation?.errors?.length) {
      log(
        "info",
        `Mass clone: ${target.name} will not be retried; Meta rejects this draft for a reason a retry cannot fix (billing or permissions).`,
      );
    }
    if (transient) {
      log(
        "info",
        `Mass clone: ${target.name} hit a transient draft publishing error; clearing the draft and retrying once.`,
      );
      await this.rollbackTarget(report, target.accountId);
      const retrySuccess = await this.runOneClone();
      report = state.lastOperationReport || null;
      row.counts = report?.counts || null;
      row.retried = true;
      if (retrySuccess) {
        row.status = "success";
        log("info", `Mass clone: ${target.name} cloned on retry.`);
        return true;
      }
    }
    row.status = "failed";
    row.message = (report?.issues || [])
      .map((issue) => issue.message)
      .join("; ")
      .slice(0, 400);
    if (!row.message) {
      row.message = "The clone operation was refused before it started.";
    }
    const rolled = await this.rollbackTarget(report, target.accountId);
    row.rollback = rolled;
    if (rolled.deleted) {
      row.message =
        `${row.message} Deleted ${rolled.deleted} created object(s).`.trim();
    }
    if (rolled.failed) {
      row.message =
        `${row.message} Rollback failed for ${rolled.failed} object(s).`.trim();
    }
    log(
      "warn",
      `Mass clone: ${target.name} failed; deleted ${rolled.deleted}, left ${rolled.failed}.`,
    );
    return false;
  }

  async run() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    if (this.dependencies.initializeSession) {
      await this.dependencies.initializeSession();
    }
    if (state.massRunning) return false;
    const jsonSource = state.cloneSourceKind === "json";
    if (jsonSource) {
      if (!state.clonePackage) {
        log(
          "warn",
          "Load a JSON package in the Clone tab before starting the transfer.",
        );
        return false;
      }
    } else if (!state.cloneSourceAccountId || !state.cloneSourceCampaignId) {
      log("warn", "Pick a source account and campaign in the Clone tab first.");
      return false;
    }
    const targets = this.selectedTargets();
    if (!targets.length) {
      log("warn", "Select at least one target account for the mass clone.");
      return false;
    }
    state.massRunning = true;
    state.massStop = false;
    state.massActiveAccountId = "";
    state.massResults = targets.map((target) => ({
      accountId: target.accountId,
      name: target.name,
      status: "queued",
      message: "",
      counts: null,
      rollback: null,
    }));
    this.dependencies.renderMassClone?.();
    try {
      const packageData =
        await this.dependencies.cloneWorkflow.ensureClonePackageLoaded();
      if (!packageData) {
        log(
          "warn",
          "Clone package is not loaded; the mass clone did not start.",
        );
        return false;
      }
      const sourceName =
        packageData.source?.campaignName || packageData.campaign?.name || "";
      for (let index = 0; index < targets.length; index += 1) {
        if (state.massStop) {
          state.massResults[index].status = "cancelled";
          continue;
        }
        await this.runTarget(targets[index], {
          packageData,
          sourceName,
          index,
        });
        this.dependencies.renderMassClone?.();
      }
      const done = state.massResults.filter(
        (r) => r.status === "success",
      ).length;
      const failed = state.massResults.filter(
        (r) => r.status === "failed",
      ).length;
      const skipped = state.massResults.filter(
        (r) => r.status === "skipped",
      ).length;
      const cancelled = state.massResults.filter(
        (r) => r.status === "cancelled",
      ).length;
      log(
        "info",
        `Mass clone finished: ${done} cloned, ${failed} failed, ${skipped} skipped, ${cancelled} cancelled.`,
      );
      return failed === 0 && done > 0;
    } finally {
      state.massRunning = false;
      state.massActiveAccountId = "";
      this.dependencies.renderMassClone?.();
      this.dependencies.onMassFinished?.();
    }
  }
}
