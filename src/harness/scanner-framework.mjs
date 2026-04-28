import * as fs from "node:fs/promises";
import { homedir, platform } from "node:os";
import { validateAdapter } from "./interface.mjs";

/**
 * Build the context object passed to every adapter hook and scanner.
 *
 * @param {import("./interface.mjs").HarnessAdapter} adapter
 * @param {Record<string, *>} [options]
 * @returns {import("./interface.mjs").HarnessContext}
 */
export function createHarnessContext(adapter, options = {}) {
  return {
    harnessId: adapter.id,
    home: options.home || homedir(),
    cwd: options.cwd || process.cwd(),
    platform: options.platform || platform(),
    env: options.env || process.env,
    options,
    fs: options.fs || fs,
  };
}

/**
 * Count scanned items by category.
 *
 * @param {import("./interface.mjs").HarnessItem[]} items
 * @returns {Record<string, number>}
 */
export function buildCounts(items) {
  const counts = { total: items.length };
  for (const item of items) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }
  return counts;
}

function descriptorFor(adapter) {
  return {
    id: adapter.id,
    displayName: adapter.displayName,
    shortName: adapter.shortName,
    icon: adapter.icon,
    iconSvg: adapter.iconSvg,
    executable: adapter.executable,
  };
}

function splitExtras(extras = {}) {
  const {
    effective = null,
    notices = [],
    adapterData = {},
    ...rest
  } = extras || {};

  return {
    effective,
    notices,
    adapterData: { ...rest, ...adapterData },
  };
}

function adapterMetadata(adapter) {
  const metadata = {};
  if (adapter.prompts) metadata.prompts = adapter.prompts;
  return metadata;
}

/**
 * Assemble a stable ScanResult shape for UI/API consumers.
 *
 * @param {import("./interface.mjs").HarnessAdapter} adapter
 * @param {import("./interface.mjs").HarnessScope[]} scopes
 * @param {import("./interface.mjs").HarnessItem[]} items
 * @param {Record<string, *>} [extras]
 * @returns {import("./interface.mjs").ScanResult}
 */
export function normalizeScanResult(adapter, scopes, items, extras = {}) {
  const normalizedExtras = splitExtras(extras);

  return {
    harness: descriptorFor(adapter),
    categories: adapter.categories,
    scopeTypes: adapter.scopeTypes,
    capabilities: adapter.capabilities,
    scopes,
    items,
    counts: buildCounts(items),
    effective: normalizedExtras.effective,
    notices: normalizedExtras.notices,
    adapterData: { ...adapterMetadata(adapter), ...normalizedExtras.adapterData },
  };
}

async function runScopeScanners(adapter, scope, ctx) {
  const categoryScans = Object.entries(adapter.scanners).map(async ([categoryId, scanner]) => {
    const items = await scanner(scope, ctx);
    if (!Array.isArray(items)) {
      throw new TypeError(`Scanner ${adapter.id}.${categoryId} must return an array`);
    }
    return items;
  });

  return (await Promise.all(categoryScans)).flat();
}

/**
 * Run all scanners exposed by a harness adapter.
 *
 * @param {import("./interface.mjs").HarnessAdapter} adapter
 * @param {Record<string, *>} [options]
 * @returns {Promise<import("./interface.mjs").ScanResult>}
 */
export async function scanHarness(adapter, options = {}) {
  validateAdapter(adapter);

  const ctx = createHarnessContext(adapter, options);
  await adapter.beforeScan?.(ctx);

  const scopes = await adapter.discoverScopes(ctx);
  if (!Array.isArray(scopes)) {
    throw new TypeError(`Adapter ${adapter.id} discoverScopes(ctx) must return an array`);
  }

  const scopedItems = (await Promise.all(
    scopes.map(scope => runScopeScanners(adapter, scope, ctx))
  )).flat();

  const globalItems = adapter.scanGlobalItems
    ? await adapter.scanGlobalItems(ctx)
    : [];
  if (!Array.isArray(globalItems)) {
    throw new TypeError(`Adapter ${adapter.id} scanGlobalItems(ctx) must return an array`);
  }

  const items = [...scopedItems, ...globalItems];
  const partialResult = normalizeScanResult(adapter, scopes, items);
  const extras = await adapter.afterScan?.(ctx, partialResult);

  if (extras && typeof extras !== "object") {
    throw new TypeError(`Adapter ${adapter.id} afterScan(ctx, result) must return an object or undefined`);
  }

  return extras === undefined
    ? partialResult
    : normalizeScanResult(adapter, scopes, items, extras);
}
