import assert from "node:assert/strict";
import { test } from "node:test";
import { IdentityService } from "../src/identity/identity-service.mjs";
import { PrivateGraphqlClient } from "../src/facebook/private-graphql-client.mjs";

const PAGE_ID = "1388097814392191";
const IG_V2 = "17841459749257020";
const IG_ACTOR = "29256697720634360";

function createHarness({
  mutation,
  object,
  savedHint = null,
  threadsMutation,
  reads = [],
} = {}) {
  const state = {
    accounts: [{ id: "account-1" }],
    pages: [{ id: PAGE_ID, name: "Test page" }],
    clonePages: [],
    accessiblePagesCache: [],
    pageIdentityHints: savedHint ? { [PAGE_ID]: savedHint } : {},
  };
  const pendingReads = [...reads];
  const calls = { mutations: 0, objects: 0, threadsMutations: 0 };
  const logs = [];
  const service = new IdentityService({
    state,
    logging: {
      log: (level, message, detail) => logs.push({ level, message, detail }),
    },
    privateGraphqlClient: {
      privateGraphqlRequest: async () => {
        if (!pendingReads.length)
          throw new Error("native identity unavailable");
        return pendingReads.shift();
      },
      privateGraphqlMutation: async () => {
        calls.mutations += 1;
        return mutation();
      },
      businessGraphqlRequest: async () => {
        calls.threadsMutations += 1;
        if (threadsMutation) return threadsMutation();
        throw new Error(
          "PBTA fallback must not run when PBIA returns Threads ID",
        );
      },
    },
    graphClient: {
      graphFetch: async (path) => {
        if (String(path) === PAGE_ID) return { id: PAGE_ID };
        calls.objects += 1;
        return object();
      },
    },
  });
  return { service, state, calls, logs };
}

function successfulHarness(options = {}) {
  return createHarness({
    mutation: () => ({
      __chunks: [
        { data: {} },
        {
          data: {
            xfb_create_page_backed_instagram_accounts: {
              iguser_v2_id: IG_V2,
            },
          },
        },
      ],
    }),
    object: () => ({
      id: IG_V2,
      legacy_instagram_user_id: IG_ACTOR,
      threads_user_id: "threads-2",
    }),
    ...options,
  });
}

function nativePage({ linked = false, pageBacked = false } = {}) {
  const linkedNode = {
    id: "linked-user",
    legacy_instagram_user_id: "linked-actor",
  };
  const pbiaNode = { id: IG_V2, legacy_instagram_user_id: IG_ACTOR };
  return {
    data: {
      pages: [
        {
          id: PAGE_ID,
          ...(linked ? { instagram_business_account: linkedNode } : {}),
          page_backed_instagram_accounts: {
            nodes: pageBacked ? [pbiaNode] : [],
          },
          page_backed_threads_accounts: { threads_user_id: "threads-native" },
        },
      ],
    },
  };
}

test("direct Page fields select linked Instagram even when the native snapshot has no link", async () => {
  const { service, calls } = successfulHarness({
    mutation: () => assert.fail("linked Instagram must not create a PBIA"),
  });
  service.dependencies.graphClient.graphFetch = async (path, options) => {
    if (String(path) === PAGE_ID) {
      if (options.query.fields.includes("connected_instagram_account")) {
        return {
          id: PAGE_ID,
          connected_instagram_account: { id: IG_V2 },
        };
      }
      return { id: PAGE_ID };
    }
    calls.objects += 1;
    return {
      id: IG_V2,
      legacy_instagram_user_id: IG_ACTOR,
      threads_user_id: "",
    };
  };
  const identity = await service.ensurePageIdentityProfiles(
    PAGE_ID,
    "linked direct",
    "account-1",
  );
  assert.equal(identity.instagramUserId, IG_V2);
  assert.equal(identity.instagramActorId, IG_ACTOR);
  assert.equal(identity.source, "connected_instagram_account");
  assert.equal(identity.destinationSpec, undefined);
  assert.equal(calls.mutations, 0);
});

test("a linked target Instagram is used without creating a PBIA", async () => {
  const { service, calls } = successfulHarness({
    reads: [nativePage({ linked: true, pageBacked: true })],
    mutation: () => assert.fail("linked Instagram must not create a PBIA"),
    object: () => assert.fail("native linked IDs need no object lookup"),
  });
  const osp = {
    instagram_user_id: "source-user",
    instagram_actor_id: "source-actor",
  };
  await service.applyInstagramIdentity(osp, PAGE_ID, "catalog ad", "account-1");
  assert.equal(osp.instagram_user_id, "linked-user");
  assert.equal(osp.instagram_actor_id, "linked-actor");
  assert.deepEqual(calls, { mutations: 0, objects: 0, threadsMutations: 0 });
});

