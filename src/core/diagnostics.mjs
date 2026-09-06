import { NETWORK_DIAGNOSTIC_LIMIT } from "../domain/constants.mjs";

/** NetworkDiagnostics. Dependencies are supplied by the application composition root. */
export class NetworkDiagnostics {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.redactUrlForDiagnostics = this.redactUrlForDiagnostics.bind(this);
    this.recordNetworkDiagnostic = this.recordNetworkDiagnostic.bind(this);
  }

  redactUrlForDiagnostics(input) {
    try {
      const url = new URL(String(input || ""), window.location.href);
      const parts = url.pathname.split("/").filter(Boolean).slice(0, 4);
      const path = parts.length ? `/${parts.join("/")}` : "/";
      return `${url.origin}${path}${url.search ? "?..." : ""}`;
    } catch (_error) {
      return String(input || "").slice(0, 120);
    }
  }

  recordNetworkDiagnostic(data = {}) {
    const { state } = this.dependencies;
    const { redactUrlForDiagnostics } = this;
    const entry = {
      createdAt: new Date().toISOString(),
      kind: data.kind || "request",
      phase: data.phase || "",
      method: data.method || "GET",
      url: redactUrlForDiagnostics(data.url || ""),
      status: data.status ?? "",
      attempt: data.attempt ?? "",
      error: String(data.error?.message || data.error || "").slice(0, 500),
      details: data.details || null,
    };
    state.networkDiagnostics.push(entry);
    if (state.networkDiagnostics.length > NETWORK_DIAGNOSTIC_LIMIT) {
      state.networkDiagnostics.splice(
        0,
        state.networkDiagnostics.length - NETWORK_DIAGNOSTIC_LIMIT,
      );
    }
    return entry;
  }
}
