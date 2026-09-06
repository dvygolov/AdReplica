import { stripFacebookPrelude } from "../utils/string.mjs";
import { getFacebookModule } from "../utils/facebook-runtime.mjs";
import { Config } from "../config.mjs";

/** SessionService. Dependencies are supplied by the application composition root. */
export class SessionService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.fetchText = this.fetchText.bind(this);
    this.extractPrivateTokens = this.extractPrivateTokens.bind(this);
    this.extractAccessToken = this.extractAccessToken.bind(this);
    this.getCurrentActorId = this.getCurrentActorId.bind(this);
    this.getDraftApplicationId = this.getDraftApplicationId.bind(this);
    this.discoverSession = this.discoverSession.bind(this);
    this.initializeSession = this.initializeSession.bind(this);
  }

  async fetchText(url, options = {}) {
    const { adReplicaFetch } = this.dependencies.browserTransport;
    const response = await adReplicaFetch(url, {
      credentials: "include",
      redirect: "follow",
      ...options,
    });
    const text = stripFacebookPrelude(await response.text());
    return { response, text };
  }

  extractPrivateTokens(text) {
    const fbDtsg =
      text.match(/DTSGInitialData",\[\],\{"token":"([^"]+)/)?.[1] ||
      text.match(/"dtsg":\{"token":"([^"]+)/)?.[1] ||
      "";
    const asyncGetToken =
      text.match(/"async_get_token":"([^"]+)/)?.[1] ||
      text.match(/"dtsg_ag":\{"token":"([^"]+)/)?.[1] ||
      "";
    const lsd = text.match(/LSD",\[\],\{"token":"([^"]+)/)?.[1] || "";
    return fbDtsg && lsd ? { fbDtsg, asyncGetToken, lsd } : null;
  }

  extractAccessToken(text) {
    return text.match(/EAAB[a-zA-Z0-9]+/)?.[0] || "";
  }

  getCurrentActorId() {
    return (
      (document.cookie.match(/(?:^|;\s)c_user=(\d+)/) || [])[1] ||
      getFacebookModule("CurrentUserInitialData")?.USER_ID ||
      ""
    );
  }

  getDraftApplicationId() {
    const html = document.documentElement?.outerHTML || "";
    const match =
      html.match(/current_addrafts\{\\?"cross_application_id\\?":\\?"(\d+)"/) ||
      html.match(/cross_application_id\\?":\\?"(\d+)"/) ||
      html.match(/cross_application_id":"(\d+)"/);
    return match?.[1] || Config.ADS_MANAGER_APPLICATION_ID;
  }

  async discoverSession() {
    const { log } = this.dependencies.logging;
    const { fetchText, extractPrivateTokens, extractAccessToken } = this;
    const htmlCandidates = [];

    const currentHtml = document.documentElement?.outerHTML || "";
    if (currentHtml) {
      htmlCandidates.push(currentHtml);
    }

    try {
      const managerUrl = new URL(
        "/ads/manager?locale=en_US",
        window.location.origin,
      ).toString();
      const firstFetch = await fetchText(managerUrl);
      htmlCandidates.push(firstFetch.text);
      const redirect = firstFetch.text
        .match(/window\.location\.replace\("([^"]+)/)?.[1]
        ?.replaceAll("\\", "");
      if (redirect) {
        try {
          const redirected = await fetchText(redirect);
          htmlCandidates.push(redirected.text);
        } catch (error) {
          log(
            "warn",
            "Failed to follow ads manager redirect for token.",
            String(error),
          );
        }
      }
    } catch (error) {
      log("warn", "Failed to fetch ads manager for token.", String(error));
    }

    for (const html of htmlCandidates) {
      const token = extractAccessToken(html);
      const privateTokens = extractPrivateTokens(html);
      if (token) {
        return {
          token,
          privateTokens,
        };
      }
    }

    for (const html of htmlCandidates) {
      const privateTokens = extractPrivateTokens(html);
      if (privateTokens) {
        return {
          token: "",
          privateTokens,
        };
      }
    }

    return {
      token: "",
      privateTokens: null,
    };
  }

  async initializeSession(force = false) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { renderStatus, renderButtons, renderUI } =
      this.dependencies.panelView;
    const { discoverSession } = this;
    const { loadAccounts } = this.dependencies.accountController;
    if (state.loadingSession) return;
    if (state.sessionReady && !force) return;
    state.loadingSession = true;
    renderStatus();
    renderButtons();
    try {
      const runtimeToken =
        typeof __accessToken !== "undefined" ? __accessToken : "";
      const runtimeDtsg =
        getFacebookModule("DTSGInitialData")?.token ||
        getFacebookModule("DTSGInitData")?.token ||
        "";
      const runtimeLsd = getFacebookModule("LSD")?.token || "";

      if (runtimeToken) {
        state.token = runtimeToken;
        state.privateTokens =
          runtimeDtsg && runtimeLsd
            ? { fbDtsg: runtimeDtsg, asyncGetToken: "", lsd: runtimeLsd }
            : null;
        if (!state.privateTokens) {
          const session = await discoverSession();
          state.privateTokens = session.privateTokens;
          if (!state.token && session.token) {
            state.token = session.token;
          }
        }
      } else {
        const session = await discoverSession();
        state.privateTokens = session.privateTokens;
        state.token = session.token;
      }
      if (!state.token) {
        throw new Error(
          "Could not extract access_token. Run the script on the Ads Manager page.",
        );
      }
      state.sessionReady = true;
      log("info", "Session connected.");
      await loadAccounts();
    } catch (error) {
      state.sessionReady = false;
      log("error", "Session initialization error.", String(error));
      throw error;
    } finally {
      state.loadingSession = false;
      renderUI();
    }
  }
}
