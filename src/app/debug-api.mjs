/** Compatibility API for browser diagnostics and regression fixtures. */
export function createDebugApi(services, state) {
  return {
    setState: (partialState = {}) => {
      if (!partialState || typeof partialState !== "object") {
        return state;
      }
      Object.assign(state, partialState);
      services.panelView.renderUI();
      return state;
    },
    renderUI: () => {
      services.panelView.renderUI();
      return state;
    },
    privateGraphqlMutation: (docId, friendlyName, variables) =>
      services.privateGraphqlClient.privateGraphqlMutation(
        docId,
        friendlyName,
        variables,
      ),
    ensureClonePackageLoaded: () =>
      services.cloneWorkflow.ensureClonePackageLoaded(),
    runClone: (options = {}) =>
      services.cloneWorkflow.cloneCampaignToAccount(options),
    runImport: (options = {}) => services.importWorkflow.importPackage(options),
    repairDraftIdentity: (accountId, draftId) =>
      services.draftValidation.ensureDraftInstagramIdentityParity(
        accountId,
        draftId,
      ),
    repairDraftIdentityWithContext: (accountId, draftId, contexts = []) => {
      const map = new Map();
      for (const context of Array.isArray(contexts) ? contexts : []) {
        const normalized = {
          adId: String(context?.adId || ""),
          adName: String(context?.adName || ""),
          pageId: String(context?.pageId || ""),
          creativeId: String(context?.creativeId || ""),
          tempId: String(context?.tempId || ""),
        };
        if (normalized.adId) {
          map.set(`id:${normalized.adId}`, normalized);
        }
        if (normalized.adName) {
          map.set(`name:${normalized.adName.trim().toLowerCase()}`, normalized);
        }
        if (normalized.tempId) {
          map.set(`temp:${normalized.tempId}`, normalized);
        }
      }
      return services.draftValidation.ensureDraftInstagramIdentityParity(
        accountId,
        draftId,
        map,
      );
    },
    scanDraftIdentity: async (accountId, draftId) => {
      const draft = await services.draftRepository.fetchCurrentDraftDetails(
        accountId,
        draftId,
      );
      return (draft?.addraft_fragments?.data || [])
        .map(services.draftValidation.getAffectedDraftIdentityFragment)
        .filter(Boolean);
    },
    ensurePageIdentityProfiles: (pageId, itemName = "", accountId = "") =>
      services.identityService.ensurePageIdentityProfiles(
        pageId,
        itemName,
        accountId,
      ),
    privateMutation: (docId, friendlyName, variables) =>
      services.privateGraphqlClient.privateGraphqlMutation(
        docId,
        friendlyName,
        variables,
      ),
    inspectEditorState: () =>
      services.editorInspector.inspectDynamicCreativeEditorState(window),
    fetchEntity: async (id, fields) =>
      services.graphClient.graphFetch(id, {
        query: {
          fields,
        },
      }),
    graphFetch: (pathOrUrl, options = {}) =>
      services.graphClient.graphFetch(pathOrUrl, options),
    graphGetAll: (path, query = {}) =>
      services.graphClient.graphGetAll(path, query),
    clearDrafts: (accountId = "") =>
      services.draftRepository.clearDraftsForAccount(
        accountId || services.accountController.getServiceDraftAccountId(),
      ),
    fetchExportPackage: (accountId, campaignId) =>
      services.campaignExporter.fetchCampaignExportPackage(
        accountId,
        campaignId,
      ),
    fetchCatalogExportSnapshot: (catalogId) =>
      services.catalogExporter.fetchCatalogExportSnapshot({ id: catalogId }),
    fetchCatalogExportsForPackage: (catalogs) =>
      services.catalogExporter.fetchCatalogExportsForPackage(catalogs),
    fetchAccountContext: (accountId) =>
      services.accountContextService.fetchAccountContext(accountId),
    copyCatalogToTargetBusiness: (sourceCatalogId, targetAccountId) =>
      services.accountContextService
        .fetchAccountContext(targetAccountId)
        .then((context) =>
          services.catalogCopyService.copyCatalogToTargetBusiness(
            sourceCatalogId,
            context,
          ),
        ),
    copyCatalogIntoExistingTarget: (sourceCatalogId, targetCatalogId) =>
      services.catalogCopyService.copyCatalogIntoExistingTarget(
        sourceCatalogId,
        targetCatalogId,
      ),
    fetchAdsManagerInstagramObjectRecord: (instagramObjectId, accountId = "") =>
      services.identityService.fetchAdsManagerInstagramObjectRecord(
        instagramObjectId,
        accountId,
      ),
    inspectCurrentDraft: async (accountId) =>
      services.graphClient.graphFetch(`act_${accountId}/current_addrafts`, {
        query: {
          fields: [
            "id",
            "state",
            "publish_status{status,error_count,publish_error}",
            "addraft_fragments.limit(500){id,ad_object_type,ad_object_id,validation_status,active_errors,publish_error,values}",
          ].join(","),
        },
      }),
    inspectDynamicCreativeEditorState: (targetWindow = window) =>
      services.editorInspector.inspectDynamicCreativeEditorState(targetWindow),
  };
}
