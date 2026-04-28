/**
 * claude-context-budget.mjs — Estimate Claude Code context usage for a scope.
 *
 * Pure adapter logic. No HTTP, no UI.
 */

import { readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { countTokens, getMethod } from "../../tokenizer.mjs";

const USE_MEASURED_CONTEXT_TOKENS = process.env.CCO_MEASURED_CONTEXT_TOKENS === "1";

export const ALWAYS_LOADED_CATEGORIES = new Set(["skill", "rule", "command", "agent"]);
export const LOADED_CONFIG_NAMES = new Set(["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.md (managed)"]);

// System overhead — rough estimates that change every Claude Code release.
// These numbers are intentionally rounded. Don't over-tune them.
// Run `/context` in Claude Code to see YOUR actual numbers.
//
// As of v2.1.84 (March 2026), real measurements range:
//   System loaded: 14.8K (Sonnet 200K) to 20.2K (Opus 200K)
//   System deferred: ~7K
//   Skill boilerplate: ~400 when skills exist
//
// We use ~18K as a middle-ground estimate.
export const SYSTEM_LOADED = 18000;
export const SYSTEM_DEFERRED = 7000;

// MCP tool schemas — deferred when ToolSearch active.
// Average ~3100 tokens per UNIQUE server based on /context measurements.
export const MCP_TOOL_SCHEMA_TOKENS = 3100;

// CLAUDE.md injection wrapper (~100 tokens for <system-reminder> tags + headers).
export const CLAUDEMD_WRAPPER = 100;

// Autocompact buffer — Claude Code reserves ~13K for compaction.
export const AUTOCOMPACT_BUFFER = 13000;

// Warning threshold — Claude Code starts warning user when context is getting full.
export const WARNING_THRESHOLD_BUFFER = 20000;

// Max output tokens — reserved for model response.
export const MAX_OUTPUT_TOKENS = 32000;

/**
 * Expand @import references in CLAUDE.md files.
 * Claude Code expands these at session start — imported content is
 * verbatim-merged into the parent. Max depth: 5 hops.
 */
export async function expandImports(text, basePath, depth = 0, options = {}) {
  if (depth >= 5) return text;
  const home = options.home || homedir();
  const lines = text.split("\n");
  const expanded = [];
  for (const line of lines) {
    const match = line.match(/^@(.+)$/);
    if (match) {
      let importPath = match[1].trim();
      // Support ~ expansion
      if (importPath.startsWith("~")) {
        importPath = importPath.replace(/^~/, home);
      }
      importPath = resolve(basePath, importPath);
      try {
        let imported = await readFile(importPath, "utf-8");
        imported = await expandImports(imported, dirname(importPath), depth + 1, { home });
        expanded.push(imported);
      } catch {
        expanded.push(line); // keep original line if import fails
      }
    } else {
      expanded.push(line);
    }
  }
  return expanded.join("\n");
}

/**
 * Strip block-level HTML comments from CLAUDE.md content.
 * Official docs: "Block-level HTML comments are stripped before injection."
 */
export function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

async function countContextTokens(text) {
  if (USE_MEASURED_CONTEXT_TOKENS) return countTokens(text);
  if (!text) return { tokens: 0, confidence: "estimated" };
  return {
    tokens: Math.ceil(Buffer.byteLength(text, "utf-8") / 4),
    confidence: "estimated",
  };
}

async function getContextTokenMethod() {
  if (USE_MEASURED_CONTEXT_TOKENS) return getMethod();
  return "estimated";
}

async function tokenizeItems(data, scopeIds, options = {}) {
  const items = data.items.filter(
    i => scopeIds.includes(i.scopeId) &&
      (ALWAYS_LOADED_CATEGORIES.has(i.category) ||
       (i.category === "config" && LOADED_CONFIG_NAMES.has(i.name)) ||
       i.category === "mcp")
  );
  const loaded = [];
  const deferred = [];

  const tokenized = await Promise.all(items.map(item => tokenizeItem(data, item, options)));
  for (const { entry, placement } of tokenized) {
    if (placement === "deferred") {
      deferred.push(entry);
    } else {
      loaded.push(entry);
    }
  }

  return { loaded, deferred };
}

async function tokenizeItem(data, item, options) {
  let text = "";
  try {
    if (item.category === "mcp") {
      // MCP config JSON — the config itself is tiny, tool schemas are deferred
      text = JSON.stringify(item.mcpConfig || {}, null, 2);
    } else if (item.category === "skill") {
      // Claude Code injects skills in TWO places:
      // 1. Skill tool description: <available_skills>"name": description</available_skills>
      // 2. system-reminder: "- name: description" (re-injected on tool calls)
      //
      // We count the <available_skills> format since that's the primary injection.
      // The Skill tool boilerplate (~430 tokens) is added as a constant below.
      //
      // Read SKILL.md and extract the frontmatter description field.
      const skillMdPath = join(item.path, "SKILL.md");
      try {
        const skillContent = await readFile(skillMdPath, "utf-8");
        const fmMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const descMatch = fmMatch[1].match(/description:\s*(.+(?:\n(?![\w-]+:).+)*)/);
          // Match actual injection format: "skill-name": Description text
          text = `"${item.name}": ${descMatch ? descMatch[1].trim() : item.description || ""}`;
        } else {
          text = `"${item.name}": ${item.description || ""}`;
        }
      } catch {
        text = `"${item.name}": ${item.description || ""}`;
      }
    } else if (item.path) {
      // CLAUDE.md, rules, commands, agents: read file content
      text = await readFile(item.path, "utf-8");

      // For CLAUDE.md files: expand @imports and strip HTML comments
      // (Claude Code does both before injecting into context)
      if (item.category === "config" && LOADED_CONFIG_NAMES.has(item.name)) {
        text = await expandImports(text, dirname(item.path), 0, options);
        text = stripHtmlComments(text);
      }

      // For rules: strip HTML comments too
      if (item.category === "rule") {
        text = stripHtmlComments(text);
      }
    }
  } catch {}

  const { tokens, confidence } = await countContextTokens(text);
  const scopeObj = data.scopes.find(s => s.id === item.scopeId);
  const entry = {
    category: item.category,
    subType: item.subType,
    name: item.name,
    path: item.path,
    tokens,
    confidence,
    sizeBytes: item.sizeBytes || 0,
    scopeId: item.scopeId,
    scopeName: scopeObj?.name || item.scopeId,
  };

  if (item.category === "mcp") {
    // MCP tool schemas are deferred when ToolSearch is active (>10% threshold)
    // We put MCP in deferred since most setups trigger ToolSearch
    return { entry, placement: "deferred" };
  }
  if (item.category === "rule" && text) {
    // Rules with `paths:` frontmatter are on-demand (loaded only when
    // Claude reads files matching the pattern). Rules without `paths:`
    // are loaded at session start alongside CLAUDE.md.
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
    if (/^paths:/m.test(fm)) {
      return { entry, placement: "deferred" };
    }
  }

  return { entry, placement: "loaded" };
}

