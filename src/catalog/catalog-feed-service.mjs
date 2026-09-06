import { pickDefinedFields } from "../domain/catalog.mjs";

/** CatalogFeedService. Dependencies are supplied by the application composition root. */
export class CatalogFeedService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.buildCatalogFeedPayload = this.buildCatalogFeedPayload.bind(this);
    this.getTimePartsForTimezone = this.getTimePartsForTimezone.bind(this);
    this.copyCatalogProductFeeds = this.copyCatalogProductFeeds.bind(this);
    this.getCatalogFeedSignature = this.getCatalogFeedSignature.bind(this);
    this.requestCatalogFeedUpdateNow =
      this.requestCatalogFeedUpdateNow.bind(this);
  }

  buildCatalogFeedPayload(feed) {
    const { getTimePartsForTimezone } = this;
    const body = pickDefinedFields(feed, [
      "name",
      "file_name",
      "delimiter",
      "encoding",
      "quoted_fields",
      "default_currency",
    ]);
    body.name =
      body.name || feed?.raw?.name || feed?.file_name || "AdReplica feed";
    const schedule = feed?.schedule || feed?.raw?.schedule || null;
    if (schedule && typeof schedule === "object") {
      body.schedule = pickDefinedFields(schedule, [
        "url",
        "uri",
        "interval",
        "hour",
        "minute",
        "day_of_month",
        "day_of_week",
        "timezone",
      ]);
      if (!body.schedule.url && body.schedule.uri) {
        body.schedule.url = body.schedule.uri;
      }
      delete body.schedule.uri;
      if (
        body.schedule.url &&
        body.schedule.interval &&
        body.schedule.hour === undefined &&
        schedule.next_scheduled_update_time
      ) {
        const timeParts = getTimePartsForTimezone(
          Number(schedule.next_scheduled_update_time) * 1000,
          body.schedule.timezone || "UTC",
        );
        if (timeParts) {
          body.schedule.hour = timeParts.hour;
          body.schedule.minute = timeParts.minute;
        }
      }
    }
    return body;
  }

  getTimePartsForTimezone(timestampMs, timezone) {
    if (!Number.isFinite(timestampMs)) {
      return null;
    }
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(timestampMs));
      const hour = Number(parts.find((part) => part.type === "hour")?.value);
      const minute = Number(
        parts.find((part) => part.type === "minute")?.value,
      );
      return Number.isFinite(hour) && Number.isFinite(minute)
        ? { hour, minute }
        : null;
    } catch (_error) {
      return null;
    }
  }

  async copyCatalogProductFeeds(sourceFeeds, targetCatalogId) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { fetchCatalogProductFeeds } = this.dependencies.catalogExporter;
    const {
      buildCatalogFeedPayload,
      getCatalogFeedSignature,
      requestCatalogFeedUpdateNow,
    } = this;
    const feedIdMap = {};
    const existingFeeds = await fetchCatalogProductFeeds(targetCatalogId, {
      suppressEmptyLog: true,
    }).catch(() => []);
    if (!existingFeeds.length) {
      log(
        "info",
        `No reusable target catalog feeds found for ${targetCatalogId}; creating feeds from source export.`,
      );
    }
    const existingFeedBySignature = new Map();
    for (const existing of existingFeeds) {
      const signature = getCatalogFeedSignature(existing);
      if (signature) {
        existingFeedBySignature.set(signature, existing);
      }
    }
    for (const feed of sourceFeeds || []) {
      const payload = buildCatalogFeedPayload(feed);
      if (!payload.schedule?.url) {
        throw new Error(
          `Catalog feed ${payload.name} has no schedule.url in export.`,
        );
      }
      const signature = getCatalogFeedSignature(payload);
      const existing = signature
        ? existingFeedBySignature.get(signature)
        : null;
      if (existing?.id) {
        const targetFeedId = String(existing.id);
        if (feed.id) {
          feedIdMap[String(feed.id)] = targetFeedId;
        }
        log("info", `Reusing catalog feed: ${payload.name} (${targetFeedId}).`);
        await requestCatalogFeedUpdateNow(targetFeedId);
        continue;
      }
      try {
        const created = await graphFetch(`${targetCatalogId}/product_feeds`, {
          method: "POST",
          body: payload,
        });
        const targetFeedId = String(created.id || "");
        if (feed.id) {
          feedIdMap[String(feed.id)] = targetFeedId;
        }
        log("info", `Catalog feed copied: ${payload.name}`);
        if (targetFeedId) {
          await requestCatalogFeedUpdateNow(targetFeedId);
        }
      } catch (error) {
        if (error?.uncertain) throw error;
        log(
          "warn",
          `Catalog feed copy failed: ${payload.name}.`,
          String(error),
        );
        throw error;
      }
    }
    return feedIdMap;
  }

  getCatalogFeedSignature(feed) {
    const name = String(feed?.name || feed?.raw?.name || "")
      .trim()
      .toLowerCase();
    const schedule = feed?.schedule || feed?.raw?.schedule || {};
    const url = String(schedule?.url || schedule?.uri || "").trim();
    return name && url ? `${name}\n${url}` : "";
  }

  async requestCatalogFeedUpdateNow(productFeedId) {
    const { log } = this.dependencies.logging;
    const { getCurrentActorId } = this.dependencies.sessionService;
    const { businessGraphqlRequest } = this.dependencies.privateGraphqlClient;
    const normalizedFeedId = String(productFeedId || "");
    const actorId = String(getCurrentActorId() || "");
    if (!normalizedFeedId || !actorId) {
      return null;
    }
    try {
      const response = await businessGraphqlRequest(
        "24205943975656126",
        "CatalogFeedSchedulesSettingsContainerV2RequestUpdateMutation",
        {
          input: {
            actor_id: actorId,
            client_mutation_id: String(Date.now()),
            product_feed_id: normalizedFeedId,
            schedule_type: "REPLACE",
          },
        },
      );
      log("info", `Catalog feed update requested: ${normalizedFeedId}.`);
      return response;
    } catch (error) {
      if (error?.uncertain) throw error;
      log(
        "warn",
        `Catalog feed update request failed for ${normalizedFeedId}.`,
        String(error),
      );
      return null;
    }
  }
}
