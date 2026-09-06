import {
  appendCreativeUrlTags,
  buildDraftStandaloneVideoCreative,
  buildImportedCreativePayload,
  extractMediaExtensionFromUrl,
  getSourcePageId,
  getVideoThumbnailOriginalName,
  replaceCreativePageReferences,
  setStoryImageHash,
  stripAssetFeedLabelIdsForImport,
  stripCreativePreviewIdentifiers,
  synchronizeCreativeIdentityFields,
} from "../domain/creative.mjs";
import { deepClone } from "../utils/object.mjs";
import {
  hasCarouselAttachmentMedia,
  isCatalogTemplateCreative,
} from "../domain/package.mjs";
import { ensureDraftCreativeDestinationSpec } from "../domain/draft-values.mjs";

/** CreativeService. Dependencies are supplied by the application composition root. */
export class CreativeService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.createImageCreative = this.createImageCreative.bind(this);
    this.createVideoCreative = this.createVideoCreative.bind(this);
    this.resolveCreativeImport = this.resolveCreativeImport.bind(this);
    this.resolveCreativeDraftPayload =
      this.resolveCreativeDraftPayload.bind(this);
  }

  async createImageCreative(accountId, creative, imageHash, mappedPageId) {
    const { applyInstagramIdentity } = this.dependencies.identityService;
    const { createAdCreativeWithRetries } = this.dependencies.creativeValidator;
    const raw = deepClone(creative.raw);
    const osp = raw.object_story_spec || {};
    const linkData = osp.link_data || {};
    setStoryImageHash(linkData, imageHash);
    osp.link_data = linkData;
    await applyInstagramIdentity(
      osp,
      mappedPageId,
      raw.name || creative.name,
      accountId,
    );
    raw.object_story_spec = osp;
    synchronizeCreativeIdentityFields(raw, osp);
    stripCreativePreviewIdentifiers(raw);
    const body = buildImportedCreativePayload(raw);
    body.name = raw.name || creative.name;
    return createAdCreativeWithRetries(
      accountId,
      raw.name || creative.name,
      body,
    );
  }

  async createVideoCreative(
    accountId,
    creative,
    uploadedVideoId,
    mappedPageId,
    customPreview = null,
  ) {
    const { applyInstagramIdentity } = this.dependencies.identityService;
    const { getPreferredVideoThumbnail } = this.dependencies.videoService;
    const { createAdCreativeWithRetries } = this.dependencies.creativeValidator;
    const raw = deepClone(creative.raw);
    const osp = raw.object_story_spec || {};
    const videoData = osp.video_data || {};
    videoData.video_id = uploadedVideoId;
    if (customPreview?.hash) {
      videoData.image_hash = customPreview.hash;
      delete videoData.image_url;
      videoData.video_thumbnail_source = "custom";
    } else {
      delete videoData.image_hash;
      videoData.image_url = await getPreferredVideoThumbnail(uploadedVideoId);
      videoData.video_thumbnail_source = "generated_default";
    }
    osp.video_data = videoData;
    await applyInstagramIdentity(
      osp,
      mappedPageId,
      raw.name || creative.name,
      accountId,
    );
    raw.object_story_spec = osp;
    synchronizeCreativeIdentityFields(raw, osp);
    stripCreativePreviewIdentifiers(raw);
    const body = buildImportedCreativePayload(raw);
    body.name = raw.name || creative.name;
    return createAdCreativeWithRetries(
      accountId,
      raw.name || creative.name,
      body,
    );
  }

  async resolveCreativeImport(accountId, creative, mediaCache) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { getPageIdentityHint, applyInstagramIdentity } =
      this.dependencies.identityService;
    const {
      getCreativeMediaSlots,
      getDefaultMediaFile,
      recoverSlotMediaFromSource,
      resolveImportedMediaFile,
    } = this.dependencies.mediaSlots;
    const {
      stripUnsupportedInstagramEnhancements,
      replaceAssetFeedMedia,
      replaceCarouselAttachmentMedia,
    } = this.dependencies.creativeMedia;
    const { uploadVideo } = this.dependencies.videoService;
    const { uploadImageAsset } = this.dependencies.imageService;
    const { createCreativeByPostId, createAdCreativeWithRetries } =
      this.dependencies.creativeValidator;
    const { createImageCreative, createVideoCreative } = this;
    const sourcePageId = getSourcePageId(creative);
    const mappedPageId = state.importPageMappings[sourcePageId] || sourcePageId;
    if (sourcePageId && !mappedPageId) {
      log(
        "warn",
        `Creative ${creative.name} skipped: no replacement selected for FP ${sourcePageId} .`,
      );
      return null;
    }
    if (sourcePageId && mappedPageId && mappedPageId !== sourcePageId) {
      log(
        "info",
        `Creative ${creative.name}: remapping FP ${sourcePageId} -> ${mappedPageId}.`,
      );
    }

    if (creative.raw.asset_feed_spec) {
      const raw = deepClone(creative.raw);
      replaceCreativePageReferences(raw, sourcePageId, mappedPageId);
      const osp = raw.object_story_spec || {};

      const identity = await applyInstagramIdentity(
        osp,
        mappedPageId,
        raw.name || creative.name,
        accountId,
      );
      ensureDraftCreativeDestinationSpec(
        raw,
        getPageIdentityHint(mappedPageId)?.destinationSpec || null,
      );
      stripUnsupportedInstagramEnhancements(
        raw,
        identity,
        raw.name || creative.name,
      );
      const afs = raw.asset_feed_spec;
      if (!afs) {
        raw.object_story_spec = osp;
        creative = {
          ...creative,
          raw,
        };
      } else {
        if (
          !(await replaceAssetFeedMedia(
            accountId,
            creative,
            osp,
            afs,
            mediaCache,
          ))
        ) {
          return null;
        }
        stripAssetFeedLabelIdsForImport(afs);
        raw.object_story_spec = osp;
        synchronizeCreativeIdentityFields(raw, osp);
        stripCreativePreviewIdentifiers(raw);
        const body = buildImportedCreativePayload(raw);
        body.name = raw.name || creative.name;
        return createAdCreativeWithRetries(
          accountId,
          raw.name || creative.name,
          body,
        );
      }
    }

    if (creative.raw.object_story_id) {
      if (mappedPageId && mappedPageId !== sourcePageId) {
        log(
          "warn",
          `Creative ${creative.name} skipped: object_story_id cannot be transferred to another FP.`,
        );
        return null;
      }
      return createCreativeByPostId(accountId, creative);
    }

    if (isCatalogTemplateCreative(creative.raw)) {
      const raw = deepClone(creative.raw);
      replaceCreativePageReferences(raw, sourcePageId, mappedPageId);
      const osp = raw.object_story_spec || {};
      await applyInstagramIdentity(
        osp,
        mappedPageId,
        raw.name || creative.name,
        accountId,
      );
      raw.object_story_spec = osp;
      synchronizeCreativeIdentityFields(raw, osp);
      stripCreativePreviewIdentifiers(raw);
      const body = buildImportedCreativePayload(raw);
      return createAdCreativeWithRetries(
        accountId,
        raw.name || creative.name,
        body,
      );
    }

    if (hasCarouselAttachmentMedia(creative.raw)) {
      const raw = deepClone(creative.raw);
      replaceCreativePageReferences(raw, sourcePageId, mappedPageId);
      const osp = raw.object_story_spec || {};
      await applyInstagramIdentity(
        osp,
        mappedPageId,
        raw.name || creative.name,
        accountId,
      );
      if (
        !(await replaceCarouselAttachmentMedia(
          accountId,
          creative,
          osp,
          mediaCache,
        ))
      ) {
        return null;
      }
      raw.object_story_spec = osp;
      synchronizeCreativeIdentityFields(raw, osp);
      stripCreativePreviewIdentifiers(raw);
      const body = buildImportedCreativePayload(raw);
      body.name = raw.name || creative.name;
      return createAdCreativeWithRetries(
        accountId,
        raw.name || creative.name,
        body,
      );
    }

    const slots = getCreativeMediaSlots(creative);
    if (!slots.length) {
      log(
        "warn",
        `Creative ${creative.name} skipped: no supported media slot.`,
      );
      return null;
    }

    const slot = slots[0];
    let mediaFile = getDefaultMediaFile(slot);
    if (!mediaFile) {
      mediaFile = await recoverSlotMediaFromSource(slot);
    }
    if (!mediaFile) {
      log(
        "warn",
        `Creative ${creative.name} skipped: media file not found ${slot.expectedFileName}.`,
      );
      return null;
    }

    if (slot.type === "image") {
      const uploadedImage = await uploadImageAsset(
        accountId,
        mediaFile,
        mediaCache,
      );
      return createImageCreative(
        accountId,
        creative,
        uploadedImage.hash,
        mappedPageId,
      );
    }

    if (slot.type === "video") {
      let uploadedId = mediaCache.videos.get(mediaFile);
      if (!uploadedId) {
        log("info", `Uploading video ${mediaFile.name}...`);
        uploadedId = await uploadVideo(accountId, mediaFile);
        mediaCache.videos.set(mediaFile, uploadedId);
      }
      const videoData = creative.raw?.object_story_spec?.video_data || {};
      const previewOriginalKey = getVideoThumbnailOriginalName(
        String(videoData.video_id || ""),
        extractMediaExtensionFromUrl(videoData.image_url, ".jpg"),
      );
      const previewFile = resolveImportedMediaFile(
        `${creative.id}:video_preview`,
        previewOriginalKey,
      );
      const customPreview = previewFile
        ? await uploadImageAsset(accountId, previewFile, mediaCache)
        : null;
      return createVideoCreative(
        accountId,
        creative,
        uploadedId,
        mappedPageId,
        customPreview,
      );
    }

    return null;
  }

  async resolveCreativeDraftPayload(accountId, creative, mediaCache) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { getPageIdentityHint, applyInstagramIdentity } =
      this.dependencies.identityService;
    const {
      getCreativeMediaSlots,
      getDefaultMediaFile,
      recoverSlotMediaFromSource,
      resolveImportedMediaFile,
    } = this.dependencies.mediaSlots;
    const {
      stripUnsupportedInstagramEnhancements,
      buildDraftAssetFeedFallbackFromLinkData,
      replaceAssetFeedMedia,
      replaceCarouselAttachmentMedia,
    } = this.dependencies.creativeMedia;
    const { uploadVideo, getPreferredVideoThumbnail } =
      this.dependencies.videoService;
    const { uploadImageAsset } = this.dependencies.imageService;
    const { validateDraftCreativePayload } =
      this.dependencies.creativeValidator;
    const sourcePageId = getSourcePageId(creative);
    const mappedPageId = state.importPageMappings[sourcePageId] || sourcePageId;
    if (sourcePageId && !mappedPageId) {
      log(
        "warn",
        `Creative ${creative.name} skipped: no replacement selected for FP ${sourcePageId} .`,
      );
      return null;
    }
    if (sourcePageId && mappedPageId && mappedPageId !== sourcePageId) {
      log(
        "info",
        `Creative ${creative.name}: remapping FP ${sourcePageId} -> ${mappedPageId}.`,
      );
    }

    const raw = deepClone(creative.raw);
    replaceCreativePageReferences(raw, sourcePageId, mappedPageId);

    if (raw.asset_feed_spec) {
      const osp = raw.object_story_spec || {};

      const identity = await applyInstagramIdentity(
        osp,
        mappedPageId,
        raw.name || creative.name,
        accountId,
      );
      ensureDraftCreativeDestinationSpec(
        raw,
        getPageIdentityHint(mappedPageId)?.destinationSpec || null,
      );
      stripUnsupportedInstagramEnhancements(
        raw,
        identity,
        raw.name || creative.name,
      );
      const afs = raw.asset_feed_spec;
      if (!afs) {
        raw.object_story_spec = osp;
        const fallbackCreative = await buildDraftAssetFeedFallbackFromLinkData(
          accountId,
          creative,
          raw,
          mediaCache,
        );
        if (fallbackCreative) {
          if (
            !(await validateDraftCreativePayload(
              accountId,
              raw.name || creative.name,
              fallbackCreative,
            ))
          ) {
            return null;
          }
          return fallbackCreative;
        }
        creative = {
          ...creative,
          raw,
        };
      } else {
        raw.object_story_spec = osp;
        synchronizeCreativeIdentityFields(raw, osp);
        stripCreativePreviewIdentifiers(raw);
        if (
          !(await replaceAssetFeedMedia(
            accountId,
            creative,
            osp,
            afs,
            mediaCache,
          ))
        ) {
          return null;
        }
        stripAssetFeedLabelIdsForImport(afs);
        const payload = buildImportedCreativePayload(raw);
        if (
          !(await validateDraftCreativePayload(
            accountId,
            raw.name || creative.name,
            payload,
            {
              forceVideoRetry:
                Array.isArray(afs.videos) &&
                afs.videos.some((item) => item?.video_id),
            },
          ))
        ) {
          return null;
        }
        return payload;
      }
    }

    if (raw.object_story_id) {
      if (mappedPageId && mappedPageId !== sourcePageId) {
        log(
          "warn",
          `Creative ${creative.name} skipped: object_story_id cannot be transferred to another FP.`,
        );
        return null;
      }
      return {
        object_story_id: raw.object_story_id,
      };
    }

    if (isCatalogTemplateCreative(raw)) {
      const osp = raw.object_story_spec || {};
      await applyInstagramIdentity(
        osp,
        mappedPageId,
        raw.name || creative.name,
        accountId,
      );
      raw.object_story_spec = osp;
      synchronizeCreativeIdentityFields(raw, osp);
      stripCreativePreviewIdentifiers(raw);
      const payload = buildImportedCreativePayload(raw);
      if (
        !(await validateDraftCreativePayload(
          accountId,
          raw.name || creative.name,
          payload,
        ))
      ) {
        return null;
      }
      return payload;
    }

    if (hasCarouselAttachmentMedia(raw)) {
      const osp = raw.object_story_spec || {};
      await applyInstagramIdentity(
        osp,
        mappedPageId,
        raw.name || creative.name,
        accountId,
      );
      if (
        !(await replaceCarouselAttachmentMedia(
          accountId,
          creative,
          osp,
          mediaCache,
        ))
      ) {
        return null;
      }
      raw.object_story_spec = osp;
      synchronizeCreativeIdentityFields(raw, osp);
      stripCreativePreviewIdentifiers(raw);
      const payload = buildImportedCreativePayload(raw);
      payload.name = raw.name || creative.name;
      if (
        !(await validateDraftCreativePayload(
          accountId,
          raw.name || creative.name,
          payload,
        ))
      ) {
        return null;
      }
      return payload;
    }

    const slots = getCreativeMediaSlots(creative);
    if (!slots.length) {
      log(
        "warn",
        `Creative ${creative.name} skipped: no supported media slot.`,
      );
      return null;
    }

    const osp = raw.object_story_spec || {};
    await applyInstagramIdentity(
      osp,
      mappedPageId,
      raw.name || creative.name,
      accountId,
    );

    const slot = slots[0];
    let mediaFile = getDefaultMediaFile(slot);
    if (!mediaFile) {
      mediaFile = await recoverSlotMediaFromSource(slot);
    }
    if (!mediaFile) {
      log(
        "warn",
        `Creative ${creative.name} skipped: media file not found ${slot.expectedFileName}.`,
      );
      return null;
    }

    if (slot.type === "image") {
      const uploadedImage = await uploadImageAsset(
        accountId,
        mediaFile,
        mediaCache,
      );
      if (!osp.link_data) {
        osp.link_data = {};
      }
      setStoryImageHash(osp.link_data, uploadedImage.hash);
    }

    if (slot.type === "video") {
      let uploadedId = mediaCache.videos.get(mediaFile);
      if (!uploadedId) {
        log("info", `Uploading video ${mediaFile.name}...`);
        uploadedId = await uploadVideo(accountId, mediaFile);
        mediaCache.videos.set(mediaFile, uploadedId);
      }
      if (!osp.video_data) {
        osp.video_data = {};
      }
      osp.video_data.video_id = uploadedId;
      const previewOriginalKey = getVideoThumbnailOriginalName(
        String(slot.sourceId || uploadedId),
        extractMediaExtensionFromUrl(osp.video_data.image_url, ".jpg"),
      );
      const previewFile = resolveImportedMediaFile(
        `${creative.id}:video_preview`,
        previewOriginalKey,
      );
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
        osp.video_data.image_url = await getPreferredVideoThumbnail(uploadedId);
        osp.video_data.video_thumbnail_source = "generated_default";
      }
    }

    const payload =
      slot.type === "video"
        ? buildDraftStandaloneVideoCreative(
            {
              ...raw,
              object_story_spec: osp,
            },
            raw.name || creative.name,
          )
        : appendCreativeUrlTags(
            {
              name: raw.name || creative.name,
              object_story_spec: osp,
            },
            raw,
          );
    if (
      !(await validateDraftCreativePayload(
        accountId,
        raw.name || creative.name,
        payload,
        {
          forceVideoRetry: slot.type === "video",
        },
      ))
    ) {
      return null;
    }

    if (slot.type === "video") {
      return payload;
    }

    raw.object_story_spec = osp;
    synchronizeCreativeIdentityFields(raw, osp);
    stripCreativePreviewIdentifiers(raw);
    return raw;
  }
}
