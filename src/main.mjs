import { AdReplicaApp } from "./app/ad-replica-app.mjs";

if (window.AdReplica?.destroy?.() !== false) {
  const app = new AdReplicaApp();
  window.AdReplica = app.toPublicApi();
  app.mount();
}
