/**
 * Harness adapter interface contract.
 *
 * These typedefs describe the stable shape shared by harness adapters,
 * scanners, UI routes, and operations. They intentionally preserve the
 * existing scanner.mjs scope/item fields so Phase 1 can layer on top of the
 * current Claude Code data model without breaking callers.
 */

/** @typedef {string} CategoryId */
/** @typedef {string} ScopeTypeId */

/**
 * @typedef {object} HarnessCapabilities
 * @property {boolean} contextBudget
 * @property {boolean} mcpControls
 * @property {boolean} mcpPolicy
 * @property {boolean} mcpSecurity
 * @property {boolean} sessions
 * @property {boolean} effective
 * @property {boolean} backup
 */

/**
 * @typedef {object} HarnessContext
 * @property {string} harnessId
 * @property {string} home
 * @property {string} cwd
 * @property {NodeJS.Platform} platform
 * @property {NodeJS.ProcessEnv} env
 * @property {Record<string, *>} options
 * @property {typeof import("node:fs/promises")} fs
 */

/**
 * @typedef {object} CategoryDef
 * @property {CategoryId} id
 * @property {string} label
 * @property {string} filterLabel
 * @property {string} icon
 * @property {number} order
 * @property {string} group
 * @property {string} source
 * @property {string} preview
 * @property {boolean} movable
 * @property {boolean} deletable
 * @property {boolean} participatesInEffective
 * @property {string} effectiveRule
 * @property {string} sortDefault
 */

/**
 * @typedef {object} ScopeTypeDef
 * @property {ScopeTypeId} id
 * @property {string} label
 * @property {string} icon
 * @property {boolean} isGlobal
 */

/**
 * @typedef {object} HarnessScope
 * @property {string} id
 * @property {string} name
 * @property {ScopeTypeId} type
 * @property {string} tag
 * @property {string|null} parentId
 * @property {string|null} repoDir
 * @property {string|null} configDir
 * @property {Record<string, *>} [data]
 * @property {string|null} [claudeProjectDir] Existing Claude scanner field.
 */

/**
 * Existing scanner.mjs-compatible inventory item.
 *
 * @typedef {object} HarnessItem
 * @property {CategoryId} category
 * @property {string} scopeId
 * @property {string} name
 * @property {string} [fileName]
 * @property {string} [description]
 * @property {string} [subType]
 * @property {string} [size]
 * @property {number} [sizeBytes]
 * @property {string} [mtime]
 * @property {string} [ctime]
 * @property {string} [path]
 * @property {string} [openPath]
 * @property {string} [previewPath]
 * @property {boolean} [locked]
 * @property {boolean} [movable]
 * @property {boolean} [deletable]
 * @property {string|null} [bundle]
 * @property {*} [value]
 * @property {string} [valueType]
 * @property {string} [sourceFile]
 * @property {string} [sourceTier]
 * @property {string} [settingGroup]
 * @property {Record<string, *>} [mcpConfig]
 * @property {Record<string, *>} [data]
 */

/**
 * @typedef {object} EffectiveModel
 * @property {Record<string, *>[]} rules
 * @property {CategoryId[]} includeGlobalCategories
 * @property {boolean} shadowByName
 * @property {boolean} conflictByName
 * @property {CategoryId[]} ancestorCategories
 */

/**
 * @typedef {object} PromptAction
 * @property {string} id
 * @property {string} icon
 * @property {string} label
 * @property {string} info
 * @property {string} kind
 * @property {string} template
 * @property {string|Function} when
 */

/**
 * @typedef {object} HarnessOperations
 * @property {(item: HarnessItem, scopes: HarnessScope[]) => *} getValidDestinations
 * @property {(item: HarnessItem, toScopeId: string, scopes: HarnessScope[]) => Promise<*>} moveItem
 * @property {(item: HarnessItem, scopes: HarnessScope[]) => Promise<*>} deleteItem
 * @property {(backupPath: string, options?: Record<string, *>) => Promise<*>} [restoreItem]
 * @property {(entry: Record<string, *>, options?: Record<string, *>) => Promise<*>} [restoreMcpEntry]
 */

/**
 * @typedef {object} HarnessDescriptor
 * @property {string} id
 * @property {string} displayName
 * @property {string} shortName
 * @property {string} icon
 * @property {string} [iconSvg]
 * @property {string} executable
 */

