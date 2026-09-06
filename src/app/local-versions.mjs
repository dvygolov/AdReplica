import { Config } from "../config.mjs";

export const VERSION_HISTORY_KEY = "adreplica.loader.history.v1";
const CACHE_KEY = "adreplica.loader.cache.v1";

function isPayload(value) {
  return Boolean(
    value?.app === "AdReplica" &&
    /^\d{6}b\d+$/.test(value.version) &&
    typeof value.source === "string" &&
    value.source.length &&
    /^[a-f0-9]{64}$/i.test(value.sha256),
  );
}

/** Local script history only: never stores application state or credentials. */
export class LocalVersions {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.warning = "";
  }

  readHistory() {
    try {
      return JSON.parse(window.localStorage.getItem(VERSION_HISTORY_KEY)) || {};
    } catch (_error) {
      return {};
    }
  }

  captureCurrent() {
    try {
      const current = JSON.parse(window.localStorage.getItem(CACHE_KEY));
      // Direct development injection and local rollback must not rotate history.
      if (!isPayload(current) || current.version !== Config.VERSION) return;
      const history = this.readHistory();
      if (history.current?.version === current.version) return;
      window.localStorage.setItem(
        VERSION_HISTORY_KEY,
        JSON.stringify({
          current,
          previous: isPayload(history.current) ? history.current : null,
        }),
      );
    } catch (_error) {
      this.warning =
        "Local version history could not be saved in this browser.";
      this.dependencies.logging.log("warn", this.warning);
    }
  }

  previous() {
    const previous = this.readHistory().previous;
    return isPayload(previous) && previous.version !== Config.VERSION
      ? previous
      : null;
  }

  async loadPrevious() {
    const { state } = this.dependencies;
    if (
      state.busy ||
      state.loadingSession ||
      state.operationActive ||
      state.versionLoading
    )
      return false;
    state.versionLoading = true;
    this.dependencies.panelView.renderButtons();
    try {
      const previous = this.previous();
      if (!previous)
        throw new Error("No previous version is saved in this browser.");
      const digest = await window.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(previous.source),
      );
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== previous.sha256.toLowerCase())
        throw new Error(
          "The saved version is damaged. The current version was kept.",
        );
      const currentApp = window.AdReplica;
      await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(
          new Blob([previous.source], { type: "application/javascript" }),
        );
        const script = document.createElement("script");
        const cleanup = () => {
          URL.revokeObjectURL(url);
          script.remove();
        };
        script.src = url;
        script.onload = () => {
          cleanup();
          resolve();
        };
        script.onerror = () => {
          cleanup();
          reject(new Error("Could not load the saved version."));
        };
        document.head.appendChild(script);
      });
      if (window.AdReplica === currentApp)
        throw new Error(
          "The saved script did not replace the current application.",
        );
      if (window.__AdReplicaLoader) {
        window.__AdReplicaLoader.build = previous.version;
        window.__AdReplicaLoader.source = "local-previous";
      }
      return true;
    } catch (error) {
      this.warning = error.message;
      this.dependencies.logging.log("error", error.message);
      return false;
    } finally {
      state.versionLoading = false;
      this.dependencies.panelView.renderButtons();
    }
  }
}
