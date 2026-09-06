import {
  normalizeCreativeExportRaw,
  normalizeExportScheduleFields,
  stripVolatileEntityFields,
} from "../domain/schedule.mjs";
import {
  extractMediaExtensionFromUrl,
  getVideoThumbnailOriginalName,
  hasAssetFeedCustomVideoThumbnail,
  hasStandaloneCustomVideoThumbnail,
} from "../domain/creative.mjs";
import {
  getSourceCatalogsFromPackage,
  getSourceProductSetsFromPackage,
  mergeEntityHintsById,
} from "../domain/package.mjs";
import { isLikelyCatalogCreative } from "../domain/catalog.mjs";
import { sanitizeFileName } from "../utils/string.mjs";

/** CampaignExporter. Dependencies are supplied by the application composition root. */
export class CampaignExporter {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getPageName = this.getPageName.bind(this);
    this.fetchCampaignExportPackage =
      this.fetchCampaignExportPackage.bind(this);
  }

  async getPageName(pageId) {
    const { graphPageFetch } = this.dependencies.graphClient;
    if (!pageId) return "";
    try {
      const page = await graphPageFetch(pageId, {
        query: { fields: "id,name,is_published" },
      });
      return page.name || page.id || "";
    } catch (_error) {
      return pageId;
    }
  }

  async fetchCampaignExportPackage(accountId, campaignId) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const {
      filterDpaCatalogHintsToPackageReferences,
      fetchDpaCatalogHintsForAds,
    } = this.dependencies.catalogDiscovery;
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    const { getPageName } = this;
    const { fetchCatalogExportsForPackage } = this.dependencies.catalogExporter;
    const account = state.accounts.find((item) => item.id === accountId);
    const campaign = normalizeExportScheduleFields(
      stripVolatileEntityFields(
        await graphFetch(campaignId, {
          query: {
            fields: [
              "id",
              "name",
              "status",
              "effective_status",
              "objective",
              "daily_budget",
              "lifetime_budget",
              "bid_strategy",
              "buying_type",
              "special_ad_categories",
              "special_ad_category",
              "special_ad_category_country",
              "start_time",
              "stop_time",
            ].join(","),
          },
        }),
      ),
      ["start_time", "stop_time"],
    );
    const adsets = (
      await graphGetAll(`${campaignId}/adsets`, {
        fields: [
          "id",
          "name",
          "status",
          "effective_status",
          "is_dynamic_creative",
          "daily_budget",
          "lifetime_budget",
          "optimization_goal",
          "billing_event",
          "targeting",
          "bid_strategy",
          "bid_amount",
          "bid_constraints",
          "promoted_object",
          "attribution_spec",
          "asset_feed_id",
          "destination_type",
          "is_dynamic_creative_optimization",
          "is_dynamic_creative_asset_customization",
          "is_dynamic_creative_format_automation",
          "optimization_sub_event",
          "adset_schedule",
          "pacing_type",
          "use_new_app_click",
          "is_autobid",
          "multi_optimization_goal_weight",
          "creative_sequence",
          "dynamic_ad_voice",
          "targeting_as_signal",
          "automatic_manual_state",
          "campaign_attribution",
          "attribution_count_type",
          "start_time",
          "end_time",
          "dsa_beneficiary",
          "dsa_payor",
        ].join(","),
      })
    ).map((item) =>
      normalizeExportScheduleFields(stripVolatileEntityFields(item), [
        "start_time",
        "end_time",
      ]),
    );
    const ads = (
      await graphGetAll(`${campaignId}/ads`, {
        fields: [
          "id",
          "name",
          "status",
          "effective_status",
          "creative",
          "adset",
          "conversion_domain",
        ].join(","),
      })
    ).map(stripVolatileEntityFields);

    const creativeIds = [
      ...new Set(
        ads
          .map((ad) => ad?.creative?.id)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const creatives = [];
    const downloadQueue = [];
    const pageNames = new Map();
    const fileNameMap = {};
    const usedFileNames = new Set();
    const sourceToFriendly = new Map();

    const creativeIdToAdName = new Map();
    for (const ad of ads) {
      const cid = String(ad?.creative?.id);
      if (cid && !creativeIdToAdName.has(cid)) {
        creativeIdToAdName.set(cid, ad.name || ad.id);
      }
    }

    function makeFriendlyFileName(baseName, ext) {
      let candidate = `${sanitizeFileName(baseName)}${ext}`;
      if (!usedFileNames.has(candidate)) {
        usedFileNames.add(candidate);
        return candidate;
      }
      let n = 2;
      while (usedFileNames.has(`${sanitizeFileName(baseName)}_${n}${ext}`)) {
        n++;
      }
      candidate = `${sanitizeFileName(baseName)}_${n}${ext}`;
      usedFileNames.add(candidate);
      return candidate;
    }

    function makeFriendlyMediaFileName(baseName, type, index, ext) {
      const safeType =
        sanitizeFileName(
          type === "video" || type === "image" ? type : String(type || "media"),
        ) || "media";
      const ordinal = Number.isFinite(index)
        ? String(index).padStart(2, "0")
        : "01";
      return makeFriendlyFileName(`${baseName}__${safeType}_${ordinal}`, ext);
    }

    for (const creativeId of creativeIds) {
      const creative = await graphFetch(creativeId, {
        query: {
          fields: [
            "id",
            "name",
            "object_story_spec",
            "object_story_id",
            "asset_feed_spec",
            "template_url_spec",
            "url_tags",
            "object_type",
            "product_set_id",
            "body",
            "title",
            "degrees_of_freedom_spec",
            "creative_sourcing_spec",
            "contextual_multi_ads",
            "actor_type",
            "authorization_category",
            "branded_content_sponsor_page_id",
            "destination_spec",
            "effective_instagram_media_id",
            "effective_instagram_story_id",
            "effective_object_story_id",
            "instagram_actor_id",
            "instagram_permalink_url",
            "thumbnail_url",
            "uca_draft_version",
            "use_page_actor_override",
          ].join(","),
        },
      });

      const sourcePageId =
        creative?.object_story_spec?.page_id ||
        (creative?.object_story_id
          ? String(creative.object_story_id).split("_")[0]
          : "");
      if (sourcePageId && !pageNames.has(sourcePageId)) {
        pageNames.set(sourcePageId, await getPageName(sourcePageId));
      }

      const creativeEntry = {
        id: String(creative.id),
        name: creative.name || creative.id,
        raw: normalizeCreativeExportRaw(creative),
        sourcePageId: sourcePageId || "",
        sourcePageName: sourcePageId
          ? pageNames.get(sourcePageId) || sourcePageId
          : "",
        unsupportedReason: "",
      };

      const adName =
        creativeIdToAdName.get(String(creative.id)) ||
        creative.name ||
        creative.id;
      const osp = creative.object_story_spec || {};
      let hasAssetFeedMedia = false;
      if (creative.asset_feed_spec) {
        const afs = creative.asset_feed_spec;
        if (Array.isArray(afs.images)) {
          for (const img of afs.images) {
            if (!img.hash) continue;
            hasAssetFeedMedia = true;
            const imageHash = String(img.hash);
            const originalName = `${imageHash}.jpg`;
            if (sourceToFriendly.has(originalName)) {
              continue;
            }
            const images = await graphFetch(`act_${accountId}/adimages`, {
              query: {
                hashes: [imageHash],
                fields: "hash,url,permalink_url",
              },
            });
            const image = images.data?.[0];
            const imageUrl = image?.url || image?.permalink_url;
            if (imageUrl) {
              const friendly = makeFriendlyMediaFileName(
                adName,
                "image",
                afs.images.indexOf(img) + 1,
                ".jpg",
              );
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "image",
                fileName: friendly,
                sourceUrl: imageUrl,
                sourceAccountId: accountId,
                sourceId: imageHash,
                sourceKind: "adimage",
              });
            }
          }
        }
        if (Array.isArray(afs.videos)) {
          for (const vid of afs.videos) {
            if (!vid.video_id) continue;
            hasAssetFeedMedia = true;
            const videoId = String(vid.video_id);
            const originalName = `${videoId}.mp4`;
            if (sourceToFriendly.has(originalName)) {
              continue;
            }
            const video = await graphFetch(videoId, {
              query: { fields: "id,source" },
            });
            if (video.source) {
              const friendly = makeFriendlyMediaFileName(
                adName,
                "video",
                afs.videos.indexOf(vid) + 1,
                ".mp4",
              );
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "video",
                fileName: friendly,
                sourceUrl: video.source,
                sourceAccountId: accountId,
                sourceId: videoId,
                sourceKind: "advideo",
              });
            }
            if (hasAssetFeedCustomVideoThumbnail(vid)) {
              const previewExt = extractMediaExtensionFromUrl(
                vid.thumbnail_url,
                ".jpg",
              );
              const previewOriginalName = getVideoThumbnailOriginalName(
                videoId,
                previewExt,
              );
              if (!sourceToFriendly.has(previewOriginalName)) {
                let previewUrl = vid.thumbnail_url || "";
                if (!previewUrl && vid.thumbnail_hash) {
                  const images = await graphFetch(`act_${accountId}/adimages`, {
                    query: {
                      hashes: [String(vid.thumbnail_hash)],
                      fields: "hash,url,permalink_url",
                    },
                  });
                  const image = images.data?.[0];
                  previewUrl = image?.url || image?.permalink_url || "";
                }
                if (previewUrl) {
                  const friendly = makeFriendlyMediaFileName(
                    adName,
                    "preview",
                    afs.videos.indexOf(vid) + 1,
                    previewExt,
                  );
                  sourceToFriendly.set(previewOriginalName, friendly);
                  fileNameMap[previewOriginalName] = friendly;
                  downloadQueue.push({
                    type: "image",
                    fileName: friendly,
                    sourceUrl: previewUrl,
                    sourceAccountId: accountId,
                    sourceId: vid.thumbnail_hash
                      ? String(vid.thumbnail_hash)
                      : "",
                    sourceKind: "thumbnail",
                  });
                }
              }
            }
          }
        }
      }
      if (!creative.object_story_id && !hasAssetFeedMedia) {
        if (osp.video_data?.video_id) {
          const videoId = String(osp.video_data.video_id);
          const originalName = `${videoId}.mp4`;
          if (!sourceToFriendly.has(originalName)) {
            const video = await graphFetch(videoId, {
              query: { fields: "id,source" },
            });
            const friendly = makeFriendlyMediaFileName(
              adName,
              "video",
              1,
              ".mp4",
            );
            sourceToFriendly.set(originalName, friendly);
            fileNameMap[originalName] = friendly;
            downloadQueue.push({
              type: "video",
              fileName: friendly,
              sourceUrl: video.source,
              sourceAccountId: accountId,
              sourceId: videoId,
              sourceKind: "advideo",
            });
          }
          if (hasStandaloneCustomVideoThumbnail(osp.video_data)) {
            const previewExt = extractMediaExtensionFromUrl(
              osp.video_data.image_url,
              ".jpg",
            );
            const previewOriginalName = getVideoThumbnailOriginalName(
              videoId,
              previewExt,
            );
            if (!sourceToFriendly.has(previewOriginalName)) {
              let previewUrl = osp.video_data.image_url || "";
              if (!previewUrl && osp.video_data.image_hash) {
                const images = await graphFetch(`act_${accountId}/adimages`, {
                  query: {
                    hashes: [String(osp.video_data.image_hash)],
                    fields: "hash,url,permalink_url",
                  },
                });
                const image = images.data?.[0];
                previewUrl = image?.url || image?.permalink_url || "";
              }
              if (previewUrl) {
                const friendly = makeFriendlyMediaFileName(
                  adName,
                  "preview",
                  1,
                  previewExt,
                );
                sourceToFriendly.set(previewOriginalName, friendly);
                fileNameMap[previewOriginalName] = friendly;
                downloadQueue.push({
                  type: "image",
                  fileName: friendly,
                  sourceUrl: previewUrl,
                  sourceAccountId: accountId,
                  sourceId: osp.video_data.image_hash
                    ? String(osp.video_data.image_hash)
                    : "",
                  sourceKind: "thumbnail",
                });
              }
            }
          }
        } else if (osp.link_data?.image_hash) {
          const imageHash = String(osp.link_data.image_hash);
          const originalName = `${imageHash}.jpg`;
          if (!sourceToFriendly.has(originalName)) {
            const images = await graphFetch(`act_${accountId}/adimages`, {
              query: {
                hashes: [imageHash],
                fields: "hash,url,permalink_url",
              },
            });
            const image = images.data?.[0];
            const imageUrl = image?.url || image?.permalink_url;
            if (imageUrl) {
              const friendly = makeFriendlyMediaFileName(
                adName,
                "image",
                1,
                ".jpg",
              );
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "image",
                fileName: friendly,
                sourceUrl: imageUrl,
                sourceAccountId: accountId,
                sourceId: imageHash,
                sourceKind: "adimage",
              });
            }
          }
        }
        if (Array.isArray(osp.link_data?.child_attachments)) {
          for (const [
            attachmentIndex,
            attachment,
          ] of osp.link_data.child_attachments.entries()) {
            if (!attachment?.image_hash) {
              continue;
            }
            const imageHash = String(attachment.image_hash);
            const originalName = `${imageHash}.jpg`;
            if (sourceToFriendly.has(originalName)) {
              continue;
            }
            const images = await graphFetch(`act_${accountId}/adimages`, {
              query: {
                hashes: [imageHash],
                fields: "hash,url,permalink_url",
              },
            });
            const image = images.data?.[0];
            const imageUrl = image?.url || image?.permalink_url;
            if (imageUrl) {
              const friendly = makeFriendlyMediaFileName(
                adName,
                "carousel",
                attachmentIndex + 1,
                ".jpg",
              );
              sourceToFriendly.set(originalName, friendly);
              fileNameMap[originalName] = friendly;
              downloadQueue.push({
                type: "image",
                fileName: friendly,
                sourceUrl: imageUrl,
                sourceAccountId: accountId,
                sourceId: imageHash,
                sourceKind: "adimage",
              });
            }
          }
        }
      }

      creatives.push(creativeEntry);
    }

    const dpaCatalogHints = await fetchDpaCatalogHintsForAds(
      accountId,
      ads,
      creatives,
    );
    if (dpaCatalogHints.catalogs.length) {
      log(
        "info",
        `Detected catalog ad source: ${dpaCatalogHints.catalogs.map((item) => `${item.name} (${item.id})`).join(", ")}`,
      );
    }
    for (const ad of ads || []) {
      const creative = creatives.find(
        (item) => String(item.id) === String(ad?.creative?.id || ""),
      );
      if (!creative || !isLikelyCatalogCreative(creative)) {
        continue;
      }
      if (!creative?.raw?.product_set_id) {
        log(
          "warn",
          `Catalog creative ${creative.name || creative.id} exported without product_set_id after DPA hint enrichment.`,
        );
      }
    }
    const referencePackage = {
      campaign,
      adsets,
      ads,
      creatives,
    };
    const referencedDpaCatalogHints = filterDpaCatalogHintsToPackageReferences(
      referencePackage,
      dpaCatalogHints,
    );
    const provisionalPackage = {
      ...referencePackage,
      catalogs: referencedDpaCatalogHints.catalogs,
      productSets: referencedDpaCatalogHints.productSets,
    };
    const sourceCatalogs = mergeEntityHintsById(
      referencedDpaCatalogHints.catalogs,
      getSourceCatalogsFromPackage(provisionalPackage),
    );
    const sourceProductSets = mergeEntityHintsById(
      referencedDpaCatalogHints.productSets,
      getSourceProductSetsFromPackage(provisionalPackage),
    );
    const catalogExports = await fetchCatalogExportsForPackage(sourceCatalogs);

    const dedupedFiles = new Map();
    for (const item of downloadQueue) {
      if (!dedupedFiles.has(item.fileName)) {
        dedupedFiles.set(item.fileName, item);
      }
    }

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: {
        origin: window.location.origin,
        accountId,
        accountName: account?.name || accountId,
        campaignId: String(campaign.id),
        campaignName: campaign.name || campaign.id,
      },
      campaign,
      adsets,
      ads,
      creatives,
      catalogs: sourceCatalogs,
      productSets: sourceProductSets,
      catalogExports,
      fileNameMap,
      files: [...dedupedFiles.values()].map((item) => ({
        type: item.type,
        fileName: item.fileName,
      })),
      warnings: creatives
        .filter((item) => item.unsupportedReason)
        .map(
          (item) =>
            `Creative ${item.name} marked as unsupported: ${item.unsupportedReason}`,
        ),
      _downloadQueue: [...dedupedFiles.values()],
    };
  }
}