/**
 * @typedef {object} ScanResult
 * @property {HarnessDescriptor} harness
 * @property {CategoryDef[]} categories
 * @property {ScopeTypeDef[]} scopeTypes
 * @property {HarnessCapabilities} capabilities
 * @property {HarnessScope[]} scopes
 * @property {HarnessItem[]} items
 * @property {Record<string, number>} counts
 * @property {EffectiveModel|null} effective
 * @property {Array<string|Record<string, *>>} notices
 * @property {Record<string, *>} adapterData
 */

/**
 * @typedef {object} HarnessAdapter
 * @property {string} id
 * @property {string} displayName
 * @property {string} shortName
 * @property {string} icon
 * @property {string} [iconSvg]
 * @property {string} executable
 * @property {CategoryDef[]} categories
 * @property {ScopeTypeDef[]} scopeTypes
 * @property {HarnessCapabilities} capabilities
 * @property {(ctx: HarnessContext) => { rootDir: string, backupDir: string, safeRoots: string[] }} getPaths
 * @property {(ctx: HarnessContext) => Promise<HarnessScope[]>} discoverScopes
 * @property {Record<CategoryId, (scope: HarnessScope, ctx: HarnessContext) => Promise<HarnessItem[]>>} scanners
 * @property {(ctx: HarnessContext) => Promise<HarnessItem[]>} [scanGlobalItems]
 * @property {(ctx: HarnessContext) => Promise<void>|void} [beforeScan]
 * @property {(ctx: HarnessContext, result: Partial<ScanResult>) => Promise<Record<string, *>|void>|Record<string, *>|void} [afterScan]
 * @property {*} [effective]
 * @property {*} [prompts]
 * @property {*} [itemConfig]
 * @property {*} [contextBudget]
 * @property {*} [sessions]
 * @property {*} [mcpControls]
 * @property {*} [mcpPolicy]
 * @property {*} [security]
 * @property {HarnessOperations} [operations]
 */

const REQUIRED_ADAPTER_STRINGS = ["id", "displayName", "shortName", "icon", "executable"];
const REQUIRED_CAPABILITIES = ["contextBudget", "mcpControls", "mcpPolicy", "mcpSecurity", "sessions", "effective", "backup"];

function assertCondition(condition, message) {
  if (!condition) throw new TypeError(`Invalid harness adapter: ${message}`);
}

/**
 * Validate an adapter at registration/startup time.
 *
 * @param {HarnessAdapter} adapter
 * @returns {HarnessAdapter}
 */
export function validateAdapter(adapter) {
  assertCondition(adapter && typeof adapter === "object", "adapter must be an object");

  for (const field of REQUIRED_ADAPTER_STRINGS) {
    assertCondition(typeof adapter[field] === "string" && adapter[field].trim(), `${field} is required`);
  }

  assertCondition(Array.isArray(adapter.categories), "categories must be an array");
  assertCondition(Array.isArray(adapter.scopeTypes), "scopeTypes must be an array");
  assertCondition(adapter.capabilities && typeof adapter.capabilities === "object", "capabilities is required");

  for (const field of REQUIRED_CAPABILITIES) {
    assertCondition(typeof adapter.capabilities[field] === "boolean", `capabilities.${field} must be boolean`);
  }

  assertCondition(typeof adapter.getPaths === "function", "getPaths(ctx) is required");
  assertCondition(typeof adapter.discoverScopes === "function", "discoverScopes(ctx) is required");
  assertCondition(adapter.scanners && typeof adapter.scanners === "object", "scanners record is required");

  for (const category of adapter.categories) {
    assertCondition(category && typeof category.id === "string" && category.id.trim(), "each category needs an id");
    assertCondition(typeof category.label === "string", `category ${category.id} needs a label`);
    assertCondition(typeof adapter.scanners[category.id] === "function", `scanner for category ${category.id} is required`);
  }

  for (const scopeType of adapter.scopeTypes) {
    assertCondition(scopeType && typeof scopeType.id === "string" && scopeType.id.trim(), "each scope type needs an id");
    assertCondition(typeof scopeType.label === "string", `scope type ${scopeType.id} needs a label`);
    assertCondition(typeof scopeType.isGlobal === "boolean", `scope type ${scopeType.id} needs isGlobal`);
  }

  return adapter;
}
