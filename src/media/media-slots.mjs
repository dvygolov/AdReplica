import {
  extractMediaExtensionFromUrl,
  getVideoThumbnailOriginalName,
  hasAssetFeedCustomVideoThumbnail,
  hasStandaloneCustomVideoThumbnail,
} from "../domain/creative.mjs";
import {
  getSourcePagesFromPackage,
  getSourcePixelsFromPackage,
} from "../domain/package.mjs";

/** MediaSlots. Dependencies are supplied by the application composition root. */
export class MediaSlots {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getCreativeMediaSlots = this.getCreativeMediaSlots.bind(this);
    this.getMediaSlotsFromPackage = this.getMediaSlotsFromPackage.bind(this);
    this.getImportSourcePages = this.getImportSourcePages.bind(this);
    this.getImportSourcePixels = this.getImportSourcePixels.bind(this);
    this.getImportMediaSlots = this.getImportMediaSlots.bind(this);
    this.getSharedMediaOverrideKey = this.getSharedMediaOverrideKey.bind(this);
    this.getDefaultMediaFile = this.getDefaultMediaFile.bind(this);
    this.recoverSlotMediaFromSource =
      this.recoverSlotMediaFromSource.bind(this);
    this.resolveImportedMediaFile = this.resolveImportedMediaFile.bind(this);
  }

  getCreativeMediaSlots(creative) {
    const { state } = this.dependencies;
    const raw = creative.raw || {};
    const slots = [];
    const fnMap = state.importPackage?.fileNameMap;

    if (raw.asset_feed_spec) {
      const afs = raw.asset_feed_spec;
      if (Array.isArray(afs.images)) {
        afs.images.forEach((img, index) => {
          if (img.hash) {
            const hash = String(img.hash);
            const originalName = `${hash}.jpg`;
            slots.push({
              key: `${creative.id}:afs_image_${index}`,
              creativeId: creative.id,
              creativeName: creative.name,
              type: "image",
              slotKind: "asset_feed_image",
              slotLabel: `asset feed image #${index + 1}`,
              slotIndex: index,
              expectedFileName: (fnMap && fnMap[originalName]) || originalName,
              sourceId: hash,
              sourceImageHash: hash,
            });
          }
        });
      }
      if (Array.isArray(afs.videos)) {
        afs.videos.forEach((vid, index) => {
          if (vid.video_id) {
            const videoId = String(vid.video_id);
            const originalName = `${videoId}.mp4`;
            slots.push({
              key: `${creative.id}:afs_video_${index}`,
              creativeId: creative.id,
              creativeName: creative.name,
              type: "video",
              slotKind: "asset_feed_video",
              slotLabel: `asset feed video #${index + 1}`,
              slotIndex: index,
              expectedFileName: (fnMap && fnMap[originalName]) || originalName,
              sourceId: videoId,
              sourceVideoId: videoId,
            });
            if (hasAssetFeedCustomVideoThumbnail(vid)) {
              const ext = extractMediaExtensionFromUrl(
                vid.thumbnail_url,
                ".jpg",
              );
              const thumbOriginalName = getVideoThumbnailOriginalName(
                videoId,
                ext,
              );
              slots.push({
                key: `${creative.id}:afs_video_thumb_${index}`,
                creativeId: creative.id,
                creativeName: creative.name,
                type: "image",
                slotKind: "asset_feed_video_thumbnail",
                slotLabel: `asset feed video thumbnail #${index + 1}`,
                slotIndex: index,
                expectedFileName:
                  (fnMap && fnMap[thumbOriginalName]) || thumbOriginalName,
                sourceId: `${videoId}:preview`,
                sourceImageHash: vid.thumbnail_hash
                  ? String(vid.thumbnail_hash)
                  : "",
                sourceVideoId: videoId,
              });
            }
          }
        });
      }
    }

    const osp = raw.object_story_spec || {};
    if (raw.object_story_id) {
      return slots;
    }
    if (osp.video_data?.video_id) {
      const videoId = String(osp.video_data.video_id);
      const originalName = `${videoId}.mp4`;
      slots.push({
        key: `${creative.id}:video`,
        creativeId: creative.id,
        creativeName: creative.name,
        type: "video",
        slotKind: "video",
        slotLabel: "video",
        slotIndex: 0,
        expectedFileName: (fnMap && fnMap[originalName]) || originalName,
        sourceId: videoId,
        sourceVideoId: videoId,
      });
      if (hasStandaloneCustomVideoThumbnail(osp.video_data)) {
        const ext = extractMediaExtensionFromUrl(
          osp.video_data.image_url,
          ".jpg",
        );
        const thumbOriginalName = getVideoThumbnailOriginalName(videoId, ext);
        slots.push({
          key: `${creative.id}:video_preview`,
          creativeId: creative.id,
          creativeName: creative.name,
          type: "image",
          slotKind: "video_thumbnail",
          slotLabel: "video thumbnail",
          slotIndex: 0,
          expectedFileName:
            (fnMap && fnMap[thumbOriginalName]) || thumbOriginalName,
          sourceId: `${videoId}:preview`,
          sourceImageHash: osp.video_data.image_hash
            ? String(osp.video_data.image_hash)
            : "",
          sourceVideoId: videoId,
        });
      }
    } else if (osp.link_data?.image_hash) {
      const imageHash = String(osp.link_data.image_hash);
      const originalName = `${imageHash}.jpg`;
      slots.push({
        key: `${creative.id}:image`,
        creativeId: creative.id,
        creativeName: creative.name,
        type: "image",
        slotKind: "image",
        slotLabel: "image",
        slotIndex: 0,
        expectedFileName: (fnMap && fnMap[originalName]) || originalName,
        sourceId: imageHash,
        sourceImageHash: imageHash,
      });
    }
    if (Array.isArray(osp.link_data?.child_attachments)) {
      osp.link_data.child_attachments.forEach((attachment, index) => {
        if (attachment?.image_hash) {
          const imageHash = String(attachment.image_hash);
          const originalName = `${imageHash}.jpg`;
          slots.push({
            key: `${creative.id}:child_attachment_image_${index}`,
            creativeId: creative.id,
            creativeName: creative.name,
            type: "image",
            slotKind: "carousel_image",
            slotLabel: `carousel image #${index + 1}`,
            slotIndex: index,
            expectedFileName: (fnMap && fnMap[originalName]) || originalName,
            sourceId: imageHash,
            sourceImageHash: imageHash,
          });
        }
      });
    }
    return slots;
  }

  getMediaSlotsFromPackage(packageData) {
    const { state } = this.dependencies;
    const { getCreativeMediaSlots } = this;
    if (!packageData) return [];
    const creativeIdToAdName = new Map();
    for (const ad of packageData.ads || []) {
      const cid = String(ad?.creative?.id);
      if (cid && !creativeIdToAdName.has(cid)) {
        creativeIdToAdName.set(cid, ad.name || ad.id);
      }
    }
    const previousPackage = state.importPackage;
    state.importPackage = packageData;
    const allSlots = (packageData.creatives || []).flatMap(
      getCreativeMediaSlots,
    );
    state.importPackage = previousPackage;
    const seen = new Map();
    const unique = [];
    for (const slot of allSlots) {
      if (seen.has(slot.sourceId)) {
        continue;
      }
      seen.set(slot.sourceId, true);
      const adName =
        creativeIdToAdName.get(slot.creativeId) ||
        slot.creativeName ||
        slot.creativeId;
      unique.push({ ...slot, creativeName: adName });
    }
    return unique;
  }

  getImportSourcePages() {
    const { state } = this.dependencies;
    return getSourcePagesFromPackage(state.importPackage);
  }

  getImportSourcePixels() {
    const { state } = this.dependencies;
    return getSourcePixelsFromPackage(state.importPackage);
  }

  getImportMediaSlots() {
    const { state } = this.dependencies;
    const { getMediaSlotsFromPackage } = this;
    return getMediaSlotsFromPackage(state.importPackage);
  }

  getSharedMediaOverrideKey(expectedFileName) {
    return `expected:${String(expectedFileName || "")}`;
  }

  getDefaultMediaFile(
    slot,
    mediaOverrides = this.dependencies.state.importMediaOverrides,
    mediaFiles = this.dependencies.state.importMediaFiles,
  ) {
    const { getSharedMediaOverrideKey } = this;
    return (
      mediaOverrides.get(slot.key) ||
      mediaOverrides.get(getSharedMediaOverrideKey(slot.expectedFileName)) ||
      mediaFiles.get(slot.expectedFileName) ||
      null
    );
  }

  async recoverSlotMediaFromSource(slot) {
    const { state, sourceImageRecoveryCache, sourceVideoRecoveryCache } =
      this.dependencies;
    const { log } = this.dependencies.logging;
    const { createRemoteMediaFile } = this.dependencies.downloadService;
    const {
      getPackageSourceAccountId,
      checkSourceImageAvailable,
      checkSourceVideoAvailable,
    } = this.dependencies.mediaPreflight;
    if (!slot || slot.missingCreative) {
      return null;
    }
    const sourceAccountId = getPackageSourceAccountId(state.importPackage);
    if (!sourceAccountId) {
      return null;
    }
    const expectedFileName = String(slot.expectedFileName || "");
    if (slot.type === "image" && slot.sourceImageHash) {
      const source = await checkSourceImageAvailable(
        sourceAccountId,
        String(slot.sourceImageHash),
        sourceImageRecoveryCache,
      );
      if (!source.ok) {
        return null;
      }
      log(
        "info",
        `Recovering image ${expectedFileName || slot.sourceImageHash} from source account ${sourceAccountId}...`,
      );
      return createRemoteMediaFile({
        fileName: expectedFileName || `${slot.sourceImageHash}.jpg`,
        type: "image/jpeg",
        sourceUrl: source.url || "",
        sourceAccountId,
        sourceId: String(slot.sourceImageHash),
        sourceKind: String(slot.slotKind || "image"),
      });
    }
    if (slot.type === "video" && slot.sourceVideoId) {
      const source = await checkSourceVideoAvailable(
        String(slot.sourceVideoId),
        sourceVideoRecoveryCache,
      );
      if (!source.ok) {
        return null;
      }
      log(
        "info",
        `Recovering video ${expectedFileName || slot.sourceVideoId} from source account ${sourceAccountId}...`,
      );
      return createRemoteMediaFile({
        fileName: expectedFileName || `${slot.sourceVideoId}.mp4`,
        type: "video/mp4",
        sourceUrl: source.source || "",
        sourceAccountId,
        sourceId: String(slot.sourceVideoId),
        sourceKind: String(slot.slotKind || "video"),
      });
    }
    return null;
  }

  resolveImportedMediaFile(
    mediaKey,
    originalKey,
    fnMap = this.dependencies.state.importPackage?.fileNameMap,
  ) {
    const { state } = this.dependencies;
    const { getSharedMediaOverrideKey } = this;
    const mappedKey = (fnMap && fnMap[originalKey]) || originalKey;
    return (
      state.importMediaOverrides.get(mediaKey) ||
      state.importMediaOverrides.get(getSharedMediaOverrideKey(mappedKey)) ||
      state.importMediaOverrides.get(getSharedMediaOverrideKey(originalKey)) ||
      state.importMediaFiles.get(mappedKey) ||
      state.importMediaFiles.get(originalKey) ||
      null
    );
  }
}
