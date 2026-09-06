import { Config } from "../config.mjs";

/** LogView. Dependencies are supplied by the application composition root. */
export class LogView {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.formatLogEntry = this.formatLogEntry.bind(this);
    this.buildLogText = this.buildLogText.bind(this);
    this.renderLogs = this.renderLogs.bind(this);
    this.downloadLogs = this.downloadLogs.bind(this);
  }

  formatLogEntry(entry) {
    const time = entry.createdAt.slice(11, 19);
    const lvl = entry.level.toUpperCase().padEnd(5);
    let line = `[${time}] ${lvl} ${entry.message}`;
    if (entry.details) {
      const details =
        typeof entry.details === "string"
          ? entry.details
          : JSON.stringify(entry.details, null, 2);
      line += `\n${details}`;
    }
    return line;
  }

  buildLogText() {
    const { state } = this.dependencies;
    const { formatLogEntry } = this;
    const networkLines = state.networkDiagnostics.length
      ? state.networkDiagnostics.map((entry) => {
          const time = entry.createdAt.slice(11, 19);
          const status = entry.status ? ` status=${entry.status}` : "";
          const attempt = entry.attempt ? ` attempt=${entry.attempt}` : "";
          const phase = entry.phase ? ` phase=${entry.phase}` : "";
          const details = entry.details
            ? `\n${JSON.stringify(entry.details, null, 2)}`
            : "";
          const error = entry.error ? `\n${entry.error}` : "";
          return `[${time}] ${entry.kind} ${entry.method}${status}${attempt}${phase} ${entry.url}${error}${details}`;
        })
      : ["No failed API requests recorded."];
    const context = [
      `AdReplica log`,
      `Build: ${Config.VERSION}`,
      `Exported at: ${new Date().toISOString()}`,
      `Page: ${window.location.origin}${window.location.pathname}`,
      `Session ready: ${state.sessionReady}`,
      `Busy: ${state.busy}`,
      `Export account: ${state.exportAccountId || "-"}`,
      `Export campaign: ${state.exportCampaignId || "-"}`,
      `Import account: ${state.importAccountId || "-"}`,
      `Clone source account: ${state.cloneSourceAccountId || "-"}`,
      `Clone source campaign: ${state.cloneSourceCampaignId || "-"}`,
      `Clone target account: ${state.cloneTargetAccountId || "-"}`,
      `Clone mode: ${state.cloneAsDraft ? "DRAFT" : state.cloneStatus}`,
      "",
      "Network diagnostics:",
      ...networkLines,
      "",
      "Logs:",
    ];
    const logLines = state.logs.length
      ? state.logs.map(formatLogEntry)
      : ["No log entries."];
    return context.concat(logLines).join("\n");
  }

  renderLogs() {
    const { state, dom } = this.dependencies;
    const { formatLogEntry } = this;
    if (!dom.logs) return;
    const text = state.logs.map(formatLogEntry).join("\n");
    dom.logs.value = text;
    dom.logs.scrollTop = dom.logs.scrollHeight;
  }

  downloadLogs() {
    const { buildLogText } = this;
    const { triggerDownload } = this.dependencies.downloadService;
    const blob = new Blob([buildLogText()], {
      type: "text/plain;charset=utf-8",
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    triggerDownload(`adreplica-log-${Config.VERSION}-${stamp}.txt`, blob);
  }
}
