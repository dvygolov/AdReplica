import { UncertainWriteError } from "./request-errors.mjs";
import { stripFacebookPrelude } from "../utils/string.mjs";
import { getFacebookModule } from "../utils/facebook-runtime.mjs";

/** PrivateGraphqlClient. Dependencies are supplied by the application composition root. */
export class PrivateGraphqlClient {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.parsePrivateGraphqlText = this.parsePrivateGraphqlText.bind(this);
    this.privateGraphqlRequest = this.privateGraphqlRequest.bind(this);
    this.businessGraphqlRequest = this.businessGraphqlRequest.bind(this);
    this.privateGraphqlMutation = this.privateGraphqlMutation.bind(this);
  }

  parsePrivateGraphqlText(text) {
    const stripped = stripFacebookPrelude(text || "");
    if (!stripped.trim()) {
      return {};
    }
    try {
      return JSON.parse(stripped);
    } catch (_error) {
      const chunks = stripped
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (_lineError) {
            return null;
          }
        })
        .filter(Boolean);
      if (!chunks.length) {
        throw new Error(
          `Failed to parse private GraphQL response: ${stripped.slice(0, 300)}`,
        );
      }
      return {
        ...(chunks[0] || {}),
        __chunks: chunks,
      };
    }
  }

  async privateGraphqlRequest(docId, friendlyName, variables, options = {}) {
    const { state } = this.dependencies;
    const { recordNetworkDiagnostic } = this.dependencies.networkDiagnostics;
    const { adReplicaFetch } = this.dependencies.browserTransport;
    const { getCurrentActorId } = this.dependencies.sessionService;
    const { parsePrivateGraphqlText } = this;
    const body = new URLSearchParams();
    const isIdentityRequest = [
      "AdsPageInstagramAccountMutation",
      "createAndUsePBTAMutation",
    ].includes(friendlyName);
    const readModule = (name) => {
      try {
        return getFacebookModule(name);
      } catch (_error) {
        return null;
      }
    };
    let resolvedDocId = String(docId);
    let runtimeParams = false;
    let currentRuntimeDocument = false;

    if (isIdentityRequest) {
      const module = readModule("getAsyncParams");
      const getParams = typeof module === "function" ? module : module?.default;
      if (typeof getParams === "function") {
        try {
          const params = getParams("POST");
          const entries =
            params instanceof URLSearchParams
              ? [...params.entries()]
              : Object.entries(params || {});
          for (const [key, value] of entries) {
            if (
              value !== null &&
              value !== undefined &&
              ["string", "number", "boolean"].includes(typeof value)
            ) {
              body.set(key, String(value));
            }
          }
          runtimeParams = [...body.keys()].length > 0;
        } catch (_error) {
          // Keep the original parameter fallback.
        }
      }
      const moduleArtifact = readModule(`${friendlyName}.graphql`);
      const artifact = moduleArtifact?.default || moduleArtifact;
      const params = artifact?.params;
      const definitions =
        artifact?.operation?.argumentDefinitions ||
        artifact?.fragment?.argumentDefinitions;
      if (
        artifact?.kind === "Request" &&
        params?.name === friendlyName &&
        params.operationKind === "mutation" &&
        /^\d+$/.test(String(params.id || "")) &&
        Array.isArray(definitions)
      ) {
        const declared = new Set(
          definitions.map((item) => item?.name).filter(Boolean),
        );
        if (Object.keys(variables || {}).some((key) => !declared.has(key))) {
          throw new Error(
            "The current Meta identity mutation has different variable names; no request was sent.",
          );
        }
        resolvedDocId = String(params.id);
        currentRuntimeDocument = true;
      }
      const dtsg =
        readModule("DTSGInitialData")?.token ||
        readModule("DTSGInitData")?.token;
      const lsd = readModule("LSD")?.token;
      if (!body.get("fb_dtsg") && dtsg) body.set("fb_dtsg", dtsg);
      if (!body.get("lsd") && lsd) body.set("lsd", lsd);
    }

    if (!body.get("fb_dtsg") && state.privateTokens?.fbDtsg) {
      body.set("fb_dtsg", state.privateTokens.fbDtsg);
    }
    if (!body.get("lsd") && state.privateTokens?.lsd) {
      body.set("lsd", state.privateTokens.lsd);
    }
    if (!body.get("fb_dtsg") || !body.get("lsd")) {
      throw new Error(
        "No private GraphQL tokens. Reinitialize session from an Ads Manager page.",
      );
    }
    const actorId = String(body.get("__user") || getCurrentActorId() || "");
    if (!actorId) {
      throw new Error(
        "Could not resolve actor id for private GraphQL request.",
      );
    }
    if (!body.get("av")) body.set("av", actorId);
    if (!body.get("__user")) body.set("__user", actorId);
    if (!body.get("__a")) body.set("__a", "1");
    body.set("fb_api_caller_class", "RelayModern");
    body.set("fb_api_req_friendly_name", friendlyName);
    body.set("server_timestamps", "true");
    body.set("doc_id", resolvedDocId);
    body.set("variables", JSON.stringify(variables || {}));

    let endpoint = options.endpoint || "https://www.facebook.com/api/graphql/";
    const headers = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "*/*",
    };
    if (isIdentityRequest && runtimeParams && currentRuntimeDocument) {
      const config =
        readModule("RelayAPIConfig") || readModule("RelayAPIConfigDefaults");
      try {
        const origin = globalThis.location?.origin || window.location.origin;
        const nativeUrl = new URL(String(config?.graphURI || ""), origin);
        if (
          origin &&
          nativeUrl.protocol === "https:" &&
          nativeUrl.origin === origin &&
          nativeUrl.pathname === "/api/graphql/" &&
          !nativeUrl.username &&
          !nativeUrl.password
        ) {
          endpoint = nativeUrl.href;
          const customHeaders = config?.customHeaders;
          if (
            customHeaders &&
            typeof customHeaders === "object" &&
            !Array.isArray(customHeaders)
          ) {
            for (const [name, value] of Object.entries(customHeaders)) {
              if (
                typeof value !== "string" ||
                !/^[A-Za-z0-9-]+$/.test(name) ||
                /[\r\n]/.test(value) ||
                /^(?:cookie|cookie2|host|origin|referer|connection|content-length|transfer-encoding|sec-|proxy-)/i.test(
                  name,
                )
              ) {
                continue;
              }
              headers[name] = value;
            }
          }
        }
      } catch (_error) {
        // Keep the original endpoint.
      }
    }

    const endpointForLog = (() => {
      try {
        const url = new URL(endpoint);
        return `${url.origin}${url.pathname}`;
      } catch (_error) {
        return "[unavailable]";
      }
    })();
    if (isIdentityRequest) {
      state.lastPrivateRequestCompatibility = {
        operation: friendlyName,
        runtimeParams,
        documentSource: currentRuntimeDocument ? "current-runtime" : "original",
        documentChanged: resolvedDocId !== String(docId),
        endpoint: endpointForLog,
      };
    }
    let response;
    let text;
    const isMutation = /Mutation/i.test(friendlyName);
    try {
      response = await adReplicaFetch(endpoint, {
        method: "POST",
        credentials: "include",
        mode: "cors",
        headers,
        body,
      });
      text = await response.text();
    } catch (error) {
      recordNetworkDiagnostic({
        kind: "private_graphql",
        phase: "fetch",
        method: "POST",
        url: endpointForLog,
        error,
        details: { friendlyName, docId: resolvedDocId },
      });
      throw isMutation ? new UncertainWriteError(friendlyName, error) : error;
    }

    let json;
    try {
      json = parsePrivateGraphqlText(text);
    } catch (error) {
      recordNetworkDiagnostic({
        kind: "private_graphql",
        phase: "parse",
        method: "POST",
        url: endpointForLog,
        status: response.status,
        error,
        details: { friendlyName, docId: resolvedDocId },
      });
      throw isMutation ? new UncertainWriteError(friendlyName, error) : error;
    }
    const envelopeCode = Number(
      typeof json?.error === "object" ? json.error?.code : json?.error,
    );
    if (Number.isFinite(envelopeCode) && envelopeCode !== 0) {
      const summary = String(
        json.errorSummary || json.error?.message || "Private request failed",
      ).slice(0, 1000);
      const description = String(json.errorDescription || "").slice(0, 1000);
      const error = new Error(
        `Meta ${envelopeCode}: ${summary}${description ? ` — ${description}` : ""}`,
      );
      error.code = envelopeCode;
      recordNetworkDiagnostic({
        kind: "private_graphql",
        phase: "response",
        method: "POST",
        url: endpointForLog,
        status: response.status,
        error: error.message,
        details: { friendlyName, docId: resolvedDocId, code: envelopeCode },
      });
      if (isMutation && response.status >= 500) {
        throw new UncertainWriteError(friendlyName, error);
      }
      throw error;
    }
    const hasUsablePartialData =
      options.allowPartialErrors && json.data && typeof json.data === "object";
    if (!response.ok || (json.errors && !hasUsablePartialData)) {
      if (isMutation && response.status >= 500) {
        throw new UncertainWriteError(
          friendlyName,
          new Error(`GraphQL server returned ${response.status}.`),
        );
      }
      const firstError = Array.isArray(json.errors)
        ? json.errors[0]
        : json.errors;
      recordNetworkDiagnostic({
        kind: "private_graphql",
        phase: "response",
        method: "POST",
        url: endpointForLog,
        status: response.status,
        error:
          firstError?.message ||
          firstError?.summary ||
          JSON.stringify(firstError || { status: response.status }),
        details: {
          friendlyName,
          docId: resolvedDocId,
          severity: firstError?.severity || "",
        },
      });
      throw new Error(
        JSON.stringify(
          json.errors || { status: response.status, text },
          null,
          2,
        ),
      );
    }
    return json;
  }

  async businessGraphqlRequest(docId, friendlyName, variables) {
    const { privateGraphqlRequest } = this;
    return privateGraphqlRequest(docId, friendlyName, variables, {
      endpoint: "https://business.facebook.com/api/graphql/",
    });
  }

  async privateGraphqlMutation(docId, friendlyName, variables) {
    const { privateGraphqlRequest } = this;
    return privateGraphqlRequest(docId, friendlyName, variables);
  }
}
