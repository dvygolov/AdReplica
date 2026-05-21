export class SessionService {
  constructor({ initializeSession }) {
    this.initializeSession = initializeSession;
  }

  init(force = false) {
    return this.initializeSession(force);
  }
}

export class GraphClient {
  constructor({ graphFetch, graphGetAll, graphPageFetch, graphPageGetAll }) {
    this.fetch = graphFetch;
    this.getAll = graphGetAll;
    this.pageFetch = graphPageFetch;
    this.pageGetAll = graphPageGetAll;
  }
}

export class PrivateGraphqlClient {
  constructor({ privateGraphqlRequest, businessGraphqlRequest, privateGraphqlMutation }) {
    this.request = privateGraphqlRequest;
    this.businessRequest = businessGraphqlRequest;
    this.mutation = privateGraphqlMutation;
  }
}

export class AccountContextService {
  constructor({ fetchAccountContext, invalidateAccountContextCache }) {
    this.fetch = fetchAccountContext;
    this.invalidate = invalidateAccountContextCache;
  }
}

export class CampaignExporter {
  constructor({ fetchCampaignExportPackage, exportSelectedCampaign }) {
    this.fetchPackage = fetchCampaignExportPackage;
    this.exportSelected = exportSelectedCampaign;
  }
}

export class ImportWorkflow {
  constructor({ importPackage }) {
    this.run = importPackage;
  }
}

export class CloneWorkflow {
  constructor({ cloneCampaignToAccount, ensureClonePackageLoaded }) {
    this.run = cloneCampaignToAccount;
    this.ensurePackageLoaded = ensureClonePackageLoaded;
  }
}

export class CreativeService {
  constructor({ resolveCreativeImport, resolveCreativeDraftPayload }) {
    this.resolveImport = resolveCreativeImport;
    this.resolveDraftPayload = resolveCreativeDraftPayload;
  }
}

export class DraftService {
  constructor({ fetchCurrentDraftDetails, ensureDraftInstagramIdentityParity, logDraftValidation }) {
    this.fetchCurrentDetails = fetchCurrentDraftDetails;
    this.ensureInstagramIdentityParity = ensureDraftInstagramIdentityParity;
    this.logValidation = logDraftValidation;
  }
}

export class CatalogService {
  constructor({
    fetchCatalogExportSnapshot,
    fetchCatalogExportsForPackage,
    copyCatalogToTargetBusiness,
    copyCatalogIntoExistingTarget,
  }) {
    this.fetchExportSnapshot = fetchCatalogExportSnapshot;
    this.fetchExportsForPackage = fetchCatalogExportsForPackage;
    this.copyToTargetBusiness = copyCatalogToTargetBusiness;
    this.copyIntoExistingTarget = copyCatalogIntoExistingTarget;
  }
}

export class IdentityService {
  constructor({
    ensurePageIdentityProfiles,
    fetchAdsManagerInstagramObjectRecord,
    resolveInstagramIdentityForPage,
  }) {
    this.ensurePageProfiles = ensurePageIdentityProfiles;
    this.fetchAdsManagerInstagramObjectRecord = fetchAdsManagerInstagramObjectRecord;
    this.resolveInstagramIdentityForPage = resolveInstagramIdentityForPage;
  }
}

export class MediaService {
  constructor({ uploadImage, uploadVideo, uploadImageAsset, getPreferredVideoThumbnail }) {
    this.uploadImage = uploadImage;
    this.uploadVideo = uploadVideo;
    this.uploadImageAsset = uploadImageAsset;
    this.getPreferredVideoThumbnail = getPreferredVideoThumbnail;
  }
}

export function createServiceRegistry(dependencies) {
  return {
    session: new SessionService(dependencies),
    graph: new GraphClient(dependencies),
    privateGraphql: new PrivateGraphqlClient(dependencies),
    accountContext: new AccountContextService(dependencies),
    campaignExporter: new CampaignExporter(dependencies),
    importWorkflow: new ImportWorkflow(dependencies),
    cloneWorkflow: new CloneWorkflow(dependencies),
    creative: new CreativeService(dependencies),
    draft: new DraftService(dependencies),
    catalog: new CatalogService(dependencies),
    identity: new IdentityService(dependencies),
    media: new MediaService(dependencies),
  };
}