// Add MEMORY.md files — always loaded (first 200 lines / 25KB)
export async function addMemoryIndexFiles(scopeIds, targetArray, options = {}) {
  const data = options.data;
  if (!data) throw new Error("addMemoryIndexFiles requires options.data");

  const claudeDir = options.claudeDir || join(options.home || homedir(), ".claude");
  for (const sid of scopeIds) {
    const s = data.scopes.find(sc => sc.id === sid);
    if (!s) continue;
    let memPath = null;
    if (s.id === "global") {
      memPath = join(claudeDir, "memory", "MEMORY.md");
    } else if (s.claudeProjectDir) {
      memPath = join(s.claudeProjectDir, "memory", "MEMORY.md");
    }
    if (!memPath) continue;
    try {
      let text = await readFile(memPath, "utf-8");
      // Claude loads first 200 lines or 25KB of MEMORY.md
      const lines = text.split("\n").slice(0, 200);
      text = lines.join("\n").slice(0, 25000);
      const { tokens, confidence } = await countContextTokens(text);
      if (tokens > 0) {
        targetArray.push({
          category: "memory",
          subType: "index",
          name: "MEMORY.md",
          path: memPath,
          tokens,
          confidence,
          sizeBytes: Buffer.byteLength(text, "utf-8"),
          scopeId: sid,
          scopeName: s.name,
        });
      }
    } catch {}
  }
}

