import { sleep } from "../utils/object.mjs";
import { sanitizeFileName } from "../utils/string.mjs";
import { sha256Blob } from "../media/media-hashes.mjs";

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
    const { downloadFile, getFileNameForBlob, triggerDownload } =
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
      const jsonFileName = `${sanitizeFileName(packageData.source.campaignName)}.json`;
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
      let downloadedMediaCount = 0;
      for (const file of packageData._downloadQueue) {
        log("info", `Downloading ${file.fileName}...`);
        let blob;
        let sha256 = "";
        try {
          if (!file.sourceUrl) {
            throw new Error("No source URL.");
          }
          blob = await downloadFile(file.sourceUrl, file.fileName);
          sha256 = await sha256Blob(blob);
        } catch (downloadError) {
          const decision = await askMediaDownloadFailureDecision(
            file,
            downloadError,
          );
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
        const savedName = getFileNameForBlob(file.fileName, blob);
        if (savedName !== file.fileName) {
          log(
            "info",
            `Meta served ${file.fileName} as ${savedName}; saving it under the real format.`,
          );
        }
        const manifestEntry = packageData.files.find(
          (item) => item.fileName === file.fileName,
        );
        if (manifestEntry) {
          manifestEntry.originalFileName = file.fileName;
          manifestEntry.fileName = savedName;
          manifestEntry.mediaId = `sha256:${sha256}`;
          manifestEntry.sha256 = sha256;
          manifestEntry.mimeType = blob.type || "application/octet-stream";
          manifestEntry.sourceId = file.sourceId || "";
          manifestEntry.sourceKind = file.sourceKind || "";
        }
        for (const [originalName, friendlyName] of Object.entries(
          packageData.fileNameMap || {},
        )) {
          if (friendlyName === file.fileName) {
            packageData.fileNameMap[originalName] = savedName;
          }
        }
        triggerDownload(savedName, blob);
        downloadedMediaCount += 1;
        await sleep(250);
      }

      for (const failed of failedDownloads) {
        const manifestEntry = packageData.files.find(
          (item) => item.fileName === failed.fileName,
        );
        if (manifestEntry) {
          manifestEntry.missing = true;
          manifestEntry.exportError = failed.error;
        }
      }
      // Write the package last: its filenames and hashes now describe the bytes
      // that were actually saved, including Meta's JPEG-to-WebP responses.
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
      triggerDownload(jsonFileName, jsonBlob);

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
      log(
        "info",
        `Export complete. Files downloaded by AdReplica: ${downloadedMediaCount + 1}/${packageData.files.length + 1}. Total media handled: ${downloadedMediaCount}/${packageData.files.length}`,
      );
      return !failedDownloads.length;
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
