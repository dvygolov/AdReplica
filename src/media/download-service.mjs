import { sleep } from "../utils/object.mjs";

/** DownloadService. Dependencies are supplied by the application composition root. */
export class DownloadService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.responseToBlob = this.responseToBlob.bind(this);
    this.getMediaFileName = this.getMediaFileName.bind(this);
    this.isRemoteMediaFile = this.isRemoteMediaFile.bind(this);
    this.createRemoteMediaFile = this.createRemoteMediaFile.bind(this);
    this.getUrlDiagnosticLabel = this.getUrlDiagnosticLabel.bind(this);
    this.downloadFile = this.downloadFile.bind(this);
    this.triggerBrowserNativeDownload =
      this.triggerBrowserNativeDownload.bind(this);
    this.triggerDownload = this.triggerDownload.bind(this);
  }

  async responseToBlob(response) {
    const buffer = await response.arrayBuffer();
    return new Blob([buffer], {
      type: response.headers.get("content-type") || "application/octet-stream",
    });
  }

  getMediaFileName(file) {
    return String(file?.name || file?.fileName || "");
  }

  isRemoteMediaFile(file) {
    return Boolean(file?.__adReplicaRemoteMedia);
  }

  createRemoteMediaFile(file, error = null) {
    return {
      __adReplicaRemoteMedia: true,
      name: file.fileName,
      fileName: file.fileName,
      type: file.type,
      sourceUrl: file.sourceUrl || "",
      sourceAccountId: String(file.sourceAccountId || "").replace(/^act_/, ""),
      sourceId: String(file.sourceId || ""),
      sourceKind: file.sourceKind || "",
      downloadError: String(error?.message || error || ""),
    };
  }

  getUrlDiagnosticLabel(sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      return `${url.hostname}${url.pathname ? url.pathname.split("/").slice(0, 3).join("/") : ""}`;
    } catch (_error) {
      return "unknown source";
    }
  }

  async downloadFile(sourceUrl, fileName, options = {}) {
    const { log } = this.dependencies.logging;
    const { adReplicaFetch } = this.dependencies.browserTransport;
    const { responseToBlob, getUrlDiagnosticLabel } = this;
    const attempts = Math.max(1, Number(options.attempts || 3));
    const isCdn = /fbcdn\.net|scontent/.test(sourceUrl);
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await adReplicaFetch(sourceUrl, {
          credentials: isCdn ? "omit" : "include",
          mode: "cors",
        });
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} ${response.statusText || ""}`.trim(),
          );
        }
        return responseToBlob(response);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          break;
        }
        log(
          "warn",
          `Media download failed on attempt ${attempt}/${attempts}: ${fileName}. Retrying...`,
          `${getUrlDiagnosticLabel(sourceUrl)} | ${String(error?.message || error)}`,
        );
        await sleep(800 * attempt);
      }
    }
    throw new Error(
      `Download error ${fileName}: ${String(lastError?.message || lastError || "unknown error")}`,
    );
  }

  triggerBrowserNativeDownload(file) {
    if (!file?.sourceUrl || !document.body) {
      return false;
    }
    const link = document.createElement("a");
    link.href = file.sourceUrl;
    link.download = file.fileName || file.name || "";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 1500);
    return true;
  }

  triggerDownload(fileName, blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }
}
