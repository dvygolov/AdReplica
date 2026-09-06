import { escapeHtml } from "../utils/string.mjs";

/** PackageRenderer. Dependencies are supplied by the application composition root. */
export class PackageRenderer {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.renderPackageSummary = this.renderPackageSummary.bind(this);
    this.renderCloneCampaignSummary =
      this.renderCloneCampaignSummary.bind(this);
  }

  renderPackageSummary(packageData) {
    if (!packageData) {
      return "";
    }
    return `
      <div class="sk-mapping-block">
        <div class="sk-subtitle">Package</div>
        <div class="sk-summary-grid">
          <div><span>Campaign</span><strong>${escapeHtml(packageData.source?.campaignName || packageData.campaign?.name || "-")}</strong></div>
          <div><span>Adsets</span><strong>${escapeHtml(packageData.adsets.length)}</strong></div>
          <div><span>Ads</span><strong>${escapeHtml(packageData.ads.length)}</strong></div>
          <div><span>Creatives</span><strong>${escapeHtml(packageData.creatives.length)}</strong></div>
        </div>
        ${!packageData.ads.length ? '<p class="sk-note sk-warning">This package contains no ads or creatives. Export a campaign with ads to import its media.</p>' : ""}
      </div>
    `;
  }

  renderCloneCampaignSummary(packageData) {
    if (!packageData) {
      return "";
    }
    return `
      <div class="sk-note sk-clone-summary">
        Adsets: <strong>${escapeHtml(packageData.adsets.length)}</strong>
        &nbsp;|&nbsp;
        Creatives: <strong>${escapeHtml(packageData.creatives.length)}</strong>
      </div>
    `;
  }
}
