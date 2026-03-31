/**
 * effective.mjs — Per-category effective resolution logic.
 *
 * Pure functions. No DOM, no UI, no side effects.
 * Shared between the dashboard frontend (app.js) and unit tests.
 *
 * Claude Code does not use one universal scope model. Each category
 * has its own official rules for availability, precedence, and inheritance.
 * This module implements those rules.
 */

/**
 * Categories that have an official effective rule.
 * Only these participate in "Show Effective" mode.
 */
export const EFFECTIVE_RULES = {
  skill:   "Available from Personal (~/.claude/skills), Project (.claude/skills), and installed Plugins",
  mcp:     "Resolved by local > project > user — same-name servers use the narrower scope",
  command: "Available from User and Project — same-name conflicts are not supported",
  agent:   "Project-level agents override same-name User agents",
  config:  "Resolved by precedence: managed > CLI > project local > project shared > user",
  hook:    "Configured in settings files — resolved by settings precedence",
  memory:  "Global memories are available in all projects; project memories are specific to this project",
};

/**
 * Returns true if a category participates in Show Effective.
 */
export function hasEffectiveRule(category) {
  return category in EFFECTIVE_RULES;
}

/**
 * Find scopes whose repoDir is a path ancestor of the given scope.
 * e.g. /work/company is an ancestor of /work/company/repo-a.
 *
 * @param {string} scopeId - The scope to find ancestors for
 * @param {Array} scopes - All scopes
 * @returns {Array} Ancestor scopes (deepest first)
 */
export function getAncestorScopes(scopeId, scopes) {
  const scope = scopes.find(s => s.id === scopeId);
  if (!scope?.repoDir) return [];
  return scopes.filter(s =>
    s.repoDir &&
    s.id !== scopeId &&
    s.id !== "global" &&
    scope.repoDir.startsWith(s.repoDir + "/")
  );
}

/**
 * Compute which items are shadowed, conflicted, or from ancestor scopes.
 *
 * @param {string} scopeId - Currently selected project scope
 * @param {Array} allItems - All items from all scopes
 * @param {Array} scopes - All scopes
 * @param {Function} keyFn - Function to generate a unique key for an item
 * @returns {{ shadowedKeys: Set, conflictKeys: Set, ancestorKeys: Set }}
 */
export function computeEffectiveSets(scopeId, allItems, scopes, keyFn) {
  const shadowedKeys = new Set();
  const conflictKeys = new Set();
  const ancestorKeys = new Set();

  if (!scopeId || scopeId === "global") {
    return { shadowedKeys, conflictKeys, ancestorKeys };
  }

  const projectItems = allItems.filter(i => i.scopeId === scopeId);
  const globalItems  = allItems.filter(i => i.scopeId === "global");

  // MCP & Agents: narrower scope (project) wins same-name
  for (const cat of ["mcp", "agent"]) {
    const projectNames = new Set(
      projectItems.filter(i => i.category === cat).map(i => i.name)
    );
    for (const gi of globalItems.filter(i => i.category === cat)) {
      if (projectNames.has(gi.name)) shadowedKeys.add(keyFn(gi));
    }
  }

  // Commands: both levels available but same-name conflicts are officially unsupported
  const projCmdNames   = new Set(projectItems.filter(i => i.category === "command").map(i => i.name));
  const globalCmdNames = new Set(globalItems.filter(i => i.category === "command").map(i => i.name));
  for (const name of projCmdNames) {
    if (!globalCmdNames.has(name)) continue;
    for (const i of [...projectItems, ...globalItems].filter(i => i.category === "command" && i.name === name)) {
      conflictKeys.add(keyFn(i));
    }
  }

  // Ancestor scopes: parent directories whose config/memory items are relevant
  const ancestors = getAncestorScopes(scopeId, scopes);
  for (const as of ancestors) {
    for (const i of allItems.filter(i => i.scopeId === as.id && (i.category === "config" || i.category === "memory"))) {
      ancestorKeys.add(keyFn(i));
    }
  }

  return { shadowedKeys, conflictKeys, ancestorKeys };
}

/**
 * Get the effective items for a project scope.
 * Includes: project items + global items (for participating categories) + ancestor items.
 *
 * @param {string} scopeId - Currently selected scope
 * @param {Array} allItems - All items from all scopes
 * @param {Array} scopes - All scopes
 * @returns {Array} Effective items
 */
export function getEffectiveItems(scopeId, allItems, scopes) {
  const projectItems = allItems.filter(i => i.scopeId === scopeId);

  if (scopeId === "global") return projectItems;

  // Global items only for categories with official rules
  const effectiveGlobal = allItems.filter(
    i => i.scopeId === "global" && hasEffectiveRule(i.category)
  );

  // Ancestor scope items (config + memory from path-parent scopes)
  const ancestorItems = [];
  for (const as of getAncestorScopes(scopeId, scopes)) {
    ancestorItems.push(
      ...allItems.filter(i => i.scopeId === as.id && (i.category === "config" || i.category === "memory"))
    );
  }

  return [...projectItems, ...effectiveGlobal, ...ancestorItems];
}

// Browser: attach to window so app.js can use it via <script> tag
if (typeof window !== "undefined") {
  window.Effective = { EFFECTIVE_RULES, hasEffectiveRule, getAncestorScopes, computeEffectiveSets, getEffectiveItems };
}
