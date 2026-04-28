/**
 * claude-operations.mjs — Safely move/delete Claude Code customizations.
 *
 * Rules:
 *   - memory → memory only
 *   - skill → skill only
 *   - mcp → mcp only
 *   - config, hook, plugin, session → locked / not movable
 *
 * Pure data module. No HTTP, no UI.
 */

import { rename, mkdir, readFile, writeFile, rm, unlink, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

/**
 * Move a file or directory, falling back to copy+delete on EXDEV (cross-device).
 */
async function safeRename(src, dest, isDir = false) {
  try {
    await rename(src, dest);
  } catch (err) {
    if (err.code === "EXDEV") {
      // Cross-device: copy then delete
      await cp(src, dest, { recursive: isDir });
      await rm(src, { recursive: isDir, force: true });
    } else {
      throw err;
    }
  }
}

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");

/**
 * Returns true if a scope's .claude directory is the same as the global ~/.claude.
 * This happens when repoDir === HOME (e.g. /home/user).
 * Skills/memories moved there would land in ~/.claude/ — same as Global — which is confusing.
 */
export function sharesGlobalClaudeDir(scope) {
  return Boolean(scope.repoDir && join(scope.repoDir, ".claude") === CLAUDE_DIR);
}

// ── Resolve scope to real filesystem path ────────────────────────────

function resolveMemoryDir(scopeId) {
  if (scopeId === "global") return join(CLAUDE_DIR, "memory");
  return join(CLAUDE_DIR, "projects", scopeId, "memory");
}

function resolveSkillDir(scopeId, scopes) {
  if (scopeId === "global") return join(CLAUDE_DIR, "skills");
  const scope = scopes.find(s => s.id === scopeId);
  if (!scope || !scope.repoDir) return null;
  return join(scope.repoDir, ".claude", "skills");
}

function resolvePlanDir(scopeId) {
  if (scopeId === "global") return join(CLAUDE_DIR, "plans");
  return join(CLAUDE_DIR, "projects", scopeId, "plans");
}

function resolveRuleDir(scopeId, scopes) {
  if (scopeId === "global") return join(CLAUDE_DIR, "rules");
  const scope = scopes.find(s => s.id === scopeId);
  if (!scope || !scope.repoDir) return null;
  return join(scope.repoDir, ".claude", "rules");
}

function resolveCommandDir(scopeId, scopes) {
  if (scopeId === "global") return join(CLAUDE_DIR, "commands");
  const scope = scopes.find(s => s.id === scopeId);
  if (!scope || !scope.repoDir) return null;
  return join(scope.repoDir, ".claude", "commands");
}

function resolveAgentDir(scopeId, scopes) {
  if (scopeId === "global") return join(CLAUDE_DIR, "agents");
  const scope = scopes.find(s => s.id === scopeId);
  if (!scope || !scope.repoDir) return null;
  return join(scope.repoDir, ".claude", "agents");
}

function resolveMcpJson(scopeId, scopes) {
  if (scopeId === "global") return join(CLAUDE_DIR, ".mcp.json");
  const scope = scopes.find(s => s.id === scopeId);
  if (!scope || !scope.repoDir) return null;
  return join(scope.repoDir, ".mcp.json");
}

// ── Validate move ────────────────────────────────────────────────────

function validateMove(item, toScopeId) {
  // Locked items cannot move
  if (item.locked) {
    return { ok: false, error: `${item.name} is locked and cannot be moved` };
  }

  // Same scope = no-op
  if (item.scopeId === toScopeId) {
    return { ok: false, error: "Item is already in this scope" };
  }

  // Only memory, skill, mcp, plan, command, agent, rule can move
  const movableCategories = ["memory", "skill", "mcp", "plan", "command", "agent", "rule"];
  if (!movableCategories.includes(item.category)) {
    return { ok: false, error: `${item.category} items cannot be moved` };
  }

  return { ok: true };
}

// ── Move memory file ─────────────────────────────────────────────────

async function moveMemory(item, toScopeId) {
  const toDir = resolveMemoryDir(toScopeId);
  const toPath = join(toDir, item.fileName);

  if (existsSync(toPath)) {
    return { ok: false, error: `File already exists at destination: ${item.fileName}` };
  }

  await mkdir(toDir, { recursive: true });
  await safeRename(item.path, toPath);

  return {
    ok: true,
    from: item.path,
    to: toPath,
    message: `Moved "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Move skill directory ─────────────────────────────────────────────

async function moveSkill(item, toScopeId, scopes) {
  const toSkillsRoot = resolveSkillDir(toScopeId, scopes);
  if (!toSkillsRoot) {
    return { ok: false, error: `Cannot resolve skill directory for scope: ${toScopeId}` };
  }

  const toPath = join(toSkillsRoot, item.fileName);

  if (existsSync(toPath)) {
    return { ok: false, error: `Skill directory already exists at destination: ${item.fileName}` };
  }

  await mkdir(toSkillsRoot, { recursive: true });
  await safeRename(item.path, toPath, true);

  return {
    ok: true,
    from: item.path,
    to: toPath,
    message: `Moved skill "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Move plan file ──────────────────────────────────────────────────

async function movePlan(item, toScopeId) {
  const toDir = resolvePlanDir(toScopeId);
  const toPath = join(toDir, item.fileName);

  if (existsSync(toPath)) {
    return { ok: false, error: `File already exists at destination: ${item.fileName}` };
  }

  await mkdir(toDir, { recursive: true });
  await safeRename(item.path, toPath);

  return {
    ok: true,
    from: item.path,
    to: toPath,
    message: `Moved plan "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Move rule file ──────────────────────────────────────────────────

async function moveRule(item, toScopeId, scopes) {
  const toDir = resolveRuleDir(toScopeId, scopes);
  if (!toDir) {
    return { ok: false, error: `Cannot resolve rules directory for scope: ${toScopeId}` };
  }
  const toPath = join(toDir, item.fileName);

  if (existsSync(toPath)) {
    return { ok: false, error: `Rule already exists at destination: ${item.fileName}` };
  }

  await mkdir(toDir, { recursive: true });
  await safeRename(item.path, toPath);

  return {
    ok: true,
    from: item.path,
    to: toPath,
    message: `Moved rule "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Move command file ───────────────────────────────────────────────

async function moveCommand(item, toScopeId, scopes) {
  const toDir = resolveCommandDir(toScopeId, scopes);
  if (!toDir) {
    return { ok: false, error: `Cannot resolve commands directory for scope: ${toScopeId}` };
  }
  const toPath = join(toDir, item.fileName);

  if (existsSync(toPath)) {
    return { ok: false, error: `Command already exists at destination: ${item.fileName}` };
  }

  await mkdir(toDir, { recursive: true });
  await safeRename(item.path, toPath);

  return {
    ok: true,
    from: item.path,
    to: toPath,
    message: `Moved command "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Move agent file ────────────────────────────────────────────────

async function moveAgent(item, toScopeId, scopes) {
  const toDir = resolveAgentDir(toScopeId, scopes);
  if (!toDir) {
    return { ok: false, error: `Cannot resolve agents directory for scope: ${toScopeId}` };
  }
  const toPath = join(toDir, item.fileName);

  if (existsSync(toPath)) {
    return { ok: false, error: `Agent already exists at destination: ${item.fileName}` };
  }

  await mkdir(toDir, { recursive: true });
  await safeRename(item.path, toPath);

  return {
    ok: true,
    from: item.path,
    to: toPath,
    message: `Moved agent "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Move MCP server entry ────────────────────────────────────────────

async function moveMcp(item, toScopeId, scopes) {
  const fromMcpJson = item.path;
  const toMcpJson = resolveMcpJson(toScopeId, scopes);

  if (!toMcpJson) {
    return { ok: false, error: `Cannot resolve .mcp.json for scope: ${toScopeId}` };
  }

  // Read source .mcp.json
  let fromContent;
  try {
    fromContent = JSON.parse(await readFile(fromMcpJson, "utf-8"));
  } catch {
    return { ok: false, error: `Cannot read source .mcp.json: ${fromMcpJson}` };
  }

  // For .claude.json project-scope servers, read from the correct nesting level (#11)
  let serverConfig;
  if (item.claudeJsonProjectKey) {
    serverConfig = fromContent.projects?.[item.claudeJsonProjectKey]?.mcpServers?.[item.name];
  } else {
    serverConfig = fromContent.mcpServers?.[item.name];
  }
  if (!serverConfig) {
    return { ok: false, error: `Server "${item.name}" not found in ${fromMcpJson}` };
  }

  // Read or create destination .mcp.json
  let toContent = { mcpServers: {} };
  try {
    toContent = JSON.parse(await readFile(toMcpJson, "utf-8"));
    if (!toContent.mcpServers) toContent.mcpServers = {};
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  if (toContent.mcpServers[item.name]) {
    return { ok: false, error: `Server "${item.name}" already exists in destination` };
  }

  // Add to destination
  toContent.mcpServers[item.name] = serverConfig;

  // Remove from source — from the correct nesting level
  if (item.claudeJsonProjectKey) {
    delete fromContent.projects[item.claudeJsonProjectKey].mcpServers[item.name];
  } else {
    delete fromContent.mcpServers[item.name];
  }

  // Write both files
  await mkdir(dirname(toMcpJson), { recursive: true });
  await writeFile(toMcpJson, JSON.stringify(toContent, null, 2) + "\n");
  await writeFile(fromMcpJson, JSON.stringify(fromContent, null, 2) + "\n");

  return {
    ok: true,
    from: fromMcpJson,
    to: toMcpJson,
    message: `Moved MCP server "${item.name}" from ${item.scopeId} to ${toScopeId}`,
  };
}

// ── Main move function ───────────────────────────────────────────────

/**
 * Move an item to a different scope.
 *
 * @param {object} item - Item object from scanner
 * @param {string} toScopeId - Target scope ID
 * @param {object[]} scopes - All scopes from scanner
 * @returns {{ ok: boolean, error?: string, from?: string, to?: string, message?: string }}
 */
export async function moveItem(item, toScopeId, scopes) {
  const validation = validateMove(item, toScopeId);
  if (!validation.ok) return validation;

  try {
    switch (item.category) {
      case "memory":
        return await moveMemory(item, toScopeId);
      case "skill":
        return await moveSkill(item, toScopeId, scopes);
      case "mcp":
        return await moveMcp(item, toScopeId, scopes);
      case "plan":
        return await movePlan(item, toScopeId);
      case "command":
        return await moveCommand(item, toScopeId, scopes);
      case "agent":
        return await moveAgent(item, toScopeId, scopes);
      case "rule":
        return await moveRule(item, toScopeId, scopes);
      default:
        return { ok: false, error: `Unknown category: ${item.category}` };
    }
  } catch (err) {
    return { ok: false, error: `Move failed: ${err.message}` };
  }
}

// ── Delete functions ─────────────────────────────────────────────────

async function deleteMemory(item) {
  await unlink(item.path);
  return { ok: true, deleted: item.path, message: `Deleted memory "${item.name}"` };
}

async function deleteSkill(item) {
  await rm(item.path, { recursive: true, force: true });
  return { ok: true, deleted: item.path, message: `Deleted skill "${item.name}"` };
}

async function deleteMcp(item) {
  const mcpJson = item.path;
  let content;
  try {
    content = JSON.parse(await readFile(mcpJson, "utf-8"));
  } catch {
    return { ok: false, error: `Cannot read .mcp.json: ${mcpJson}` };
  }

  if (!content.mcpServers?.[item.name]) {
    return { ok: false, error: `Server "${item.name}" not found in ${mcpJson}` };
  }

  delete content.mcpServers[item.name];
  await writeFile(mcpJson, JSON.stringify(content, null, 2) + "\n");

  return { ok: true, deleted: mcpJson, message: `Deleted MCP server "${item.name}"` };
}

async function deleteSession(item) {
  // Delete the .jsonl file + any subagent directory with the same UUID
  await unlink(item.path);
  const sessionDir = item.path.replace(/\.jsonl$/, "");
  try { await rm(sessionDir, { recursive: true, force: true }); } catch { /* no subagent dir */ }
  return { ok: true, deleted: item.path, message: `Deleted session "${item.name}"` };
}

/**
 * Delete an item permanently.
 */
export async function deleteItem(item, scopes) {
  if (item.locked) {
    return { ok: false, error: `${item.name} is locked and cannot be deleted` };
  }

  const deletableCategories = ["memory", "skill", "mcp", "plan", "session", "command", "agent", "rule"];
  if (!deletableCategories.includes(item.category)) {
    return { ok: false, error: `${item.category} items cannot be deleted` };
  }

  try {
    switch (item.category) {
      case "memory":
      case "plan":
      case "command":
      case "agent":
      case "rule":
        return await deleteMemory(item); // all are single .md files
      case "session":
        return await deleteSession(item);
      case "skill":
        return await deleteSkill(item);
      case "mcp":
        return await deleteMcp(item);
      default:
        return { ok: false, error: `Unknown category: ${item.category}` };
    }
  } catch (err) {
    return { ok: false, error: `Delete failed: ${err.message}` };
  }
}

/**
 * Get valid destination scopes for an item.
 * Returns only scopes where this category of item can live.
 */
export function getValidDestinations(item, scopes) {
  if (item.locked) return [];

  return scopes
    .filter(s => s.id !== item.scopeId)
    .filter(s => {
      switch (item.category) {
        case "memory":
        case "skill":
        case "command":
        case "agent":
          // File-based items: global is always valid; project scopes are valid only if
          // their .claude dir is distinct from global's ~/.claude (avoids silent overlap).
          return s.id === "global" || (s.repoDir && !sharesGlobalClaudeDir(s));
        case "mcp":
          return true; // MCP configs live in claudeProjectDir, not repoDir/.claude/
        // plan and rule: no official scope rule — moving has no meaningful effect
        case "plan":
        case "rule":
        default:
          return false;
      }
    });
}

/**
 * Harness operations bundle for the Claude Code adapter.
 */
export const claudeOperations = {
  getValidDestinations,
  moveItem,
  deleteItem,
};
