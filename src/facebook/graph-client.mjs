import { isTransientNetworkFetchError } from "../domain/graph-errors.mjs";
import { Config } from "../config.mjs";
import { sleep } from "../utils/object.mjs";
import { stripFacebookPrelude } from "../utils/string.mjs";
import { UncertainWriteError, GraphRequestError } from "./request-errors.mjs";

/** GraphClient. Dependencies are supplied by the application composition root. */
export class GraphClient {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.graphFetch = this.graphFetch.bind(this);
    this.graphGetAll = this.graphGetAll.bind(this);
    this.graphPageFetch = this.graphPageFetch.bind(this);
    this.graphPageGetAll = this.graphPageGetAll.bind(this);
  }

  async graphFetch(pathOrUrl, options = {}) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { recordNetworkDiagnostic } = this.dependencies.networkDiagnostics;
    const { adReplicaFetch } = this.dependencies.browserTransport;
    const { getAccountIdFromGraphPath, applyGraphRuntimeTemplate } =
      this.dependencies.requestContext;
    if (!state.token) {
      throw new Error("No access_token.");
    }

    const {
      method = "GET",
      query = {},
      body = null,
      formData = null,
      fullUrl = false,
      raw = false,
      apiBase = Config.API_URL,
      networkRetryAttempts = 3,
      networkRetryBaseDelayMs = 600,
      timeoutMs = 120000,
    } = options;

    const url = fullUrl
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl.replace(/^\/+/, ""), apiBase);
    const templateAccountId =
      String(query?.__aaid || body?.account_id || "").replace(/^act_/, "") ||
      getAccountIdFromGraphPath(pathOrUrl);

    if (!url.searchParams.has("access_token")) {
      url.searchParams.set("access_token", state.token);
    }
    if (!url.searchParams.has("locale")) {
      url.searchParams.set("locale", "en_US");
    }
    applyGraphRuntimeTemplate(url, method, templateAccountId);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    });

    const init = {
      method,
      mode: "cors",
      credentials: "include",
      referrer: "https://business.facebook.com/",
      referrerPolicy: "origin-when-cross-origin",
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua":
          '"Google Chrome";v="107", "Chromium";v="107", "Not=A?Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
    };

    if (formData) {
      formData.set("access_token", state.token);
      if (!formData.has("locale")) {
        formData.set("locale", "en_US");
      }
      init.body = formData;
    } else if (body) {
      init.headers["content-type"] = "application/x-www-form-urlencoded";
      const payload = new URLSearchParams();
      payload.set("access_token", state.token);
      payload.set("locale", "en_US");
      Object.entries(body).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        payload.set(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        );
      });
      init.body = payload;
    }

    let response;
    let responseText = "";
    let lastFetchError = null;
    const readOnly =
      ["GET", "HEAD"].includes(method.toUpperCase()) ||
      (method.toUpperCase() === "POST" &&
        Array.isArray(body?.execution_options) &&
        body.execution_options.includes("validate_only"));
    const maxNetworkAttempts = readOnly
      ? Math.max(1, Number(networkRetryAttempts || 1))
      : 1;
    for (let attempt = 1; attempt <= maxNetworkAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await adReplicaFetch(url.toString(), {
          ...init,
          signal: controller.signal,
        });
        if (!raw) responseText = await response.text();
        lastFetchError = null;
        break;
      } catch (error) {
        lastFetchError = error;
        const message = String(error?.message || error || "");
        if (
          !isTransientNetworkFetchError(error) ||
          attempt === maxNetworkAttempts
        ) {
          recordNetworkDiagnostic({
            kind: "graph_fetch",
            phase: "fetch",
            method,
            url: url.toString(),
            attempt,
            error,
          });
          throw readOnly ? error : new UncertainWriteError(url.pathname, error);
        }
        log(
          "warn",
          `Transient fetch failure on attempt ${attempt} for ${url.pathname}. Retrying...`,
          message,
        );
        await sleep(
          Math.max(0, Number(networkRetryBaseDelayMs || 0)) *
            2 ** (attempt - 1),
        );
      } finally {
        clearTimeout(timer);
      }
    }
    if (!response && lastFetchError) {
      recordNetworkDiagnostic({
        kind: "graph_fetch",
        phase: "fetch",
        method,
        url: url.toString(),
        error: lastFetchError,
      });
      throw lastFetchError;
    }
    if (raw) {
      return response;
    }
    const text = stripFacebookPrelude(responseText);
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (error) {
      recordNetworkDiagnostic({
        kind: "graph_fetch",
        phase: "parse",
        method,
        url: url.toString(),
        status: response.status,
        error,
      });
      const parseError = new Error(
        "Failed to parse the Graph response as JSON.",
      );
      throw readOnly
        ? parseError
        : new UncertainWriteError(url.pathname, parseError);
    }
    if (!response.ok || json.error) {
      const graphError = json.error || { status: response.status, text };
      recordNetworkDiagnostic({
        kind: "graph_fetch",
        phase: "response",
        method,
        url: url.toString(),
        status: response.status,
        error: graphError?.message || JSON.stringify(graphError),
        details: {
          code: graphError?.code || "",
          subcode: graphError?.error_subcode || "",
          type: graphError?.type || "",
          fbtrace_id: graphError?.fbtrace_id || "",
        },
      });
      if (!readOnly && response.status >= 500)
        throw new UncertainWriteError(
          url.pathname,
          new Error(`Graph server returned ${response.status}.`),
        );
      throw new GraphRequestError(
        json.error || { status: response.status },
        response.status,
      );
    }
    if (!readOnly && method.toUpperCase() === "POST") {
      const edge = url.pathname.split("/").at(-1);
      const creates = [
        "campaigns",
        "adsets",
        "ads",
        "adcreatives",
        "adspixels",
        "advideos",
        "products",
        "product_sets",
        "product_feeds",
        "owned_product_catalogs",
        "product_catalogs",
      ];
      if (
        (creates.includes(edge) && !json.id && !json.product_id) ||
        (edge === "addraft_fragments" && !json.ad_object_id)
      ) {
        throw new UncertainWriteError(
          url.pathname,
          new Error("Creation response contains no object ID."),
        );
      }
    }
    if (!readOnly && method.toUpperCase() === "POST" && state.operationReport) {
      const edge = url.pathname.split("/").at(-1);
      const types = {
        adcreatives: "creative",
        adspixels: "pixel",
        advideos: "video",
        products: "product",
        product_sets: "product_set",
        product_feeds: "feed",
        owned_product_catalogs: "catalog",
        product_catalogs: "catalog",
      };
      if (types[edge] && (json.id || json.product_id))
        state.operationReport.record(
          types[edge],
          json.id || json.product_id,
          body?.name || "",
          {
            accountId: templateAccountId,
          },
        );
      if (edge === "adimages")
        for (const entry of Object.values(json.images || {})) {
          if (entry?.hash)
            state.operationReport.record(
              "image",
              entry.hash,
              entry.name || "",
              { accountId: templateAccountId },
            );
        }
    }
    return json;
  }

  async graphGetAll(path, query = {}) {
    const { graphFetch } = this;
    const first = await graphFetch(path, { query });
    const rows = [...(first.data || [])];
    let next = first.paging?.next || "";
    while (next) {
      const page = await graphFetch(next, { fullUrl: true });
      rows.push(...(page.data || []));
      next = page.paging?.next || "";
    }
    return rows;
  }

  async graphPageFetch(pathOrUrl, options = {}) {
    const { graphFetch } = this;
    return graphFetch(pathOrUrl, {
      ...options,
      apiBase: Config.PAGE_API_URL,
    });
  }

  async graphPageGetAll(path, query = {}) {
    const { graphPageFetch } = this;
    const first = await graphPageFetch(path, { query });
    const rows = [...(first.data || [])];
    let next = first.paging?.next || "";
    while (next) {
      const page = await graphPageFetch(next, { fullUrl: true });
      rows.push(...(page.data || []));
      next = page.paging?.next || "";
    }
    return rows;
  }
}
