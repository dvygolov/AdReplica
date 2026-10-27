import { assessAccountHealth } from "../accounts/account-health.mjs";
import { cloneToLabel, smallLabel, statLabel, t } from "./i18n.mjs";
import { escapeHtml } from "../utils/string.mjs";

const JOB_LABELS = {
  queued: "job.queued",
  running: "job.running",
  success: "job.success",
  failed: "job.failed",
  skipped: "job.skipped",
  cancelled: "job.cancelled",
};

/** Renders the clone tab: target table, mapping preview and the run screen. */
export class MassCloneView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.render = this.render.bind(this);
    this.renderTargets = this.renderTargets.bind(this);
    this.renderPreview = this.renderPreview.bind(this);
    this.renderProgress = this.renderProgress.bind(this);
    this.renderSource = this.renderSource.bind(this);
  }

  /** Only usable accounts are listed: an unsettled cabinet cannot host ads. */
  targetAccounts() {
    const { state } = this.dependencies;
    return (state.accounts || []).filter(
      (account) => assessAccountHealth(state.accounts, account.id).ok,
    );
  }

  accountCurrency(account) {
    return String(
      account?.raw?.currency || account?.currency || "",
    ).toUpperCase();
  }

  sourceCurrency() {
    const { state } = this.dependencies;
    const source = (state.accounts || []).find(
      (account) =>
        String(account.id) === String(state.cloneSourceAccountId || ""),
    );
    return this.accountCurrency(source);
  }

  isBusinessAccount(account) {
    return Boolean(
      account?.raw?.business?.id ||
      account?.raw?.business ||
      account?.businessId ||
      account?.raw?.owner_business,
    );
  }

  pixelOptions(accountId, selectedPixelId) {
    const { state } = this.dependencies;
    const pixels = state.massPixels?.[accountId] || [];
    const head = `<option value="" ${selectedPixelId ? "" : "selected"}>${escapeHtml(
      t("opt.noPixel"),
    )}</option>`;
    return (
      head +
      pixels
        .map(
          (pixel) =>
            `<option value="${escapeHtml(pixel.id)}" ${
              pixel.id === selectedPixelId ? "selected" : ""
            }>${escapeHtml(pixel.name || pixel.id)}</option>`,
        )
        .join("")
    );
  }

  renderSource() {
    const { state, dom } = this.dependencies;
    const box = dom.clonePackageSummary;
    if (!box) return;
    const data = state.clonePackage;
    if (!data) {
      box.innerHTML = state.clonePackageLoading
        ? `<div class="sk-empty">${escapeHtml(t("clone.loading"))}</div>`
        : "";
      return;
    }
    const adsets = Array.isArray(data.adsets) ? data.adsets : [];
    const ads = Array.isArray(data.ads) ? data.ads : [];
    const media = Array.isArray(data._downloadQueue) ? data._downloadQueue : [];
    const creatives = new Set(
      ads
        .map((ad) => ad?.creative?.id || ad?.creative_id || "")
        .filter(Boolean),
    );
    const catalogs = Array.isArray(data.catalogs) ? data.catalogs : [];
    const currency = this.sourceCurrency();
    const budget = adsets.reduce(
      (sum, adset) => sum + Number(adset?.daily_budget || 0),
      0,
    );
    const stat = (value, label) =>
      `<div class="sk-stat"><b>${escapeHtml(String(value))}</b><span>${escapeHtml(
        label,
      )}</span></div>`;
    box.innerHTML = [
      stat(adsets.length, statLabel("stat.adsets", adsets.length)),
      stat(ads.length, statLabel("stat.ads", ads.length)),
      stat(
        creatives.size || ads.length,
        statLabel("stat.creatives", creatives.size || ads.length),
      ),
      stat(media.length, statLabel("stat.media", media.length)),
      stat(
        `${currency ? `${currency} ` : ""}${(budget / 100).toFixed(2)}`,
        t("stat.budget"),
      ),
      stat(catalogs.length, statLabel("stat.catalogs", catalogs.length)),
    ].join("");

    if (dom.cloneSummary) {
      const campaignName =
        data.campaign?.name ||
        state.cloneCampaignName ||
        data.fileNameMap ||
        "";
      const parts = [
        state.accounts?.find(
          (account) =>
            String(account.id) === String(state.cloneSourceAccountId || ""),
        )?.name,
        campaignName,
        `${adsets.length} ${smallLabel("stat.adsets", adsets.length)}`,
        `${ads.length} ${smallLabel("stat.ads", ads.length)}`,
        `${currency ? `${currency} ` : ""}${(budget / 100).toFixed(2)}`,
      ].filter(Boolean);
      dom.cloneSummary.textContent = parts.join(" · ");
    }
    if (dom.cloneMediaToggle) {
      dom.cloneMediaToggle.textContent = t("clone.mediaSummary", {
        count: media.length,
      });
    }
    if (dom.cloneMediaBox) {
      dom.cloneMediaBox.classList.toggle("sk-hidden", !media.length);
    }
    if (dom.cloneMedia) {
      dom.cloneMedia.innerHTML = media
        .map(
          (file) =>
            `<div class="sk-media-row"><span>${escapeHtml(
              file.fileName || file.name || "—",
            )}</span><span>${escapeHtml(file.kind || "")}</span></div>`,
        )
        .join("");
    }
  }

  renderTargets() {
    const { state, dom } = this.dependencies;
    const body = dom.cloneTargetsBody;
    if (!body) return;
    const accounts = this.targetAccounts();
    if (!accounts.length) {
      body.innerHTML = `<tr><td colspan="5" class="sk-empty">${escapeHtml(
        t("clone.targetsNone"),
      )}</td></tr>`;
      return;
    }
    const selection = state.massTargets || {};
    const sourceCurrency = this.sourceCurrency();
    const rates = state.massRates || {};
    body.innerHTML = accounts
      .map((account) => {
        const accountId = String(account.id);
        const picked = selection[accountId] || {};
        const currency = this.accountCurrency(account);
        const rate = rates[accountId];
        const currencyChip =
          sourceCurrency && currency && currency !== sourceCurrency
            ? `<span class="sk-chip sk-warn">${escapeHtml(
                t("currency.convert", {
                  cur: currency,
                  rate: Number.isFinite(Number(rate))
                    ? `×${rate}`
                    : t("currency.auto"),
                }),
              )}</span>`
            : `<span class="sk-chip">${escapeHtml(currency || "—")}</span>`;
        const isSource =
          String(accountId) === String(state.cloneSourceAccountId || "");
        const typeChip = this.isBusinessAccount(account)
          ? `<span class="sk-chip sk-warn">${escapeHtml(
              t("chip.bm", {
                biz:
                  account.raw?.business?.name ||
                  account.raw?.owner_business?.name ||
                  "BM",
              }),
            )}</span>`
          : `<span class="sk-chip">${escapeHtml(t("chip.personal"))}</span>`;
        return `<tr data-account-row="${escapeHtml(accountId)}"${
          picked.selected ? ' class="sk-sel"' : ""
        }>
          <td class="sk-chk"><input type="checkbox" data-mass-account="${escapeHtml(
            accountId,
          )}" ${picked.selected ? "checked" : ""} ${
            state.massRunning ? "disabled" : ""
          } /></td>
          <td><span class="sk-who">${escapeHtml(
            account.name || accountId,
          )}<span class="sk-id">${escapeHtml(accountId)}</span></span></td>
          <td>${typeChip}${
            isSource
              ? ` <span class="sk-chip">${escapeHtml(t("chip.source"))}</span>`
              : ""
          }</td>
          <td><select class="sk-pix" data-mass-pixel="${escapeHtml(accountId)}" ${
            state.massRunning ? "disabled" : ""
          }>${this.pixelOptions(accountId, String(picked.pixelId || ""))}</select></td>
          <td>${currencyChip}</td>
        </tr>`;
      })
      .join("");
  }

  renderPreview() {
    const { state, dom } = this.dependencies;
    const body = dom.clonePreviewBody;
    if (!dom.clonePreviewCard) return;
    const selected = this.targetAccounts().filter(
      (account) => state.massTargets?.[String(account.id)]?.selected,
    );
    const visible =
      Boolean(state.clonePreviewOpen) &&
      selected.length > 0 &&
      !state.massRunning &&
      !state.massResults?.length;
    dom.clonePreviewCard.classList.toggle("sk-hidden", !visible);
    if (!visible || !body) return;
    const accounts = this.targetAccounts().filter(
      (account) => state.massTargets?.[String(account.id)]?.selected,
    );
    const data = state.clonePackage;
    const adsets = Array.isArray(data?.adsets) ? data.adsets : [];
    const budget = adsets.reduce(
      (sum, adset) => sum + Number(adset?.daily_budget || 0),
      0,
    );
    const currency = this.sourceCurrency();
    const sourcePage = String(
      data?.campaign?.page_id || data?.adsets?.[0]?.page_id || "",
    );
    const pageName = (state.clonePages || []).find(
      (page) =>
        String(page.id) === String(state.clonePageMappings?.[sourcePage]),
    )?.name;
    const hasCatalogColumn = Boolean(data?.catalogs?.length);
    body.innerHTML = accounts
      .map((account) => {
        const accountId = String(account.id);
        const rate = Number(state.massRates?.[accountId] || 1);
        const rowCurrency = this.accountCurrency(account) || currency;
        const picked = state.massTargets?.[accountId]?.pixelId;
        const catalog = Object.values(state.cloneCatalogMappings || {}).find(
          (value) =>
            value && value !== "__copy_into__" && value !== "__create__",
        );
        const needsPage = Boolean(sourcePage);
        const risk =
          !this.isBusinessAccount(account) && data?.catalogs?.length
            ? `<span class="sk-chip sk-warn">${escapeHtml(t("risk.noBm"))}</span>`
            : needsPage && !pageName
              ? `<span class="sk-chip sk-warn">${escapeHtml(
                  t("risk.noPage"),
                )}</span>`
              : `<span class="sk-chip sk-ok">${escapeHtml(t("risk.ok"))}</span>`;
        return `<tr>
          <td>${escapeHtml(account.name || accountId)}</td>
          <td>${escapeHtml(pageName || "—")}</td>
          <td>${escapeHtml(picked || t("opt.noPixel"))}</td>
          ${hasCatalogColumn ? `<td>${escapeHtml(catalog ? String(catalog) : "—")}</td>` : ""}
          <td>${escapeHtml(state.cloneAsDraft ? "DRAFT" : state.cloneStatus)}</td>
          <td>${escapeHtml(
            `${rowCurrency} ${((budget * (Number.isFinite(rate) ? rate : 1)) / 100).toFixed(2)}`,
          )}</td>
          <td>${risk}</td>
        </tr>`;
      })
      .join("");
  }

  renderProgress() {
    const { state, dom } = this.dependencies;
    const jobs = dom.massCloneProgress;
    if (!jobs) return;
    const results = state.massResults || [];
    if (dom.cloneRunCard) {
      dom.cloneRunCard.classList.toggle(
        "sk-hidden",
        !results.length && !state.massRunning,
      );
    }
    if (!results.length) {
      jobs.innerHTML = "";
      if (dom.cloneProgressBar) dom.cloneProgressBar.style.width = "0%";
      if (dom.cloneCounters) dom.cloneCounters.innerHTML = "";
      if (dom.cloneConsole) dom.cloneConsole.textContent = "";
      return;
    }
    const counts = {
      success: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
      queued: 0,
      running: 0,
    };
    for (const row of results)
      counts[row.status] = (counts[row.status] || 0) + 1;
    if (dom.cloneProgressBar) {
      const finished = results.length - counts.queued - counts.running;
      dom.cloneProgressBar.style.width = `${Math.round((finished / results.length) * 100)}%`;
    }
    if (dom.cloneCounters) {
      const active =
        results.find((row) => row.status === "running")?.name || "—";
      const finishedNow = results.length - counts.queued - counts.running;
      dom.cloneCounters.innerHTML = [
        `<span>${escapeHtml(t("run.progress"))} <b>${finishedNow}/${results.length}</b></span>`,
        `<span>${escapeHtml(t("run.done"))} <b class="sk-ok">${counts.success}</b></span>`,
        `<span>${escapeHtml(t("run.rolled"))} <b class="sk-warn">${counts.failed}</b></span>`,
        `<span>${escapeHtml(t("run.queued"))} <b>${counts.queued + counts.running}</b></span>`,
        `<span>${escapeHtml(t("run.current"))} <b>${escapeHtml(active)}</b></span>`,
      ].join("");
    }
    jobs.innerHTML = results
      .map((row) => {
        const detail = row.counts
          ? ` · campaign ${row.counts.campaign}, ad set ${row.counts.adset}, ad ${row.counts.ad}`
          : "";
        return `<div class="sk-job sk-${escapeHtml(row.status)}">
          <div><b>${escapeHtml(row.name || row.accountId)}</b>
            <div class="sk-job-ph">${escapeHtml(
              t(JOB_LABELS[row.status] || row.status),
            )}${escapeHtml(detail)}${row.retried ? " · retried" : ""}</div>
            ${row.message ? `<div class="sk-job-msg">${escapeHtml(row.message)}</div>` : ""}
          </div>
        </div>`;
      })
      .join("");
    if (dom.cloneConsole) {
      dom.cloneConsole.textContent = results
        .filter((row) => row.message)
        .map((row) => `${row.name}: ${row.message}`)
        .join("\n");
    }
  }

  render() {
    const { state, dom } = this.dependencies;
    if (!state.uiReady || !dom.root) return;
    this.renderSource();
    this.renderTargets();
    this.renderPreview();
    this.renderProgress();
    const total = this.targetAccounts().length;
    const count = Object.values(state.massTargets || {}).filter(
      (item) => item.selected,
    ).length;
    if (dom.cloneTargetsCount) {
      dom.cloneTargetsCount.textContent = total
        ? t("clone.targetsHint", { n: count, total })
        : "";
    }
    if (dom.cloneMaster) {
      dom.cloneMaster.checked = total > 0 && count === total;
      dom.cloneMaster.indeterminate = count > 0 && count < total;
      dom.cloneMaster.disabled = !total || state.massRunning;
    }
    if (dom.clonePreviewButton) {
      dom.clonePreviewButton.disabled = state.massRunning || !count;
    }
    if (dom.cloneRunButton) {
      dom.cloneRunButton.textContent = state.massRunning
        ? t("run.running")
        : count
          ? cloneToLabel(count)
          : t("btn.clone");
    }
    if (dom.massStopButton) {
      dom.massStopButton.disabled = !state.massRunning;
    }
    if (dom.massRetryButton) {
      const failed = (state.massResults || []).filter(
        (row) => row.status === "failed",
      ).length;
      dom.massRetryButton.disabled = state.massRunning || !failed;
      dom.massRetryButton.textContent = failed
        ? t("btn.retryN", { n: failed })
        : t("btn.retry");
    }
  }
}
