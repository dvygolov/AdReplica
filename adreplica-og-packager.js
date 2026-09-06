#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const SOURCE = path.join(ROOT, "adreplica.js");
const LOADER_SOURCE = path.join(ROOT, "adreplica-loader.js");
const LANDING_SCREENSHOT = path.join(ROOT, "target-current.png");
const OUT_ROOT = path.join(ROOT, "dist", "adreplica");
const CHUNK_SIZE = 350000;
const APP_MARK_FILE = "assets/adreplica-mark.svg";

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitString(input, chunkSize) {
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  const chunks = [];
  for (let index = 0; index < input.length; index += chunkSize) {
    chunks.push(input.slice(index, index + chunkSize));
  }
  return chunks;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildAppMarkSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="AdReplica mark">',
    '  <defs>',
    '    <linearGradient id="adreplica-gold" x1="0%" x2="100%" y1="0%" y2="100%">',
    '      <stop offset="0%" stop-color="#ffe16a"/>',
    '      <stop offset="55%" stop-color="#ffd000"/>',
    '      <stop offset="100%" stop-color="#ffab00"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect x="4" y="4" width="88" height="88" rx="22" fill="#151515" stroke="url(#adreplica-gold)" stroke-width="6"/>',
    '  <rect x="23" y="25" width="34" height="42" rx="6" fill="#222" stroke="#fff2bd" stroke-width="4"/>',
    '  <rect x="39" y="29" width="34" height="42" rx="6" fill="#151515" stroke="url(#adreplica-gold)" stroke-width="5"/>',
    '  <path d="M48 56 56 40l8 16" fill="none" stroke="url(#adreplica-gold)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
    '  <path d="M52 51h8" fill="none" stroke="#fff2bd" stroke-width="4" stroke-linecap="round"/>',
    '  <path d="M33 37h11M33 49h9M33 61h8" fill="none" stroke="#ffd000" stroke-width="4" stroke-linecap="round" opacity=".72"/>',
    '</svg>',
  ].join("\n");
}

