import { deepClone } from "../utils/object.mjs";

/** MediaPreflight. Dependencies are supplied by the application composition root. */
export class MediaPreflight {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getPackageSourceAccountId = this.getPackageSourceAccountId.bind(this);
    this.collectMediaPreflightSlots =
      this.collectMediaPreflightSlots.bind(this);
    this.buildMediaPreflightIssue = this.buildMediaPreflightIssue.bind(this);
    this.formatMediaPreflightIssue = this.formatMediaPreflightIssue.bind(this);
    this.checkSourceImageAvailable = this.checkSourceImageAvailable.bind(this);
    this.checkSourceVideoAvailable = this.checkSourceVideoAvailable.bind(this);
    this.preflightUploadMediaSlot = this.preflightUploadMediaSlot.bind(this);
    this.runMediaPreflight = this.runMediaPreflight.bind(this);
    this.filterPackageAdsByMediaPreflightIssues =
      this.filterPackageAdsByMediaPreflightIssues.bind(this);
    this.runMediaPreflightAndApplyDecision =
      this.runMediaPreflightAndApplyDecision.bind(this);
  }

  getPackageSourceAccountId(packageData) {
    return String(
      packageData?.source?.accountId || packageData?.sourceAccountId || "",
    ).replace(/^act_/, "");
  }

  collectMediaPreflightSlots(packageData) {
    const { state } = this.dependencies;
    const { getCreativeMediaSlots } = this.dependencies.mediaSlots;
    const slots = [];
    const creativeById = new Map(
      (packageData?.creatives || []).map((creative) => [
        String(creative.id),
        creative,
      ]),
    );
    const previousPackage = state.importPackage;
    state.importPackage = packageData;
    try {
      for (const ad of packageData?.ads || []) {
        const creativeId = String(ad?.creative?.id || "");
        const creative = creativeById.get(creativeId);
        if (!creative) {
          slots.push({
            adId: String(ad?.id || ""),
            adName: ad?.name || ad?.id || "",
            creativeId,
            creativeName: creativeId,
            type: "creative",
            slotLabel: "creative",
            expectedFileName: "",
            missingCreative: true,
          });
          continue;
        }
        for (const slot of getCreativeMediaSlots(creative)) {
          slots.push({
            ...slot,
            adId: String(ad?.id || ""),
            adName: ad?.name || ad?.id || "",
            creativeId: String(creative.id || slot.creativeId || ""),
            creativeName:
              creative.name || slot.creativeName || creative.id || "",
          });
        }
      }
    } finally {
      state.importPackage = previousPackage;
    }
    return slots;
  }

  buildMediaPreflightIssue(slot, reason, details = "") {
    return {
      adId: String(slot?.adId || ""),
      adName: String(slot?.adName || ""),
      creativeId: String(slot?.creativeId || ""),
      creativeName: String(slot?.creativeName || ""),
      slotLabel: String(
        slot?.slotLabel || slot?.slotKind || slot?.type || "media",
      ),
      mediaType: String(slot?.type || ""),
      sourceId: String(
        slot?.sourceImageHash || slot?.sourceVideoId || slot?.sourceId || "",
      ),
      expectedFileName: String(slot?.expectedFileName || ""),
      reason,
      details: String(details || ""),
    };
  }

  formatMediaPreflightIssue(issue) {
    const ad = issue.adName || issue.adId || "-";
    const creative = issue.creativeName || issue.creativeId || "-";
    const source = issue.sourceId ? ` source ${issue.sourceId}` : "";
    const file = issue.expectedFileName
      ? ` file ${issue.expectedFileName}`
      : "";
    return `Ad "${ad}", creative "${creative}", ${issue.slotLabel}:${source}${file} - ${issue.reason}`;
  }

  async checkSourceImageAvailable(accountId, imageHash, cache) {
    const { getAdImageUrlByHash } = this.dependencies.imageService;
    const key = `${accountId}:${imageHash}`;
    if (cache.has(key)) {
      return cache.get(key);
    }
    let result = { ok: false, url: "", error: "" };
    try {
      const url = await getAdImageUrlByHash(accountId, imageHash);
      result = { ok: Boolean(url), url, error: "" };
    } catch (error) {
      result = { ok: false, url: "", error: String(error?.message || error) };
    }
    cache.set(key, result);
    return result;
  }

  async checkSourceVideoAvailable(videoId, cache) {
    const { graphFetch } = this.dependencies.graphClient;
    if (cache.has(videoId)) {
      return cache.get(videoId);
    }
    let result = { ok: false, source: "", error: "" };
    try {
      const video = await graphFetch(videoId, {
        query: { fields: "id,source" },
      });
      result = {
        ok: Boolean(video?.source),
        source: video?.source || "",
        error: "",
      };
    } catch (error) {
      result = {
        ok: false,
        source: "",
        error: String(error?.message || error),
      };
    }
    cache.set(videoId, result);
    return result;
  }

  async preflightUploadMediaSlot(accountId, slot, mediaCache) {
    const { log } = this.dependencies.logging;
    const { getDefaultMediaFile } = this.dependencies.mediaSlots;
    const { getMediaFileName } = this.dependencies.downloadService;
    const { uploadVideo } = this.dependencies.videoService;
    const { uploadImageAsset } = this.dependencies.imageService;
    const mediaFile = getDefaultMediaFile(slot);
    if (!mediaFile) {
      throw new Error(`media file not selected: ${slot.expectedFileName}`);
    }
    if (slot.type === "image") {
      await uploadImageAsset(accountId, mediaFile, mediaCache);
      return;
    }
    if (slot.type === "video") {
      const fileName = getMediaFileName(mediaFile);
      let videoId = mediaCache.videos.get(mediaFile);
      if (!videoId) {
        log("info", `Preflight uploading video ${fileName}...`);
        videoId = await uploadVideo(accountId, mediaFile);
        mediaCache.videos.set(mediaFile, videoId);
      }
    }
  }

  async runMediaPreflight(packageData, targetAccountId, mediaCache) {
    const { getDefaultMediaFile } = this.dependencies.mediaSlots;
    const { isRemoteMediaFile } = this.dependencies.downloadService;
    const {
      getPackageSourceAccountId,
      collectMediaPreflightSlots,
      buildMediaPreflightIssue,
      checkSourceImageAvailable,
      checkSourceVideoAvailable,
      preflightUploadMediaSlot,
    } = this;
    const slots = collectMediaPreflightSlots(packageData);
    const issues = [];
    const sourceAccountId = getPackageSourceAccountId(packageData);
    const sourceImageCache = new Map();
    const sourceVideoCache = new Map();
    const targetChecked = new Set();

    for (const slot of slots) {
      if (slot.missingCreative) {
        issues.push(
          buildMediaPreflightIssue(slot, "creative is missing from package"),
        );
        continue;
      }

      const mediaFile = getDefaultMediaFile(slot);
      const hasLocalOrRemoteFile = Boolean(mediaFile);

      if (!hasLocalOrRemoteFile) {
        if (sourceAccountId && slot.type === "image" && slot.sourceImageHash) {
          const source = await checkSourceImageAvailable(
            sourceAccountId,
            slot.sourceImageHash,
            sourceImageCache,
          );
          if (source.ok) {
            // Import will auto-copy the image from the source account.
            continue;
          }
          issues.push(
            buildMediaPreflightIssue(
              slot,
              "source image is unavailable or current account has no access",
              source.error,
            ),
          );
          continue;
        }
        if (slot.type === "video" && slot.sourceVideoId) {
          const source = await checkSourceVideoAvailable(
            slot.sourceVideoId,
            sourceVideoCache,
          );
          if (source.ok) {
            // Import will auto-copy the video from the source account.
            continue;
          }
          issues.push(
            buildMediaPreflightIssue(
              slot,
              "source video is unavailable or current account has no access",
              source.error,
            ),
          );
          continue;
        }
        issues.push(
          buildMediaPreflightIssue(
            slot,
            "media file is unavailable or was not selected",
          ),
        );
        continue;
      }

      if (sourceAccountId && isRemoteMediaFile(mediaFile)) {
        if (slot.type === "image" && slot.sourceImageHash) {
          const source = await checkSourceImageAvailable(
            sourceAccountId,
            slot.sourceImageHash,
            sourceImageCache,
          );
          if (!source.ok) {
            issues.push(
              buildMediaPreflightIssue(
                slot,
                "source image is unavailable or current account has no access",
                source.error,
              ),
            );
            continue;
          }
        }
        if (slot.type === "video" && slot.sourceVideoId) {
          const source = await checkSourceVideoAvailable(
            slot.sourceVideoId,
            sourceVideoCache,
          );
          if (!source.ok) {
            issues.push(
              buildMediaPreflightIssue(
                slot,
                "source video is unavailable or current account has no access",
                source.error,
              ),
            );
            continue;
          }
        }
      }

      const targetKey = mediaFile;
      if (targetChecked.has(targetKey)) {
        continue;
      }
      targetChecked.add(targetKey);
      try {
        await preflightUploadMediaSlot(targetAccountId, slot, mediaCache);
      } catch (error) {
        if (error?.uncertain) throw error;
        issues.push(
          buildMediaPreflightIssue(
            slot,
            "target media copy failed or image is not available for creative use",
            String(error?.message || error),
          ),
        );
      }
    }

    return {
      adsChecked: (packageData?.ads || []).length,
      mediaChecked: slots.filter((slot) => !slot.missingCreative).length,
      issues,
    };
  }

  filterPackageAdsByMediaPreflightIssues(packageData, issues) {
    if (!packageData || !issues?.length) {
      return packageData;
    }
    const blockedAdIds = new Set(
      issues.map((issue) => String(issue.adId || "")).filter(Boolean),
    );
    const blockedAdNames = new Set(
      issues
        .filter((issue) => !issue.adId)
        .map((issue) => String(issue.adName || ""))
        .filter(Boolean),
    );
    const next = deepClone(packageData);
    next.ads = (next.ads || []).filter((ad) => {
      const id = String(ad?.id || "");
      const name = String(ad?.name || "");
      return (
        !(id && blockedAdIds.has(id)) && !(name && blockedAdNames.has(name))
      );
    });
    const usedCreativeIds = new Set(
      (next.ads || [])
        .map((ad) => String(ad?.creative?.id || ""))
        .filter(Boolean),
    );
    next.creatives = (next.creatives || []).filter((creative) =>
      usedCreativeIds.has(String(creative.id || "")),
    );
    return next;
  }

  async runMediaPreflightAndApplyDecision(
    packageData,
    targetAccountId,
    mediaCache,
    options = {},
  ) {
    const { log } = this.dependencies.logging;
    const {
      formatMediaPreflightIssue,
      runMediaPreflight,
      filterPackageAdsByMediaPreflightIssues,
    } = this;
    const { askMediaPreflightDecision } = this.dependencies.dialogs;
    const summary = await runMediaPreflight(
      packageData,
      targetAccountId,
      mediaCache,
    );
    log(
      "info",
      `Media preflight checked ${summary.adsChecked} ad(s), ${summary.mediaChecked} media item(s), ${summary.issues.length} issue(s).`,
    );
    for (const issue of summary.issues) {
      log(
        "warn",
        `Media preflight issue: ${formatMediaPreflightIssue(issue)}`,
        issue.details || null,
      );
    }
    if (!summary.issues.length) {
      return { proceed: true, packageData };
    }

    const forcedDecision = ["cancel", "valid_only", "try_anyway"].includes(
      options.mediaPreflightDecision,
    )
      ? options.mediaPreflightDecision
      : "";
    const decision =
      forcedDecision || (await askMediaPreflightDecision(summary));
    if (decision === "try_anyway") {
      log(
        "warn",
        `Continuing import despite ${summary.issues.length} media preflight issue(s).`,
      );
      return { proceed: true, packageData };
    }
    if (decision === "valid_only") {
      const filtered = filterPackageAdsByMediaPreflightIssues(
        packageData,
        summary.issues,
      );
      const skipped =
        (packageData.ads || []).length - (filtered.ads || []).length;
      log(
        "warn",
        `Continuing import with valid ads only; skipped ${skipped} ad(s) with media preflight issues.`,
      );
      return { proceed: true, packageData: filtered };
    }
    log("warn", "Import canceled after media preflight issues.");
    return { proceed: false, packageData };
  }
}
