import { sleep } from "../utils/object.mjs";

/** ImageService. Dependencies are supplied by the application composition root. */
export class ImageService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getAdImageHashFromResponse =
      this.getAdImageHashFromResponse.bind(this);
    this.getFileExtension = this.getFileExtension.bind(this);
    this.replaceFileExtension = this.replaceFileExtension.bind(this);
    this.shouldTranscodeImageForMeta =
      this.shouldTranscodeImageForMeta.bind(this);
    this.detectImageFormat = this.detectImageFormat.bind(this);
    this.loadImageElementFromBlob = this.loadImageElementFromBlob.bind(this);
    this.transcodeImageFileForMeta = this.transcodeImageFileForMeta.bind(this);
    this.tryUploadRemoteImageCopy = this.tryUploadRemoteImageCopy.bind(this);
    this.tryUploadRemoteImageUrl = this.tryUploadRemoteImageUrl.bind(this);
    this.waitForAdImageUrlByHash = this.waitForAdImageUrlByHash.bind(this);
    this.downloadRemoteMediaAsFile = this.downloadRemoteMediaAsFile.bind(this);
    this.uploadRemoteImageViaBrowser =
      this.uploadRemoteImageViaBrowser.bind(this);
    this.uploadRemoteImage = this.uploadRemoteImage.bind(this);
    this.uploadImage = this.uploadImage.bind(this);
    this.getAdImageUrlByHash = this.getAdImageUrlByHash.bind(this);
    this.uploadImageAsset = this.uploadImageAsset.bind(this);
  }

  getAdImageHashFromResponse(json, fileName) {
    if (json?.hash) {
      return String(json.hash);
    }
    const images = json?.images || {};
    const direct = fileName ? images[fileName] : null;
    const first = direct || images[Object.keys(images)[0]];
    if (first?.hash) {
      return String(first.hash);
    }
    if (typeof first?.id === "string" && first.id.includes(":")) {
      return first.id.split(":").pop();
    }
    return "";
  }

  getFileExtension(fileName) {
    const match = String(fileName || "").match(/(\.[a-z0-9]{1,8})$/i);
    return match ? match[1].toLowerCase() : "";
  }

  replaceFileExtension(fileName, extension) {
    const { getFileExtension } = this;
    const safeExtension = String(extension || "").startsWith(".")
      ? String(extension)
      : `.${extension}`;
    const name = String(fileName || "image");
    return getFileExtension(name)
      ? name.replace(/(\.[a-z0-9]{1,8})$/i, safeExtension)
      : `${name}${safeExtension}`;
  }

  /** Reads the first bytes of a file and reports the real image format. */
  async detectImageFormat(file) {
    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (
        head.length >= 12 &&
        head[0] === 0x52 &&
        head[1] === 0x49 &&
        head[2] === 0x46 &&
        head[3] === 0x46 &&
        head[8] === 0x57 &&
        head[9] === 0x45 &&
        head[10] === 0x42 &&
        head[11] === 0x50
      ) {
        return "webp";
      }
      if (head[0] === 0xff && head[1] === 0xd8) return "jpeg";
      if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e)
        return "png";
      if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46)
        return "gif";
      return "";
    } catch (_error) {
      return "";
    }
  }

  /**
   * Meta serves creatives as WebP whatever the export named them, and the
   * `adimages` endpoint rejects those bytes. Decide by the file content, not by
   * its name or MIME type, so a `tel__image_01.jpg` that is really WebP is
   * converted before upload.
   */
  async shouldTranscodeImageForMeta(file) {
    const { getMediaFileName, isRemoteMediaFile } =
      this.dependencies.downloadService;
    const { getFileExtension } = this;
    if (!file || isRemoteMediaFile(file)) {
      return false;
    }
    const fileName = getMediaFileName(file);
    if (
      String(file.type || "").toLowerCase() === "image/webp" ||
      getFileExtension(fileName) === ".webp"
    ) {
      return true;
    }
    return (await this.detectImageFormat(file)) === "webp";
  }

  loadImageElementFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(
          new Error(
            `Failed to decode image ${blob.name || blob.type || ""}: Meta returned a non-image payload (the download may be an error page).`,
          ),
        );
      };
      image.src = url;
    });
  }

  async transcodeImageFileForMeta(file) {
    const { log } = this.dependencies.logging;
    const { getMediaFileName } = this.dependencies.downloadService;
    const {
      replaceFileExtension,
      shouldTranscodeImageForMeta,
      loadImageElementFromBlob,
    } = this;
    if (!(await shouldTranscodeImageForMeta(file))) {
      return file;
    }
    const image = await loadImageElementFromBlob(file);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    if (!canvas.width || !canvas.height) {
      throw new Error(
        `Cannot convert ${getMediaFileName(file)}: empty image dimensions.`,
      );
    }
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(
        `Cannot convert ${getMediaFileName(file)}: canvas is unavailable.`,
      );
    }
    context.drawImage(image, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      throw new Error(`Cannot convert ${getMediaFileName(file)} to JPEG.`);
    }
    const nextName = replaceFileExtension(getMediaFileName(file), ".jpg");
    log(
      "info",
      `Converted ${getMediaFileName(file)} to ${nextName} for Meta image upload.`,
    );
    return new File([blob], nextName, {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });
  }

  async tryUploadRemoteImageCopy(accountId, file) {
    const { graphFetch } = this.dependencies.graphClient;
    const { getMediaFileName } = this.dependencies.downloadService;
    const { getAdImageHashFromResponse } = this;
    if (!file.sourceAccountId || !file.sourceId) {
      return "";
    }
    const json = await graphFetch(`act_${accountId}/adimages`, {
      method: "POST",
      body: {
        name: getMediaFileName(file),
        copy_from: {
          source_account_id: String(file.sourceAccountId).replace(/^act_/, ""),
          hash: String(file.sourceId),
        },
      },
    });
    return getAdImageHashFromResponse(json, getMediaFileName(file));
  }

  async tryUploadRemoteImageUrl(accountId, file) {
    const { graphFetch } = this.dependencies.graphClient;
    const { getMediaFileName } = this.dependencies.downloadService;
    const { getAdImageHashFromResponse } = this;
    if (!file.sourceUrl) {
      return "";
    }
    const json = await graphFetch(`act_${accountId}/adimages`, {
      method: "POST",
      body: {
        name: getMediaFileName(file),
        url: file.sourceUrl,
      },
    });
    return getAdImageHashFromResponse(json, getMediaFileName(file));
  }

  async waitForAdImageUrlByHash(accountId, imageHash, options = {}) {
    const { log } = this.dependencies.logging;
    const { getAdImageUrlByHash } = this;
    const attempts = Number(options.attempts || 12);
    const delayMs = Number(options.delayMs || 5000);
    const label = options.label || String(imageHash || "");
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const url = await getAdImageUrlByHash(accountId, imageHash);
        if (url) {
          return url;
        }
      } catch (error) {
        if (error?.uncertain) throw error;
        lastError = error;
      }
      if (attempt < attempts) {
        log(
          "info",
          `Waiting for target image to become available: ${label} (${attempt}/${attempts}).`,
        );
        await sleep(delayMs);
      }
    }
    if (lastError) {
      log(
        "warn",
        `Target image availability check failed for ${label}.`,
        String(lastError),
      );
    }
    return "";
  }

  async downloadRemoteMediaAsFile(file) {
    const { getMediaFileName, downloadFile } =
      this.dependencies.downloadService;
    if (!file.sourceUrl) {
      throw new Error("No source URL.");
    }
    const blob = await downloadFile(file.sourceUrl, getMediaFileName(file));
    return new File([blob], getMediaFileName(file), {
      type: blob.type || (file.type === "video" ? "video/mp4" : "image/jpeg"),
    });
  }

  async uploadRemoteImageViaBrowser(accountId, file) {
    const { downloadRemoteMediaAsFile, uploadImage } = this;
    const downloaded = await downloadRemoteMediaAsFile(file);
    return uploadImage(accountId, downloaded);
  }

  async uploadRemoteImage(accountId, file) {
    const { log } = this.dependencies.logging;
    const { getMediaFileName } = this.dependencies.downloadService;
    const {
      tryUploadRemoteImageCopy,
      tryUploadRemoteImageUrl,
      waitForAdImageUrlByHash,
      uploadRemoteImageViaBrowser,
    } = this;
    const failures = [];
    try {
      const hash = await tryUploadRemoteImageCopy(accountId, file);
      if (hash) {
        const url = await waitForAdImageUrlByHash(accountId, hash, {
          label: getMediaFileName(file),
        });
        if (url) {
          log(
            "info",
            `Copied image ${getMediaFileName(file)} through Meta copy_from.`,
          );
          return hash;
        }
        throw new Error(
          `copy_from returned image hash ${hash}, but target account did not expose it for creative use.`,
        );
      }
    } catch (error) {
      if (error?.uncertain) throw error;
      failures.push(`copy_from: ${String(error?.message || error)}`);
    }
    try {
      const hash = await tryUploadRemoteImageUrl(accountId, file);
      if (hash) {
        log(
          "info",
          `Copied image ${getMediaFileName(file)} through Meta URL import.`,
        );
        return hash;
      }
    } catch (error) {
      if (error?.uncertain) throw error;
      failures.push(`url: ${String(error?.message || error)}`);
    }
    try {
      const hash = await uploadRemoteImageViaBrowser(accountId, file);
      if (hash) {
        log(
          "info",
          `Copied image ${getMediaFileName(file)} through browser download fallback.`,
        );
        return hash;
      }
    } catch (error) {
      if (error?.uncertain) throw error;
      failures.push(`browser_download: ${String(error?.message || error)}`);
    }
    throw new Error(
      `Remote image copy failed for ${getMediaFileName(file)}. ${failures.join(" | ")}`,
    );
  }

  async uploadImage(accountId, file) {
    const { graphFetch } = this.dependencies.graphClient;
    const { isRemoteMediaFile } = this.dependencies.downloadService;
    const { transcodeImageFileForMeta, uploadRemoteImage } = this;
    if (isRemoteMediaFile(file)) {
      return uploadRemoteImage(accountId, file);
    }
    const uploadFile = await transcodeImageFileForMeta(file);
    const formData = new FormData();
    formData.append("image_name", uploadFile, uploadFile.name);
    const json = await graphFetch(`act_${accountId}/adimages`, {
      method: "POST",
      formData,
    });
    const entry = json.images?.[uploadFile.name];
    if (!entry?.hash) {
      throw new Error(`Facebook did not return hash for ${uploadFile.name}.`);
    }
    return String(entry.hash);
  }

  async getAdImageUrlByHash(accountId, imageHash) {
    const { graphFetch } = this.dependencies.graphClient;
    if (!imageHash) {
      return "";
    }
    const images = await graphFetch(`act_${accountId}/adimages`, {
      query: {
        hashes: [String(imageHash)],
        fields: "hash,url,permalink_url",
      },
    });
    const image = images.data?.[0];
    return image?.url || image?.permalink_url || "";
  }

  async uploadImageAsset(accountId, file, mediaCache) {
    const { log } = this.dependencies.logging;
    const { getMediaFileName } = this.dependencies.downloadService;
    const { waitForAdImageUrlByHash, uploadImage } = this;
    const fileName = getMediaFileName(file);
    let hash = mediaCache.images.get(file);
    if (!hash) {
      log("info", `Uploading image ${fileName}...`);
      hash = await uploadImage(accountId, file);
      mediaCache.images.set(file, hash);
    }
    let url = mediaCache.imageUrls?.get(String(hash)) || "";
    if (!url) {
      url = await waitForAdImageUrlByHash(accountId, hash, {
        label: fileName,
      });
      if (!mediaCache.imageUrls) {
        mediaCache.imageUrls = new Map();
      }
      if (url) {
        mediaCache.imageUrls.set(String(hash), url);
      }
    }
    if (!url) {
      throw new Error(
        `Target image is not available for creative use: ${fileName} (${hash}).`,
      );
    }
    return { hash, url };
  }
}