function parseListArg(name) {
  return readArg(name, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function detectBuild(source) {
  const match = source.match(/VERSION:\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Cannot detect AdReplica VERSION in source file.");
  }
  return match[1];
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function pruneOldBuildDirs(outRoot, currentBuild) {
  if (!fs.existsSync(outRoot)) return;
  for (const entry of fs.readdirSync(outRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "latest" || entry.name === currentBuild) continue;
    if (!/^\d{6}b\d+$/i.test(entry.name)) continue;
    fs.rmSync(path.join(outRoot, entry.name), { recursive: true, force: true });
  }
}

function buildOgHtml({ appName, build, chunk, index, total }) {
  const title = `${appName} ${build} chunk ${index + 1}/${total}`;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="robots" content="noindex,nofollow" />',
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:title" content="${escapeHtml(title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(chunk)}" />`,
    `  <title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    `  <pre>${escapeHtml(title)}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function buildManifestHtml({ appName, build, manifestBase64 }) {
  const title = `${appName} ${build} manifest`;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="robots" content="noindex,nofollow" />',
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:title" content="${escapeHtml(title)}" />`,
    `  <meta property="og:description" content="${escapeHtml(manifestBase64)}" />`,
    `  <title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    `  <pre>${escapeHtml(title)}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function buildLandingHtml({ appName, displayName = appName, build, bookmarklet, screenshotUrl, iconUrl }) {
  const title = `${displayName} Loader`;
  const inlineMark = buildAppMarkSvg();
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <meta name="robots" content="noindex,nofollow" />',
    `  <meta name="description" content="${escapeHtml(displayName)} bookmarklet loader for Facebook Ads Manager campaign export, import, and clone workflows." />`,
    `  <link rel="icon" href="${escapeHtml(iconUrl)}" type="image/svg+xml" />`,
    "  <style>",
    "    :root {",
    "      --bg: #141414;",
    "      --panel: #202020;",
    "      --panel-2: #292929;",
    "      --ink: #f8f0c8;",
    "      --muted: #a5a08f;",
    "      --gold: #ffd000;",
    "      --gold-2: #ffab00;",
    "      --line: rgba(255, 208, 0, 0.34);",
    "      --soft: rgba(255, 208, 0, 0.11);",
    "    }",
    "    * { box-sizing: border-box; }",
    "    html { scroll-behavior: smooth; }",
    "    body {",
    "      margin: 0;",
    "      min-height: 100vh;",
    "      color: var(--ink);",
    "      font-family: 'Trebuchet MS', Verdana, sans-serif;",
    "      background:",
    "        radial-gradient(circle at 16% 12%, rgba(255, 208, 0, 0.28) 0 10rem, transparent 26rem),",
    "        radial-gradient(circle at 92% 18%, rgba(255, 171, 0, 0.18) 0 12rem, transparent 30rem),",
    "        linear-gradient(135deg, #101010, #1b1b1b 52%, #111);",
    "      overflow-x: hidden;",
    "    }",
    "    body::before {",
    "      content: '';",
    "      position: fixed;",
    "      inset: 0;",
    "      pointer-events: none;",
    "      opacity: 0.12;",
    "      background-image: linear-gradient(90deg, var(--gold) 1px, transparent 1px), linear-gradient(var(--gold) 1px, transparent 1px);",
    "      background-size: 44px 44px;",
    "      mask-image: linear-gradient(to bottom, black, transparent 85%);",
    "    }",
    "    a { color: inherit; }",
    "    main {",
    "      width: min(1180px, calc(100vw - 36px));",
    "      margin: 0 auto;",
    "      padding: 38px 0 72px;",
    "    }",
    "    .nav {",
    "      display: flex;",
    "      align-items: center;",
    "      justify-content: space-between;",
    "      gap: 20px;",
    "      margin-bottom: 24px;",
    "      color: var(--muted);",
    "      font-size: 13px;",
    "    }",
    "    .brand-wrap { display: grid; gap: 2px; }",
    "    .brand-line { display: inline-flex; align-items: center; gap: 12px; }",
    "    .brand-mark { width: 42px; height: 42px; display: block; flex: 0 0 auto; filter: drop-shadow(0 8px 18px rgba(255, 208, 0, 0.14)); }",
    "    .brand { color: var(--gold); font-size: 30px; font-weight: 900; letter-spacing: -0.05em; }",
    "    .byline { color: var(--muted); font-size: 13px; }",
    "    .byline a { color: var(--gold); text-decoration: none; }",
    "    .byline a:hover, .nav-links a:hover { text-decoration: underline; }",
    "    .nav-links { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }",
    "    .nav-links a { color: var(--muted); text-decoration: none; }",
    "    .tg-link {",
    "      display: inline-grid;",
    "      place-items: center;",
    "      width: 32px;",
    "      height: 32px;",
    "      border: 1px solid var(--line);",
    "      border-radius: 999px;",
    "      background: rgba(255, 208, 0, 0.08);",
    "      color: var(--gold);",
    "    }",
    "    .tg-link svg { width: 16px; height: 16px; display: block; }",
    "    .hero {",
    "      width: 100%;",
    "      border: 2px solid var(--gold);",
    "      border-radius: 22px;",
    "      background: linear-gradient(145deg, rgba(32, 32, 32, 0.98), rgba(18, 18, 18, 0.96));",
    "      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.44), 0 0 0 8px rgba(255, 208, 0, 0.05);",
    "      padding: clamp(24px, 4vw, 54px);",
    "      position: relative;",
    "      overflow: hidden;",
    "    }",
    "    .hero::after {",
    "      content: '';",
    "      position: absolute;",
    "      right: -80px;",
    "      top: -80px;",
    "      width: 220px;",
    "      height: 220px;",
    "      border-radius: 999px;",
    "      background: var(--soft);",
    "      border: 1px solid var(--line);",
    "    }",
    "    .eyebrow {",
    "      display: inline-flex;",
    "      gap: 10px;",
    "      align-items: center;",
    "      padding: 8px 12px;",
    "      border: 1px solid var(--gold);",
    "      border-radius: 999px;",
    "      background: rgba(255, 208, 0, 0.08);",
    "      color: var(--gold);",
    "      font: 800 12px/1.2 Verdana, sans-serif;",
    "      letter-spacing: 0.12em;",
    "      text-transform: uppercase;",
    "    }",
    "    .hero-grid {",
    "      display: grid;",
    "      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);",
    "      gap: clamp(28px, 4vw, 48px);",
    "      align-items: center;",
    "      position: relative;",
    "      z-index: 1;",
    "    }",
    "    h1 {",
    "      position: relative;",
    "      z-index: 1;",
    "      margin: 24px 0 36px;",
    "      color: #fff6c8;",
    "      font-size: clamp(38px, 5.6vw, 72px);",
    "      line-height: 1.04;",
    "      letter-spacing: -0.055em;",
    "      text-wrap: balance;",
    "    }",
    "    .lead {",
    "      max-width: 660px;",
    "      margin: 0;",
    "      color: #c9c1a5;",
    "      font: 16px/1.65 Verdana, sans-serif;",
    "    }",
    "    .shot {",
    "      margin: 0;",
    "      border: 1px solid var(--line);",
    "      border-radius: 18px;",
    "      background: #0f0f0f;",
    "      padding: 10px;",
    "      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);",
    "    }",
    "    .shot-window {",
    "      position: relative;",
    "      aspect-ratio: 550 / 400;",
    "      overflow: hidden;",
    "      border-radius: 10px;",
    "      background: #e9eaec;",
    "    }",
    "    .shot img {",
    "      display: block;",
    "      position: absolute;",
    "      /* Frame the panel at x=685, y=0 in the original 1920x921 screenshot. */",
    "      width: 349.091%;",
    "      max-width: none;",
    "      height: auto;",
    "      left: -124.545%;",
    "      top: 0;",
    "    }",
    "    .shot figcaption {",
    "      padding: 12px 4px 2px;",
    "      color: var(--muted);",
    "      font: 12px/1.5 Verdana, sans-serif;",
    "    }",
    "    .install {",
    "      display: grid;",
    "      gap: 20px;",
    "      justify-items: start;",
    "      margin-top: 28px;",
    "    }",
    "    .install-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; width: 100%; }",
    "    .copy-button {",
    "      padding: 12px 16px;",
    "      border: 1px solid var(--line);",
    "      border-radius: 999px;",
    "      background: rgba(255, 208, 0, 0.08);",
    "      color: var(--gold);",
    "      font: 700 13px/1.4 Verdana, sans-serif;",
    "      cursor: pointer;",
    "    }",
    "    .copy-button:hover { background: rgba(255, 208, 0, 0.16); }",
    "    .copy-status:empty { display: none; }",
    "    .bookmarklet {",
    "      display: inline-flex;",
    "      align-items: center;",
    "      justify-content: center;",
    "      min-height: 68px;",
    "      width: min(100%, 320px);",
    "      padding: 0 28px;",
    "      border: 3px solid #050505;",
    "      border-radius: 14px;",
    "      color: #111;",
    "      background: linear-gradient(135deg, var(--gold), var(--gold-2));",
    "      box-shadow: 8px 8px 0 #050505;",
    "      text-decoration: none;",
    "      font: 900 24px/1 Verdana, sans-serif;",
    "      cursor: grab;",
    "      user-select: none;",
    "      transition: transform 160ms ease, box-shadow 160ms ease;",
    "    }",
    "    .bookmarklet:hover { transform: translate(-2px, -2px); box-shadow: 10px 10px 0 #050505; }",
    "    .bookmarklet:active { cursor: grabbing; }",
    "    a:focus-visible, button:focus-visible { outline: 2px solid var(--gold); outline-offset: 5px; }",
    "    .hint {",
    "      margin: 0;",
    "      color: var(--muted);",
    "      font: 14px/1.65 Verdana, sans-serif;",
    "    }",
    "    .section { margin-top: 28px; }",
    "    .cards {",
    "      display: grid;",
    "      grid-template-columns: repeat(3, minmax(0, 1fr));",
    "      gap: 14px;",
    "    }",
    "    .card {",
    "      min-height: 154px;",
    "      border: 1px solid rgba(255, 208, 0, 0.25);",
    "      border-radius: 18px;",
    "      background: rgba(32, 32, 32, 0.82);",
    "      padding: 20px;",
    "    }",
    "    .card strong { display: block; color: var(--gold); font-size: 18px; margin-bottom: 10px; }",
    "    .card p { margin: 0; color: #c9c1a5; font: 14px/1.55 Verdana, sans-serif; }",
    "    .steps {",
    "      display: grid;",
    "      grid-template-columns: repeat(3, 1fr);",
    "      gap: 1px;",
    "      overflow: hidden;",
    "      border: 1px solid rgba(255, 208, 0, 0.25);",
    "      border-radius: 18px;",
    "      background: rgba(255, 208, 0, 0.25);",
    "    }",
    "    .step { background: #1d1d1d; padding: 18px; color: #d7cfb3; font: 14px/1.55 Verdana, sans-serif; }",
    "    .step b { color: var(--gold); display: block; margin-bottom: 8px; }",
    "    .footer { margin-top: 22px; color: var(--muted); font: 13px/1.5 Verdana, sans-serif; }",
    "    @media (max-width: 760px) {",
    "      .hero-grid { grid-template-columns: 1fr; }",
    "      .cards, .steps { grid-template-columns: 1fr; }",
    "      h1 { margin-bottom: 28px; }",
    "      .lead { max-width: none; }",
    "    }",
    "    @media (max-width: 480px) {",
    "      main { width: calc(100% - 24px); padding-top: 22px; }",
    "      .hero { padding: 24px 20px; }",
    "      .nav { align-items: flex-start; gap: 16px; flex-direction: column; }",
    "      .nav-links { gap: 18px; }",
    "      .bookmarklet { width: calc(100% - 8px); }",
    "      .install { justify-items: stretch; }",
    "    }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <nav class=\"nav\">",
    "      <div class=\"brand-wrap\">",
    `        <div class="brand-line"><span class="brand-mark">${inlineMark}</span><div class="brand">${escapeHtml(displayName)}</div></div>`,
    "        <div class=\"byline\">by <a href=\"https://yellowweb.top\" target=\"_blank\" rel=\"noopener\">Yellow Web</a></div>",
    "      </div>",
    "      <div class=\"nav-links\"><a href=\"#install\">Install</a><a href=\"#features\">Features</a><a href=\"#how\">How it works</a><a class=\"tg-link\" href=\"https://t.me/yellow_web\" target=\"_blank\" rel=\"noopener\" aria-label=\"Yellow Web Telegram\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M21.8 4.6 18.6 19.7c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.2 1.1 11.7c-1.1-.3-1.1-1.1.2-1.6L20.5 2.7c.9-.3 1.7.2 1.3 1.9Z\"/></svg></a></div>",
    "    </nav>",
    "    <section class=\"hero\" id=\"install\">",
    `      <div class="eyebrow">${escapeHtml(displayName)} build ${escapeHtml(build)}</div>`,
    "      <h1>Campaign cloning without leaving Ads Manager.</h1>",
    "      <div class=\"hero-grid\">",
    "        <div>",
    "          <p class=\"lead\">Export, import, and clone Facebook campaigns right in Ads Manager. Bring your drafts, media, pages, pixels, and catalogs with you.</p>",
    "          <div class=\"install\">",
    "            <div class=\"install-actions\">",
    `            <a class="bookmarklet" id="bookmarkletLink" draggable="true" aria-describedby="installHint" href="${escapeHtml(bookmarklet)}">AdReplica</a>`,
    "              <button class=\"copy-button\" id=\"copyBookmarklet\" type=\"button\">Copy to clipboard</button>",
    "            </div>",
    "            <p class=\"hint\" id=\"installHint\">Drag the yellow button to your bookmarks bar, or copy the code into a new bookmark's URL.<br>Then open Ads Manager and click the saved bookmark.</p>",
    "            <p class=\"hint copy-status\" id=\"copyStatus\" role=\"status\"></p>",
    "          </div>",
    "        </div>",
    "        <figure class=\"shot\">",
    "          <div class=\"shot-window\">",
    `            <img src="${escapeHtml(screenshotUrl)}" width="1920" height="921" alt="AdReplica panel in Ads Manager with Export, Import, and Clone tabs" />`,
    "          </div>",
    "          <figcaption>The AdReplica panel, right inside Ads Manager.</figcaption>",
    "        </figure>",
    "      </div>",
    "    </section>",
    "    <section class=\"section cards\" id=\"features\">",
    "      <div class=\"card\"><strong>Export</strong><p>Save campaign structure to JSON and collect required media for reproducible imports and comparisons.</p></div>",
    "      <div class=\"card\"><strong>Import</strong><p>Create real objects or drafts with page, pixel, schedule, media, dynamic creative, and catalog remapping.</p></div>",
    "      <div class=\"card\"><strong>Clone</strong><p>Copy a source campaign into another ad account in DRAFT, PAUSED, or ACTIVE mode without writing files to disk.</p></div>",
    "      <div class=\"card\"><strong>Draft-safe</strong><p>Uses Ads Manager draft fragments and validates against editor behavior instead of trusting Graph parity alone.</p></div>",
    "      <div class=\"card\"><strong>Catalog-aware</strong><p>Detects Advantage+ catalog ads, product sets, feeds, and BM constraints before cloning catalog campaigns.</p></div>",
    "      <div class=\"card\"><strong>Languages</strong><p>Preserves language/asset customization setups used by webmasters who localize creatives through Facebook's Languages flow.</p></div>",
    "      <div class=\"card\"><strong>Self-updating</strong><p>The loader bookmarklet reads a small OG manifest, verifies payload SHA-256, and caches the latest payload locally.</p></div>",
    "    </section>",
    "    <section class=\"section steps\" id=\"how\">",
    "      <div class=\"step\"><b>1. Install</b>Drag the yellow AdReplica button to your bookmarks bar, or use Copy to clipboard and paste the code into a new bookmark's URL.</div>",
    "      <div class=\"step\"><b>2. Open Ads Manager</b>Use the Facebook profile and ad account you want to work with, then click the bookmark.</div>",
    "      <div class=\"step\"><b>3. Export, import, clone</b>Choose an action in the AdReplica panel and select the campaigns you want to work with.</div>",
    "    </section>",
    "    <p class=\"footer\">by <a href=\"https://yellowweb.top\" target=\"_blank\" rel=\"noopener\">Yellow Web</a> · <a href=\"https://t.me/yellow_web\" target=\"_blank\" rel=\"noopener\">Telegram</a></p>",
    "  </main>",
    "  <script>",
    "    document.getElementById('copyBookmarklet').addEventListener('click', async function() {",
    "      var status = document.getElementById('copyStatus');",
    "      try {",
    "        await navigator.clipboard.writeText(document.getElementById('bookmarkletLink').getAttribute('href'));",
    "        status.textContent = 'Code copied. Paste it into a new bookmark’s URL field.';",
    "      } catch (error) {",
    "        status.textContent = 'Copy failed. Allow clipboard access and try again, or drag the yellow button to your bookmarks bar.';",
    "      }",
    "    });",
    "  </script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function main() {
  const sourcePath = path.resolve(readArg("source", SOURCE));
  const outRoot = path.resolve(readArg("out", OUT_ROOT));
  const distRoot = path.dirname(outRoot);
  const baseUrl = readArg("base-url", "");
  const appName = readArg("app", "AdReplica");
  const displayName = "Ad Replica";
  const chunkOgObjectIds = parseListArg("chunk-og-object-ids");
  const source = fs.readFileSync(sourcePath, "utf8");
  const build = readArg("build", detectBuild(source));
  const buildDir = path.join(outRoot, build);
  const latestDir = path.join(outRoot, "latest");
  const ogDir = path.join(buildDir, "og");
  const latestOgDir = path.join(latestDir, "og");
  const base64 = Buffer.from(source, "utf8").toString("base64");
  const chunks = splitString(base64, CHUNK_SIZE);
  const generatedAt = new Date().toISOString();

  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.rmSync(latestDir, { recursive: true, force: true });
  writeFile(path.join(buildDir, "payload.js"), source);
  writeFile(path.join(latestDir, "payload.js"), source);
  chunks.forEach((chunk, index) => {
    const chunkFileName = `chunk-${String(index + 1).padStart(3, "0")}.html`;
    const html = buildOgHtml({
      appName,
      build,
      chunk,
      index,
      total: chunks.length,
    });
    writeFile(path.join(ogDir, chunkFileName), html);
    writeFile(path.join(latestOgDir, chunkFileName), html);
  });

  const publicUrl = (relativePath) => {
    if (!baseUrl) return "";
    return `${baseUrl.replace(/\/+$/, "")}/${relativePath.replace(/\\/g, "/")}`;
  };
  const prettyPublicUrl = (relativePath) => publicUrl(relativePath).replace(/\.html(?=$|[?#])/, "");
  const manifest = {
    app: appName,
    build,
    version: build,
    generatedAt,
    payload: {
      encoding: "base64",
      sha256: sha256Hex(source),
      byteLength: Buffer.byteLength(source, "utf8"),
    },
    chunks: chunks.map((chunk, index) => ({
      index: index + 1,
      file: `og/chunk-${String(index + 1).padStart(3, "0")}.html`,
      url: prettyPublicUrl(`${build}/og/chunk-${String(index + 1).padStart(3, "0")}.html`),
      latestUrl: prettyPublicUrl(`latest/og/chunk-${String(index + 1).padStart(3, "0")}.html`),
      ogObjectId: chunkOgObjectIds[index] || "",
      base64Length: chunk.length,
      base64Sha256: sha256Hex(chunk),
    })),
  };
  const manifestJson = JSON.stringify(manifest);
  const manifestBase64 = Buffer.from(manifestJson, "utf8").toString("base64");
  const manifestHtml = buildManifestHtml({ appName, build, manifestBase64 });
  writeFile(path.join(buildDir, "manifest.html"), manifestHtml);
  writeFile(path.join(latestDir, "manifest.html"), manifestHtml);

  const packageInfo = {
    ...manifest,
    source: path.relative(ROOT, sourcePath).replace(/\\/g, "/"),
    chunkSize: CHUNK_SIZE,
    payloadFile: "payload.js",
    manifestFile: "manifest.html",
    manifestUrl: prettyPublicUrl(`${build}/manifest.html`),
    latestManifestUrl: prettyPublicUrl("latest/manifest.html"),
  };
  writeFile(path.join(buildDir, "package-info.json"), `${JSON.stringify(packageInfo, null, 2)}\n`);
  writeFile(path.join(latestDir, "package-info.json"), `${JSON.stringify(packageInfo, null, 2)}\n`);
  const loaderSource = fs.readFileSync(LOADER_SOURCE, "utf8");
  const bookmarklet = `javascript:${encodeURIComponent(loaderSource)}`;
  const toolMeta = {
    app: appName,
    title: displayName,
    shortName: "Ad Replica",
    description: "Campaign export, import, clone, media, identities, pixels, and catalogs for Ads Manager.",
    build,
    version: build,
    landingUrl: "https://adreplica.pages.dev/",
    sourceUrl: "https://github.com/dvygolov/AdReplica",
    bookmarkletHref: bookmarklet,
    latestManifestUrl: packageInfo.latestManifestUrl,
    generatedAt,
  };
  writeFile(path.join(latestDir, "tool-meta.json"), `${JSON.stringify(toolMeta, null, 2)}\n`);
  const screenshotUrl = "assets/adreplica-ui.png";
  const iconUrl = APP_MARK_FILE;
  if (fs.existsSync(LANDING_SCREENSHOT)) {
    fs.mkdirSync(path.join(distRoot, "assets"), { recursive: true });
    fs.copyFileSync(LANDING_SCREENSHOT, path.join(distRoot, screenshotUrl));
  }
  writeFile(path.join(distRoot, APP_MARK_FILE), `${buildAppMarkSvg()}\n`);
  writeFile(path.join(distRoot, "index.html"), buildLandingHtml({
    appName,
    displayName,
    build,
    bookmarklet,
    screenshotUrl,
    iconUrl,
  }));
  writeFile(path.join(distRoot, "_headers"), [
    "/",
    "  Cache-Control: no-store",
    "",
    "/*",
    "  Cache-Control: no-store",
    "",
    "/adreplica/*",
    "  Access-Control-Allow-Origin: *",
    "  Cache-Control: no-store",
    "",
  ].join("\n"));
  writeFile(path.join(distRoot, "_redirects"), [
    "/ /index.html 200",
    "/* /index.html 200",
    "",
  ].join("\n"));
  pruneOldBuildDirs(outRoot, build);

  console.log(`AdReplica ${build} packaged.`);
  console.log(`Payload: ${path.join(buildDir, "payload.js")}`);
  console.log(`Latest payload: ${path.join(latestDir, "payload.js")}`);
  console.log(`OG chunks: ${chunks.length}`);
  if (baseUrl) {
    console.log(`Manifest latest URL: ${packageInfo.latestManifestUrl}`);
    console.log("Scrape the stable latest manifest and OG chunk URLs, then pass returned IDs back to the packager:");
    console.log(`- ${packageInfo.latestManifestUrl}`);
    for (const chunk of packageInfo.chunks) {
      console.log(`- ${chunk.latestUrl}`);
    }
  }
}

main();
