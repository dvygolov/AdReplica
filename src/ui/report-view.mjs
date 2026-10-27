import { escapeHtml } from "../utils/string.mjs";
import { t } from "./i18n.mjs";

const STATUS_KEYS = {
  success: "report.status.success",
  partial: "report.status.partial",
  failed: "report.status.failed",
  cancelled: "report.status.cancelled",
  needs_review: "report.status.needs_review",
};

/** Result of a finished operation: modal, so the verdict cannot be missed. */
export class ReportView {
  constructor({ dom, services, state }) {
    Object.assign(this, { dom, services, state });
    this.element = null;
  }

  show(report) {
    // A mass clone reports once at the end; per-account modals would block the batch.
    if (this.suppressed()) return;
    this.destroy();
    if (!this.dom.root) return;
    const data = report.toJSON();
    const node = document.createElement("section");
    node.className = "sk-card sk-operation-report";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.classList.add("sk-report-card");
    const operation = t(`report.kind.${data.kind}`);
    node.dataset.reportKind = data.kind;
    node.innerHTML = `<div class="sk-report-head">
        <h3>${operation}: ${escapeHtml(t(STATUS_KEYS[data.status]) || data.status)}</h3>
        <button type="button" class="sk-icon" data-action="close" aria-label="${escapeHtml(t("report.close"))}">✕</button>
      </div>
      <div class="sk-report-meta">${escapeHtml(data.campaignName)}<br />${escapeHtml(t("report.account", { id: data.accountId }))}${data.kind === "export" ? "" : ` · ${escapeHtml(data.mode)}`}</div>
      <p>${["campaign", "adset", "ad"].map((type) => `${type}: ${data.counts[type]}/${data.expected[type]}`).join(" · ")}</p>
      <details><summary>${escapeHtml(t("report.details"))}</summary><pre></pre></details>
      <div class="sk-actions"><button data-action="text">${escapeHtml(t("report.download"))}</button><button data-action="json">JSON</button>
      ${data.kind === "export" ? "" : `<button data-action="reload">${escapeHtml(t("report.reload"))}</button>`}
      <button data-action="close" class="sk-primary">${escapeHtml(t("report.ok"))}</button></div>`;
    node.querySelector("pre").textContent = report.toText();
    node.querySelector("pre").style.cssText =
      "white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;";
    node.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      const action = button?.dataset.action;
      if (action === "close") {
        this.destroy();
        return;
      }
      if (action === "reload")
        this.services.dialogs.askToReloadResult(
          "Reload Ads Manager to show the result?",
          data.accountId,
        );
      else if (action === "text" || action === "json") {
        const content =
          action === "json" ? JSON.stringify(data, null, 2) : report.toText();
        this.services.downloadService.triggerDownload(
          `${report.id}.${action === "json" ? "json" : "txt"}`,
          new Blob([content], {
            type: action === "json" ? "application/json" : "text/plain",
          }),
        );
        const label = button.textContent;
        button.textContent = `✓ ${action === "json" ? "JSON" : "report"}`;
        button.classList.add("sk-done");
        setTimeout(() => {
          button.textContent = label;
          button.classList.remove("sk-done");
        }, 1600);
      }
    });
    // The dimmed backdrop is a second way out of the modal.
    const overlay = document.createElement("div");
    overlay.className = "sk-overlay";
    overlay.dataset.reportKind = data.kind;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.destroy();
    });
    overlay.append(node);
    // Dims only the AdReplica window, the surrounding Ads Manager stays usable.
    (this.dom.root.querySelector(".sk-shell") || this.dom.root).append(overlay);
    this.element = overlay;
  }
  suppressed() {
    return Boolean(this.state?.massRunning);
  }

  /** One modal for the whole batch: counters plus a row per cabinet. */
  showMassSummary(massState) {
    if (!this.dom.root) return;
    const rows = Array.isArray(massState?.massResults)
      ? massState.massResults
      : [];
    if (!rows.length) return;
    this.destroy();
    const count = (status) =>
      rows.filter((row) => row.status === status).length;
    const cloned = count("success");
    const failed = count("failed");
    const skipped = count("skipped");
    const cancelled = count("cancelled");
    const overlay = document.createElement("div");
    overlay.className = "sk-overlay";
    overlay.dataset.reportKind = "clone";
    const card = document.createElement("section");
    card.className = "sk-card sk-report-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.dataset.reportKind = "clone";
    const statusWord = failed
      ? t("report.status.partial")
      : cancelled || skipped
        ? t("report.status.partial")
        : t("report.status.success");
    card.innerHTML = `<div class="sk-report-head">
        <h3>${escapeHtml(t("report.mass.title"))}: ${escapeHtml(statusWord)}</h3>
        <button type="button" class="sk-icon" data-action="close" aria-label="${escapeHtml(t("report.close"))}">✕</button>
      </div>
      <div class="sk-report-meta">${escapeHtml(
        t("report.mass.counters", {
          cloned,
          failed,
          skipped: skipped + cancelled,
        }),
      )}</div>
      <div class="sk-mass-list">${rows
        .map(
          (row) =>
            `<div class="sk-mass-row sk-${escapeHtml(row.status)}">
              <b>${escapeHtml(row.name || row.accountId)}</b>
              <span>${escapeHtml(t(`job.${row.status}`) || row.status)}</span>
            </div>`,
        )
        .join("")}</div>
      <div class="sk-actions">
        <button data-action="close" class="sk-primary">${escapeHtml(t("report.ok"))}</button>
      </div>`;
    card.addEventListener("click", (event) => {
      if (event.target.closest("button[data-action='close']")) this.destroy();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this.destroy();
    });
    overlay.append(card);
    (this.dom.root.querySelector(".sk-shell") || this.dom.root).append(overlay);
    this.element = overlay;
  }

  destroy() {
    this.element?.remove();
    this.element = null;
  }
}
