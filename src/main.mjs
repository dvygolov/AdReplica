import { AdReplicaApp } from "./app/ad-replica-app.mjs";

/**
 * Mounts one AdReplica instance. Kept as a function so the refresh control can
 * rebuild the whole interface without reloading the Ads Manager page.
 */
function mountAdReplica() {
  const app = new AdReplicaApp();
  const api = app.toPublicApi();
  api.refresh = () => {
    if (window.AdReplica?.destroy?.() === false) return false;
    mountAdReplica();
    return true;
  };
  window.AdReplica = api;
  app.mount();
}

if (window.AdReplica?.destroy?.() !== false) {
  mountAdReplica();
}
