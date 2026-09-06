import { Logging } from "../core/logging.mjs";
import { PanelView } from "../ui/panel-view.mjs";
import { NetworkDiagnostics } from "../core/diagnostics.mjs";
import { BrowserTransport } from "../facebook/browser-transport.mjs";
import { DraftWriter } from "../writers/draft-writer.mjs";
import { IdentityService } from "../identity/identity-service.mjs";
import { MediaSlots } from "../media/media-slots.mjs";
import { CatalogDiscovery } from "../catalog/catalog-discovery.mjs";
import { PackageRenderer } from "../ui/package-renderer.mjs";
import { RequestContext } from "../facebook/request-context.mjs";
import { MappingsView } from "../ui/mappings-view.mjs";
import { LogView } from "../ui/log-view.mjs";
import { PanelController } from "../ui/panel-controller.mjs";
import { SessionService } from "../facebook/session-service.mjs";
import { GraphClient } from "../facebook/graph-client.mjs";
import { PrivateGraphqlClient } from "../facebook/private-graphql-client.mjs";
import { AccountController } from "../accounts/account-controller.mjs";
import { AccountContextService } from "../accounts/account-context-service.mjs";
import { MappingController } from "../accounts/mapping-controller.mjs";
import { CampaignController } from "../accounts/campaign-controller.mjs";
import { CampaignExporter } from "../export/campaign-exporter.mjs";
import { CatalogExporter } from "../catalog/catalog-exporter.mjs";
import { DownloadService } from "../media/download-service.mjs";
import { Dialogs } from "../ui/dialogs.mjs";
import { ExportWorkflow } from "../workflows/export-workflow.mjs";
import { CloneWorkflow } from "../workflows/clone-workflow.mjs";
import { MediaPreflight } from "../media/media-preflight.mjs";
import { ImportController } from "../ui/import-controller.mjs";
import { CreativeMedia } from "../creative/creative-media.mjs";
import { PixelService } from "../pixels/pixel-service.mjs";
import { ScheduleService } from "../workflows/schedule-service.mjs";
import { ImageService } from "../media/image-service.mjs";
import { VideoService } from "../media/video-service.mjs";
import { CreativeValidator } from "../creative/creative-validator.mjs";
import { CreativeService } from "../creative/creative-service.mjs";
import { DirectWriter } from "../writers/direct-writer.mjs";
import { DraftRepository } from "../drafts/draft-repository.mjs";
import { DraftController } from "../ui/draft-controller.mjs";
import { DraftRecovery } from "../drafts/draft-recovery.mjs";
import { DraftValidation } from "../drafts/draft-validation.mjs";
import { CatalogMappingService } from "../catalog/catalog-mapping-service.mjs";
import { CatalogCopyService } from "../catalog/catalog-copy-service.mjs";
import { CatalogFeedService } from "../catalog/catalog-feed-service.mjs";
import { CatalogProductService } from "../catalog/catalog-product-service.mjs";
import { CatalogSetService } from "../catalog/catalog-set-service.mjs";
import { EditorInspector } from "../ui/editor-inspector.mjs";
import { ImportWorkflow } from "../workflows/import-workflow.mjs";

/** Construct one runtime. Each service receives only its declared collaborators.
 * Lazy getters resolve UI/workflow callbacks without circular module imports.
 */
