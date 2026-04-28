/**
 * scanner.mjs — legacy compatibility entrypoint.
 *
 * Claude-specific scanning now lives in src/harness/adapters/claude.mjs.
 */

import { getAdapter, getDefaultAdapterId, listAdapters } from "./harness/registry.mjs";
import { scanHarness as runHarnessScan } from "./harness/scanner-framework.mjs";

export {
  detectEnterpriseMcp,
  getDisabledMcpServers,
  setDisabledMcpServers,
  scanMcpPolicy,
  checkMcpPolicy,
} from "./harness/adapters/claude.mjs";

export { getAdapter, getDefaultAdapterId, listAdapters };

function normalizeHarnessArgs(harnessIdOrOptions, maybeOptions) {
  if (typeof harnessIdOrOptions === "string") {
    return {
      harnessId: harnessIdOrOptions || getDefaultAdapterId(),
      options: maybeOptions || {},
    };
  }

  return {
    harnessId: getDefaultAdapterId(),
    options: harnessIdOrOptions || {},
  };
}

/**
 * Run a scan through the harness registry.
 *
 * @param {string|Record<string, *>} [harnessIdOrOptions]
 * @param {Record<string, *>} [maybeOptions]
 * @returns {Promise<import("./harness/interface.mjs").ScanResult>}
 */
export async function scanHarness(harnessIdOrOptions = getDefaultAdapterId(), maybeOptions = {}) {
  const { harnessId, options } = normalizeHarnessArgs(harnessIdOrOptions, maybeOptions);
  const adapter = await getAdapter(harnessId);
  return runHarnessScan(adapter, options);
}

/**
 * Legacy scanner API. Defaults to Claude and preserves the pre-harness
 * response shape expected by the UI, tests, and older imports.
 */
export async function scan(options = {}) {
  const result = await scanHarness(getDefaultAdapterId(), options);
  return {
    scopes: result.scopes,
    items: result.items,
    counts: result.counts,
    enterpriseMcp: result.adapterData.enterpriseMcp,
  };
}
