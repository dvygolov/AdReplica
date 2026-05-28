#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const PACKAGE_LOCK = path.join(ROOT, "package-lock.json");
const VERSION_FILE_EXTENSIONS = new Set([".js", ".mjs"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getTodayPrefix(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
}

function nextBuildVersion(currentVersion, todayPrefix = getTodayPrefix()) {
  const match = String(currentVersion || "").match(/^(\d{6})b(\d+)$/);
  if (!match || match[1] !== todayPrefix) {
    return `${todayPrefix}b1`;
  }
  return `${todayPrefix}b${Number(match[2]) + 1}`;
}

function updatePackageLock(nextVersion) {
  if (!fs.existsSync(PACKAGE_LOCK)) {
    return;
  }
  const lock = readJson(PACKAGE_LOCK);
  lock.version = nextVersion;
  if (lock.packages?.[""]) {
    lock.packages[""].version = nextVersion;
  }
  writeJson(PACKAGE_LOCK, lock);
}

function listRootVersionFiles() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VERSION_FILE_EXTENSIONS.has(path.extname(entry.name)))
    .map((entry) => path.join(ROOT, entry.name));
}

function updateSourceVersions(nextVersion) {
  let changed = 0;
  for (const filePath of listRootVersionFiles()) {
    const source = fs.readFileSync(filePath, "utf8");
    const updated = source
      .replace(/VERSION:\s*"(\d{6}b\d+)"/g, `VERSION: "${nextVersion}"`)
      .replace(/VERSION:"(\d{6}b\d+)"/g, `VERSION:"${nextVersion}"`)
      .replace(/FINE_BUILD\s*=\s*"(\d{6}b\d+)"/g, `FINE_BUILD = "${nextVersion}"`);
    if (updated !== source) {
      fs.writeFileSync(filePath, updated);
      changed += 1;
    }
  }
  return changed;
}

function main() {
  const pkg = readJson(PACKAGE_JSON);
  const previousVersion = pkg.version;
  const nextVersion = nextBuildVersion(previousVersion);
  pkg.version = nextVersion;
  writeJson(PACKAGE_JSON, pkg);
  updatePackageLock(nextVersion);
  const changedSources = updateSourceVersions(nextVersion);
  console.log(`${pkg.name || "app"} build version: ${previousVersion} -> ${nextVersion} (${changedSources} source file(s))`);
}

main();
