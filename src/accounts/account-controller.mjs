import { getAccountLabel } from "../domain/creative.mjs";
import { getFacebookModule } from "../utils/facebook-runtime.mjs";
import { normalizeAccountId } from "../domain/ids.mjs";

/** AccountController. Dependencies are supplied by the application composition root. */
export class AccountController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.loadAccounts = this.loadAccounts.bind(this);
    this.getAdsManagerUrlAccountId = this.getAdsManagerUrlAccountId.bind(this);
    this.getServiceDraftAccountId = this.getServiceDraftAccountId.bind(this);
    this.getAccountDisplayLabel = this.getAccountDisplayLabel.bind(this);
  }

  async loadAccounts() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { renderUI } = this.dependencies.panelView;
    const { graphGetAll } = this.dependencies.graphClient;
    const { fetchAccountContext } = this.dependencies.accountContextService;
    const {
      applyDefaultMappings,
      refreshImportAccountContext,
      refreshCloneTargetContext,
    } = this.dependencies.mappingController;
    const { loadCloneSourceCampaigns, loadExportCampaigns } =
      this.dependencies.campaignController;
    const rows = await graphGetAll("me/adaccounts", {
      fields: [
        "id",
        "name",
        "account_status",
        "disable_reason",
        "currency",
        "business_country_code",
        "timezone_id",
        "adspaymentcycle",
        "funding_source_details",
        "campaigns.limit(1).summary(true){id}",
      ].join(","),
    });

    const deduped = new Map();
    for (const row of rows) {
      const account = {
        id: String(row.id).replace(/^act_/, ""),
        name: row.name || row.id,
        ownerId: "me",
        ownerName: "",
        campaignsCount: Number(row.campaigns?.summary?.total_count ?? 0),
        raw: row,
      };
      if (!deduped.has(account.id)) {
        deduped.set(account.id, account);
      }
    }
    state.accounts = [...deduped.values()];

    state.accounts = state.accounts.sort((left, right) =>
      getAccountLabel(left).localeCompare(getAccountLabel(right), "ru"),
    );
    const currentAccountId = getFacebookModule(
      "BusinessUnifiedNavigationContext",
    )?.adAccountID
      ? String(
          getFacebookModule("BusinessUnifiedNavigationContext").adAccountID,
        ).replace(/^act_/, "")
      : "";
    if (!state.exportAccountId) {
      state.exportAccountId = currentAccountId || state.accounts[0]?.id || "";
    }
    if (!state.importAccountId) {
      state.importAccountId = currentAccountId || state.accounts[0]?.id || "";
    }
    if (!state.cloneSourceAccountId) {
      state.cloneSourceAccountId =
        currentAccountId || state.accounts[0]?.id || "";
    }
    if (!state.cloneTargetAccountId) {
      state.cloneTargetAccountId =
        currentAccountId || state.accounts[0]?.id || "";
    }
    if (
      state.importAccountId &&
      state.importAccountId === state.cloneTargetAccountId
    ) {
      const sharedContext = await fetchAccountContext(state.importAccountId);
      state.pages = sharedContext.pages;
      state.importAccountPixels = sharedContext.pixels;
      state.importTargetBusiness = sharedContext.business;
      state.importTargetCatalogs = sharedContext.catalogs;
      state.clonePages = sharedContext.pages;
      state.cloneTargetPixels = sharedContext.pixels;
      state.cloneTargetBusiness = sharedContext.business;
      state.cloneTargetCatalogs = sharedContext.catalogs;
      applyDefaultMappings(
        state.importPackage,
        state.pages,
        state.importAccountPixels,
        state.importTargetCatalogs,
        state.importPageMappings,
        state.importPixelMappings,
        state.importCatalogMappings,
      );
      applyDefaultMappings(
        state.clonePackage,
        state.clonePages,
        state.cloneTargetPixels,
        state.cloneTargetCatalogs,
        state.clonePageMappings,
        state.clonePixelMappings,
        state.cloneCatalogMappings,
      );
    } else {
      await refreshImportAccountContext();
      await refreshCloneTargetContext();
    }
    renderUI();
    log("info", `Accounts loaded: ${state.accounts.length}`);
    if (state.exportAccountId) {
      await loadExportCampaigns();
    }
    if (state.cloneSourceAccountId) {
      await loadCloneSourceCampaigns();
    }
  }

  getAdsManagerUrlAccountId() {
    try {
      const params = new URL(window.location.href).searchParams;
      for (const key of ["act", "ad_account_id", "account_id", "__aaid"]) {
        const accountId = normalizeAccountId(params.get(key));
        if (accountId) {
          return accountId;
        }
      }
    } catch (_error) {}
    return "";
  }

  getServiceDraftAccountId() {
    const { state } = this.dependencies;
    const { getAdsManagerUrlAccountId } = this;
    return (
      getAdsManagerUrlAccountId() ||
      normalizeAccountId(state.cloneTargetAccountId) ||
      normalizeAccountId(state.importAccountId) ||
      normalizeAccountId(state.exportAccountId) ||
      normalizeAccountId(state.accounts[0]?.id)
    );
  }

  getAccountDisplayLabel(accountId) {
    const { state } = this.dependencies;
    const normalizedAccountId = normalizeAccountId(accountId);
    const account = state.accounts.find(
      (item) => normalizeAccountId(item?.id) === normalizedAccountId,
    );
    return account
      ? `${account.name || "Ad account"} (${normalizedAccountId})`
      : `act_${normalizedAccountId}`;
  }
}
