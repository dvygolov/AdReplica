import { normalizeAccountId, normalizeDraftId } from "../domain/ids.mjs";
import {
  formatGraphDraftTimestamp,
  getDraftValue,
} from "../domain/draft-values.mjs";

/** DraftRepository. Dependencies are supplied by the application composition root. */
export class DraftRepository {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.sortDraftFragmentsForDeletion =
      this.sortDraftFragmentsForDeletion.bind(this);
    this.fetchCurrentDrafts = this.fetchCurrentDrafts.bind(this);
    this.clearDraftsForAccount = this.clearDraftsForAccount.bind(this);
    this.getCurrentDraftId = this.getCurrentDraftId.bind(this);
    this.fetchCurrentDraftDetails = this.fetchCurrentDraftDetails.bind(this);
    this.updateDraftIdentityFragment =
      this.updateDraftIdentityFragment.bind(this);
  }

  sortDraftFragmentsForDeletion(fragments) {
    const rank = {
      ad: 0,
      ad_set: 1,
      adset: 1,
      campaign: 2,
      campaign_group: 3,
    };
    return [...(fragments || [])].sort((left, right) => {
      const leftRank = rank[String(left?.ad_object_type || "")] ?? 9;
      const rightRank = rank[String(right?.ad_object_type || "")] ?? 9;
      return leftRank - rightRank;
    });
  }

  async fetchCurrentDrafts(accountId) {
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    const current = await graphFetch(`act_${accountId}/current_addrafts`, {
      query: {
        fields: "id,state,publish_status{status,error_count,publish_error}",
        limit: 100,
      },
    });
    const drafts = [];
    for (const draft of current.data || []) {
      const draftId = normalizeDraftId(draft.id);
      if (!draftId) {
        continue;
      }
      const fragments = await graphGetAll(`${draftId}/addraft_fragments`, {
        fields: [
          "id",
          "ad_object_type",
          "ad_object_id",
          "parent_ad_object_id",
          "validation_status",
          "active_errors",
          "publish_error",
        ].join(","),
        limit: 500,
      });
      drafts.push({
        ...draft,
        id: draftId,
        fragments,
      });
    }
    return drafts;
  }

  async clearDraftsForAccount(accountId) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { sortDraftFragmentsForDeletion, fetchCurrentDrafts } = this;
    const normalizedAccountId = normalizeAccountId(accountId);
    if (!normalizedAccountId) {
      throw new Error("No ad account selected for draft cleanup.");
    }
    const drafts = await fetchCurrentDrafts(normalizedAccountId);
    const summary = {
      accountId: normalizedAccountId,
      draftCount: drafts.length,
      fragmentCount: drafts.reduce(
        (count, draft) => count + draft.fragments.length,
        0,
      ),
      deletedCount: 0,
      failedCount: 0,
    };
    for (const draft of drafts) {
      const fragments = sortDraftFragmentsForDeletion(draft.fragments);
      for (const fragment of fragments) {
        if (!fragment?.id) {
          continue;
        }
        try {
          await graphFetch(fragment.id, { method: "DELETE" });
          summary.deletedCount += 1;
        } catch (error) {
          summary.failedCount += 1;
          log(
            "warn",
            `Draft fragment delete failed: ${fragment.id}.`,
            String(error),
          );
        }
      }
    }
    const remainingDrafts = await fetchCurrentDrafts(normalizedAccountId);
    const remainingFragments = remainingDrafts.reduce(
      (count, draft) => count + draft.fragments.length,
      0,
    );
    if (summary.failedCount || remainingFragments) {
      throw new Error(
        `Draft cleanup incomplete: deleted ${summary.deletedCount}/${summary.fragmentCount}, ` +
          `${remainingFragments} fragment${remainingFragments === 1 ? "" : "s"} still visible.`,
      );
    }
    return summary;
  }

  async getCurrentDraftId(accountId) {
    const { log } = this.dependencies.logging;
    const { getDraftApplicationId } = this.dependencies.sessionService;
    const { graphFetch } = this.dependencies.graphClient;
    const current = await graphFetch(`act_${accountId}/current_addrafts`, {
      query: { fields: "api_version" },
    });
    if (current.data?.[0]?.id) {
      const draftId = normalizeDraftId(current.data[0].id);
      log("info", `Reusing active draft ${draftId}.`);
      return draftId;
    }
    const created = await graphFetch(`act_${accountId}/addrafts`, {
      method: "POST",
      body: {
        name: "Imported draft",
        application_id: getDraftApplicationId(),
        ownership_type: "USER",
        use_active_draft_if_exists: true,
      },
    });
    const draftId = normalizeDraftId(created.id);
    log("info", `Created active draft ${draftId}.`);
    return draftId;
  }

  async fetchCurrentDraftDetails(accountId, draftId) {
    const { graphFetch, graphGetAll } = this.dependencies.graphClient;
    const normalizedDraftId = normalizeDraftId(draftId);
    const current = await graphFetch(`act_${accountId}/current_addrafts`, {
      query: {
        fields: [
          "id",
          "state",
          "publish_status{status,error_count,publish_error}",
        ].join(","),
      },
    });
    const draft =
      (current.data || []).find(
        (item) => normalizeDraftId(item.id) === normalizedDraftId,
      ) || null;
    if (!draft) {
      return null;
    }
    const fragments = await graphGetAll(
      `${normalizedDraftId}/addraft_fragments`,
      {
        fields:
          "id,ad_object_type,ad_object_id,parent_ad_object_id,validation_status,active_errors,publish_error,values",
        limit: 500,
      },
    );
    return {
      ...draft,
      addraft_fragments: { data: fragments },
    };
  }

  async updateDraftIdentityFragment(accountId, draftId, fragment, values) {
    const { graphFetch } = this.dependencies.graphClient;
    const normalizedDraftId = normalizeDraftId(draftId);
    const now = formatGraphDraftTimestamp(new Date());
    await graphFetch(String(fragment.id), {
      method: "POST",
      body: {
        action: "add",
        id: String(fragment.id),
        ad_draft_id: normalizedDraftId,
        account_id: accountId,
        ad_object_id: String(fragment.ad_object_id || ""),
        ad_object_type: String(fragment.ad_object_type || ""),
        parent_ad_object_id: String(
          fragment.parent_ad_object_id ||
            getDraftValue(values, "parentAdObjectID") ||
            "",
        ),
        draft_version: 1,
        fragment_version: 1,
        source: "NONE",
        status: "EDITING",
        include_headers: false,
        suppress_http_code: 1,
        validate: false,
        time_created: now,
        time_updated: now,
        values,
      },
    });
  }
}
