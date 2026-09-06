import { escapeHtml } from "../utils/string.mjs";

/** Dialogs. Dependencies are supplied by the application composition root. */
export class Dialogs {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.askMediaDownloadFailureDecision =
      this.askMediaDownloadFailureDecision.bind(this);
    this.askMediaPreflightDecision = this.askMediaPreflightDecision.bind(this);
    this.reloadAdsManagerResult = this.reloadAdsManagerResult.bind(this);
    this.askToReloadResult = this.askToReloadResult.bind(this);
    this.confirmCatalogPlan = this.confirmCatalogPlan.bind(this);
  }

  async confirmCatalogPlan(plan) {
    const changes = plan.filter((item) => item.mode !== "reuse");
    return window.confirm(
      `Copy catalog data?\n\n${changes.map((item) => `${item.sourceName} → ${item.targetName} (${item.mode === "copy-new" ? "new catalog" : "add to existing catalog"})`).join("\n")}\n\nProducts, feeds and product sets may be created. Existing product set filters will be preserved.`,
    );
  }

  askMediaDownloadFailureDecision(file, error) {
    const { triggerBrowserNativeDownload } = this.dependencies.downloadService;
    const fileName = file?.fileName || file?.name || "media file";
    const details = [
      `File: ${fileName}`,
      file?.type ? `Type: ${file.type}` : "",
      file?.sourceKind ? `Source: ${file.sourceKind}` : "",
      file?.sourceId ? `Source ID: ${file.sourceId}` : "",
      `Error: ${String(error?.message || error || "unknown error")}`,
    ].filter(Boolean);
    const canTryBrowserDownload = Boolean(file?.sourceUrl && document.body);

    if (!document.body) {
      return Promise.resolve(
        window.confirm(
          `Can't download creative:\n${details.join("\n")}\n\nContinue?`,
        )
          ? "yes"
          : "no",
      );
    }

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "background:rgba(15,23,42,.54)",
        "font-family:Arial,sans-serif",
      ].join(";");
      overlay.innerHTML = `
        <div style="width:min(520px,calc(100vw - 32px));background:#111827;color:#f9fafb;border:1px solid rgba(255,255,255,.18);border-radius:8px;box-shadow:0 24px 70px rgba(0,0,0,.35);padding:18px;">
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;">Can't download creative</div>
          <div style="font-size:13px;line-height:1.45;white-space:pre-wrap;color:#d1d5db;margin-bottom:14px;">${escapeHtml(details.join("\n"))}</div>
          <div style="font-size:13px;color:#f9fafb;margin-bottom:14px;">Try browser download, or continue downloading the remaining files?</div>
          <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
            ${canTryBrowserDownload ? '<button type="button" data-choice="browser" style="padding:7px 12px;border-radius:6px;border:1px solid #fbbf24;background:#fbbf24;color:#1f2937;font-weight:700;cursor:pointer;">Browser download</button>' : ""}
            <button type="button" data-choice="yes" style="padding:7px 12px;border-radius:6px;border:1px solid #22c55e;background:#22c55e;color:#052e16;font-weight:700;cursor:pointer;">Yes</button>
            <button type="button" data-choice="no" style="padding:7px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.24);background:#1f2937;color:#f9fafb;font-weight:700;cursor:pointer;">No</button>
            <button type="button" data-choice="cancel" style="padding:7px 12px;border-radius:6px;border:1px solid rgba(255,255,255,.24);background:transparent;color:#f9fafb;font-weight:700;cursor:pointer;">Cancel</button>
          </div>
        </div>
      `;

      const cleanup = (choice) => {
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(choice);
      };
      const onKeydown = (event) => {
        if (event.key === "Escape") {
          cleanup("cancel");
        }
      };
      overlay.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("button[data-choice]");
        if (!button) return;
        const choice = button.dataset.choice || "cancel";
        if (choice === "browser") {
          triggerBrowserNativeDownload(file);
        }
        cleanup(choice);
      });
      document.addEventListener("keydown", onKeydown);
      document.body.appendChild(overlay);
      overlay
        .querySelector(
          "button[data-choice='browser'],button[data-choice='yes']",
        )
        ?.focus();
    });
  }

  askMediaPreflightDecision(summary) {
    const issues = summary?.issues || [];
    if (!issues.length) {
      return Promise.resolve("continue");
    }
    if (!document.body) {
      return Promise.resolve(
        window.confirm(
          "Media preflight found unavailable creative media. Try copying anyway?",
        )
          ? "try_anyway"
          : "cancel",
      );
    }
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;";
      const rows = issues
        .slice(0, 12)
        .map(
          (issue) => `
        <li style="margin:0 0 8px 0;">
          <div style="font-weight:700;">${escapeHtml(issue.adName || issue.adId || "Ad")}</div>
          <div>${escapeHtml(issue.creativeName || issue.creativeId || "Creative")} / ${escapeHtml(issue.slotLabel)}</div>
          <div style="color:#fca5a5;">${escapeHtml(issue.reason)}</div>
          ${issue.sourceId ? `<div style="color:#cbd5e1;">Source: ${escapeHtml(issue.sourceId)}</div>` : ""}
          ${issue.expectedFileName ? `<div style="color:#cbd5e1;">File: ${escapeHtml(issue.expectedFileName)}</div>` : ""}
        </li>
      `,
        )
        .join("");
      const more =
        issues.length > 12
          ? `<div style="color:#cbd5e1;margin-top:8px;">And ${escapeHtml(String(issues.length - 12))} more issue(s). See logs for the full list.</div>`
          : "";
      overlay.innerHTML = `
        <div style="background:#111827;color:#f9fafb;width:min(760px,100%);max-height:86vh;overflow:auto;border:1px solid #374151;border-radius:8px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.35);font-family:Arial,sans-serif;">
          <div style="font-size:17px;font-weight:800;margin-bottom:8px;">Media preflight found unavailable creative media</div>
          <div style="font-size:13px;color:#d1d5db;margin-bottom:12px;">
            Checked ${escapeHtml(String(summary.adsChecked || 0))} ad(s) and ${escapeHtml(String(summary.mediaChecked || 0))} media item(s). ${escapeHtml(String(issues.length))} issue(s) need a decision before copying.
          </div>
          <ol style="font-size:12px;line-height:1.35;margin:0 0 14px 18px;padding:0;">${rows}</ol>
          ${more}
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;">
            <button type="button" data-choice="cancel" style="padding:7px 12px;border-radius:6px;border:1px solid #4b5563;background:#1f2937;color:#f9fafb;font-weight:700;cursor:pointer;">Cancel</button>
            <button type="button" data-choice="valid_only" style="padding:7px 12px;border-radius:6px;border:1px solid #fbbf24;background:#fbbf24;color:#1f2937;font-weight:700;cursor:pointer;">Copy valid ads only</button>
            <button type="button" data-choice="try_anyway" style="padding:7px 12px;border-radius:6px;border:1px solid #ef4444;background:#ef4444;color:#fff;font-weight:700;cursor:pointer;">Try anyway</button>
          </div>
        </div>
      `;
      const finish = (choice) => {
        overlay.remove();
        resolve(choice);
      };
      overlay.addEventListener("click", (event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest("button[data-choice]")
            : null;
        if (button) {
          finish(button.dataset.choice);
        }
      });
      document.body.appendChild(overlay);
    });
  }

  reloadAdsManagerResult(accountId) {
    const { buildAdsManagerAccountUrl } = this.dependencies.editorInspector;
    const targetUrl = buildAdsManagerAccountUrl(accountId);
    if (window.location.href === targetUrl) {
      window.location.reload();
    } else {
      window.location.assign(targetUrl);
    }
  }

  askToReloadResult(message, accountId) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { reloadAdsManagerResult } = this;
    if (state.reloadTimer) {
      clearTimeout(state.reloadTimer);
      state.reloadTimer = null;
    }
    const promptText =
      message ||
      "Import finished. Reload Ads Manager to show the updated result?";
    let shouldReload = false;
    try {
      shouldReload = window.confirm(promptText);
    } catch (_error) {
      shouldReload = false;
    }
    if (!shouldReload) {
      log("info", "Result is ready. Reload skipped by user.");
      return;
    }
    log("info", "Reloading Ads Manager to show the updated result.");
    state.reloadTimer = window.setTimeout(() => {
      reloadAdsManagerResult(accountId);
    }, 1200);
  }
}
