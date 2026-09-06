import { normalizeAccountId, normalizeDraftId } from "../domain/ids.mjs";
import {
  filterDraftFragmentsForTransaction,
  getDraftValue,
} from "../domain/draft-values.mjs";
import { sleep } from "../utils/object.mjs";
import { isTransientNetworkFetchError } from "../domain/graph-errors.mjs";

/** DraftRecovery. Dependencies are supplied by the application composition root. */
export class DraftRecovery {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.rollbackDraftImport = this.rollbackDraftImport.bind(this);
    this.normalizeDraftObjectType = this.normalizeDraftObjectType.bind(this);
    this.findDraftFragmentByTempId = this.findDraftFragmentByTempId.bind(this);
    this.recoverCreatedDraftFragment =
      this.recoverCreatedDraftFragment.bind(this);
    this.createDraftFragmentWithRecovery =
      this.createDraftFragmentWithRecovery.bind(this);
  }

  async rollbackDraftImport(accountId, draftId, draftTransaction) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { sortDraftFragmentsForDeletion, fetchCurrentDraftDetails } =
      this.dependencies.draftRepository;
    const normalizedAccountId = normalizeAccountId(accountId);
    const normalizedDraftId = normalizeDraftId(draftId);
    const summary = {
      draftId: normalizedDraftId,
      ownedCount: 0,
      deletedCount: 0,
      failedFragmentIds: [],
      remainingFragmentIds: [],
    };
    if (
      !(draftTransaction?.tempIds instanceof Set) ||
      !draftTransaction.tempIds.size
    ) {
      return summary;
    }
    if (
      draftTransaction.accountId !== normalizedAccountId ||
      draftTransaction.draftId !== normalizedDraftId
    ) {
      throw new Error(
        "Draft import rollback target does not match the active transaction.",
      );
    }

    const seenFragmentIds = new Set();
    const deletedFragmentIds = new Set();
    const failedFragmentIds = new Set();
    for (const delayMs of [0, 1000, 2000]) {
      if (delayMs) {
        await sleep(delayMs);
      }
      const draft = await fetchCurrentDraftDetails(
        normalizedAccountId,
        normalizedDraftId,
      );
      const ownedFragments = filterDraftFragmentsForTransaction(
        draft?.addraft_fragments?.data || [],
        draftTransaction,
      );
      for (const fragment of sortDraftFragmentsForDeletion(ownedFragments)) {
        const fragmentId = String(fragment?.id || "");
        if (!fragmentId || deletedFragmentIds.has(fragmentId)) {
          continue;
        }
        seenFragmentIds.add(fragmentId);
        try {
          await graphFetch(fragmentId, { method: "DELETE" });
          deletedFragmentIds.add(fragmentId);
          failedFragmentIds.delete(fragmentId);
        } catch (error) {
          failedFragmentIds.add(fragmentId);
          log(
            "warn",
            `Draft import rollback failed for fragment ${fragmentId}.`,
            String(error),
          );
        }
      }
    }

    summary.ownedCount = seenFragmentIds.size;
    summary.deletedCount = deletedFragmentIds.size;
    summary.failedFragmentIds = [...failedFragmentIds];
    const remainingDraft = await fetchCurrentDraftDetails(
      normalizedAccountId,
      normalizedDraftId,
    );
    summary.remainingFragmentIds = filterDraftFragmentsForTransaction(
      remainingDraft?.addraft_fragments?.data || [],
      draftTransaction,
    )
      .map((fragment) => String(fragment.id || fragment.ad_object_id || ""))
      .filter(Boolean);
    if (
      summary.failedFragmentIds.length ||
      summary.remainingFragmentIds.length
    ) {
      throw new Error(
        `Draft import rollback incomplete: deleted ${summary.deletedCount}/${summary.ownedCount}; ` +
          `${summary.remainingFragmentIds.length} operation fragment${summary.remainingFragmentIds.length === 1 ? "" : "s"} still visible.`,
      );
    }
    return summary;
  }

  normalizeDraftObjectType(value) {
    const normalized = String(value || "").toLowerCase();
    return normalized === "adset" ? "ad_set" : normalized;
  }

  async findDraftFragmentByTempId(draftId, expected) {
    const { graphGetAll } = this.dependencies.graphClient;
    const { normalizeDraftObjectType } = this;
    const fragments = await graphGetAll(
      `${normalizeDraftId(draftId)}/addraft_fragments`,
      {
        fields: "id,ad_object_type,ad_object_id,parent_ad_object_id,values",
        limit: 500,
      },
    );
    const expectedType = normalizeDraftObjectType(expected.adObjectType);
    const expectedTempId = String(expected.tempId ?? "");
    const expectedParentId = String(expected.parentAdObjectId || "");
    const expectedAccountId = normalizeAccountId(expected.accountId);
    return (
      fragments.find((fragment) => {
        if (
          normalizeDraftObjectType(fragment?.ad_object_type) !== expectedType
        ) {
          return false;
        }
        if (
          String(getDraftValue(fragment?.values, "tempID") ?? "") !==
          expectedTempId
        ) {
          return false;
        }
        const fragmentParentId = String(
          fragment?.parent_ad_object_id ||
            getDraftValue(fragment?.values, "parentAdObjectID") ||
            "",
        );
        if (expectedParentId && fragmentParentId !== expectedParentId) {
          return false;
        }
        const fragmentAccountId = normalizeAccountId(
          getDraftValue(fragment?.values, "account_id"),
        );
        return (
          !expectedAccountId ||
          !fragmentAccountId ||
          fragmentAccountId === expectedAccountId
        );
      }) || null
    );
  }

  async recoverCreatedDraftFragment(draftId, expected) {
    const { log } = this.dependencies.logging;
    const { findDraftFragmentByTempId } = this;
    for (const delayMs of [1000, 2000, 4000]) {
      await sleep(delayMs);
      try {
        const fragment = await findDraftFragmentByTempId(draftId, expected);
        if (fragment?.ad_object_id) {
          return fragment;
        }
      } catch (error) {
        log(
          "warn",
          `Could not verify ${expected.label} draft fragment after an ambiguous network failure.`,
          String(error),
        );
      }
    }
    return null;
  }

  async createDraftFragmentWithRecovery(draftId, body, expected) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { recoverCreatedDraftFragment } = this;
    try {
      return await graphFetch(
        `${normalizeDraftId(draftId)}/addraft_fragments`,
        {
          method: "POST",
          body,
          networkRetryAttempts: 1,
        },
      );
    } catch (error) {
      if (!error?.uncertain && !isTransientNetworkFetchError(error)) {
        throw error;
      }
      log(
        "warn",
        `Network response was lost while creating ${expected.label} draft fragment; checking the draft without repeating the write.`,
        String(error?.message || error || ""),
      );
      const recovered = await recoverCreatedDraftFragment(draftId, expected);
      if (recovered) {
        log(
          "info",
          `Recovered ${expected.label} draft fragment after the network failure: ${recovered.ad_object_id}.`,
        );
        return {
          id: recovered.id,
          ad_object_id: recovered.ad_object_id,
          recovered: true,
        };
      }
      throw error;
    }
  }
}
