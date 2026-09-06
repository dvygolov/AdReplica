/** CampaignController. Dependencies are supplied by the application composition root. */
export class CampaignController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.refreshCloneSourceContext = this.refreshCloneSourceContext.bind(this);
    this.fetchCampaignsForAccount = this.fetchCampaignsForAccount.bind(this);
    this.loadCampaignsIntoState = this.loadCampaignsIntoState.bind(this);
    this.loadCloneSourceCampaigns = this.loadCloneSourceCampaigns.bind(this);
    this.loadExportCampaigns = this.loadExportCampaigns.bind(this);
  }

  async refreshCloneSourceContext() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { fetchAccountContext } = this.dependencies.accountContextService;
    if (!state.cloneSourceAccountId || !state.sessionReady) return;
    try {
      const accountId = state.cloneSourceAccountId;
      const context = await fetchAccountContext(accountId);
      if (state.cloneSourceAccountId !== accountId) return;
      state.cloneSourceBusiness = context.business;
      state.cloneSourceCatalogs = context.catalogs;
    } catch (error) {
      log("error", "Failed to refresh clone source context.", String(error));
    }
  }

  async fetchCampaignsForAccount(accountId) {
    const { state } = this.dependencies;
    const { graphGetAll } = this.dependencies.graphClient;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (state.accountCampaignsCache[normalizedAccountId]) {
      return state.accountCampaignsCache[normalizedAccountId];
    }
    const campaigns = await graphGetAll(
      `act_${normalizedAccountId}/campaigns`,
      {
        fields: [
          "id",
          "name",
          "status",
          "effective_status",
          "objective",
          "daily_budget",
          "lifetime_budget",
          "bid_strategy",
          "buying_type",
          "special_ad_categories",
          "special_ad_category",
          "special_ad_category_country",
          "start_time",
          "stop_time",
        ].join(","),
      },
    );
    state.accountCampaignsCache[normalizedAccountId] = campaigns;
    return campaigns;
  }

  async loadCampaignsIntoState(accountId, fieldName, selectedFieldName) {
    const { state } = this.dependencies;
    const { fetchCampaignsForAccount } = this;
    const campaigns = await fetchCampaignsForAccount(accountId);
    if (
      fieldName === "cloneSourceCampaigns" &&
      state.cloneSourceAccountId !== accountId
    )
      return;
    state[fieldName] = campaigns.map((campaign) => ({
      id: String(campaign.id),
      name: campaign.name || campaign.id,
      raw: campaign,
    }));
    if (!state[selectedFieldName] && state[fieldName][0]) {
      state[selectedFieldName] = state[fieldName][0].id;
    }
  }

  async loadCloneSourceCampaigns() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy, renderUI } = this.dependencies.panelView;
    const { initializeSession } = this.dependencies.sessionService;
    const { loadCampaignsIntoState } = this;
    const { ensureClonePackageLoaded } = this.dependencies.cloneWorkflow;
    if (!state.cloneSourceAccountId) {
      log("warn", "Select a source account for clone first.");
      return;
    }
    setBusy(true);
    try {
      await initializeSession();
      await loadCampaignsIntoState(
        state.cloneSourceAccountId,
        "cloneSourceCampaigns",
        "cloneSourceCampaignId",
      );
      renderUI();
      log(
        "info",
        `Clone source campaigns found: ${state.cloneSourceCampaigns.length}`,
      );
      if (state.cloneSourceCampaignId) {
        await ensureClonePackageLoaded();
      }
    } catch (error) {
      log("error", "Failed to load clone source campaigns.", String(error));
    } finally {
      setBusy(false);
    }
  }

  async loadExportCampaigns() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy, renderUI } = this.dependencies.panelView;
    const { initializeSession } = this.dependencies.sessionService;
    const { graphGetAll } = this.dependencies.graphClient;
    if (!state.exportAccountId) {
      log("warn", "Select an account for export first.");
      return;
    }
    setBusy(true);
    try {
      await initializeSession();
      const accountId = state.exportAccountId;
      const campaigns = await graphGetAll(`act_${accountId}/campaigns`, {
        fields: [
          "id",
          "name",
          "status",
          "effective_status",
          "objective",
          "daily_budget",
          "lifetime_budget",
          "bid_strategy",
          "buying_type",
          "special_ad_categories",
          "special_ad_category",
          "special_ad_category_country",
          "start_time",
          "stop_time",
        ].join(","),
      });
      if (state.exportAccountId !== accountId) return;
      state.exportCampaigns = campaigns.map((campaign) => ({
        id: String(campaign.id),
        name: campaign.name || campaign.id,
        raw: campaign,
      }));
      if (!state.exportCampaignId && state.exportCampaigns[0]) {
        state.exportCampaignId = state.exportCampaigns[0].id;
      }
      renderUI();
      log("info", `Campaigns found: ${state.exportCampaigns.length}`);
    } catch (error) {
      log("error", "Failed to load campaigns.", String(error));
    } finally {
      setBusy(false);
    }
  }
}
