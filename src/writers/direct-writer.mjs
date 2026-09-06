import {
  applyBidFields,
  hasAdsetDayParting,
  shouldIncludeAdsetSchedule,
  shouldIncludeCampaignBidStrategy,
} from "../domain/budget.mjs";
import {
  hasPositiveBudget,
  normalizeScheduleValue,
} from "../domain/schedule.mjs";
import { deepClone } from "../utils/object.mjs";

/** DirectWriter. Dependencies are supplied by the application composition root. */
export class DirectWriter {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.createCampaign = this.createCampaign.bind(this);
    this.createAdset = this.createAdset.bind(this);
    this.createAd = this.createAd.bind(this);
    this.activateCampaign = this.activateCampaign.bind(this);
  }

  async createCampaign(accountId, campaign, options = {}) {
    const { state } = this.dependencies;
    const { graphFetch } = this.dependencies.graphClient;
    const body = {
      name: state.importCampaignName || campaign.name,
      objective: campaign.objective,
      status: "PAUSED",
      special_ad_categories: campaign.special_ad_categories || [],
    };
    if (campaign.special_ad_category) {
      body.special_ad_category = campaign.special_ad_category;
    }
    if (campaign.special_ad_category_country) {
      body.special_ad_category_country = campaign.special_ad_category_country;
    }
    if (hasPositiveBudget(campaign.daily_budget)) {
      body.daily_budget = campaign.daily_budget;
    }
    if (hasPositiveBudget(campaign.lifetime_budget)) {
      body.lifetime_budget = campaign.lifetime_budget;
    }
    if (shouldIncludeCampaignBidStrategy(campaign)) {
      body.bid_strategy = campaign.bid_strategy;
    }
    if (campaign.buying_type) {
      body.buying_type = campaign.buying_type;
    }
    const startTime = normalizeScheduleValue(campaign.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    const stopTime = normalizeScheduleValue(
      campaign.stop_time,
      campaign.stop_time ? 30 : 0,
      {
        preservePast: state.importPreserveSchedule,
      },
    );
    if (startTime) {
      body.start_time = startTime;
    }
    if (stopTime) {
      body.stop_time = stopTime;
    }
    const json = await graphFetch(`act_${accountId}/campaigns`, {
      method: "POST",
      body,
    });
    state.operationReport?.record("campaign", json.id, body.name, {
      status: "PAUSED",
    });
    return String(json.id);
  }

  async createAdset(accountId, campaignId, adset, pixelMap, options = {}) {
    const { state } = this.dependencies;
    const { graphFetch } = this.dependencies.graphClient;
    const { cleanTargeting } = this.dependencies.scheduleService;
    const promotedObject = deepClone(adset.promoted_object || {});
    if (promotedObject.pixel_id) {
      promotedObject.pixel_id =
        pixelMap[String(promotedObject.pixel_id)] || promotedObject.pixel_id;
    }

    const body = {
      name: adset.name,
      campaign_id: campaignId,
      status: "PAUSED",
      optimization_goal: adset.optimization_goal,
      billing_event: adset.billing_event,
      targeting: cleanTargeting(adset.targeting, adset.name),
      promoted_object: promotedObject,
      is_dynamic_creative: Boolean(adset.is_dynamic_creative),
    };
    if (adset.destination_type) {
      body.destination_type = adset.destination_type;
    }
    if (adset.asset_feed_id) {
      body.asset_feed_id = adset.asset_feed_id;
    }
    for (const [field, value] of Object.entries({
      optimization_sub_event: adset.optimization_sub_event,
      multi_optimization_goal_weight: adset.multi_optimization_goal_weight,
      automatic_manual_state: adset.automatic_manual_state,
      campaign_attribution: adset.campaign_attribution,
      attribution_count_type: adset.attribution_count_type,
    })) {
      if (value !== undefined && value !== null && value !== "") {
        body[field] = value;
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
        body[field] = value;
      }
    }
    if (
      adset.targeting_as_signal !== undefined &&
      adset.targeting_as_signal !== null &&
      adset.targeting_as_signal !== ""
    ) {
      body.targeting_as_signal = adset.targeting_as_signal;
    }
    if (typeof adset.use_new_app_click === "boolean") {
      body.use_new_app_click = adset.use_new_app_click;
    }
    if (typeof adset.is_autobid === "boolean") {
      body.is_autobid = adset.is_autobid;
    }
    if (shouldIncludeAdsetSchedule(adset, options)) {
      body.adset_schedule = adset.adset_schedule;
    }
    if (adset.pacing_type && !hasAdsetDayParting(adset)) {
      body.pacing_type = adset.pacing_type;
    }
    if (
      adset.creative_sequence !== undefined &&
      adset.creative_sequence !== null &&
      adset.creative_sequence !== ""
    ) {
      body.creative_sequence = adset.creative_sequence;
    }
    if (adset.dynamic_ad_voice) {
      body.dynamic_ad_voice = adset.dynamic_ad_voice;
    }

    if (hasPositiveBudget(adset.daily_budget)) {
      body.daily_budget = adset.daily_budget;
    }
    if (hasPositiveBudget(adset.lifetime_budget)) {
      body.lifetime_budget = adset.lifetime_budget;
    }
    applyBidFields(body, adset, options);
    if (adset.attribution_spec) {
      body.attribution_spec = adset.attribution_spec;
    }
    if (adset.dsa_beneficiary) {
      body.dsa_beneficiary = adset.dsa_beneficiary;
    }
    if (adset.dsa_payor) {
      body.dsa_payor = adset.dsa_payor;
    }
    const hasEndTime = Boolean(adset.end_time);
    const startTime = normalizeScheduleValue(adset.start_time, 0, {
      preservePast: state.importPreserveSchedule,
    });
    const endTime = normalizeScheduleValue(
      adset.end_time,
      hasEndTime ? 30 : 0,
      {
        preservePast: state.importPreserveSchedule,
      },
    );
    if (startTime) {
      body.start_time = startTime;
    }
    if (endTime) {
      body.end_time = endTime;
    }

    const json = await graphFetch(`act_${accountId}/adsets`, {
      method: "POST",
      body,
    });
    state.operationReport?.record("adset", json.id, body.name, {
      status: "PAUSED",
      parentId: String(campaignId),
    });
    return String(json.id);
  }

  async createAd(accountId, adsetId, ad, creativeId, options = {}) {
    const { state } = this.dependencies;
    const { graphFetch } = this.dependencies.graphClient;
    const body = {
      name: ad.name,
      status: "PAUSED",
      adset_id: adsetId,
      creative: { creative_id: creativeId },
    };
    if (ad.conversion_domain) {
      body.conversion_domain = ad.conversion_domain;
    }
    const json = await graphFetch(`act_${accountId}/ads`, {
      method: "POST",
      body,
    });
    state.operationReport?.record("ad", json.id, body.name, {
      status: "PAUSED",
      parentId: String(adsetId),
    });
    return String(json.id);
  }

  async activateCampaign(campaignId) {
    const { state } = this.dependencies;
    const { graphFetch } = this.dependencies.graphClient;
    const report = state.operationReport;
    if (!report?.isComplete())
      throw new Error(
        "Activation blocked: the campaign was not imported completely.",
      );
    report.activation = "verifying";
    const records = report.created.filter(
      (x) => ["campaign", "adset", "ad"].includes(x.type) && !x.removed,
    );
    for (const item of records) {
      const entity = await graphFetch(item.id, {
        query: { fields: "id,status,account_id" },
      });
      if (
        String(entity.id) !== item.id ||
        String(entity.account_id) !== String(state.importAccountId) ||
        entity.status !== "PAUSED"
      ) {
        throw new Error(
          `Activation blocked: ${item.type} ${item.id} does not match the staged account/status.`,
        );
      }
    }
    report.activation = "activating";
    try {
      for (const type of ["ad", "adset", "campaign"])
        for (const item of records.filter((x) => x.type === type)) {
          await graphFetch(item.id, {
            method: "POST",
            body: { status: "ACTIVE" },
          });
          item.status = "ACTIVE";
        }
      const result = await graphFetch(campaignId, {
        query: { fields: "id,status" },
      });
      if (result.status !== "ACTIVE")
        throw new Error("Campaign activation was not confirmed.");
      report.activation = "active";
    } catch (error) {
      report.activation = "needs_review";
      try {
        await graphFetch(campaignId, {
          method: "POST",
          body: { status: "PAUSED" },
        });
        const result = await graphFetch(campaignId, {
          query: { fields: "id,status" },
        });
        if (result.status !== "PAUSED")
          throw new Error("Pause was not confirmed.");
        const campaign = records.find((x) => x.id === String(campaignId));
        if (campaign) campaign.status = "PAUSED";
        report.activation = "paused_after_error";
      } catch (pauseError) {
        report.issue(`Campaign ${campaignId}: ${pauseError.message}`, {
          uncertain: true,
          stage: "pause",
        });
      }
      throw error;
    }
  }
}
