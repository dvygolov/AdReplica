import {
  hasAdsetDayParting,
  hasCampaignLevelBudget,
  pushDraftBidFields,
  shouldIncludeAdsetSchedule,
  shouldIncludeCampaignBidStrategy,
} from "../domain/budget.mjs";
import { normalizeDraftId } from "../domain/ids.mjs";
import {
  hasPositiveBudget,
  normalizeScheduleValue,
} from "../domain/schedule.mjs";
import {
  draftItem,
  draftJsonItem,
  draftValueItem,
} from "../domain/draft-values.mjs";
import { deepClone } from "../utils/object.mjs";
import { resolveMutuallyExclusiveStoryImageFields } from "../domain/creative.mjs";
import {
  isGenericAdCreativeCreateFailure,
  summarizeCreativePayload,
} from "../domain/graph-errors.mjs";

/** DraftWriter. Dependencies are supplied by the application composition root. */
export class DraftWriter {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.nextDraftTempId = this.nextDraftTempId.bind(this);
    this.createCampaignDraft = this.createCampaignDraft.bind(this);
    this.createAdsetDraft = this.createAdsetDraft.bind(this);
    this.createAdDraft = this.createAdDraft.bind(this);
  }

  nextDraftTempId(draftTransaction = null) {
    const { state } = this.dependencies;
    if (!Number.isInteger(state.tempIdCursor)) {
      state.tempIdCursor = -Date.now();
    } else {
      state.tempIdCursor -= 1;
    }
    const tempId = state.tempIdCursor;
    if (draftTransaction?.tempIds instanceof Set) {
      draftTransaction.tempIds.add(String(tempId));
    }
    return tempId;
  }

  async createCampaignDraft(accountId, draftId, campaign, options = {}) {
    const { state } = this.dependencies;
    const { nextDraftTempId } = this;
    const { getDraftApplicationId } = this.dependencies.sessionService;
    const { createDraftFragmentWithRecovery } = this.dependencies.draftRecovery;
    const normalizedDraftId = normalizeDraftId(draftId);
    const campaignTempId = nextDraftTempId(options.draftTransaction);
    const objective = String(campaign.objective || "CONVERSIONS").toUpperCase();
    const isOutcomeLeads = objective === "OUTCOME_LEADS";
    const hasCampaignBudget = hasCampaignLevelBudget(campaign);
    const hasDayParting = Boolean(options.hasDayParting);
    const values = [
      draftItem("name", state.importCampaignName || campaign.name),
      draftItem("objective", objective),
      draftItem("status", state.importStatus),
      draftJsonItem(
        "special_ad_categories",
        campaign.special_ad_categories || [],
      ),
      draftItem("special_ad_category", campaign.special_ad_category || "NONE"),
      draftItem("account_id", accountId),
      draftValueItem("tempID", campaignTempId),
    ];
    if (campaign.special_ad_category_country) {
      values.push(
        draftJsonItem(
          "special_ad_category_country",
          campaign.special_ad_category_country,
        ),
      );
    }
    if (hasPositiveBudget(campaign.daily_budget)) {
      values.push(draftItem("daily_budget", campaign.daily_budget));
    }
    if (hasPositiveBudget(campaign.lifetime_budget)) {
      values.push(draftItem("lifetime_budget", campaign.lifetime_budget));
    }
    if (shouldIncludeCampaignBidStrategy(campaign)) {
      values.push(draftItem("bid_strategy", campaign.bid_strategy));
    }
    if (campaign.buying_type) {
      values.push(draftItem("buying_type", campaign.buying_type));
    }
    const startTime = normalizeScheduleValue(campaign.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    values.push(
      startTime
        ? draftItem("start_time", startTime)
        : draftValueItem("start_time", null),
    );
    const stopTime = normalizeScheduleValue(
      campaign.stop_time,
      campaign.stop_time ? 30 : 0,
      {
        preservePast: state.importPreserveSchedule,
      },
    );
    values.push(
      stopTime
        ? draftItem("stop_time", stopTime)
        : draftValueItem("stop_time", null),
    );
    if (isOutcomeLeads) {
      values.push(
        draftValueItem("adlabels", null),
        draftValueItem("lightweight_split_test", null),
        draftItem("campaign_group_creation_source", "click_quick_create"),
        draftValueItem("smart_promotion_type", null),
        draftValueItem("is_pca_unified", null),
        draftValueItem("mc_experience_config", null),
        draftValueItem("is_odax_campaign_group", true),
        draftValueItem("boosted_component_product", null),
        draftValueItem("incremental_conversion_optimization_config", null),
        draftValueItem("topline_id", null),
        draftValueItem("is_full_funnel", null),
        draftValueItem("frequency_control_specs", null),
        draftValueItem("is_reels_trending_ads_enabled", null),
        draftItem("automation_unified_campaign_type", "UNIFIED_LEADS"),
        draftValueItem("agency_fee_config", null),
        draftValueItem("promoted_object", null),
        draftValueItem("source_recommendation_type", null),
        draftValueItem("is_message_campaign", null),
        draftValueItem("collaborative_ads_partner_info", null),
        draftValueItem("is_using_l3_schedule", null),
      );
      if (hasCampaignBudget) {
        values.push(
          draftValueItem("can_use_spend_cap", true),
          draftValueItem("budget_strategy", null),
          draftJsonItem("metrics_metadata", {
            budget_optimization: ["default_on"],
          }),
          draftValueItem("spend_cap", null),
          draftValueItem(
            "is_autobid",
            !campaign.bid_strategy ||
              campaign.bid_strategy === "LOWEST_COST_WITHOUT_CAP",
          ),
          draftValueItem("budget_remaining", null),
          draftValueItem("is_average_price_pacing", false),
        );
        if (!hasDayParting) {
          values.push(draftJsonItem("pacing_type", ["standard"]));
        }
      }
    }
    const body = {
      action: "add",
      ad_object_type: "campaign",
      ad_draft_id: normalizedDraftId,
      account_id: accountId,
      values,
      application_id: getDraftApplicationId(),
      ownership_type: "USER",
      use_active_draft_if_exists: true,
    };
    const json = await createDraftFragmentWithRecovery(draftId, body, {
      accountId,
      adObjectType: "campaign",
      tempId: campaignTempId,
      parentAdObjectId: "",
      label: "campaign",
    });
    state.operationReport?.record(
      "campaign",
      json.ad_object_id,
      state.importCampaignName,
      {
        draftId: normalizedDraftId,
        fragmentId: json.id,
        tempId: campaignTempId,
      },
    );
    return String(json.ad_object_id);
  }

  async createAdsetDraft(
    accountId,
    draftId,
    campaignDraftId,
    adset,
    pixelMap,
    options = {},
  ) {
    const { state } = this.dependencies;
    const { nextDraftTempId } = this;
    const { getDraftApplicationId } = this.dependencies.sessionService;
    const { cleanTargeting } = this.dependencies.scheduleService;
    const { createDraftFragmentWithRecovery } = this.dependencies.draftRecovery;
    const normalizedDraftId = normalizeDraftId(draftId);
    const promotedObject = deepClone(adset.promoted_object || {});
    const adsetTempId = nextDraftTempId(options.draftTransaction);
    if (promotedObject.pixel_id) {
      promotedObject.pixel_id =
        pixelMap[String(promotedObject.pixel_id)] || promotedObject.pixel_id;
    }
    const values = [
      draftItem("name", adset.name),
      draftItem("parentAdObjectID", campaignDraftId),
      draftItem("campaign_id", campaignDraftId),
      draftItem("account_id", accountId),
      draftItem("status", state.importStatus),
      draftItem("optimization_goal", adset.optimization_goal),
      draftItem("billing_event", adset.billing_event),
      draftJsonItem("targeting", cleanTargeting(adset.targeting, adset.name)),
      draftJsonItem("promoted_object", promotedObject),
      draftValueItem("is_dynamic_creative", Boolean(adset.is_dynamic_creative)),
      draftValueItem("tempID", adsetTempId),
      draftItem("campaign_creation_source", "click_quick_create"),
    ];
    if (adset.destination_type) {
      values.push(draftItem("destination_type", adset.destination_type));
    }
    if (adset.asset_feed_id) {
      values.push(draftItem("asset_feed_id", adset.asset_feed_id));
    }
    for (const [field, value] of Object.entries({
      optimization_sub_event: adset.optimization_sub_event,
      multi_optimization_goal_weight: adset.multi_optimization_goal_weight,
      automatic_manual_state: adset.automatic_manual_state,
      campaign_attribution: adset.campaign_attribution,
      attribution_count_type: adset.attribution_count_type,
    })) {
      if (value !== undefined && value !== null && value !== "") {
        values.push(draftItem(field, value));
      }
    }
    for (const [field, value] of Object.entries({
      is_dynamic_creative_optimization: adset.is_dynamic_creative_optimization,
      is_dynamic_creative_asset_customization:
        adset.is_dynamic_creative_asset_customization,
      is_dynamic_creative_format_automation:
        adset.is_dynamic_creative_format_automation,
    })) {
      if (typeof value === "boolean") {
        values.push(draftValueItem(field, value));
      }
    }
    if (
      adset.targeting_as_signal !== undefined &&
      adset.targeting_as_signal !== null &&
      adset.targeting_as_signal !== ""
    ) {
      values.push(
        draftValueItem("targeting_as_signal", adset.targeting_as_signal),
      );
    }
    if (typeof adset.use_new_app_click === "boolean") {
      values.push(draftValueItem("use_new_app_click", adset.use_new_app_click));
    }
    if (typeof adset.is_autobid === "boolean") {
      values.push(draftValueItem("is_autobid", adset.is_autobid));
    }
    if (shouldIncludeAdsetSchedule(adset, options)) {
      values.push(draftJsonItem("adset_schedule", adset.adset_schedule));
    }
    if (adset.pacing_type && !hasAdsetDayParting(adset)) {
      values.push(draftJsonItem("pacing_type", adset.pacing_type));
    }
    if (
      adset.creative_sequence !== undefined &&
      adset.creative_sequence !== null &&
      adset.creative_sequence !== ""
    ) {
      values.push(draftValueItem("creative_sequence", adset.creative_sequence));
    }
    if (adset.dynamic_ad_voice) {
      values.push(draftItem("dynamic_ad_voice", adset.dynamic_ad_voice));
    }
    if (hasPositiveBudget(adset.daily_budget)) {
      values.push(draftItem("daily_budget", adset.daily_budget));
    }
    if (hasPositiveBudget(adset.lifetime_budget)) {
      values.push(draftItem("lifetime_budget", adset.lifetime_budget));
    }
    pushDraftBidFields(values, adset, options);
    if (adset.attribution_spec) {
      values.push(draftJsonItem("attribution_spec", adset.attribution_spec));
    }
    if (adset.dsa_beneficiary) {
      values.push(draftItem("dsa_beneficiary", adset.dsa_beneficiary));
    }
    if (adset.dsa_payor) {
      values.push(draftItem("dsa_payor", adset.dsa_payor));
    }
    const startTime = normalizeScheduleValue(adset.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    values.push(
      startTime
        ? draftItem("start_time", startTime)
        : draftValueItem("start_time", null),
    );
    const hasEndTime = Boolean(adset.end_time);
    const endTime = normalizeScheduleValue(
      adset.end_time,
      hasEndTime ? 30 : 0,
      {
        preservePast: state.importPreserveSchedule,
      },
    );
    values.push(
      endTime
        ? draftItem("end_time", endTime)
        : draftValueItem("end_time", null),
    );
    const body = {
      action: "add",
      ad_object_type: "ad_set",
      account_id: accountId,
      ad_draft_id: normalizedDraftId,
      parent_ad_object_id: campaignDraftId,
      values,
      application_id: getDraftApplicationId(),
      ownership_type: "USER",
      use_active_draft_if_exists: true,
    };
    const json = await createDraftFragmentWithRecovery(draftId, body, {
      accountId,
      adObjectType: "ad_set",
      tempId: adsetTempId,
      parentAdObjectId: campaignDraftId,
      label: "ad set",
    });
    state.operationReport?.record("adset", json.ad_object_id, adset.name, {
      draftId: normalizedDraftId,
      fragmentId: json.id,
      tempId: adsetTempId,
    });
    return String(json.ad_object_id);
  }

  async createAdDraft(
    accountId,
    draftId,
    campaignDraftId,
    adsetDraftId,
    ad,
    creativeRaw,
    options = {},
  ) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { nextDraftTempId, createAdDraft } = this;
    const { getDraftApplicationId } = this.dependencies.sessionService;
    const { createDraftFragmentWithRecovery } = this.dependencies.draftRecovery;
    const normalizedDraftId = normalizeDraftId(draftId);
    const adTempId = nextDraftTempId(options.draftTransaction);
    resolveMutuallyExclusiveStoryImageFields(creativeRaw);
    const values = [
      draftItem("name", ad.name),
      draftItem("parentAdObjectID", adsetDraftId),
      draftItem("campaign_id", campaignDraftId),
      draftItem("adset_id", adsetDraftId),
      draftItem("account_id", accountId),
      draftValueItem("display_sequence", 0),
      draftItem("status", state.importStatus),
      draftJsonItem("creative", creativeRaw),
      draftValueItem("campaign_index", 0),
      draftItem("ad_creation_source", "click_quick_create"),
      draftValueItem("tempID", adTempId),
    ];
    if (ad.conversion_domain) {
      values.push(draftItem("conversion_domain", ad.conversion_domain));
    }
    try {
      const body = {
        action: "add",
        ad_object_type: "ad",
        account_id: accountId,
        ad_draft_id: normalizedDraftId,
        parent_ad_object_id: adsetDraftId,
        values,
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: true,
      };
      const json = await createDraftFragmentWithRecovery(draftId, body, {
        accountId,
        adObjectType: "ad",
        tempId: adTempId,
        parentAdObjectId: adsetDraftId,
        label: `ad ${ad.name}`,
      });
      state.operationReport?.record("ad", json.ad_object_id, ad.name, {
        draftId: normalizedDraftId,
        fragmentId: json.id,
        tempId: adTempId,
      });
      return String(json.ad_object_id);
    } catch (error) {
      if (error?.uncertain) throw error;
      const simpleFallback = creativeRaw?.__adReplicaSimpleDraftFallback;
      if (simpleFallback && isGenericAdCreativeCreateFailure(error)) {
        options.draftTransaction?.tempIds?.delete(String(adTempId));
        log(
          "warn",
          `Draft creative failed with Meta generic adcreative error; retrying simple link_data fallback for ${ad.name}.`,
          summarizeCreativePayload(creativeRaw),
        );
        return createAdDraft(
          accountId,
          draftId,
          campaignDraftId,
          adsetDraftId,
          ad,
          simpleFallback,
          options,
        );
      }
      log(
        "error",
        `Draft ad creation failed for ${ad.name}.`,
        summarizeCreativePayload(creativeRaw),
      );
      throw error;
    }
  }
}
