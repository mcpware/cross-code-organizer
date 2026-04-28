import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateAdapter } from "./interface.mjs";

const adapters = new Map();
let discoveryPromise = null;

function adapterSummary(adapter) {
  return {
    id: adapter.id,
    displayName: adapter.displayName,
    shortName: adapter.shortName,
    icon: adapter.icon,
  };
}

async function importAdapterModule(filePath) {
  const mod = await import(pathToFileURL(filePath).href);
  const candidates = [];

  if (mod.default) candidates.push(mod.default);
  if (mod.adapter) candidates.push(mod.adapter);
  if (Array.isArray(mod.adapters)) candidates.push(...mod.adapters);

  for (const candidate of candidates) {
    registerAdapter(candidate);
  }
}

async function discoverAdapters() {
  const adaptersDir = join(import.meta.dirname, "adapters");

  let entries;
  try {
    entries = await readdir(adaptersDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith(".mjs"))
      .map(entry => importAdapterModule(join(adaptersDir, entry.name)))
  );
}

async function ensureDiscovered() {
  if (!discoveryPromise) discoveryPromise = discoverAdapters();
  await discoveryPromise;
}

/**
 * Register one harness adapter.
 *
 * @param {import("./interface.mjs").HarnessAdapter} adapter
 * @returns {import("./interface.mjs").HarnessAdapter}
 */
export function registerAdapter(adapter) {
  const validated = validateAdapter(adapter);
  adapters.set(validated.id, validated);
  return validated;
}

/**
 * Return a registered adapter by id.
 *
 * @param {string} id
 * @returns {Promise<import("./interface.mjs").HarnessAdapter>}
 */
export async function getAdapter(id) {
  await ensureDiscovered();
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Unknown harness adapter: ${id}`);
  return adapter;
}

/**
 * List registered adapter descriptors.
 *
 * @returns {Promise<Array<{ id: string, displayName: string, shortName: string, icon: string }>>}
 */
export async function listAdapters() {
  await ensureDiscovered();
  return [...adapters.values()].map(adapterSummary);
}

/**
 * Default harness adapter id.
 *
 * @returns {string}
 */
export function getDefaultAdapterId() {
  return "claude";
}
