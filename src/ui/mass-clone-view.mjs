import { assessAccountHealth } from "../accounts/account-health.mjs";
import { escapeHtml } from "../utils/string.mjs";

const RESULT_LABELS = {
  queued: "queued",
  running: "running",
  success: "cloned",
  failed: "failed · rolled back",
  skipped: "skipped",
  cancelled: "cancelled",
};

/** Renders the mass-clone target list and the per-account progress. */
export class MassCloneView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.render = this.render.bind(this);
    this.renderTargets = this.renderTargets.bind(this);
    this.renderProgress = this.renderProgress.bind(this);
  }

  pixelOptions(accountId, selectedPixelId) {
    const { state } = this.dependencies;
    const pixels = state.massPixels?.[accountId] || [];
    const head = `<option value="" ${selectedPixelId ? "" : "selected"}>Auto (reuse existing pixel)</option>`;
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

  renderTargets() {
    const { state, dom } = this.dependencies;
    const list = dom.massCloneList;
    if (!list) return;
    if (!state.accounts?.length) {
      list.innerHTML = `<div class="sk-empty">Accounts are not loaded yet.</div>`;
      return;
    }
    const selection = state.massTargets || {};
    list.innerHTML = state.accounts
      .map((account) => {
        const picked = selection[account.id] || {};
        const health = assessAccountHealth(state.accounts, account.id);
        const currency = String(
          account.raw?.currency || account.currency || "",
        ).toUpperCase();
        const disabled = !health.ok || state.massRunning ? "disabled" : "";
        const state_ = state.massResults?.find(
          (row) => row.accountId === String(account.id),
        );
        const badge = state_
          ? `<span class="sk-badge" data-mass-state="${escapeHtml(account.id)}">${RESULT_LABELS[state_.status] || state_.status}</span>`
          : `<span class="sk-badge${health.ok ? "" : " sk-badge-warn"}">${escapeHtml(health.status)}</span>`;
        return `<div class="sk-mass-row${health.ok ? "" : " sk-mass-off"}">
          <label class="sk-mass-pick">
            <input type="checkbox" data-mass-account="${escapeHtml(account.id)}"
              ${picked.selected ? "checked" : ""} ${disabled} />
            <span>${escapeHtml(account.name || account.id)}<span class="sk-mass-id">${escapeHtml(account.id)}${
              currency ? ` · ${escapeHtml(currency)}` : ""
            }</span></span>
          </label>
          <select data-mass-pixel="${escapeHtml(account.id)}" ${disabled}>
            ${this.pixelOptions(String(account.id), String(picked.pixelId || ""))}
          </select>
          ${badge}
        </div>`;
      })
      .join("");
  }

  renderProgress() {
    const { state, dom } = this.dependencies;
    const box = dom.massCloneProgress;
    if (!box) return;
    if (!state.massResults?.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = state.massResults
      .map((row) => {
        const counts = row.counts
          ? ` · campaign ${row.counts.campaign}, ad set ${row.counts.adset}, ad ${row.counts.ad}` +
            (row.rollback?.deleted ? `, deleted ${row.rollback.deleted}` : "")
          : "";
        return `<div class="sk-mass-result sk-mass-${escapeHtml(row.status)}">
          <b>${escapeHtml(row.name)}</b>
          <span>${RESULT_LABELS[row.status] || row.status}${escapeHtml(counts)}</span>
          ${row.message ? `<em>${escapeHtml(row.message)}</em>` : ""}
        </div>`;
      })
      .join("");
  }

  render() {
    const { state, dom } = this.dependencies;
    if (!state.uiReady || !dom.root) return;
    this.renderTargets();
    this.renderProgress();
    if (dom.massCurrencyNote) {
      dom.massCurrencyNote.textContent = state.massCurrencyNote || "";
    }
    if (
      dom.massRateInput &&
      dom.massRateInput.value !== state.massRateOverride
    ) {
      dom.massRateInput.value = state.massRateOverride || "";
    }
    if (dom.massRunButton) {
      const count = Object.values(state.massTargets || {}).filter(
        (item) => item.selected,
      ).length;
      dom.massRunButton.textContent = state.massRunning
        ? "Cloning..."
        : count
          ? `Clone to ${count} account${count === 1 ? "" : "s"}`
          : "Clone to selected accounts";
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
        ? `Retry ${failed} failed`
        : "Retry failed";
    }
  }
}
