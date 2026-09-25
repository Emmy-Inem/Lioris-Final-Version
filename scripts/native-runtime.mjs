#!/usr/bin/env node
// Keeps over-the-air (OTA) updates safe for the installed Android/iOS apps.
//
// An OTA update only reaches installs with the same runtime version (`version` in app.config.ts, see
// runtimeVersion.policy). That is safe only while the JavaScript we publish can run on the native code inside those
// installs. native-runtime.json records what the native side looked like for the current runtime version (native
// modules and the native part of the Expo config), and this script fails when the code drifts away from it:
//
//   node scripts/native-runtime.mjs           check  (CI and the OTA publish job; also `npm run native-runtime`)
//   node scripts/native-runtime.mjs update    record the current state, after bumping `version` for a new store build
//
// Native packages count at major.minor. A patch release keeps the native API, so patch bumps stay OTA-safe.
// Needs node_modules (it looks for android/ios/plugin files) and Node 22.18+ (it imports app.config.ts directly).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recordPath = join(root, 'native-runtime.json');

// Config that only affects JavaScript or the store listing, or that changes per build (version codes).
const NON_NATIVE_CONFIG = ['version', 'runtimeVersion', 'updates', 'extra', 'experiments', 'assetBundlePatterns', 'web'];
const PER_BUILD_CONFIG = { android: ['versionCode'], ios: ['buildNumber'] };

function die(message) {
  console.error(`native-runtime: ${message}`);
  process.exit(1);
}

async function loadConfig() {
  process.env.APP_ENV = 'production';
  delete process.env.ANDROID_VERSION_CODE;
  const mod = await import(pathToFileURL(join(root, 'app.config.ts')).href);
  return mod.default({ config: {} });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  }
  return value;
}

function nativeConfigSignature(config) {
  const kept = { ...config };
  for (const key of NON_NATIVE_CONFIG) delete kept[key];
  for (const [platform, keys] of Object.entries(PER_BUILD_CONFIG)) {
    if (kept[platform]) {
      kept[platform] = { ...kept[platform] };
      for (const key of keys) delete kept[platform][key];
    }
  }
  return createHash('sha256').update(JSON.stringify(stable(kept))).digest('hex').slice(0, 16);
}

function hasNativeCode(dir) {
  if (!existsSync(dir)) return false;
  if (['android/build.gradle', 'android/build.gradle.kts', 'expo-module.config.json', 'app.plugin.js']
    .some((file) => existsSync(join(dir, file)))) {
    return true;
  }
  return readdirSync(dir).some((file) => file.endsWith('.podspec'));
}

function nativePackages() {
  const lockPath = join(root, 'package-lock.json');
  if (!existsSync(join(root, 'node_modules'))) die('node_modules is missing; run npm ci first.');
  const packages = JSON.parse(readFileSync(lockPath, 'utf8')).packages ?? {};
  const found = new Set();
  for (const [path, meta] of Object.entries(packages)) {
    const at = path.lastIndexOf('node_modules/');
    if (at === -1 || !meta.version) continue;
    if (!hasNativeCode(join(root, path))) continue;
    const [major, minor] = meta.version.split('.');
    found.add(`${path.slice(at + 'node_modules/'.length)}@${major}.${minor}`);
  }
  return [...found].sort();
}

async function current() {
  const config = await loadConfig();
  return {
    version: config.version,
    configSignature: nativeConfigSignature(config),
    nativePackages: nativePackages(),
  };
}

function readRecord() {
  if (!existsSync(recordPath)) return null;
  return JSON.parse(readFileSync(recordPath, 'utf8'));
}

function drift(record, now) {
  const before = new Set(record.nativePackages);
  const after = new Set(now.nativePackages);
  return {
    added: now.nativePackages.filter((p) => !before.has(p)),
    removed: record.nativePackages.filter((p) => !after.has(p)),
    configChanged: record.configSignature !== now.configSignature,
  };
}

function describe(d) {
  const lines = [];
  if (d.added.length) lines.push(`  native packages added or upgraded: ${d.added.join(', ')}`);
  if (d.removed.length) lines.push(`  native packages removed or replaced: ${d.removed.join(', ')}`);
  if (d.configChanged) lines.push('  native part of app.config.ts changed (plugins, permissions, package ids, icons...)');
  return lines.join('\n');
}

const command = process.argv[2] ?? 'check';
if (!['check', 'update'].includes(command)) die(`unknown command "${command}" (use check or update).`);

const now = await current();
const record = readRecord();
const d = record ? drift(record, now) : null;
const drifted = d ? d.added.length > 0 || d.removed.length > 0 || d.configChanged : false;

if (command === 'update') {
  if (record && drifted && record.runtimeVersion === now.version) {
    die(`native code changed but \`version\` is still ${now.version}. Bump \`version\` in app.config.ts first, so the new store build gets a new runtime version.\n${describe(d)}`);
  }
  writeFileSync(recordPath, `${JSON.stringify({ runtimeVersion: now.version, configSignature: now.configSignature, nativePackages: now.nativePackages }, null, 2)}\n`);
  console.log(`native-runtime: recorded runtime version ${now.version} (${now.nativePackages.length} native packages).`);
  process.exit(0);
}

if (!record) die('native-runtime.json is missing. Run `npm run native-runtime -- update` and commit it.');

if (drifted && record.runtimeVersion === now.version) {
  die(
    `native code changed since runtime version ${record.runtimeVersion} was recorded, and OTA updates cannot carry native changes.\n${describe(d)}\n` +
    'To ship it: bump `version` in app.config.ts, build and release new store apps, then run `npm run native-runtime -- update` and commit native-runtime.json.\n' +
    'Installed apps on the old version keep the JavaScript they have; only apps built with the new version get updates from now on.',
  );
}
if (record.runtimeVersion !== now.version) {
  die(`app.config.ts version is ${now.version} but native-runtime.json records ${record.runtimeVersion}. Run \`npm run native-runtime -- update\` and commit the file.`);
}
console.log(`native-runtime: OK (runtime version ${now.version}, ${now.nativePackages.length} native packages).`);