export function createServices({ state, dom, logger, overrides = {} }) {
  const services = {};
  const sourceImageRecoveryCache = new Map();
  const sourceVideoRecoveryCache = new Map();
  services.logging =
    overrides.logging ||
    new Logging({
      logger,
    });
  services.panelView =
    overrides.panelView ||
    new PanelView({
      state,
      dom,
      get logView() {
        return services.logView;
      },
      get mappingsView() {
        return services.mappingsView;
      },
      get mappingController() {
        return services.mappingController;
      },
    });
  services.networkDiagnostics =
    overrides.networkDiagnostics ||
    new NetworkDiagnostics({
      state,
    });
  services.browserTransport =
    overrides.browserTransport || new BrowserTransport({});
  services.draftWriter =
    overrides.draftWriter ||
    new DraftWriter({
      state,
      get sessionService() {
        return services.sessionService;
      },
      get draftRecovery() {
        return services.draftRecovery;
      },
      get scheduleService() {
        return services.scheduleService;
      },
      get logging() {
        return services.logging;
      },
    });
  services.identityService =
    overrides.identityService ||
    new IdentityService({
      state,
      get graphClient() {
        return services.graphClient;
      },
      get logging() {
        return services.logging;
      },
      get privateGraphqlClient() {
        return services.privateGraphqlClient;
      },
    });
  services.mediaSlots =
    overrides.mediaSlots ||
    new MediaSlots({
      state,
      sourceImageRecoveryCache,
      sourceVideoRecoveryCache,
      get logging() {
        return services.logging;
      },
      get downloadService() {
        return services.downloadService;
      },
      get mediaPreflight() {
        return services.mediaPreflight;
      },
    });
  services.catalogDiscovery =
    overrides.catalogDiscovery ||
    new CatalogDiscovery({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
    });
  services.packageRenderer =
    overrides.packageRenderer || new PackageRenderer({});
  services.requestContext =
    overrides.requestContext ||
    new RequestContext({
      state,
    });
  services.mappingsView =
    overrides.mappingsView ||
    new MappingsView({
      state,
      dom,
      get mediaSlots() {
        return services.mediaSlots;
      },
      get packageRenderer() {
        return services.packageRenderer;
      },
    });
  services.logView =
    overrides.logView ||
    new LogView({
      state,
      dom,
      get downloadService() {
        return services.downloadService;
      },
    });
  services.panelController =
    overrides.panelController ||
    new PanelController({
      state,
      dom,
      get logging() {
        return services.logging;
      },
      get mediaSlots() {
        return services.mediaSlots;
      },
      get panelView() {
        return services.panelView;
      },
      get logView() {
        return services.logView;
      },
      get mappingsView() {
        return services.mappingsView;
      },
      get sessionService() {
        return services.sessionService;
      },
      get mappingController() {
        return services.mappingController;
      },
      get campaignController() {
        return services.campaignController;
      },
      get exportWorkflow() {
        return services.exportWorkflow;
      },
      get cloneWorkflow() {
        return services.cloneWorkflow;
      },
      get importController() {
        return services.importController;
      },
      get draftController() {
        return services.draftController;
      },
      get importWorkflow() {
        return services.importWorkflow;
      },
    });
  services.sessionService =
    overrides.sessionService ||
    new SessionService({
      state,
      get browserTransport() {
        return services.browserTransport;
      },
      get logging() {
        return services.logging;
      },
      get panelView() {
        return services.panelView;
      },
      get accountController() {
        return services.accountController;
      },
    });
  services.graphClient =
    overrides.graphClient ||
    new GraphClient({
      state,
      get logging() {
        return services.logging;
      },
      get networkDiagnostics() {
        return services.networkDiagnostics;
      },
      get browserTransport() {
        return services.browserTransport;
      },
      get requestContext() {
        return services.requestContext;
      },
    });
  services.privateGraphqlClient =
    overrides.privateGraphqlClient ||
    new PrivateGraphqlClient({
      state,
      get networkDiagnostics() {
        return services.networkDiagnostics;
      },
      get browserTransport() {
        return services.browserTransport;
      },
      get sessionService() {
        return services.sessionService;
      },
    });
  services.accountController =
    overrides.accountController ||
    new AccountController({
      state,
      get logging() {
        return services.logging;
      },
      get panelView() {
        return services.panelView;
      },
      get graphClient() {
        return services.graphClient;
      },
      get accountContextService() {
        return services.accountContextService;
      },
      get mappingController() {
        return services.mappingController;
      },
      get campaignController() {
        return services.campaignController;
      },
    });
  services.accountContextService =
    overrides.accountContextService ||
    new AccountContextService({
      state,
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
    });
  services.mappingController =
    overrides.mappingController ||
    new MappingController({
      state,
      dom,
      get logging() {
        return services.logging;
      },
      get accountContextService() {
        return services.accountContextService;
      },
    });
  services.campaignController =
    overrides.campaignController ||
    new CampaignController({
      state,
      get logging() {
        return services.logging;
      },
      get accountContextService() {
        return services.accountContextService;
      },
      get graphClient() {
        return services.graphClient;
      },
      get panelView() {
        return services.panelView;
      },
      get sessionService() {
        return services.sessionService;
      },
      get cloneWorkflow() {
        return services.cloneWorkflow;
      },
    });
  services.campaignExporter =
    overrides.campaignExporter ||
    new CampaignExporter({
      state,
      get graphClient() {
        return services.graphClient;
      },
      get logging() {
        return services.logging;
      },
      get catalogDiscovery() {
        return services.catalogDiscovery;
      },
      get catalogExporter() {
        return services.catalogExporter;
      },
    });
  services.catalogExporter =
    overrides.catalogExporter ||
    new CatalogExporter({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get privateGraphqlClient() {
        return services.privateGraphqlClient;
      },
    });
  services.downloadService =
    overrides.downloadService ||
    new DownloadService({
      get logging() {
        return services.logging;
      },
      get browserTransport() {
        return services.browserTransport;
      },
    });
  services.dialogs =
    overrides.dialogs ||
    new Dialogs({
      state,
      get downloadService() {
        return services.downloadService;
      },
      get editorInspector() {
        return services.editorInspector;
      },
      get logging() {
        return services.logging;
      },
    });
  services.exportWorkflow =
    overrides.exportWorkflow ||
    new ExportWorkflow({
      state,
      get logging() {
        return services.logging;
      },
      get panelView() {
        return services.panelView;
      },
      get sessionService() {
        return services.sessionService;
      },
      get campaignExporter() {
        return services.campaignExporter;
      },
      get downloadService() {
        return services.downloadService;
      },
      get dialogs() {
        return services.dialogs;
      },
    });
  services.cloneWorkflow =
    overrides.cloneWorkflow ||
    new CloneWorkflow({
      state,
      dom,
      get logging() {
        return services.logging;
      },
      get panelView() {
        return services.panelView;
      },
      get mappingsView() {
        return services.mappingsView;
      },
      get sessionService() {
        return services.sessionService;
      },
      get mappingController() {
        return services.mappingController;
      },
      get campaignController() {
        return services.campaignController;
      },
      get campaignExporter() {
        return services.campaignExporter;
      },
      get downloadService() {
        return services.downloadService;
      },
      get importWorkflow() {
        return services.importWorkflow;
      },
    });
  services.mediaPreflight =
    overrides.mediaPreflight ||
    new MediaPreflight({
      state,
      get mediaSlots() {
        return services.mediaSlots;
      },
      get imageService() {
        return services.imageService;
      },
      get graphClient() {
        return services.graphClient;
      },
      get logging() {
        return services.logging;
      },
      get downloadService() {
        return services.downloadService;
      },
      get videoService() {
        return services.videoService;
      },
      get dialogs() {
        return services.dialogs;
      },
    });
  services.importController =
    overrides.importController ||
    new ImportController({
      state,
      get logging() {
        return services.logging;
      },
      get mappingsView() {
        return services.mappingsView;
      },
      get mappingController() {
        return services.mappingController;
      },
    });
  services.creativeMedia =
    overrides.creativeMedia ||
    new CreativeMedia({
      state,
      get logging() {
        return services.logging;
      },
      get mediaSlots() {
        return services.mediaSlots;
      },
      get imageService() {
        return services.imageService;
      },
      get videoService() {
        return services.videoService;
      },
    });
  services.pixelService =
    overrides.pixelService ||
    new PixelService({
      state,
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get accountContextService() {
        return services.accountContextService;
      },
      get mediaSlots() {
        return services.mediaSlots;
      },
    });
  services.scheduleService =
    overrides.scheduleService ||
    new ScheduleService({
      state,
      get logging() {
        return services.logging;
      },
    });
  services.imageService =
    overrides.imageService ||
    new ImageService({
      get downloadService() {
        return services.downloadService;
      },
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
    });
  services.videoService =
    overrides.videoService ||
    new VideoService({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get downloadService() {
        return services.downloadService;
      },
      get imageService() {
        return services.imageService;
      },
    });
  services.creativeValidator =
    overrides.creativeValidator ||
    new CreativeValidator({
      get graphClient() {
        return services.graphClient;
      },
      get logging() {
        return services.logging;
      },
    });
  services.creativeService =
    overrides.creativeService ||
    new CreativeService({
      state,
      get identityService() {
        return services.identityService;
      },
      get creativeValidator() {
        return services.creativeValidator;
      },
      get videoService() {
        return services.videoService;
      },
      get logging() {
        return services.logging;
      },
      get mediaSlots() {
        return services.mediaSlots;
      },
      get creativeMedia() {
        return services.creativeMedia;
      },
      get imageService() {
        return services.imageService;
      },
    });
  services.directWriter =
    overrides.directWriter ||
    new DirectWriter({
      state,
      get graphClient() {
        return services.graphClient;
      },
      get scheduleService() {
        return services.scheduleService;
      },
    });
  services.draftRepository =
    overrides.draftRepository ||
    new DraftRepository({
      get graphClient() {
        return services.graphClient;
      },
      get logging() {
        return services.logging;
      },
      get sessionService() {
        return services.sessionService;
      },
    });
  services.draftController =
    overrides.draftController ||
    new DraftController({
      state,
      get logging() {
        return services.logging;
      },
      get panelView() {
        return services.panelView;
      },
      get sessionService() {
        return services.sessionService;
      },
      get accountController() {
        return services.accountController;
      },
      get draftRepository() {
        return services.draftRepository;
      },
      get dialogs() {
        return services.dialogs;
      },
    });
  services.draftRecovery =
    overrides.draftRecovery ||
    new DraftRecovery({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get draftRepository() {
        return services.draftRepository;
      },
    });
  services.draftValidation =
    overrides.draftValidation ||
    new DraftValidation({
      state,
      get logging() {
        return services.logging;
      },
      get identityService() {
        return services.identityService;
      },
      get draftRepository() {
        return services.draftRepository;
      },
    });
  services.catalogMappingService =
    overrides.catalogMappingService ||
    new CatalogMappingService({
      state,
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get accountContextService() {
        return services.accountContextService;
      },
      get catalogCopyService() {
        return services.catalogCopyService;
      },
    });
  services.catalogCopyService =
    overrides.catalogCopyService ||
    new CatalogCopyService({
      state,
      get catalogExporter() {
        return services.catalogExporter;
      },
      get logging() {
        return services.logging;
      },
      get sessionService() {
        return services.sessionService;
      },
      get graphClient() {
        return services.graphClient;
      },
      get privateGraphqlClient() {
        return services.privateGraphqlClient;
      },
      get catalogFeedService() {
        return services.catalogFeedService;
      },
      get catalogProductService() {
        return services.catalogProductService;
      },
      get catalogSetService() {
        return services.catalogSetService;
      },
    });
  services.catalogFeedService =
    overrides.catalogFeedService ||
    new CatalogFeedService({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
      get catalogExporter() {
        return services.catalogExporter;
      },
      get sessionService() {
        return services.sessionService;
      },
      get privateGraphqlClient() {
        return services.privateGraphqlClient;
      },
    });
  services.catalogProductService =
    overrides.catalogProductService ||
    new CatalogProductService({
      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
    });
  services.catalogSetService =
    overrides.catalogSetService ||
    new CatalogSetService({
      state,

      get logging() {
        return services.logging;
      },
      get graphClient() {
        return services.graphClient;
      },
    });
  services.editorInspector =
    overrides.editorInspector || new EditorInspector({});
  services.importWorkflow =
    overrides.importWorkflow ||
    new ImportWorkflow({
      state,
      get logging() {
        return services.logging;
      },
      get panelView() {
        return services.panelView;
      },
      get sessionService() {
        return services.sessionService;
      },
      get accountContextService() {
        return services.accountContextService;
      },
      get mappingController() {
        return services.mappingController;
      },
      get mediaPreflight() {
        return services.mediaPreflight;
      },
      get identityService() {
        return services.identityService;
      },
      get scheduleService() {
        return services.scheduleService;
      },
      get creativeService() {
        return services.creativeService;
      },
      get directWriter() {
        return services.directWriter;
      },
      get draftRepository() {
        return services.draftRepository;
      },
      get draftRecovery() {
        return services.draftRecovery;
      },
      get draftValidation() {
        return services.draftValidation;
      },
      get draftWriter() {
        return services.draftWriter;
      },
      get pixelService() {
        return services.pixelService;
      },
      get catalogMappingService() {
        return services.catalogMappingService;
      },
      get dialogs() {
        return services.dialogs;
      },
    });
  return services;
}
