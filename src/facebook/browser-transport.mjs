import { NATIVE_FETCH_FRAME_ID } from "../app/constants.mjs";

/** BrowserTransport. Dependencies are supplied by the application composition root. */
export class BrowserTransport {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.getNativeFetchWindow = this.getNativeFetchWindow.bind(this);
    this.adReplicaFetch = this.adReplicaFetch.bind(this);
  }

  getNativeFetchWindow() {
    let frame = document.getElementById(NATIVE_FETCH_FRAME_ID);
    if (
      !frame ||
      !frame.contentWindow ||
      typeof frame.contentWindow.fetch !== "function"
    ) {
      frame = document.createElement("iframe");
      frame.id = NATIVE_FETCH_FRAME_ID;
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText =
        "display:none!important;width:0;height:0;border:0;position:absolute;left:-9999px;";
      document.documentElement.appendChild(frame);
    }
    return frame.contentWindow;
  }

  adReplicaFetch(input, init = {}) {
    const { getNativeFetchWindow } = this;
    return getNativeFetchWindow().fetch(input, init);
  }
}