test("an existing target PBIA is reused without a create mutation", async () => {
  const { service, calls } = successfulHarness({
    reads: [nativePage({ pageBacked: true })],
    mutation: () => assert.fail("existing PBIA must not be recreated"),
  });
  const identity = await service.ensurePageIdentityProfiles(PAGE_ID);
  assert.equal(identity.instagramUserId, IG_V2);
  assert.equal(identity.instagramActorId, IG_ACTOR);
  assert.equal(identity.threadsUserId, "threads-native");
  assert.deepEqual(calls, { mutations: 0, objects: 0, threadsMutations: 0 });
});

test("source export reports the identity type without storing identity IDs", async () => {
  const { service } = successfulHarness({
    reads: [nativePage({ linked: true })],
  });
  const result = await service.inspectSourcePageIdentity(PAGE_ID, "account-1");
  assert.deepEqual(result, {
    pageId: PAGE_ID,
    type: "linked",
    hasLinkedInstagram: true,
    hasPageBackedInstagram: false,
    hasThreadsIdentity: true,
  });
  assert.equal(JSON.stringify(result).includes("linked-user"), false);
});

test("a target PBIA is created and both distinct IDs come from the Ads Manager object", async () => {
  const { service, state, calls } = successfulHarness();
  const identity = await service.ensurePageIdentityProfiles(
    PAGE_ID,
    "draft 1",
    "account-1",
  );
  assert.equal(identity.instagramUserId, IG_V2);
  assert.equal(identity.instagramActorId, IG_ACTOR);
  assert.equal(identity.threadsUserId, "threads-2");
  assert.equal(identity.source, "AdsInstagramUsernameDataManager");
  assert.deepEqual(calls, { mutations: 1, objects: 1, threadsMutations: 0 });
  assert.equal(
    state.pageIdentityHints[PAGE_ID].destinationSpec.native_commerce_experience
      .shop.action_metadata.type,
    "DEFAULT_OFF",
  );
});

test("a saved identity hint never skips the native target-page mutation", async () => {
  const { service, calls } = successfulHarness({
    savedHint: {
      instagramUserId: "stale-user",
      instagramActorId: "stale-actor",
    },
  });
  const identity = await service.ensurePageIdentityProfiles(PAGE_ID);
  assert.equal(identity.instagramUserId, IG_V2);
  assert.equal(identity.instagramActorId, IG_ACTOR);
  assert.deepEqual(calls, { mutations: 1, objects: 1, threadsMutations: 0 });
});

test("one import reuses its page provision but a reset forces a fresh mutation", async () => {
  const { service, calls } = successfulHarness();
  await service.ensurePageIdentityProfiles(PAGE_ID);
  await service.ensurePageIdentityProfiles(PAGE_ID);
  assert.deepEqual(calls, { mutations: 1, objects: 1, threadsMutations: 0 });
  service.resetPageIdentityProvisionCache();
  await service.ensurePageIdentityProfiles(PAGE_ID);
  assert.deepEqual(calls, { mutations: 2, objects: 2, threadsMutations: 0 });
});

test("Threads uses the ID returned with PBIA without a separate PBTA mutation", async () => {
  const { service, calls } = successfulHarness();
  const osp = {
    page_id: "source-page",
    instagram_user_id: "source-user",
    instagram_actor_id: "source-actor",
    threads_user_id: "source-threads",
  };
  await service.applyInstagramIdentity(osp, PAGE_ID, "catalog ad", "account-1");
  assert.equal(osp.page_id, PAGE_ID);
  assert.equal(osp.instagram_user_id, IG_V2);
  assert.equal(osp.instagram_actor_id, IG_ACTOR);
  assert.equal(osp.threads_user_id, "threads-2");
  assert.equal(calls.threadsMutations, 0);
});

test("a missing PBIA Threads ID falls back to the page-backed Threads mutation", async () => {
  const { service, calls } = successfulHarness({
    object: () => ({
      id: IG_V2,
      legacy_instagram_user_id: IG_ACTOR,
      threads_user_id: "",
    }),
    threadsMutation: () => ({
      data: {
        xfb_create_page_backed_threads_accounts: { th_user_id: "threads-3" },
      },
    }),
  });
  const osp = {
    instagram_user_id: "source-user",
    instagram_actor_id: "source-actor",
    threads_user_id: "source-threads",
  };
  await service.applyInstagramIdentity(osp, PAGE_ID, "catalog ad", "account-1");
  assert.equal(osp.instagram_user_id, IG_V2);
  assert.equal(osp.instagram_actor_id, IG_ACTOR);
  assert.equal(osp.threads_user_id, "threads-3");
  assert.equal(calls.threadsMutations, 1);
});

test("an empty PBIA mutation response is recovered by re-reading the target page", async () => {
  const { service, calls } = createHarness({
    reads: [nativePage(), nativePage({ pageBacked: true })],
    mutation: () => ({ data: {} }),
    object: () => assert.fail("no object lookup without iguser_v2_id"),
  });
  const identity = await service.ensurePageIdentityProfiles(PAGE_ID);
  assert.equal(identity.instagramUserId, IG_V2);
  assert.equal(identity.instagramActorId, IG_ACTOR);
  assert.equal(calls.mutations, 1);
});

