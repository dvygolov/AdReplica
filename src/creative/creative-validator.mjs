import {
  creativePayloadHasVideo,
  getGraphErrorSubcode,
  isDirectAdCreativeGateError,
  isImageNotFoundError,
  isVideoNotReadyError,
} from "../domain/graph-errors.mjs";
import { sleep } from "../utils/object.mjs";
import {
  buildCreativeValidationPayload,
  resolveMutuallyExclusiveStoryImageFields,
} from "../domain/creative.mjs";

/** CreativeValidator. Dependencies are supplied by the application composition root. */
export class CreativeValidator {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.createCreativeByPostId = this.createCreativeByPostId.bind(this);
    this.validateObjectStorySpecCreative =
      this.validateObjectStorySpecCreative.bind(this);
    this.createAdCreativeWithRetries =
      this.createAdCreativeWithRetries.bind(this);
    this.validateDraftCreativePayload =
      this.validateDraftCreativePayload.bind(this);
  }

  async createCreativeByPostId(accountId, creative) {
    const { graphFetch } = this.dependencies.graphClient;
    const json = await graphFetch(`act_${accountId}/adcreatives`, {
      method: "POST",
      body: {
        name: creative.name,
        object_story_id: creative.raw.object_story_id,
      },
    });
    return String(json.id);
  }

  async validateObjectStorySpecCreative(
    accountId,
    creativeName,
    body,
    options = {},
  ) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const retryVideoNotReady = Boolean(options.retryVideoNotReady);
    for (let attempt = 1; attempt <= 18; attempt += 1) {
      try {
        await graphFetch(`act_${accountId}/adcreatives`, {
          method: "POST",
          body: {
            ...body,
            execution_options: ["validate_only"],
          },
        });
        return true;
      } catch (error) {
        const subcode = getGraphErrorSubcode(error);
        if (subcode === 1487194) {
          log(
            "warn",
            `Creative ${creativeName} skipped: target page cannot create this object_story_spec creative (1487194).`,
          );
          return false;
        }
        if (isImageNotFoundError(error)) {
          if (attempt === 18) {
            throw new Error(
              `Creative ${creativeName} image never became available for validate_only.`,
            );
          }
          log(
            "warn",
            `Creative ${creativeName} image is not available for validate_only yet, waiting 5s...`,
          );
          await sleep(5000);
          continue;
        }
        if (retryVideoNotReady && isVideoNotReadyError(error)) {
          if (attempt >= 12) {
            throw new Error(
              `Video creative ${creativeName} never became ready for validate_only.`,
            );
          }
          log(
            "warn",
            `Creative ${creativeName} not ready for validate_only yet, waiting 30s...`,
          );
          await sleep(30000);
          continue;
        }
        throw error;
      }
    }
    return false;
  }

  async createAdCreativeWithRetries(accountId, creativeName, body) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { validateObjectStorySpecCreative } = this;
    resolveMutuallyExclusiveStoryImageFields(body);
    const retryVideoNotReady = creativePayloadHasVideo(body);
    if (
      !(await validateObjectStorySpecCreative(accountId, creativeName, body, {
        retryVideoNotReady,
      }))
    ) {
      return null;
    }

    for (let attempt = 1; attempt <= 18; attempt += 1) {
      try {
        const json = await graphFetch(`act_${accountId}/adcreatives`, {
          method: "POST",
          body,
        });
        return String(json.id);
      } catch (error) {
        if (isImageNotFoundError(error)) {
          if (attempt === 18) {
            throw new Error(
              `Creative ${creativeName} image never became available for adcreative.`,
            );
          }
          log(
            "warn",
            `Creative ${creativeName} image is not available for adcreative yet, waiting 5s...`,
          );
          await sleep(5000);
          continue;
        }
        if (!retryVideoNotReady || !isVideoNotReadyError(error)) {
          throw error;
        }
        if (attempt >= 12) {
          throw new Error(
            `Video creative ${creativeName} never became ready for adcreative.`,
          );
        }
        log(
          "warn",
          `Creative ${creativeName} not ready for adcreative yet, waiting 30s...`,
        );
        await sleep(30000);
      }
    }
    return null;
  }

  async validateDraftCreativePayload(
    accountId,
    creativeName,
    payload,
    options = {},
  ) {
    const { log } = this.dependencies.logging;
    const { validateObjectStorySpecCreative } = this;
    if (!payload || typeof payload !== "object") {
      return true;
    }
    if (payload.object_story_id) {
      return true;
    }
    if (payload.product_set_id && payload.object_story_spec?.template_data) {
      log(
        "info",
        `Skipping validate_only for catalog draft creative ${creativeName}: product_set_id payload is validated by draft fragment flow.`,
      );
      return true;
    }
    if (!payload.object_story_spec && !payload.asset_feed_spec) {
      return true;
    }
    const validationPayload = buildCreativeValidationPayload(
      payload,
      creativeName,
    );
    if (!validationPayload) {
      return true;
    }
    try {
      return await validateObjectStorySpecCreative(
        accountId,
        creativeName,
        validationPayload,
        {
          retryVideoNotReady:
            Boolean(options.forceVideoRetry) ||
            creativePayloadHasVideo(payload),
        },
      );
    } catch (error) {
      if (isDirectAdCreativeGateError(error)) {
        log(
          "warn",
          `Skipping validate_only for draft creative ${creativeName}: Meta blocked direct adcreative validation with neko_direct_api_enable. Continuing with addraft_fragments flow.`,
        );
        return true;
      }
      throw error;
    }
  }
}
