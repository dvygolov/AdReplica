import { sleep } from "../utils/object.mjs";
import { sanitizeFileName } from "../utils/string.mjs";

/** ExportWorkflow. Dependencies are supplied by the application composition root. */
export class ExportWorkflow {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.exportSelectedCampaign = this.exportSelectedCampaign.bind(this);
  }

  async exportSelectedCampaign() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy } = this.dependencies.panelView;
    const { initializeSession } = this.dependencies.sessionService;
    const { fetchCampaignExportPackage } = this.dependencies.campaignExporter;
    const { getUrlDiagnosticLabel, downloadFile, triggerDownload } =
      this.dependencies.downloadService;
    const { askMediaDownloadFailureDecision } = this.dependencies.dialogs;
    if (!state.exportAccountId || !state.exportCampaignId) {
      log("warn", "Select an account and a campaign for export.");
      return;
    }

    setBusy(true);
    try {
      await initializeSession();
      const packageData = await fetchCampaignExportPackage(
        state.exportAccountId,
        state.exportCampaignId,
      );
      const jsonBlob = new Blob(
        [
          JSON.stringify(
            {
              ...packageData,
              _downloadQueue: undefined,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );

      const jsonFileName = `${sanitizeFileName(packageData.source.campaignName)}.json`;
      triggerDownload(jsonFileName, jsonBlob);
      if (state.operationReport) {
        state.operationReport.campaignName = packageData.source.campaignName;
        state.operationReport.exported = {
          campaign: 1,
          adset: packageData.adsets.length,
          ad: packageData.ads.length,
        };
        state.operationReport.expected = { ...state.operationReport.exported };
      }
      await sleep(150);

      const failedDownloads = [];
      const browserNativeDownloads = [];
      let downloadedMediaCount = 0;
      for (const file of packageData._downloadQueue) {
        log("info", `Downloading ${file.fileName}...`);
        let blob;
        try {
          if (!file.sourceUrl) {
            throw new Error("No source URL.");
          }
          blob = await downloadFile(file.sourceUrl, file.fileName);
        } catch (downloadError) {
          const decision = await askMediaDownloadFailureDecision(
            file,
            downloadError,
          );
          if (decision === "browser") {
            state.operationReport?.issue(
              `Browser download needs verification: ${file.fileName}`,
              { uncertain: true },
            );
            browserNativeDownloads.push({
              fileName: file.fileName,
              type: file.type || "",
              sourceKind: file.sourceKind || "",
              sourceId: file.sourceId || "",
              error: String(downloadError?.message || downloadError),
            });
            log(
              "warn",
              `Opened browser-native download after fetch failed: ${file.fileName}.`,
              `${getUrlDiagnosticLabel(file.sourceUrl)} | ${String(downloadError?.message || downloadError)}`,
            );
            await sleep(250);
            continue;
          }
          state.operationReport?.skip(
            { name: file.fileName },
            String(downloadError),
          );
          failedDownloads.push({
            fileName: file.fileName,
            type: file.type || "",
            sourceKind: file.sourceKind || "",
            sourceId: file.sourceId || "",
            error: String(downloadError?.message || downloadError),
          });
          if (decision === "yes") {
            log(
              "warn",
              `Skipped media download after user chose to continue: ${file.fileName}.`,
              String(downloadError?.message || downloadError),
            );
            continue;
          }
          const action = decision === "cancel" ? "cancelled" : "stopped";
          throw new Error(
            `Export ${action} after failed media download: ${file.fileName}. ${String(downloadError?.message || downloadError)}`,
          );
        }
        triggerDownload(file.fileName, blob);
        downloadedMediaCount += 1;
        await sleep(250);
      }

      if (packageData.warnings.length) {
        packageData.warnings.forEach((warning) => log("warn", warning));
      }

      if (packageData.catalogExports?.length) {
        log(
          "info",
          `Catalog settings embedded in JSON: ${packageData.catalogExports.map((item) => `${item.catalog?.name || item.catalog?.id} (${item.exportMode})`).join(", ")}.`,
        );
      }
      if (failedDownloads.length) {
        log(
          "warn",
          `Export completed with ${failedDownloads.length} skipped media file(s).`,
          failedDownloads,
        );
      }
      if (browserNativeDownloads.length) {
        log(
          "warn",
          `Browser-native downloads opened for ${browserNativeDownloads.length} media file(s); browser may choose its own filename for cross-origin files.`,
          browserNativeDownloads,
        );
      }
      const openedMediaCount =
        downloadedMediaCount + browserNativeDownloads.length;
      log(
        "info",
        `Export complete. Files downloaded by AdReplica: ${downloadedMediaCount + 1}/${packageData.files.length + 1}. Browser-native media opened: ${browserNativeDownloads.length}. Total media handled: ${openedMediaCount}/${packageData.files.length}`,
      );
      return !failedDownloads.length && !browserNativeDownloads.length;
    } catch (error) {
      state.operationReport?.issue(String(error), {
        uncertain: Boolean(error?.uncertain),
      });
      log("error", "Campaign export error.", String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
}
