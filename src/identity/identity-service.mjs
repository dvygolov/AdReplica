import { PAGE_IDENTITY_HINTS_KEY } from "../app/constants.mjs";
import { deepClone } from "../utils/object.mjs";
import { PAGE_BACKED_THREADS_MUTATION_DOC_ID } from "../domain/constants.mjs";
import { formatPrivateGraphqlError } from "../domain/graph-errors.mjs";
import { getSourcePageId } from "../domain/creative.mjs";

/** IdentityService. Dependencies are supplied by the application composition root. */
export class IdentityService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.loadPageIdentityHints = this.loadPageIdentityHints.bind(this);
    this.getPageIdentityHint = this.getPageIdentityHint.bind(this);
    this.savePageIdentityHint = this.savePageIdentityHint.bind(this);
    this.getIdentityLookupAccountId =
      this.getIdentityLookupAccountId.bind(this);
    this.getBusinessIdFromLocation = this.getBusinessIdFromLocation.bind(this);
    this.buildPageBackedDestinationSpec =
      this.buildPageBackedDestinationSpec.bind(this);
    this.fetchAdsManagerInstagramObjectRecord =
      this.fetchAdsManagerInstagramObjectRecord.bind(this);
    this.buildIdentityHintFromInstagramObject =
      this.buildIdentityHintFromInstagramObject.bind(this);
    this.findDeepStringValue = this.findDeepStringValue.bind(this);
    this.extractPageBackedInstagramObjectId =
      this.extractPageBackedInstagramObjectId.bind(this);
    this.extractPageBackedThreadsUserId =
      this.extractPageBackedThreadsUserId.bind(this);
    this.ensurePageBackedThreadsIdentity =
      this.ensurePageBackedThreadsIdentity.bind(this);
    this.buildIdentityHintFromInstagramObjectId =
      this.buildIdentityHintFromInstagramObjectId.bind(this);
    this.getKnownPageRecord = this.getKnownPageRecord.bind(this);
    this.fetchInstagramIdentityForPageRecord =
      this.fetchInstagramIdentityForPageRecord.bind(this);
    this.resetPageIdentityProvisionCache =
      this.resetPageIdentityProvisionCache.bind(this);
    this.ensurePageIdentityProfiles =
      this.ensurePageIdentityProfiles.bind(this);
    this.resolveInstagramIdentityForPage =
      this.resolveInstagramIdentityForPage.bind(this);
    this.applyInstagramIdentity = this.applyInstagramIdentity.bind(this);
    this.preflightImportCreativeIdentities =
      this.preflightImportCreativeIdentities.bind(this);
  }

  loadPageIdentityHints() {
    const { state } = this.dependencies;
    if (state.pageIdentityHints) {
      return state.pageIdentityHints;
    }
    try {
      const raw = window.localStorage.getItem(PAGE_IDENTITY_HINTS_KEY);
      state.pageIdentityHints = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      state.pageIdentityHints = {};
    }
    return state.pageIdentityHints;
  }

  getPageIdentityHint(pageId) {
    const { loadPageIdentityHints } = this;
    const hints = loadPageIdentityHints();
    return hints[String(pageId || "")] || null;
  }

  savePageIdentityHint(pageId, hint) {
    const { loadPageIdentityHints } = this;
    const normalizedPageId = String(pageId || "");
    if (!normalizedPageId || !hint || typeof hint !== "object") {
      return;
    }
    const hints = loadPageIdentityHints();
    hints[normalizedPageId] = {
      ...(hints[normalizedPageId] || {}),
      ...deepClone(hint),
      pageId: normalizedPageId,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(
        PAGE_IDENTITY_HINTS_KEY,
        JSON.stringify(hints),
      );
    } catch (_error) {
      // noop
    }
  }

  getIdentityLookupAccountId(accountId = "") {
    const { state } = this.dependencies;
    return String(
      accountId ||
        state.cloneTargetAccountId ||
        state.importAccountId ||
        state.exportAccountId ||
        state.accounts[0]?.id ||
        "",
    ).replace(/^act_/, "");
  }

  getBusinessIdFromLocation() {
    const params = new URLSearchParams(window.location.search || "");
    return String(
      params.get("business_id") || params.get("global_scope_id") || "",
    ).replace(/^act_/, "");
  }

  buildPageBackedDestinationSpec() {
    return {
      native_commerce_experience: {
        shop: {
          action_metadata: {
            type: "DEFAULT_OFF",
          },
        },
      },
    };
  }

  async fetchAdsManagerInstagramObjectRecord(
    instagramObjectId,
    accountId = "",
  ) {
    const { graphFetch } = this.dependencies.graphClient;
    const { getIdentityLookupAccountId } = this;
    const normalizedInstagramObjectId = String(instagramObjectId || "");
    const normalizedAccountId = getIdentityLookupAccountId(accountId);
    if (!normalizedInstagramObjectId || !normalizedAccountId) {
      return null;
    }
    return graphFetch(normalizedInstagramObjectId, {
      apiBase: "https://adsmanager-graph.facebook.com/v22.0/",
      query: {
        __aaid: normalizedAccountId,
        _reqName: "object:instagram_object",
        _reqSrc: "AdsInstagramUsernameDataManager",
        fields: ["id", "legacy_instagram_user_id", "threads_user_id"],
        include_headers: false,
        method: "get",
        pretty: 0,
        suppress_http_code: 1,
      },
    });
  }

  buildIdentityHintFromInstagramObject(instagramObject) {
    const { buildPageBackedDestinationSpec } = this;
    const instagramUserId = String(instagramObject?.id || "");
    const instagramActorId = String(
      instagramObject?.legacy_instagram_user_id || "",
    );
    if (
      !instagramActorId ||
      !instagramUserId ||
      instagramActorId === instagramUserId
    ) {
      return null;
    }
    return {
      instagramUserId,
      instagramActorId,
      threadsUserId: String(instagramObject?.threads_user_id || ""),
      source: "AdsInstagramUsernameDataManager",
      destinationSpec: buildPageBackedDestinationSpec(),
    };
  }

  findDeepStringValue(source, keys, seen = new Set()) {
    const { findDeepStringValue } = this;
    if (!source || typeof source !== "object" || seen.has(source)) {
      return "";
    }
    seen.add(source);
    for (const [key, value] of Object.entries(source)) {
      if (
        keys.includes(key) &&
        value !== null &&
        value !== undefined &&
        typeof value !== "object"
      ) {
        const normalized = String(value || "");
        if (normalized) {
          return normalized;
        }
      }
      if (value && typeof value === "object") {
        const nested = findDeepStringValue(value, keys, seen);
        if (nested) {
          return nested;
        }
      }
    }
    return "";
  }

  extractPageBackedInstagramObjectId(response) {
    const { findDeepStringValue } = this;
    const direct = String(
      response?.data?.xfb_create_page_backed_instagram_accounts?.iguser_v2_id ||
        response?.data?.xfb_create_page_backed_instagram_account
          ?.iguser_v2_id ||
        "",
    );
    return (
      direct ||
      findDeepStringValue(response?.data || response, [
        "iguser_v2_id",
        "ig_user_id",
      ])
    );
  }

  extractPageBackedThreadsUserId(response) {
    const { findDeepStringValue } = this;
    const direct = String(
      response?.data?.xfb_create_page_backed_threads_accounts?.th_user_id ||
        response?.data?.xfb_create_page_backed_threads_account?.th_user_id ||
        "",
    );
    return (
      direct ||
      findDeepStringValue(response?.data || response, [
        "th_user_id",
        "threads_user_id",
      ])
    );
  }

  async ensurePageBackedThreadsIdentity(pageId, itemName = "", accountId = "") {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { businessGraphqlRequest } = this.dependencies.privateGraphqlClient;
    const { getIdentityLookupAccountId, extractPageBackedThreadsUserId } = this;
    const normalizedPageId = String(pageId || "");
    const normalizedAccountId = getIdentityLookupAccountId(accountId);
    if (!normalizedPageId) {
      return "";
    }
    const cache =
      state.pageBackedThreadsProvisionCache instanceof Map
        ? state.pageBackedThreadsProvisionCache
        : new Map();
    state.pageBackedThreadsProvisionCache = cache;
    const cacheKey = `${normalizedAccountId}:${normalizedPageId}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const provisionPromise = (async () => {
      try {
        const response = await businessGraphqlRequest(
          PAGE_BACKED_THREADS_MUTATION_DOC_ID,
          "createAndUsePBTAMutation",
          { page_id: normalizedPageId },
        );
        const threadsUserId = extractPageBackedThreadsUserId(response);
        if (!threadsUserId) {
          throw new Error("PBTA mutation did not return th_user_id.");
        }
        log(
          "info",
          `Page-backed Threads identity ready for page ${normalizedPageId}${itemName ? ` (${itemName})` : ""}.`,
        );
        return threadsUserId;
      } catch (error) {
        if (error?.uncertain) throw error;
        log(
          "warn",
          `Failed to ensure Threads profile for page ${normalizedPageId}${itemName ? ` (${itemName})` : ""}.`,
          formatPrivateGraphqlError(error),
        );
        return "";
      }
    })();
    cache.set(cacheKey, provisionPromise);
    return provisionPromise;
  }

  async buildIdentityHintFromInstagramObjectId(
    instagramObjectId,
    accountId = "",
  ) {
    const {
      fetchAdsManagerInstagramObjectRecord,
      buildIdentityHintFromInstagramObject,
    } = this;
    const instagramObject = await fetchAdsManagerInstagramObjectRecord(
      instagramObjectId,
      accountId,
    );
    return buildIdentityHintFromInstagramObject(instagramObject);
  }

  getKnownPageRecord(pageId) {
    const { state } = this.dependencies;
    const normalizedPageId = String(pageId || "");
    const known =
      state.pages.find((item) => item.id === normalizedPageId) ||
      state.clonePages.find((item) => item.id === normalizedPageId) ||
      (Array.isArray(state.accessiblePagesCache)
        ? state.accessiblePagesCache.find(
            (item) => item.id === normalizedPageId,
          )
        : null);
    if (known) {
      return known;
    }
    return {
      id: normalizedPageId,
      name: normalizedPageId,
      instagramId: "",
      accessToken: "",
      threadsUserId: "",
    };
  }

  async fetchInstagramIdentityForPageRecord(page, accountId = "") {
    const { getPageIdentityHint } = this;
    if (!page) {
      return {
        instagramUserId: "",
        instagramActorId: "",
        threadsUserId: "",
        source: "",
      };
    }
    const savedHint = getPageIdentityHint(page.id);
    if (page.instagramIdentity) {
      return page.instagramIdentity;
    }

    if (
      savedHint?.source === "AdsInstagramUsernameDataManager" &&
      savedHint.instagramUserId &&
      savedHint.instagramActorId &&
      String(savedHint.instagramUserId) !== String(savedHint.instagramActorId)
    ) {
      return {
        instagramUserId: String(savedHint.instagramUserId),
        instagramActorId: String(savedHint.instagramActorId),
        threadsUserId: String(
          savedHint.threadsUserId || page.threadsUserId || "",
        ),
        source: "AdsInstagramUsernameDataManager",
      };
    }

    page.instagramIdentity = {
      instagramUserId: "",
      instagramActorId: "",
      threadsUserId: String(page.threadsUserId || ""),
      source: "",
    };
    return page.instagramIdentity;
  }

  resetPageIdentityProvisionCache() {
    const { state } = this.dependencies;
    state.pageIdentityProvisionCache = new Map();
    state.pageBackedThreadsProvisionCache = new Map();
  }

  async ensurePageIdentityProfiles(pageId, itemName, accountId = "") {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const {
      savePageIdentityHint,
      getIdentityLookupAccountId,
      extractPageBackedInstagramObjectId,
      buildIdentityHintFromInstagramObjectId,
      getKnownPageRecord,
    } = this;
    const { privateGraphqlMutation } = this.dependencies.privateGraphqlClient;
    const normalizedPageId = String(pageId || "");
    const normalizedAccountId = getIdentityLookupAccountId(accountId);
    const page = getKnownPageRecord(normalizedPageId);
    const cache =
      state.pageIdentityProvisionCache instanceof Map
        ? state.pageIdentityProvisionCache
        : new Map();
    state.pageIdentityProvisionCache = cache;
    const cacheKey = `${normalizedAccountId}:${normalizedPageId}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const provisionPromise = (async () => {
      try {
        const response = await privateGraphqlMutation(
          "25221386390872351",
          "AdsPageInstagramAccountMutation",
          {
            page_id: normalizedPageId,
          },
        );
        const returnedInstagramId =
          extractPageBackedInstagramObjectId(response);
        if (!returnedInstagramId) {
          throw new Error("PBIA mutation did not return iguser_v2_id.");
        }

        let identityHint;
        try {
          identityHint = await buildIdentityHintFromInstagramObjectId(
            returnedInstagramId,
            normalizedAccountId,
          );
        } catch (error) {
          if (error?.uncertain) throw error;
          throw new Error(
            `PBIA instagram_object lookup failed for ${returnedInstagramId}: ${formatPrivateGraphqlError(error)}`,
          );
        }
        if (!identityHint) {
          throw new Error(
            `PBIA instagram_object ${returnedInstagramId} did not return distinct id and legacy_instagram_user_id.`,
          );
        }
        if (identityHint.threadsUserId) {
          page.threadsUserId = identityHint.threadsUserId;
        }
        page.instagramIdentity = {
          instagramUserId: String(identityHint.instagramUserId || ""),
          instagramActorId: String(identityHint.instagramActorId || ""),
          threadsUserId: String(
            identityHint.threadsUserId || page.threadsUserId || "",
          ),
          source: "AdsInstagramUsernameDataManager",
        };
        savePageIdentityHint(normalizedPageId, identityHint);
        return page.instagramIdentity;
      } catch (error) {
        if (error?.uncertain) throw error;
        log(
          "warn",
          `Failed to ensure Instagram profile for page ${normalizedPageId}${itemName ? ` (${itemName})` : ""}.`,
          formatPrivateGraphqlError(error),
        );
        page.instagramIdentity = {
          instagramUserId: "",
          instagramActorId: "",
          threadsUserId: String(page.threadsUserId || ""),
          source: "pbia_unavailable",
        };
        return page.instagramIdentity;
      }
    })();
    cache.set(cacheKey, provisionPromise);
    return provisionPromise;
  }

  async resolveInstagramIdentityForPage(pageId, accountId = "") {
    const { getKnownPageRecord, fetchInstagramIdentityForPageRecord } = this;
    const page = getKnownPageRecord(pageId);
    return fetchInstagramIdentityForPageRecord(page, accountId);
  }

  async applyInstagramIdentity(osp, pageId, itemName, accountId = "") {
    const { log } = this.dependencies.logging;
    const {
      savePageIdentityHint,
      ensurePageBackedThreadsIdentity,
      getKnownPageRecord,
      ensurePageIdentityProfiles,
    } = this;
    osp.page_id = pageId;
    const existingInstagramUserId = String(osp.instagram_user_id || "");
    const existingInstagramActorId = String(osp.instagram_actor_id || "");
    const hasThreadsUserIdField = Object.prototype.hasOwnProperty.call(
      osp,
      "threads_user_id",
    );
    const hasThUserIdField = Object.prototype.hasOwnProperty.call(
      osp,
      "th_user_id",
    );
    const needsThreadsIdentity = Boolean(osp.threads_user_id || osp.th_user_id);
    const identity = await ensurePageIdentityProfiles(
      pageId,
      itemName,
      accountId,
    );
    if (identity.instagramUserId) {
      osp.instagram_user_id = identity.instagramUserId;
    } else if (existingInstagramUserId) {
      osp.instagram_user_id = existingInstagramUserId;
    } else {
      delete osp.instagram_user_id;
    }
    if (identity.instagramActorId) {
      osp.instagram_actor_id = identity.instagramActorId;
    } else if (
      existingInstagramActorId &&
      existingInstagramActorId !== existingInstagramUserId
    ) {
      osp.instagram_actor_id = existingInstagramActorId;
    } else {
      delete osp.instagram_actor_id;
    }
    if (
      osp.instagram_actor_id &&
      String(osp.instagram_actor_id) === String(osp.instagram_user_id || "")
    ) {
      delete osp.instagram_actor_id;
    }

    let targetThreadsUserId = "";
    if (needsThreadsIdentity) {
      const provisionedThreadsUserId = await ensurePageBackedThreadsIdentity(
        pageId,
        itemName,
        accountId,
      );
      targetThreadsUserId = String(
        provisionedThreadsUserId || identity.threadsUserId || "",
      );
      if (!targetThreadsUserId) {
        throw new Error(
          `Page ${pageId} requires a page-backed Threads identity for ${itemName || "this creative"}, but provisioning returned no target Threads ID.`,
        );
      }
      const page = getKnownPageRecord(pageId);
      page.threadsUserId = targetThreadsUserId;
      identity.threadsUserId = targetThreadsUserId;
      page.instagramIdentity = identity;
      savePageIdentityHint(pageId, {
        ...identity,
        threadsUserId: targetThreadsUserId,
      });
    }

    delete osp.threads_user_id;
    delete osp.th_user_id;
    if (targetThreadsUserId && hasThreadsUserIdField) {
      osp.threads_user_id = targetThreadsUserId;
    }
    if (targetThreadsUserId && hasThUserIdField) {
      osp.th_user_id = targetThreadsUserId;
    }
    const hasUsableInstagramIdentity =
      Boolean(osp.instagram_user_id) && Boolean(osp.instagram_actor_id);
    if (!hasUsableInstagramIdentity && itemName) {
      log(
        "warn",
        `Page ${pageId} has no accessible Instagram identity for ${itemName}.`,
      );
    }
    return identity;
  }

  async preflightImportCreativeIdentities(accountId, packageData) {
    const { log } = this.dependencies.logging;
    const { applyInstagramIdentity } = this;
    let checked = 0;
    let threadsRequired = 0;
    for (const creative of packageData?.creatives || []) {
      const objectStorySpec = creative?.raw?.object_story_spec;
      const pageId = getSourcePageId(creative);
      if (!objectStorySpec || !pageId) {
        continue;
      }
      if (objectStorySpec.threads_user_id || objectStorySpec.th_user_id) {
        threadsRequired += 1;
      }
      await applyInstagramIdentity(
        deepClone(objectStorySpec),
        pageId,
        creative?.raw?.name || creative?.name || creative?.id || "creative",
        accountId,
      );
      checked += 1;
    }
    log(
      "info",
      `Identity preflight checked ${checked} creative(s), ${threadsRequired} requiring page-backed Threads.`,
    );
  }
}
