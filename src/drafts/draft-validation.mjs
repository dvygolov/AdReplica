import {
  ensureDraftCreativeDestinationSpec,
  filterDraftFragmentsForTransaction,
  getDraftValue,
  setDraftValue,
} from "../domain/draft-values.mjs";
import { deepClone, sleep } from "../utils/object.mjs";
import { normalizeDraftId } from "../domain/ids.mjs";
import { synchronizeCreativeIdentityFields } from "../domain/creative.mjs";
import { waitForCondition } from "../domain/wait.mjs";

/** DraftValidation. Dependencies are supplied by the application composition root. */
export class DraftValidation {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getAffectedDraftIdentityFragment =
      this.getAffectedDraftIdentityFragment.bind(this);
    this.ensureDraftInstagramIdentityParity =
      this.ensureDraftInstagramIdentityParity.bind(this);
    this.logDraftValidation = this.logDraftValidation.bind(this);
  }

  getAffectedDraftIdentityFragment(fragment, draftAdContext = null) {
    if (!fragment || String(fragment.ad_object_type || "") !== "ad") {
      return null;
    }
    const creative = deepClone(
      getDraftValue(fragment.values, "creative") || null,
    );
    if (!creative || typeof creative !== "object") {
      return null;
    }
    const osp = creative.object_story_spec || {};
    const fragmentAdObjectId = String(fragment.ad_object_id || "");
    const fragmentAdName = String(getDraftValue(fragment.values, "name") || "")
      .trim()
      .toLowerCase();
    const fragmentTempId = String(
      getDraftValue(fragment.values, "tempID") || "",
    );
    let context = null;
    if (draftAdContext instanceof Map) {
      const uniqueContexts = [
        ...new Map(
          [...draftAdContext.values()].map((item) => [
            `${String(item?.adId || "")}|${String(item?.adName || "")
              .trim()
              .toLowerCase()}`,
            item,
          ]),
        ).values(),
      ];
      context =
        draftAdContext.get(`id:${fragmentAdObjectId}`) ||
        draftAdContext.get(`name:${fragmentAdName}`) ||
        draftAdContext.get(`temp:${fragmentTempId}`) ||
        (uniqueContexts.length === 1 ? uniqueContexts[0] : null) ||
        null;
    }
    const pageId = String(osp.page_id || context?.pageId || "");
    if (!pageId) {
      return null;
    }
    const needsActorId = !String(osp.instagram_actor_id || "");
    const needsDestinationSpec =
      Boolean(creative.asset_feed_spec) &&
      !creative.destination_spec?.native_commerce_experience?.shop
        ?.action_metadata;
    if (!needsActorId && !needsDestinationSpec) {
      return null;
    }
    return {
      fragmentId: String(fragment.id || ""),
      adId: String(fragment.ad_object_id || ""),
      adsetId: String(
        fragment.parent_ad_object_id ||
          getDraftValue(fragment.values, "adset_id") ||
          "",
      ),
      campaignId: String(getDraftValue(fragment.values, "campaign_id") || ""),
      pageId,
      adName: String(
        getDraftValue(fragment.values, "name") ||
          fragment.ad_object_id ||
          fragment.id ||
          "draft ad",
      ),
      creative,
      needsActorId,
      needsDestinationSpec,
    };
  }

  async ensureDraftInstagramIdentityParity(
    accountId,
    draftId,
    draftAdContext = null,
    draftTransaction = null,
  ) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const {
      getPageIdentityHint,
      ensurePageIdentityProfiles,
      applyInstagramIdentity,
    } = this.dependencies.identityService;
    const { getAffectedDraftIdentityFragment } = this;
    const { fetchCurrentDraftDetails, updateDraftIdentityFragment } =
      this.dependencies.draftRepository;
    const summary = {
      draftId: normalizeDraftId(draftId),
      initialAffectedCount: 0,
      pageIdsNeedingHints: [],
      updatedCount: 0,
      unresolvedCount: 0,
    };
    const initialDraft = await fetchCurrentDraftDetails(accountId, draftId);
    if (!initialDraft) {
      state.lastDraftIdentityRepair = summary;
      return summary;
    }
    const collectAffected = (draft) =>
      filterDraftFragmentsForTransaction(
        draft?.addraft_fragments?.data || [],
        draftTransaction,
      )
        .map((fragment) =>
          getAffectedDraftIdentityFragment(fragment, draftAdContext),
        )
        .filter(Boolean);
    let workingDraft = initialDraft;
    let initialAffected = collectAffected(workingDraft);
    if (
      !initialAffected.length &&
      draftAdContext instanceof Map &&
      draftAdContext.size
    ) {
      try {
        initialAffected = await waitForCondition(
          `Draft identity fragments for ${summary.draftId}`,
          async () => {
            const refreshedDraft = await fetchCurrentDraftDetails(
              accountId,
              draftId,
            );
            const affected = collectAffected(refreshedDraft);
            if (affected.length) {
              workingDraft = refreshedDraft;
              return affected;
            }
            return false;
          },
          20000,
          1500,
        );
      } catch (_error) {
        initialAffected = [];
      }
    }
    summary.initialAffectedCount = initialAffected.length;
    if (!initialAffected.length) {
      state.lastDraftIdentityRepair = summary;
      return summary;
    }

    const pageIdsNeedingHints = [
      ...new Set(
        initialAffected
          .filter(
            (item) =>
              item.needsActorId &&
              !getPageIdentityHint(item.pageId)?.instagramActorId,
          )
          .map((item) => item.pageId),
      ),
    ];
    summary.pageIdsNeedingHints = [...pageIdsNeedingHints];

    for (const pageId of pageIdsNeedingHints) {
      try {
        await ensurePageIdentityProfiles(
          pageId,
          `draft ${summary.draftId}`,
          accountId,
        );
      } catch (error) {
        log(
          "warn",
          `Failed to ensure page-backed Instagram identity for page ${pageId}.`,
          String(error),
        );
      }
    }

    const draft = await fetchCurrentDraftDetails(accountId, draftId);
    if (!draft) {
      state.lastDraftIdentityRepair = summary;
      return summary;
    }

    let updatedCount = 0;
    let unresolvedCount = 0;
    const scopedFragments = filterDraftFragmentsForTransaction(
      draft.addraft_fragments?.data || [],
      draftTransaction,
    );
    for (const fragment of scopedFragments) {
      const affected = getAffectedDraftIdentityFragment(
        fragment,
        draftAdContext,
      );
      if (!affected) {
        continue;
      }
      const creative = deepClone(affected.creative);
      const osp = creative.object_story_spec || {};
      const identity = await applyInstagramIdentity(
        osp,
        affected.pageId,
        affected.adName,
        accountId,
      );
      creative.object_story_spec = osp;
      synchronizeCreativeIdentityFields(creative, osp);
      const savedHint = getPageIdentityHint(affected.pageId);
      const fallbackDestinationSpec = savedHint?.destinationSpec || null;
      const destinationChanged = ensureDraftCreativeDestinationSpec(
        creative,
        fallbackDestinationSpec,
      );
      const actorResolved = Boolean(
        identity?.instagramActorId ||
        creative.object_story_spec?.instagram_actor_id,
      );
      const stillNeedsActorId = affected.needsActorId && !actorResolved;
      const stillNeedsDestinationSpec =
        affected.needsDestinationSpec &&
        !creative.destination_spec?.native_commerce_experience?.shop
          ?.action_metadata;
      if (stillNeedsActorId || stillNeedsDestinationSpec) {
        unresolvedCount += 1;
        continue;
      }
      const nextValues = setDraftValue(fragment.values, "creative", creative);
      await updateDraftIdentityFragment(
        accountId,
        draftId,
        fragment,
        nextValues,
      );
      updatedCount += 1;
      if (destinationChanged || affected.needsActorId) {
        log("info", `Updated draft identity for ${affected.adName}.`);
      }
    }

    if (updatedCount) {
      await sleep(1500);
    }
    summary.updatedCount = updatedCount;
    summary.unresolvedCount = unresolvedCount;
    state.lastDraftIdentityRepair = summary;
    return summary;
  }

  async logDraftValidation(accountId, draftId, draftTransaction = null) {
    const { log } = this.dependencies.logging;
    const { fetchCurrentDraftDetails } = this.dependencies.draftRepository;
    try {
      const normalizedDraftId = normalizeDraftId(draftId);
      let draft = await fetchCurrentDraftDetails(accountId, draftId);
      for (let attempt = 0; attempt < 4; attempt++) {
        const current = filterDraftFragmentsForTransaction(
          draft?.addraft_fragments?.data || [],
          draftTransaction,
        );
        if (
          current.length >= (draftTransaction?.tempIds?.size || 1) &&
          current.every((item) =>
            ["VALIDATED", "HAS_ERRORS"].includes(item.validation_status),
          )
        )
          break;
        await sleep(1500);
        draft = await fetchCurrentDraftDetails(accountId, draftId);
      }
      if (!draft) {
        log(
          "warn",
          `Draft ${normalizedDraftId} not found in current_addrafts after import.`,
        );
        return { invalid: 0, pending: true, count: 0 };
      }
      const fragments = filterDraftFragmentsForTransaction(
        draft.addraft_fragments?.data || [],
        draftTransaction,
      );
      if (
        draftTransaction?.tempIds instanceof Set &&
        draftTransaction.tempIds.size &&
        !fragments.length
      ) {
        log(
          "warn",
          `Draft ${normalizedDraftId} current import fragments were not visible during validation.`,
        );
        return { invalid: 0, pending: true, count: 0 };
      }
      const invalid = fragments
        .filter(
          (fragment) =>
            fragment.validation_status === "HAS_ERRORS" ||
            (Array.isArray(fragment.active_errors) &&
              fragment.active_errors.length) ||
            fragment.publish_error,
        )
        .map((fragment) => ({
          id: fragment.id,
          ad_object_type: fragment.ad_object_type,
          ad_object_id: fragment.ad_object_id,
          validation_status: fragment.validation_status,
          active_errors: fragment.active_errors || [],
          publish_error: fragment.publish_error || null,
        }));
      const pending =
        fragments.length < (draftTransaction?.tempIds?.size || 1) ||
        fragments.some(
          (item) =>
            !["VALIDATED", "HAS_ERRORS"].includes(item.validation_status),
        );
      if (invalid.length) {
        log(
          "warn",
          `Draft ${normalizedDraftId} current import has ${invalid.length} invalid fragments.`,
          invalid,
        );
      } else if (!pending) {
        log(
          "info",
          `Draft ${normalizedDraftId} current import validated without fragment errors (${fragments.length} fragments).`,
        );
      }
      return {
        invalid: invalid.length,
        pending,
        count: fragments.length,
        errors: invalid,
      };
    } catch (error) {
      log(
        "warn",
        `Failed to inspect draft validation for ${draftId}.`,
        String(error),
      );
      return { invalid: 0, pending: true, count: 0, error: String(error) };
    }
  }
}
