/** RequestContext. Dependencies are supplied by the application composition root. */
export class RequestContext {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getAccountIdFromGraphPath = this.getAccountIdFromGraphPath.bind(this);
    this.getGraphRuntimeTemplate = this.getGraphRuntimeTemplate.bind(this);
    this.applyGraphRuntimeTemplate = this.applyGraphRuntimeTemplate.bind(this);
  }

  getAccountIdFromGraphPath(pathOrUrl) {
    const text = String(pathOrUrl || "");
    const match = text.match(/act_(\d{6,})/);
    return match?.[1] || "";
  }

  getGraphRuntimeTemplate(accountId) {
    const { state } = this.dependencies;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (
      state.graphTemplateParams &&
      state.graphTemplateAccountId === normalizedAccountId
    ) {
      return state.graphTemplateParams;
    }

    const resourceUrls = performance
      .getEntriesByType("resource")
      .map((entry) => entry?.name || "")
      .filter((name) => name.includes("adsmanager-graph.facebook.com"))
      .reverse();

    const parsedUrls = resourceUrls
      .map((name) => {
        try {
          return new URL(name);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);

    const matched =
      parsedUrls.find(
        (url) =>
          !normalizedAccountId ||
          String(url.searchParams.get("__aaid") || "").replace(/^act_/, "") ===
            normalizedAccountId,
      ) || parsedUrls[0];

    if (!matched) {
      return null;
    }

    const template = {
      __aaid: matched.searchParams.get("__aaid") || normalizedAccountId,
      _sessionID: matched.searchParams.get("_sessionID") || "",
      ads_manager_write_regions:
        matched.searchParams.get("ads_manager_write_regions") || "",
      include_headers: matched.searchParams.get("include_headers") || "",
      pretty: matched.searchParams.get("pretty") || "0",
      suppress_http_code: matched.searchParams.get("suppress_http_code") || "1",
    };

    state.graphTemplateAccountId = normalizedAccountId;
    state.graphTemplateParams = template;
    return template;
  }

  applyGraphRuntimeTemplate(url, method, accountId) {
    const { getGraphRuntimeTemplate } = this;
    const template = getGraphRuntimeTemplate(accountId);
    if (!template) {
      url.searchParams.set("method", String(method || "GET").toLowerCase());
      url.searchParams.set("suppress_http_code", "1");
      url.searchParams.set("pretty", "0");
      return;
    }

    if (template.__aaid && !url.searchParams.has("__aaid")) {
      url.searchParams.set("__aaid", template.__aaid);
    }
    if (template._sessionID && !url.searchParams.has("_sessionID")) {
      url.searchParams.set("_sessionID", template._sessionID);
    }

    for (const key of ["ads_manager_write_regions", "include_headers"]) {
      if (template[key] && !url.searchParams.has(key)) {
        url.searchParams.set(key, template[key]);
      }
    }

    url.searchParams.set("method", String(method || "GET").toLowerCase());
    if (!url.searchParams.has("suppress_http_code")) {
      url.searchParams.set(
        "suppress_http_code",
        template.suppress_http_code || "1",
      );
    }
    if (!url.searchParams.has("pretty")) {
      url.searchParams.set("pretty", template.pretty || "0");
    }
  }
}