export async function computeClaudeContextBudget({
  data,
  scopeId,
  contextLimit = 200000,
  home = homedir(),
} = {}) {
  const scope = data?.scopes.find(s => s.id === scopeId);
  if (!scope) return { ok: false, error: "Scope not found" };

  // Collect parent chain (for inherited items)
  const parentIds = [];
  let cur = scope;
  while (cur.parentId) {
    parentIds.push(cur.parentId);
    cur = data.scopes.find(s => s.id === cur.parentId);
    if (!cur) break;
  }

  // What Claude Code loads at session start (from official docs):
  //
  // ALWAYS LOADED (in context every request):
  //   - System prompt (~6.5K)
  //   - System tools loaded part (~6K)
  //   - CLAUDE.md files (full content, all ancestor dirs)
  //   - .claude/rules/*.md (unconditional, no paths frontmatter)
  //   - MEMORY.md (first 200 lines or 25KB)
  //   - Skill descriptions (2% of context budget)
  //   - Git status
  //
  // DEFERRED (reserved, loaded on-demand via ToolSearch):
  //   - MCP tool definitions (~90% of MCP tokens when ToolSearch active)
  //   - System tools deferred part (~10.5K)
  //
  // NOT IN CONTEXT:
  //   - settings.json / settings.local.json (client config only)
  //   - Individual memory files (on-demand via readFileState)
  //   - Hook scripts (run externally, zero context)
  //   - Skills with disable-model-invocation: true
  const method = await getContextTokenMethod();
  const [currentResult, inheritedResult] = await Promise.all([
    tokenizeItems(data, [scopeId], { home }),
    tokenizeItems(data, parentIds, { home }),
  ]);

  await Promise.all([
    addMemoryIndexFiles([scopeId], currentResult.loaded, { data, home }),
    addMemoryIndexFiles(parentIds, inheritedResult.loaded, { data, home }),
  ]);

  const hasSkills = [...currentResult.loaded, ...inheritedResult.loaded]
    .some(i => i.category === "skill");
  const SKILL_BOILERPLATE = hasSkills ? 400 : 0;

  // Claude Code deduplicates by name (priority: local > project > user),
  // so we count unique names, not total entries.
  // Filter out disabled servers — Claude Code doesn't load them.
  const allMcpItems = data.items.filter(
    i => i.category === "mcp" &&
      (i.scopeId === scopeId || parentIds.includes(i.scopeId)) &&
      !i.mcpConfig?.disabled
  );
  const uniqueMcpNames = new Set(allMcpItems.map(i => i.name));
  const mcpServerCount = allMcpItems.length; // total entries (for display)
  const mcpUniqueCount = uniqueMcpNames.size; // unique names (for estimation)
  const mcpToolSchemaEstimate = mcpUniqueCount * MCP_TOOL_SCHEMA_TOKENS;

  // Totals
  const currentLoaded = currentResult.loaded;
  const currentDeferred = currentResult.deferred;
  const inheritedLoaded = inheritedResult.loaded;
  const inheritedDeferred = inheritedResult.deferred;

  const loadedTotal = currentLoaded.reduce((s, i) => s + i.tokens, 0)
    + inheritedLoaded.reduce((s, i) => s + i.tokens, 0)
    + SYSTEM_LOADED
    + SKILL_BOILERPLATE
    + CLAUDEMD_WRAPPER;
  const deferredTotal = currentDeferred.reduce((s, i) => s + i.tokens, 0)
    + inheritedDeferred.reduce((s, i) => s + i.tokens, 0)
    + SYSTEM_DEFERRED
    + mcpToolSchemaEstimate;

  const total = loadedTotal + deferredTotal;

  return {
    ok: true,
    scopeId,
    scopeName: scope.name,
    alwaysLoaded: {
      currentScope: { items: currentLoaded, total: currentLoaded.reduce((s, i) => s + i.tokens, 0) },
      inherited: { items: inheritedLoaded, total: inheritedLoaded.reduce((s, i) => s + i.tokens, 0) },
      system: SYSTEM_LOADED,
      skillBoilerplate: SKILL_BOILERPLATE,
      total: loadedTotal,
    },
    deferred: {
      currentScope: { items: currentDeferred, total: currentDeferred.reduce((s, i) => s + i.tokens, 0) },
      inherited: { items: inheritedDeferred, total: inheritedDeferred.reduce((s, i) => s + i.tokens, 0) },
      systemTools: SYSTEM_DEFERRED,
      mcpToolSchemas: mcpToolSchemaEstimate,
      mcpServerCount,
      mcpUniqueCount,
      total: deferredTotal,
    },
    total,
    contextLimit,
    autocompactBuffer: AUTOCOMPACT_BUFFER,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    warningZone: contextLimit - WARNING_THRESHOLD_BUFFER - MAX_OUTPUT_TOKENS,
    autocompactAt: contextLimit - AUTOCOMPACT_BUFFER - MAX_OUTPUT_TOKENS,
    percentUsed: Math.round((loadedTotal / contextLimit) * 1000) / 10,
    percentWithDeferred: Math.round((total / contextLimit) * 1000) / 10,
    method,
    // Keep old fields for backward compat with existing UI
    currentScope: { items: [...currentLoaded, ...currentDeferred], total: currentLoaded.reduce((s, i) => s + i.tokens, 0) + currentDeferred.reduce((s, i) => s + i.tokens, 0) },
    inherited: { items: [...inheritedLoaded, ...inheritedDeferred], total: inheritedLoaded.reduce((s, i) => s + i.tokens, 0) + inheritedDeferred.reduce((s, i) => s + i.tokens, 0) },
    systemOverhead: { base: SYSTEM_LOADED, skillBoilerplate: SKILL_BOILERPLATE, claudeMdWrapper: CLAUDEMD_WRAPPER, mcpServers: mcpServerCount, mcpUniqueServers: mcpUniqueCount, mcpEstimate: mcpToolSchemaEstimate, autocompactBuffer: AUTOCOMPACT_BUFFER, maxOutputTokens: MAX_OUTPUT_TOKENS, warningThresholdBuffer: WARNING_THRESHOLD_BUFFER, total: SYSTEM_LOADED + SYSTEM_DEFERRED + SKILL_BOILERPLATE + CLAUDEMD_WRAPPER + mcpToolSchemaEstimate, confidence: "estimated" },
  };
}
