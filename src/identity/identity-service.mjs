import { PAGE_IDENTITY_HINTS_KEY } from "../app/constants.mjs";
import { deepClone } from "../utils/object.mjs";
import { PAGE_BACKED_THREADS_MUTATION_DOC_ID } from "../domain/constants.mjs";
import { formatPrivateGraphqlError } from "../domain/graph-errors.mjs";
import { getSourcePageId } from "../domain/creative.mjs";

const PAGE_INSTAGRAM_QUERY_DOC_ID = "26393503750284892";
const PAGE_INSTAGRAM_MUTATION_DOC_ID = "25221386390872351";

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
    this.buildIdentityFromNativeNode =
      this.buildIdentityFromNativeNode.bind(this);
    this.fetchLinkedInstagramIdentity =
      this.fetchLinkedInstagramIdentity.bind(this);
    this.fetchPageIdentitySnapshot = this.fetchPageIdentitySnapshot.bind(this);
    this.inspectSourcePageIdentity = this.inspectSourcePageIdentity.bind(this);
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
      direct || findDeepStringValue(response, ["iguser_v2_id", "ig_user_id"])
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
    if (!normalizedPageId) return "";
    const cache =
      state.pageBackedThreadsProvisionCache instanceof Map
        ? state.pageBackedThreadsProvisionCache
        : new Map();
    state.pageBackedThreadsProvisionCache = cache;
    const cacheKey = `${normalizedAccountId}:${normalizedPageId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

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

  async buildIdentityFromNativeNode(
    node,
    source,
    accountId,
    threadsUserId = "",
  ) {
    const { buildIdentityHintFromInstagramObjectId } = this;
    let instagramUserId = String(node?.id || "");
    let instagramActorId = String(node?.legacy_instagram_user_id || "");
    if (instagramUserId && !instagramActorId) {
      const objectIdentity = await buildIdentityHintFromInstagramObjectId(
        instagramUserId,
        accountId,
      );
      instagramUserId = String(
        objectIdentity?.instagramUserId || instagramUserId,
      );
      instagramActorId = String(objectIdentity?.instagramActorId || "");
    }
    if (!instagramUserId) return null;
    if (
      source === "AdsInstagramUsernameDataManager" &&
      (!instagramActorId || instagramActorId === instagramUserId)
    ) {
      return null;
    }
    return {
      instagramUserId,
      instagramActorId:
        instagramActorId === instagramUserId ? "" : instagramActorId,
      threadsUserId: String(threadsUserId || ""),
      source,
      ...(source === "AdsInstagramUsernameDataManager"
        ? { destinationSpec: this.buildPageBackedDestinationSpec() }
        : {}),
    };
  }

  async fetchLinkedInstagramIdentity(pageId, accountId = "") {
    const { graphFetch } = this.dependencies.graphClient;
    const {
      buildIdentityHintFromInstagramObjectId,
      getIdentityLookupAccountId,
    } = this;
    const normalizedPageId = String(pageId || "");
    const normalizedAccountId = getIdentityLookupAccountId(accountId);
    const fields = [
      "connected_instagram_account",
      "instagram_business_account",
    ];
    const connections = await Promise.all(
      fields.map(async (field) => {
        try {
          const reply = await graphFetch(normalizedPageId, {
            method: "GET",
            query: {
              __aaid: normalizedAccountId,
              fields: `id,${field}{id}`,
            },
            networkRetryAttempts: 1,
            timeoutMs: 20000,
          });
          if (String(reply?.id || "") !== normalizedPageId) {
            throw new Error(`Page ID mismatch while reading ${field}.`);
          }
          if (!Object.prototype.hasOwnProperty.call(reply, field)) {
            return { field, status: "omitted", id: "" };
          }
          if (reply[field] === null) {
            return { field, status: "empty", id: "" };
          }
          const id = String(reply[field]?.id || "");
          if (!/^\d+$/.test(id)) {
            throw new Error(`Invalid linked Instagram ID in ${field}.`);
          }
          return { field, status: "linked", id };
        } catch (error) {
          return { field, status: "unavailable", id: "", error };
        }
      }),
    );
    const linked = connections.filter((item) => item.status === "linked");
    const linkedIds = [...new Set(linked.map((item) => item.id))];
    if (linkedIds.length > 1) {
      throw new Error(
        `Page ${normalizedPageId} returned conflicting linked Instagram IDs.`,
      );
    }
    if (linkedIds.length === 1) {
      const identity = await buildIdentityHintFromInstagramObjectId(
        linkedIds[0],
        normalizedAccountId,
      );
      if (
        !identity?.instagramUserId ||
        identity.instagramUserId !== linkedIds[0] ||
        !identity.instagramActorId ||
        identity.instagramActorId === linkedIds[0]
      ) {
        throw new Error(
          `Linked Instagram ${linkedIds[0]} for Page ${normalizedPageId} did not return a verified identity pair.`,
        );
      }
      identity.source = linked[0].field;
      delete identity.destinationSpec;
      return identity;
    }
    const unavailable = connections.filter(
      (item) => item.status === "unavailable",
    );
    if (unavailable.length) {
      throw new Error(
        `Could not verify linked Instagram for Page ${normalizedPageId}: ${unavailable
          .map((item) => `${item.field}=${item.error?.message || item.error}`)
          .join(", ")}.`,
      );
    }
    return null;
  }

  async fetchPageIdentitySnapshot(pageId, accountId = "") {
    const { privateGraphqlRequest } = this.dependencies.privateGraphqlClient;
    const { findDeepStringValue, buildIdentityFromNativeNode } = this;
    const normalizedPageId = String(pageId || "");
    const response = await privateGraphqlRequest(
      PAGE_INSTAGRAM_QUERY_DOC_ID,
      "AdsPageInstagramAccountStoreSourceServerQuery",
      { ids: [normalizedPageId], skip_ibta: false, skip_pbta: false },
      { allowPartialErrors: true },
    );
    let page = null;
    for (const chunk of [response, ...(response?.__chunks || [])]) {
      page = (chunk?.data?.pages || []).find(
        (item) => String(item?.id || "") === normalizedPageId,
      );
      if (page) break;
    }
    if (!page) {
      return {
        pageId: normalizedPageId,
        linked: null,
        pageBacked: null,
        threadsUserId: "",
      };
    }
    const threadsUserId = String(
      page?.page_backed_threads_accounts?.threads_user_id ||
        findDeepStringValue(page?.page_backed_threads_accounts, [
          "threads_user_id",
        ]) ||
        "",
    );
    const linkedNode =
      page?.instagram_business_account ||
      page?.bizlink_instagram_business_account ||
      page?.connected_instagram_account ||
      page?.instagram_accounts?.nodes?.[0] ||
      null;
    const linkedSource =
      page?.instagram_business_account ||
      page?.bizlink_instagram_business_account
        ? "instagram_business_account"
        : "connected_instagram_account";
    const linked = await buildIdentityFromNativeNode(
      linkedNode,
      linkedSource,
      accountId,
      threadsUserId,
    );
    const pageBackedNode =
      page?.page_backed_instagram_accounts?.nodes?.[0] || null;
    const pageBacked = await buildIdentityFromNativeNode(
      pageBackedNode,
      "AdsInstagramUsernameDataManager",
      accountId,
      threadsUserId,
    );
    return { pageId: normalizedPageId, linked, pageBacked, threadsUserId };
  }

  async inspectSourcePageIdentity(pageId, accountId = "") {
    const { fetchPageIdentitySnapshot } = this;
    const snapshot = await fetchPageIdentitySnapshot(pageId, accountId);
    return {
      pageId: String(pageId || ""),
      type: snapshot.linked
        ? "linked"
        : snapshot.pageBacked
          ? "page-backed"
          : "none",
      hasLinkedInstagram: Boolean(snapshot.linked),
      hasPageBackedInstagram: Boolean(snapshot.pageBacked),
      hasThreadsIdentity: Boolean(snapshot.threadsUserId),
    };
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
      savedHint?.instagramUserId &&
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
      fetchLinkedInstagramIdentity,
      fetchPageIdentitySnapshot,
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
      const useIdentityHint = (identityHint) => {
        if (identityHint.threadsUserId) {
          page.threadsUserId = identityHint.threadsUserId;
        }
        page.instagramIdentity = {
          instagramUserId: String(identityHint.instagramUserId || ""),
          instagramActorId: String(identityHint.instagramActorId || ""),
          threadsUserId: String(
            identityHint.threadsUserId || page.threadsUserId || "",
          ),
          source: identityHint.source,
        };
        savePageIdentityHint(normalizedPageId, identityHint);
        return page.instagramIdentity;
      };
      try {
        const linkedIdentity = await fetchLinkedInstagramIdentity(
          normalizedPageId,
          normalizedAccountId,
        );
        if (linkedIdentity) {
          log(
            "info",
            `Using linked Instagram identity for target page ${normalizedPageId}.`,
          );
          return useIdentityHint(linkedIdentity);
        }
        let snapshot = null;
        try {
          snapshot = await fetchPageIdentitySnapshot(
            normalizedPageId,
            normalizedAccountId,
          );
        } catch (error) {
          log(
            "info",
            `Native identity lookup failed for page ${normalizedPageId}; trying PBIA provisioning.`,
            formatPrivateGraphqlError(error),
          );
        }
        if (snapshot?.linked) {
          log(
            "info",
            `Using linked Instagram identity for target page ${normalizedPageId}.`,
          );
          return useIdentityHint(snapshot.linked);
        }
        if (snapshot?.pageBacked) {
          log(
            "info",
            `Using existing page-backed Instagram identity for target page ${normalizedPageId}.`,
          );
          return useIdentityHint(snapshot.pageBacked);
        }

        const response = await privateGraphqlMutation(
          PAGE_INSTAGRAM_MUTATION_DOC_ID,
          "AdsPageInstagramAccountMutation",
          { page_id: normalizedPageId },
        );
        const returnedInstagramId =
          extractPageBackedInstagramObjectId(response);
        let identityHint = returnedInstagramId
          ? await buildIdentityHintFromInstagramObjectId(
              returnedInstagramId,
              normalizedAccountId,
            )
          : null;
        if (identityHint) {
          identityHint.threadsUserId ||= snapshot?.threadsUserId || "";
          return useIdentityHint(identityHint);
        }

        // A definite empty mutation response can still mean that Meta created
        // the identity but omitted it from the response. Re-read before failing.
        snapshot = await fetchPageIdentitySnapshot(
          normalizedPageId,
          normalizedAccountId,
        );
        if (snapshot?.pageBacked) {
          return useIdentityHint(snapshot.pageBacked);
        }
        throw new Error(
          returnedInstagramId
            ? `PBIA instagram_object ${returnedInstagramId} did not return distinct id and legacy_instagram_user_id.`
            : "PBIA mutation did not return iguser_v2_id, and the page re-read found no PBIA.",
        );
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
    if (
      (existingInstagramUserId || existingInstagramActorId) &&
      !identity.instagramUserId
    ) {
      throw new Error(
        `Page ${pageId} has neither a linked nor a page-backed Instagram identity for ${itemName || "this creative"}; source identity IDs are never reused.`,
      );
    }
    if (identity.instagramUserId) {
      osp.instagram_user_id = identity.instagramUserId;
    } else {
      delete osp.instagram_user_id;
    }
    if (identity.instagramActorId) {
      osp.instagram_actor_id = identity.instagramActorId;
    } else {
      delete osp.instagram_actor_id;
    }

    let targetThreadsUserId = "";
    if (needsThreadsIdentity) {
      // Prefer the Threads ID attached to the resolved PBIA. Some pages omit it
      // from that object, so provision the page-backed Threads profile as a
      // fallback instead of failing an otherwise valid catalog clone.
      targetThreadsUserId = String(identity.threadsUserId || "");
      if (!targetThreadsUserId) {
        targetThreadsUserId = await ensurePageBackedThreadsIdentity(
          pageId,
          itemName,
          accountId,
        );
      }
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
    const hasUsableInstagramIdentity = Boolean(osp.instagram_user_id);
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
