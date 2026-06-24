#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const build = process.argv[2] || process.env.BUILD_VERSION || "";
const latestRoot = path.resolve(process.argv[3] || process.env.LATEST_ROOT || "");
const token = process.argv[4] || process.env.FB_GRAPH_SCRAPE_TOKEN || "";

function fail(message) {
  throw new Error(message);
}

if (!build) fail("Missing build version.");
if (!latestRoot) fail("Missing latest root path.");
if (!token) fail("Missing Facebook Graph scrape token.");

const packageInfoPath = path.join(latestRoot, "package-info.json");
if (!fs.existsSync(packageInfoPath)) {
  fail(`Missing ${packageInfoPath}.`);
}

const packageInfo = JSON.parse(fs.readFileSync(packageInfoPath, "utf8"));
const targets = [
  packageInfo.latestManifestUrl,
  ...(Array.isArray(packageInfo.chunks) ? packageInfo.chunks.map((chunk) => chunk.latestUrl) : []),
].filter(Boolean);

if (!targets.length) {
  fail("No OG targets found in latest package-info.json.");
}

function graphUrl(target, scrape) {
  const url = new URL("https://graph.facebook.com/v23.0/");
  url.searchParams.set("id", target);
  url.searchParams.set("fields", "og_object");
  if (scrape) {
    url.searchParams.set("scrape", "true");
    url.searchParams.set("method", "post");
  }
  url.searchParams.set("access_token", token);
  return url;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`Graph request failed for ${url}: ${response.status} ${text.slice(0, 300)}`);
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyTarget(target) {
  const maxAttempts = 8;
  const delayMs = 5000;
  let lastTitle = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const verify = await requestJson(graphUrl(target, false));
    const title = String(verify?.og_object?.title || "");
    if (title.includes(build)) {
      return title;
    }
    lastTitle = title;
    if (attempt < maxAttempts) {
      console.log(
        `Waiting for updated OG title for ${target} (attempt ${attempt}/${maxAttempts}, got "${title || "<empty>"}").`,
      );
      await sleep(delayMs);
    }
  }

  fail(`OG title mismatch for ${target}: expected build ${build}, got "${lastTitle}"`);
}

for (const target of targets) {
  await requestJson(graphUrl(target, true), { method: "POST" });
  const title = await verifyTarget(target);
  console.log(`${target} -> ${title}`);
}
