import { escapeHtml } from "../utils/string.mjs";

const LABELS = {
  success: "Completed",
  partial: "Partially completed",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_review: "Needs verification",
};

/** Persistent result card; downloading a report never downloads session credentials. */
export class ReportView {
  constructor({ dom, services }) {
    Object.assign(this, { dom, services });
    this.element = null;
  }

  show(report) {
    this.destroy();
    if (!this.dom.root) return;
    const data = report.toJSON();
    const node = document.createElement("section");
    node.className = "sk-card sk-operation-report";
    node.setAttribute("role", "status");
    const operation =
      { export: "Export", import: "Import", clone: "Clone" }[data.kind] ||
      "Operation";
    node.innerHTML = `<h3>${operation}: ${escapeHtml(LABELS[data.status] || data.status)}</h3>
      <div>${escapeHtml(data.campaignName)} — account ${escapeHtml(data.accountId)}${data.kind === "export" ? "" : ` (${escapeHtml(data.mode)})`}</div>
      <p>${["campaign", "adset", "ad"].map((type) => `${type}: ${data.counts[type]}/${data.expected[type]}`).join(" · ")}</p>
      <details><summary>Details and remaining objects</summary><pre></pre></details>
      <div class="sk-actions"><button data-action="text">Download report</button><button data-action="json">JSON</button>
      ${data.kind === "export" ? "" : '<button data-action="reload">Open result in Ads Manager</button>'}</div>`;
    node.querySelector("pre").textContent = report.toText();
    node.querySelector("pre").style.cssText =
      "white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;";
    node.addEventListener("click", (event) => {
      const action = event.target.closest("button[data-action]")?.dataset
        .action;
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
      }
    });
    this.dom.root.querySelector(".sk-logs")?.before(node);
    this.element = node;
  }
  destroy() {
    this.element?.remove();
    this.element = null;
  }
}
