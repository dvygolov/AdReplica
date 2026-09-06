import { UncertainWriteError } from "./request-errors.mjs";
import { stripFacebookPrelude } from "../utils/string.mjs";

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
    if (!state.privateTokens?.fbDtsg || !state.privateTokens?.lsd) {
      throw new Error(
        "No private GraphQL tokens. Reinitialize session from an Ads Manager page.",
      );
    }
    const actorId = String(getCurrentActorId() || "");
    if (!actorId) {
      throw new Error(
        "Could not resolve actor id for private GraphQL request.",
      );
    }

    const body = new URLSearchParams();
    body.set("av", actorId);
    body.set("__user", actorId);
    body.set("__a", "1");
    body.set("fb_dtsg", state.privateTokens.fbDtsg);
    body.set("lsd", state.privateTokens.lsd);
    body.set("fb_api_caller_class", "RelayModern");
    body.set("fb_api_req_friendly_name", friendlyName);
    body.set("server_timestamps", "true");
    body.set("doc_id", String(docId));
    body.set("variables", JSON.stringify(variables || {}));

    const endpoint =
      options.endpoint || "https://www.facebook.com/api/graphql/";
    let response;
    let text;
    const isMutation = /Mutation/i.test(friendlyName);
    try {
      response = await adReplicaFetch(endpoint, {
        method: "POST",
        credentials: "include",
        mode: "cors",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "*/*",
        },
        body,
      });
      text = await response.text();
    } catch (error) {
      recordNetworkDiagnostic({
        kind: "private_graphql",
        phase: "fetch",
        method: "POST",
        url: endpoint,
        error,
        details: {
          friendlyName,
          docId: String(docId),
        },
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
        url: endpoint,
        status: response.status,
        error,
        details: {
          friendlyName,
          docId: String(docId),
        },
      });
      throw isMutation ? new UncertainWriteError(friendlyName, error) : error;
    }
    if (!response.ok || json.errors) {
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
        url: endpoint,
        status: response.status,
        error:
          firstError?.message ||
          firstError?.summary ||
          JSON.stringify(firstError || { status: response.status }),
        details: {
          friendlyName,
          docId: String(docId),
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
