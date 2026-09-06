import { deepClone } from "../utils/object.mjs";
import {
  appendCreativeUrlTags,
  extractMediaExtensionFromUrl,
  getVideoThumbnailOriginalName,
  setStoryImageHash,
} from "../domain/creative.mjs";

/** CreativeMedia. Dependencies are supplied by the application composition root. */
export class CreativeMedia {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.stripUnsupportedInstagramEnhancements =
      this.stripUnsupportedInstagramEnhancements.bind(this);
    this.getAssetFeedFallbackTemplate =
      this.getAssetFeedFallbackTemplate.bind(this);
    this.buildDraftAssetFeedFallbackFromLinkData =
      this.buildDraftAssetFeedFallbackFromLinkData.bind(this);
    this.replaceAssetFeedMedia = this.replaceAssetFeedMedia.bind(this);
    this.replaceCarouselAttachmentMedia =
      this.replaceCarouselAttachmentMedia.bind(this);
  }

  stripUnsupportedInstagramEnhancements(raw, identity, itemName) {
    const { log } = this.dependencies.logging;
    const afs = raw?.asset_feed_spec;
    if (!afs || !Array.isArray(afs.audios) || !afs.audios.length) {
      return;
    }
    const hasFullInstagramAccount =
      identity?.source === "instagram_business_account" ||
      identity?.source === "connected_instagram_account";
    if (hasFullInstagramAccount) {
      return;
    }
    delete afs.audios;
    if (!Object.keys(afs).length) {
      delete raw.asset_feed_spec;
    }
    log(
      "warn",
      `Removed asset_feed_spec.audios for ${itemName}: current page has no linked professional Instagram account.`,
    );
  }

  getAssetFeedFallbackTemplate(excludeCreativeId, mediaType) {
    const { state } = this.dependencies;
    const creatives = state.importPackage?.creatives || [];
    for (const candidate of creatives) {
      if (String(candidate?.id || "") === String(excludeCreativeId || "")) {
        continue;
      }
      const afs = candidate?.raw?.asset_feed_spec;
      if (!afs) {
        continue;
      }
      if (
        mediaType === "image" &&
        Array.isArray(afs.images) &&
        afs.images.length
      ) {
        return deepClone(afs);
      }
      if (
        mediaType === "video" &&
        Array.isArray(afs.videos) &&
        afs.videos.length
      ) {
        return deepClone(afs);
      }
    }
    return null;
  }

  async buildDraftAssetFeedFallbackFromLinkData(
    accountId,
    creative,
    raw,
    mediaCache,
  ) {
    const { log } = this.dependencies.logging;
    const {
      getCreativeMediaSlots,
      getDefaultMediaFile,
      recoverSlotMediaFromSource,
    } = this.dependencies.mediaSlots;
    const { getAssetFeedFallbackTemplate } = this;
    const { uploadImage } = this.dependencies.imageService;
    const linkData = raw?.object_story_spec?.link_data;
    if (!linkData?.image_hash) {
      return null;
    }

    const template = getAssetFeedFallbackTemplate(creative.id, "image");
    const slot = getCreativeMediaSlots(creative).find(
      (item) => item.type === "image",
    );
    let mediaFile = slot ? getDefaultMediaFile(slot) : null;
    if (!mediaFile) {
      mediaFile = await recoverSlotMediaFromSource(slot);
    }
    if (!mediaFile) {
      log(
        "warn",
        `Creative ${creative.name} skipped: link_data image unavailable and unrecoverable (${String(linkData.image_hash)}).`,
      );
      return null;
    }
    let uploadedHash = String(linkData.image_hash);
    if (mediaFile) {
      uploadedHash = mediaCache.images.get(mediaFile);
      if (!uploadedHash) {
        log("info", `Uploading image ${mediaFile.name}...`);
        uploadedHash = await uploadImage(accountId, mediaFile);
        mediaCache.images.set(mediaFile, uploadedHash);
      }
    }

    if (!template) {
      const objectStorySpec = deepClone(raw.object_story_spec || {});
      objectStorySpec.link_data = {
        ...deepClone(linkData),
      };
      setStoryImageHash(objectStorySpec.link_data, uploadedHash);
      delete objectStorySpec.video_data;
      log(
        "info",
        `Creative ${creative.name}: rebuilt unsupported audio-only draft into object_story_spec fallback.`,
      );
      return appendCreativeUrlTags(
        {
          name: raw.name || creative.name,
          object_story_spec: objectStorySpec,
        },
        raw,
      );
    }

    const ctaType = String(
      linkData.call_to_action?.type ||
        template.call_to_actions?.[0]?.type ||
        template.call_to_action_types?.[0] ||
        "LEARN_MORE",
    );
    const websiteUrl = String(
      linkData.link || template.link_urls?.[0]?.website_url || "",
    );
    const displayUrl = String(
      linkData.caption || template.link_urls?.[0]?.display_url || "",
    );
    const titleText = String(
      raw.title ||
        linkData.name ||
        linkData.caption ||
        template.titles?.[0]?.text ||
        "",
    );
    const bodyText = String(
      linkData.message || template.bodies?.[0]?.text || "",
    );
    const descriptionText = String(
      linkData.description || template.descriptions?.[0]?.text || "",
    );

    const assetFeedSpec = deepClone(template);
    delete assetFeedSpec.audios;
    assetFeedSpec.images = (
      Array.isArray(assetFeedSpec.images) && assetFeedSpec.images.length
        ? assetFeedSpec.images
        : [{ hash: uploadedHash }]
    ).map((image) => ({
      ...image,
      hash: uploadedHash,
    }));
    delete assetFeedSpec.videos;

    assetFeedSpec.bodies = (
      Array.isArray(assetFeedSpec.bodies) && assetFeedSpec.bodies.length
        ? assetFeedSpec.bodies
        : [{ text: "" }]
    ).map((entry) => ({
      ...entry,
      text: bodyText,
    }));
    assetFeedSpec.descriptions = (
      Array.isArray(assetFeedSpec.descriptions) &&
      assetFeedSpec.descriptions.length
        ? assetFeedSpec.descriptions
        : [{ text: "" }]
    ).map((entry) => ({
      ...entry,
      text: descriptionText,
    }));
    assetFeedSpec.titles = (
      Array.isArray(assetFeedSpec.titles) && assetFeedSpec.titles.length
        ? assetFeedSpec.titles
        : [{ text: "" }]
    ).map((entry) => ({
      ...entry,
      text: titleText,
    }));
    assetFeedSpec.link_urls = (
      Array.isArray(assetFeedSpec.link_urls) && assetFeedSpec.link_urls.length
        ? assetFeedSpec.link_urls
        : [{ website_url: "", display_url: "" }]
    ).map((entry) => ({
      ...entry,
      website_url: websiteUrl,
      display_url: displayUrl,
    }));
    assetFeedSpec.call_to_action_types = [ctaType];
    assetFeedSpec.call_to_actions = [
      {
        ...(assetFeedSpec.call_to_actions?.[0] || {}),
        type: ctaType,
      },
    ];

    const objectStorySpec = deepClone(raw.object_story_spec || {});
    delete objectStorySpec.link_data;
    delete objectStorySpec.video_data;

    log(
      "info",
      `Creative ${creative.name}: rebuilt unsupported link_data draft into asset_feed_spec fallback.`,
    );
    const simpleFallbackObjectStorySpec = deepClone(
      raw.object_story_spec || {},
    );
    simpleFallbackObjectStorySpec.link_data = {
      ...deepClone(linkData),
    };
    setStoryImageHash(simpleFallbackObjectStorySpec.link_data, uploadedHash);
    delete simpleFallbackObjectStorySpec.video_data;

    const payload = appendCreativeUrlTags(
      {
        object_story_spec: objectStorySpec,
        asset_feed_spec: assetFeedSpec,
      },
      raw,
    );
    Object.defineProperty(payload, "__adReplicaSimpleDraftFallback", {
      value: appendCreativeUrlTags(
        {
          name: raw.name || creative.name,
          object_story_spec: simpleFallbackObjectStorySpec,
        },
        raw,
      ),
      enumerable: false,
    });
    return payload;
  }

  async replaceAssetFeedMedia(accountId, creative, osp, afs, mediaCache) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const {
      getCreativeMediaSlots,
      recoverSlotMediaFromSource,
      resolveImportedMediaFile,
    } = this.dependencies.mediaSlots;
    const { uploadVideo, getPreferredVideoThumbnail } =
      this.dependencies.videoService;
    const { uploadImageAsset } = this.dependencies.imageService;
    const fnMap = state.importPackage?.fileNameMap;
    const slotsByKey = new Map(
      getCreativeMediaSlots(creative).map((slot) => [String(slot.key), slot]),
    );
    const unresolved = [];
    const resolveWithRecovery = async (key, originalKey, label) => {
      const direct = resolveImportedMediaFile(key, originalKey, fnMap);
      if (direct) {
        return direct;
      }
      const recovered = await recoverSlotMediaFromSource(
        slotsByKey.get(String(key)),
      );
      if (recovered) {
        return recovered;
      }
      unresolved.push(label);
      return null;
    };

    if (Array.isArray(afs.images)) {
      for (const img of afs.images) {
        if (!img.hash) continue;
        const oldHash = String(img.hash);
        const originalKey = `${oldHash}.jpg`;
        const imageIndex = afs.images.indexOf(img);
        const mediaFile = await resolveWithRecovery(
          `${creative.id}:afs_image_${imageIndex}`,
          originalKey,
          `asset feed image #${imageIndex + 1} (${originalKey})`,
        );
        if (!mediaFile) continue;
        const uploaded = await uploadImageAsset(
          accountId,
          mediaFile,
          mediaCache,
        );
        img.hash = uploaded.hash;
      }
    }

    if (Array.isArray(afs.videos)) {
      for (const vid of afs.videos) {
        if (!vid.video_id) continue;
        const oldVideoId = String(vid.video_id);
        const videoIndex = afs.videos.indexOf(vid);
        const originalKey = `${oldVideoId}.mp4`;
        const mediaFile = await resolveWithRecovery(
          `${creative.id}:afs_video_${videoIndex}`,
          originalKey,
          `asset feed video #${videoIndex + 1} (${originalKey})`,
        );
        if (!mediaFile) continue;
        let newId = mediaCache.videos.get(mediaFile);
        if (!newId) {
          log("info", `Uploading video ${mediaFile.name}...`);
          newId = await uploadVideo(accountId, mediaFile);
          mediaCache.videos.set(mediaFile, newId);
        }
        vid.video_id = newId;
        const previewOriginalKey = getVideoThumbnailOriginalName(
          oldVideoId,
          extractMediaExtensionFromUrl(vid.thumbnail_url, ".jpg"),
        );
        let previewFile = resolveImportedMediaFile(
          `${creative.id}:afs_video_thumb_${videoIndex}`,
          previewOriginalKey,
          fnMap,
        );
        if (!previewFile) {
          previewFile = await recoverSlotMediaFromSource(
            slotsByKey.get(`${creative.id}:afs_video_thumb_${videoIndex}`),
          );
        }
        if (previewFile) {
          const uploadedPreview = await uploadImageAsset(
            accountId,
            previewFile,
            mediaCache,
          );
          if (uploadedPreview.url) {
            vid.thumbnail_url = uploadedPreview.url;
          }
          vid.thumbnail_hash = uploadedPreview.hash;
          vid.thumbnail_source = "custom";
        } else {
          vid.thumbnail_url = await getPreferredVideoThumbnail(newId);
          delete vid.thumbnail_hash;
          vid.thumbnail_source = "generated_default";
        }
      }
    }

    if (osp.video_data?.video_id) {
      const oldVideoId = String(osp.video_data.video_id);
      const originalKey = `${oldVideoId}.mp4`;
      const mediaFile = await resolveWithRecovery(
        `${creative.id}:video`,
        originalKey,
        `video (${originalKey})`,
      );
      if (mediaFile) {
        let newId = mediaCache.videos.get(mediaFile);
        if (!newId) {
          log("info", `Uploading video ${mediaFile.name}...`);
          newId = await uploadVideo(accountId, mediaFile);
          mediaCache.videos.set(mediaFile, newId);
        }
        if (!osp.video_data) {
          osp.video_data = {};
        }
        osp.video_data.video_id = newId;
        const previewOriginalKey = getVideoThumbnailOriginalName(
          oldVideoId,
          extractMediaExtensionFromUrl(osp.video_data.image_url, ".jpg"),
        );
        let previewFile = resolveImportedMediaFile(
          `${creative.id}:video_preview`,
          previewOriginalKey,
          fnMap,
        );
        if (!previewFile) {
          previewFile = await recoverSlotMediaFromSource(
            slotsByKey.get(`${creative.id}:video_preview`),
          );
        }
        if (previewFile) {
          const uploadedPreview = await uploadImageAsset(
            accountId,
            previewFile,
            mediaCache,
          );
          osp.video_data.image_hash = uploadedPreview.hash;
          delete osp.video_data.image_url;
          osp.video_data.video_thumbnail_source = "custom";
        } else {
          delete osp.video_data.image_hash;
          osp.video_data.image_url = await getPreferredVideoThumbnail(newId);
          osp.video_data.video_thumbnail_source = "generated_default";
        }
      }
    } else if (osp.link_data?.image_hash) {
      const oldHash = String(osp.link_data.image_hash);
      const originalKey = `${oldHash}.jpg`;
      const mediaFile = await resolveWithRecovery(
        `${creative.id}:image`,
        originalKey,
        `image (${originalKey})`,
      );
      if (mediaFile) {
        const uploaded = await uploadImageAsset(
          accountId,
          mediaFile,
          mediaCache,
        );
        if (!osp.link_data) {
          osp.link_data = {};
        }
        setStoryImageHash(osp.link_data, uploaded.hash);
      }
    }

    if (unresolved.length) {
      log(
        "warn",
        `Creative ${creative.name}: media unavailable and unrecoverable: ${unresolved.join("; ")}.`,
      );
      return false;
    }
    return true;
  }

  async replaceCarouselAttachmentMedia(accountId, creative, osp, mediaCache) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const {
      getCreativeMediaSlots,
      recoverSlotMediaFromSource,
      resolveImportedMediaFile,
    } = this.dependencies.mediaSlots;
    const { uploadImageAsset } = this.dependencies.imageService;
    const attachments = osp?.link_data?.child_attachments;
    if (!Array.isArray(attachments) || !attachments.length) {
      return true;
    }
    const fnMap = state.importPackage?.fileNameMap;
    let replaced = 0;
    for (const [index, attachment] of attachments.entries()) {
      if (!attachment?.image_hash) {
        continue;
      }
      const oldHash = String(attachment.image_hash);
      const originalKey = `${oldHash}.jpg`;
      let mediaFile = resolveImportedMediaFile(
        `${creative.id}:child_attachment_image_${index}`,
        originalKey,
        fnMap,
      );
      if (!mediaFile) {
        const attachmentSlot = getCreativeMediaSlots(creative).find(
          (slot) =>
            String(slot.key) ===
            `${creative.id}:child_attachment_image_${index}`,
        );
        mediaFile = await recoverSlotMediaFromSource(attachmentSlot);
      }
      if (!mediaFile) {
        log(
          "warn",
          `Creative ${creative.name} skipped: carousel media file not found ${originalKey}.`,
        );
        return false;
      }
      const uploaded = await uploadImageAsset(accountId, mediaFile, mediaCache);
      setStoryImageHash(attachment, uploaded.hash);
      replaced += 1;
    }
    if (replaced) {
      log(
        "info",
        `Creative ${creative.name}: replaced ${replaced} carousel image${replaced === 1 ? "" : "s"}.`,
      );
    }
    return true;
  }
}