test("an unresolved target PBIA fails before the source actor can be reused", async () => {
  const { service } = createHarness({
    mutation: () => ({ data: {} }),
    object: () =>
      assert.fail("object lookup must not run without iguser_v2_id"),
  });
  const osp = {
    instagram_user_id: "source-user",
    instagram_actor_id: "source-actor",
  };
  await assert.rejects(
    service.applyInstagramIdentity(osp, PAGE_ID, "catalog ad", "account-1"),
    /neither a linked nor a page-backed Instagram identity/,
  );
});

test("private GraphQL allows partial data only when explicitly requested", async () => {
  const payload = {
    data: { pages: [{ id: PAGE_ID }] },
    errors: [{ message: "optional field failed", severity: "ERROR" }],
  };
  const client = new PrivateGraphqlClient({
    state: { privateTokens: { fbDtsg: "dtsg", lsd: "lsd" } },
    sessionService: { getCurrentActorId: () => "actor" },
    networkDiagnostics: { recordNetworkDiagnostic() {} },
    browserTransport: {
      adReplicaFetch: async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    },
  });
  await assert.rejects(
    client.privateGraphqlRequest("doc", "Query", {}),
    /optional field failed/,
  );
  const result = await client.privateGraphqlRequest(
    "doc",
    "Query",
    {},
    { allowPartialErrors: true },
  );
  assert.equal(result.data.pages[0].id, PAGE_ID);
});

test("identity mutations use the current runtime context and same-origin Relay endpoint", async () => {
  const previousRequire = globalThis.require;
  const previousLocation = globalThis.location;
  const artifact = {
    kind: "Request",
    params: {
      name: "AdsPageInstagramAccountMutation",
      operationKind: "mutation",
      id: "777777777777777",
    },
    operation: { argumentDefinitions: [{ name: "page_id" }] },
  };
  const modules = {
    getAsyncParams: () => ({
      fb_dtsg: "live-dtsg",
      lsd: "live-lsd",
      __user: "live-actor",
    }),
    "AdsPageInstagramAccountMutation.graphql": artifact,
    RelayAPIConfig: {
      graphURI: "/api/graphql/",
      customHeaders: {
        "X-FB-UPL-SESSIONID": "session-marker",
        Cookie: "must-not-be-copied",
      },
    },
  };
  globalThis.require = (name) => {
    if (!(name in modules)) throw new Error("missing module");
    return modules[name];
  };
  globalThis.location = { origin: "https://adsmanager.facebook.com" };
  let sent;
  const client = new PrivateGraphqlClient({
    state: { privateTokens: { fbDtsg: "old-dtsg", lsd: "old-lsd" } },
    sessionService: { getCurrentActorId: () => "cookie-actor" },
    networkDiagnostics: { recordNetworkDiagnostic() {} },
    browserTransport: {
      adReplicaFetch: async (url, options) => {
        sent = {
          url,
          headers: options.headers,
          params: Object.fromEntries(options.body.entries()),
        };
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      },
    },
  });
  try {
    await client.privateGraphqlMutation(
      "25221386390872351",
      "AdsPageInstagramAccountMutation",
      { page_id: PAGE_ID },
    );
    assert.equal(sent.url, "https://adsmanager.facebook.com/api/graphql/");
    assert.equal(sent.params.doc_id, "777777777777777");
    assert.equal(sent.params.fb_dtsg, "live-dtsg");
    assert.equal(sent.params.__user, "live-actor");
    assert.equal(sent.headers["X-FB-UPL-SESSIONID"], "session-marker");
    assert.equal(sent.headers.Cookie, undefined);
  } finally {
    if (previousRequire === undefined) delete globalThis.require;
    else globalThis.require = previousRequire;
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
});

test("private GraphQL reports a numeric Meta error envelope instead of hiding it", async () => {
  const client = new PrivateGraphqlClient({
    state: { privateTokens: { fbDtsg: "dtsg", lsd: "lsd" } },
    sessionService: { getCurrentActorId: () => "actor" },
    networkDiagnostics: { recordNetworkDiagnostic() {} },
    browserTransport: {
      adReplicaFetch: async () =>
        new Response(
          JSON.stringify({
            error: 1357032,
            errorSummary: "Something Went Wrong",
            errorDescription: "Refresh the page.",
          }),
          { status: 200 },
        ),
    },
  });
  await assert.rejects(
    client.privateGraphqlMutation(
      "25221386390872351",
      "AdsPageInstagramAccountMutation",
      { page_id: PAGE_ID },
    ),
    (error) => error.code === 1357032 && /Refresh the page/.test(error.message),
  );
});
