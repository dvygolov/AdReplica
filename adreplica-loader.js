(function adReplicaLoader(config) {
  "use strict";

  const loaderConfig = Object.assign({
    app: "AdReplica",
    manifestOgObjectId: "36372667002332356",
    cacheKey: "adreplica.loader.cache.v1",
    timeoutMs: 45000,
  }, config || {});
  const guardKey = "__AdReplicaLoader";
  const host = String(location.hostname || "");

  if (!/(^|\.)facebook\.com$/.test(host)) {
    location.href = "https://adsmanager.facebook.com/";
    return;
  }
  if (window[guardKey]?.loading) {
    console.warn(`[${loaderConfig.app}] Loader is already running.`);
    return;
  }
  window[guardKey] = { loading: true, build: "latest", startedAt: Date.now(), source: "" };

  const log = (message) => console.log(`[${loaderConfig.app} loader] ${message}`);
  const fail = (error) => {
    console.error(`[${loaderConfig.app} loader] Failed.`, error);
    alert(`${loaderConfig.app} loader failed: ${error?.message || error}`);
  };
  const withTimeout = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), loaderConfig.timeoutMs)),
  ]);
  const decodeBase64Utf8 = (base64) => {
    const binary = atob(String(base64 || "").replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
  };
  const fetchJson = async (url) => {
    const response = await withTimeout(fetch(url, { credentials: "include", cache: "no-store" }), url);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status} ${text.slice(0, 200)}`);
    }
    const clean = text.replace(/^for\s*\(;;\);\s*/, "");
    return JSON.parse(clean);
  };
  const getAdsManagerAccessToken = () => {
    if (window.__accessToken) {
      return window.__accessToken;
    }
    const entries = performance.getEntriesByType("resource")
      .map((entry) => entry.name || "")
      .filter((url) => url.includes("adsmanager-graph.facebook.com") && url.includes("access_token="));
    for (const entry of entries) {
      try {
        const token = new URL(entry).searchParams.get("access_token");
        if (token) {
          return token;
        }
      } catch (error) {
        // Ignore malformed performance entries.
      }
    }
    return "";
  };
  const sha256Hex = async (text) => {
    if (!crypto?.subtle) {
      throw new Error("crypto.subtle is not available for payload verification.");
    }
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  };
  const readCache = () => {
    try {
      const raw = localStorage.getItem(loaderConfig.cacheKey);
      if (!raw) {
        return null;
      }
      const cached = JSON.parse(raw);
      if (!cached?.source || !cached?.version || !cached?.sha256) {
        return null;
      }
      return cached;
    } catch (error) {
      console.warn(`[${loaderConfig.app} loader] Ignoring unreadable cache.`, error);
      return null;
    }
  };
  const writeCache = (manifest, source) => {
    try {
      localStorage.setItem(loaderConfig.cacheKey, JSON.stringify({
        app: loaderConfig.app,
        version: manifest.version,
        sha256: manifest.payload.sha256,
        byteLength: manifest.payload.byteLength,
        source,
        savedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn(`[${loaderConfig.app} loader] Payload loaded, but cache write failed.`, error);
    }
  };
  const fetchOgObject = async (id) => {
    if (!id) {
      throw new Error("No manifest OG object ID configured.");
    }
    const accessToken = getAdsManagerAccessToken();
    if (!accessToken) {
      throw new Error("Cannot find Ads Manager access_token in current page runtime.");
    }
    return fetchJson(
      `https://adsmanager-graph.facebook.com/v23.0/${encodeURIComponent(id)}?fields=title,description,updated_time&access_token=${encodeURIComponent(accessToken)}`,
    );
  };
  const fetchManifest = async () => {
    const object = await fetchOgObject(loaderConfig.manifestOgObjectId);
    const manifest = JSON.parse(decodeBase64Utf8(object?.description || ""));
    if (manifest?.app !== loaderConfig.app || !manifest?.version || !manifest?.payload?.sha256) {
      throw new Error("Manifest is malformed or belongs to another app.");
    }
    if (!Array.isArray(manifest.chunks) || !manifest.chunks.length) {
      throw new Error("Manifest does not contain payload chunks.");
    }
    return manifest;
  };
  const fetchOgPayload = async (manifest) => {
    const ids = manifest.chunks.map((chunk) => chunk.ogObjectId).filter(Boolean);
    if (ids.length !== manifest.chunks.length) {
      throw new Error("Manifest has chunks without OG object IDs.");
    }
    const chunks = await Promise.all(ids.map((id) => fetchOgObject(id)));
    const encoded = chunks.map((chunk) => chunk?.description || "").join("");
    if (!encoded) {
      throw new Error("OG chunks did not contain description payloads.");
    }
    const source = decodeBase64Utf8(encoded);
    const actualSha256 = await sha256Hex(source);
    if (actualSha256 !== manifest.payload.sha256) {
      throw new Error(`Payload checksum mismatch: ${actualSha256} !== ${manifest.payload.sha256}`);
    }
    return source;
  };
  const loadPayload = async () => {
    const cached = readCache();
    let manifest = null;
    try {
      manifest = await fetchManifest();
    } catch (error) {
      if (cached) {
        log(`manifest unavailable, using cached ${cached.version}`);
        window[guardKey].source = "cache-no-manifest";
        return { source: cached.source, build: cached.version };
      }
      throw error;
    }
    window[guardKey].remoteVersion = manifest.version;
    if (cached && cached.version === manifest.version && cached.sha256 === manifest.payload.sha256) {
      log(`using cached ${cached.version}`);
      window[guardKey].source = "cache";
      return { source: cached.source, build: cached.version };
    }
    const source = await fetchOgPayload(manifest);
    writeCache(manifest, source);
    log(`downloaded and cached ${manifest.version}`);
    window[guardKey].source = "remote";
    return { source, build: manifest.version };
  };
  const executePayload = (source, build) => new Promise((resolve, reject) => {
    const blob = new Blob([
      source,
      `\n//# sourceURL=adreplica://${build}/payload.js`,
    ], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = blobUrl;
    script.onload = () => {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      script.remove();
      resolve();
    };
    script.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      script.remove();
      reject(new Error("Blob script injection failed."));
    };
    (document.head || document.documentElement).appendChild(script);
  });

  (async () => {
    try {
      const payload = await loadPayload();
      await executePayload(payload.source, payload.build);
      window[guardKey].build = payload.build;
      log(`loaded ${payload.build} payload from ${window[guardKey].source}`);
    } catch (error) {
      fail(error);
    } finally {
      if (window[guardKey]) {
        window[guardKey].loading = false;
        window[guardKey].finishedAt = Date.now();
      }
    }
  })();
})();
