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

/** Renders the clone tab: target table with per-account page/pixel/catalog and the run screen. */
export class MassCloneView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.render = this.render.bind(this);
    this.renderTargets = this.renderTargets.bind(this);
    this.renderProgress = this.renderProgress.bind(this);
    this.renderSource = this.renderSource.bind(this);
  }

  /**
   * Meta refuses ad creation without a working funding source, drafts included
   * (error 1359188). The reliable marker is a funding source that actually
   * exists — `funding_source_details.id` (mirrored by `funding_source`) — not
   * the masked card label: Meta only fills `display_string` once the card has
   * been billed at least once, so a freshly attached card shows an id with no
   * label. Empty shells carry no id at all.
   */
  hasPaymentMethod(account) {
    const raw = account?.raw || {};
    return Boolean(raw.funding_source_details?.id || raw.funding_source);
  }

  /** Only usable accounts are listed: unsettled or unpaid cabinets cannot host ads. */
  targetAccounts() {
    const { state } = this.dependencies;
    const query = String(state.massSearch || "")
      .trim()
      .toLowerCase();
    return (state.accounts || []).filter((account) => {
      if (!assessAccountHealth(state.accounts, account.id).ok) return false;
      if (!this.hasPaymentMethod(account)) return false;
      if (!query) return true;
      return (
        String(account.name || "")
          .toLowerCase()
          .includes(query) || String(account.id).includes(query)
      );
    });
  }

  /** Accounts dropped because the cabinet has no payment method. */
  hiddenNoPayment() {
    const { state } = this.dependencies;
    return (state.accounts || []).filter(
      (account) =>
        assessAccountHealth(state.accounts, account.id).ok &&
        !this.hasPaymentMethod(account),
    ).length;
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

  /** The catalog column only makes sense for a campaign that sells from a catalog. */
  showsCatalogColumn() {
    const { state } = this.dependencies;
    return Boolean(state.clonePackage?.catalogs?.length);
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

  catalogOptions(accountId, selectedCatalogId) {
    const { state } = this.dependencies;
    const catalogs = state.massCatalogs?.[accountId] || [];
    const business = state.massCatalogBusiness?.[accountId];
    const head = `<option value="" ${selectedCatalogId ? "" : "selected"}>${escapeHtml(
      t("opt.noCatalog"),
    )}</option>`;
    const copy = business?.id
      ? `<option value="__copy__" ${
          selectedCatalogId === "__copy__" ? "selected" : ""
        }>${escapeHtml(t("opt.copyCatalog", { bm: business.name || business.id }))}</option>`
      : "";
    return (
      head +
      copy +
      catalogs
        .map(
          (catalog) =>
            `<option value="${escapeHtml(catalog.id)}" ${
              catalog.id === selectedCatalogId ? "selected" : ""
            }>${escapeHtml(catalog.name || catalog.id)}</option>`,
        )
        .join("")
    );
  }

  /** Page picker: a native select cannot show the page avatar, so it is a listbox. */
  pageCell(accountId, picked) {
    const { state } = this.dependencies;
    const pages = state.massPages?.[accountId] || [];
    const open = String(state.massOpenPageMenu || "") === accountId;
    const selected = pages.find(
      (page) => String(page.id) === String(picked.pageId || ""),
    );
    const initial = (selected?.name || "FP").trim().charAt(0).toUpperCase();
    const face = selected?.picture
      ? `<img src="${escapeHtml(selected.picture)}" alt="" loading="lazy" />`
      : `<span>${escapeHtml(initial)}</span>`;
    const items = [
      `<button type="button" class="sk-fp-item" data-mass-page-pick="${escapeHtml(
        accountId,
      )}" data-page-id="">
        <span class="sk-fp-ico sk-fp-auto">${escapeHtml(t("opt.autoPageShort"))}</span>
        <span class="sk-fp-name">${escapeHtml(t("opt.autoPage"))}</span>
      </button>`,
      ...pages.map((page) => {
        const mark =
          String(page.id) === String(picked.pageId || "") ? " sk-on" : "";
        return `<button type="button" class="sk-fp-item${mark}" data-mass-page-pick="${escapeHtml(
          accountId,
        )}" data-page-id="${escapeHtml(page.id)}">
          <span class="sk-fp-ico">${
            page.picture
              ? `<img src="${escapeHtml(page.picture)}" alt="" loading="lazy" />`
              : `<span>${escapeHtml((page.name || "F").charAt(0).toUpperCase())}</span>`
          }</span>
          <span class="sk-fp-name">${escapeHtml(page.name || page.id)}</span>
        </button>`;
      }),
    ].join("");
    return `<td class="sk-fp-cell" data-fp-cell="${escapeHtml(accountId)}">
      <button type="button" class="sk-fp-btn" data-mass-page-toggle="${escapeHtml(
        accountId,
      )}" ${state.massRunning ? "disabled" : ""} title="${escapeHtml(
        selected?.name || t("opt.autoPage"),
      )}">
        <span class="sk-fp-ico">${face}</span>
        <span class="sk-fp-name">${escapeHtml(
          selected?.name || t("opt.autoPageShort"),
        )}</span>
        <span class="sk-caret">▾</span>
      </button>
      <div class="sk-fp-pop${open ? "" : " sk-hidden"}" data-mass-page-pop="${escapeHtml(
        accountId,
      )}">${items}</div>
    </td>`;
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
  }

  renderTargets() {
    const { state, dom } = this.dependencies;
    const body = dom.cloneTargetsBody;
    if (!body) return;
    const accounts = this.targetAccounts();
    const catalogColumn = this.showsCatalogColumn();
    if (dom.cloneCatalogHead) {
      dom.cloneCatalogHead.classList.toggle("sk-hidden", !catalogColumn);
    }
    const columns = 4 + (catalogColumn ? 1 : 0);
    if (!accounts.length) {
      body.innerHTML = `<tr><td colspan="${columns}" class="sk-empty">${escapeHtml(
        t("clone.targetsNone"),
      )}</td></tr>`;
      return;
    }
    const selection = state.massTargets || {};
    const sourceCurrency = this.sourceCurrency();
    const rates = state.massRates || {};
    const autoRates = state.massAutoRates || {};
    body.innerHTML = accounts
      .map((account) => {
        const accountId = String(account.id);
        const picked = selection[accountId] || {};
        const currency = this.accountCurrency(account);
        const rate = rates[accountId];
        const autoRate = autoRates[accountId];
        const converts =
          sourceCurrency && currency && currency !== sourceCurrency;
        const knownRate = Number.isFinite(Number(rate)) && Number(rate) > 0;
        const knownAuto =
          Number.isFinite(Number(autoRate)) && Number(autoRate) > 0;
        const rateText = knownRate
          ? `×${rate}`
          : knownAuto
            ? `×${autoRate}`
            : t("currency.none");
        // Narrow column: the code, an optional rate box and the whole story in a tooltip.
        const currencyChip = converts
          ? `<span class="sk-chip sk-warn" title="${escapeHtml(
              t(knownRate ? "currency.tooltipRate" : "currency.tooltip", {
                from: sourceCurrency,
                to: currency,
                rate: rateText,
              }),
            )}">${escapeHtml(currency)}</span>
            <input type="number" step="0.0001" min="0" class="sk-rate" data-mass-rate="${escapeHtml(
              accountId,
            )}" placeholder="${escapeHtml(
              knownAuto ? `${autoRate}` : "—",
            )}" title="${escapeHtml(
              t("rate.autoHint", { rate: rateText }),
            )}" value="${knownRate ? escapeHtml(String(rate)) : ""}" ${
              state.massRunning ? "disabled" : ""
            } />`
          : `<span class="sk-chip" title="${escapeHtml(
              t("currency.same", { cur: currency || "—" }),
            )}">${escapeHtml(currency || "—")}</span>`;
        const isSource =
          String(accountId) === String(state.cloneSourceAccountId || "");
        const businessName =
          account.raw?.business?.name ||
          account.raw?.owner_business?.name ||
          "BM";
        const typeIcon = this.isBusinessAccount(account)
          ? `<span class="sk-acc-ico sk-bm" title="${escapeHtml(
              t("chip.bm", { biz: businessName }),
            )}" aria-label="${escapeHtml(t("chip.bm", { biz: businessName }))}">BM</span>`
          : `<span class="sk-acc-ico sk-personal" title="${escapeHtml(
              t("chip.personal"),
            )}" aria-label="${escapeHtml(t("chip.personal"))}">&#9679;</span>`;
        const catalogCell = catalogColumn
          ? `<td><select class="sk-cat" title="${escapeHtml(
              t("opt.noCatalogHint"),
            )}" data-mass-catalog="${escapeHtml(
              accountId,
            )}" ${state.massRunning ? "disabled" : ""}>${this.catalogOptions(
              accountId,
              String(picked.catalogId || ""),
            )}</select></td>`
          : "";
        return `<tr data-account-row="${escapeHtml(accountId)}"${
          picked.selected ? ' class="sk-sel"' : ""
        }>
          <td class="sk-chk"><input type="checkbox" data-mass-account="${escapeHtml(
            accountId,
          )}" ${picked.selected ? "checked" : ""} ${
            state.massRunning ? "disabled" : ""
          } /></td>
          <td><span class="sk-acc">${typeIcon}<span class="sk-who">${escapeHtml(
            account.name || accountId,
          )}<span class="sk-id">${escapeHtml(accountId)}</span></span>${
            isSource
              ? `<span class="sk-chip">${escapeHtml(t("chip.source"))}</span>`
              : ""
          }</span></td>
          ${this.pageCell(accountId, picked)}
          <td><select class="sk-pix" title="${escapeHtml(
            t("opt.noPixelHint"),
          )}" data-mass-pixel="${escapeHtml(accountId)}" ${
            state.massRunning ? "disabled" : ""
          }>${this.pixelOptions(accountId, String(picked.pixelId || ""))}</select></td>
          ${catalogCell}
          <td class="sk-cur">${currencyChip}</td>
        </tr>`;
      })
      .join("");
    this.positionPagePopups();
  }

  /** The page listbox is a fixed overlay: the table scroll would clip it. */
  positionPagePopups() {
    const { state, dom } = this.dependencies;
    const openId = String(state.massOpenPageMenu || "");
    if (!openId) return;
    const pop = document.querySelector(
      `[data-mass-page-pop="${CSS.escape(openId)}"]`,
    );
    const button = document.querySelector(
      `[data-mass-page-toggle="${CSS.escape(openId)}"]`,
    );
    if (!pop || !button) return;
    // Move the listbox to the panel root: inside the table it inherits the
    // card's containing block and gets clipped by the scroll area.
    const host = dom.root || document.getElementById("fb-sk-ad-replica");
    if (host && pop.parentElement !== host) host.append(pop);
    const anchor = button.getBoundingClientRect();
    const width = Math.max(220, Math.round(anchor.width));
    pop.style.position = "fixed";
    pop.style.marginTop = "0";
    pop.style.pointerEvents = "auto";
    pop.style.width = `${width}px`;
    // Flip above the button when there is no room below.
    const popHeight = pop.offsetHeight || 240;
    const below = window.innerHeight - anchor.bottom;
    const top =
      below < popHeight + 12 && anchor.top > popHeight + 12
        ? anchor.top - popHeight - 4
        : anchor.bottom + 4;
    const left = Math.min(
      Math.max(8, anchor.left),
      window.innerWidth - width - 8,
    );
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
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
    this.renderProgress();
    const total = this.targetAccounts().length;
    const count = Object.values(state.massTargets || {}).filter(
      (item) => item.selected,
    ).length;
    if (dom.cloneTargetsNote) {
      const hidden = this.hiddenNoPayment();
      dom.cloneTargetsNote.textContent = hidden
        ? t("targets.noPayment", { n: hidden })
        : "";
      dom.cloneTargetsNote.classList.toggle("sk-hidden", !hidden);
    }
    if (dom.cloneMaster) {
      dom.cloneMaster.checked = total > 0 && count === total;
      dom.cloneMaster.indeterminate = count > 0 && count < total;
      dom.cloneMaster.disabled = !total || state.massRunning;
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
