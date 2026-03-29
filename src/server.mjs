/**
 * server.mjs — HTTP server for Claude Code Organizer.
 * Routes only. All logic is in scanner.mjs and mover.mjs.
 * All UI is in src/ui/ (html, css, js).
 */

import { createServer } from "node:http";
import { readFile, stat, open } from "node:fs/promises";
import { join, extname, resolve, dirname, sep, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import https from "node:https";
import { scan } from "./scanner.mjs";
import { moveItem, deleteItem, getValidDestinations } from "./mover.mjs";
import { countTokens, getMethod } from "./tokenizer.mjs";
import { introspectServers } from "./mcp-introspector.mjs";
import { runSecurityScan, checkClaudeAvailable, llmJudge } from "./security-scanner.mjs";

// ── Update check ─────────────────────────────────────────────────────
async function checkForUpdate() {
  const require = createRequire(import.meta.url);
  const { version: local } = require("../package.json");
  const data = await new Promise((resolve, reject) => {
    const req = https.get("https://registry.npmjs.org/@mcpware/claude-code-organizer/latest", { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
  const { version: latest } = JSON.parse(data);
  if (latest && latest !== local) {
    console.log(`\uD83D\uDCE6 Update available: ${local} \u2192 ${latest}  Run: npm update -g @mcpware/claude-code-organizer\n`);
  }
}

// ── Path safety ──────────────────────────────────────────────────────

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");

/**
 * Validate that a file path is within allowed directories.
 * Prevents path traversal attacks (e.g. ../../etc/passwd).
 */
function isPathAllowed(filePath) {
  const resolved = resolve(filePath);
  // Allow paths under ~/.claude/ or under any discovered project repoDir
  // Uses path.sep for cross-platform support (fixes Windows #12)
  if (resolved.startsWith(CLAUDE_DIR + sep) || resolved === CLAUDE_DIR) return true;
  // Allow paths under HOME (covers repo dirs with .mcp.json, CLAUDE.md etc)
  if (resolved.startsWith(HOME + sep)) return true;
  return false;
}

const UI_DIR = join(import.meta.dirname, "ui");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// ── Cached scan data (refresh on each request to /api/scan) ──────────
let cachedData = null;

async function freshScan() {
  cachedData = await scan();
  return cachedData;
}

// ── Request helpers ──────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function serveFile(res, filePath) {
  try {
    const content = await readFile(filePath);
    const mime = MIME[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

// ── Routes ───────────────────────────────────────────────────────────

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // ── API routes ──

  // GET /api/version — check for updates (UI calls this)
  if (path === "/api/version" && req.method === "GET") {
    const require = createRequire(import.meta.url);
    const { version: local } = require("../package.json");
    try {
      const data = await new Promise((resolve, reject) => {
        const req = https.get("https://registry.npmjs.org/@mcpware/claude-code-organizer/latest", { timeout: 3000 }, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve(body));
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      });
      const { version: latest } = JSON.parse(data);
      return json(res, { local, latest, updateAvailable: latest !== local });
    } catch {
      return json(res, { local, latest: null, updateAvailable: false });
    }
  }

  // GET /api/scan — full scan of all customizations
  if (path === "/api/scan" && req.method === "GET") {
    const data = await freshScan();
    return json(res, data);
  }

  // ── Context Budget helpers ──────────────────────────────────────────

  /**
   * Expand @import references in CLAUDE.md files.
   * Claude Code expands these at session start — imported content is
   * verbatim-merged into the parent. Max depth: 5 hops.
   */
  async function expandImports(text, basePath, depth = 0) {
    if (depth >= 5) return text;
    const lines = text.split("\n");
    const expanded = [];
    for (const line of lines) {
      const match = line.match(/^@(.+)$/);
      if (match) {
        let importPath = match[1].trim();
        // Support ~ expansion
        if (importPath.startsWith("~")) {
          importPath = importPath.replace(/^~/, HOME);
        }
        importPath = resolve(basePath, importPath);
        try {
          let imported = await readFile(importPath, "utf-8");
          imported = await expandImports(imported, dirname(importPath), depth + 1);
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
  function stripHtmlComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, "");
  }

  // GET /api/context-budget?scope=<id> — token budget breakdown for a scope
  if (path === "/api/context-budget" && req.method === "GET") {
    const scopeId = url.searchParams.get("scope");
    if (!scopeId) return json(res, { ok: false, error: "Missing scope parameter" }, 400);

    if (!cachedData) await freshScan();

    const scope = cachedData.scopes.find(s => s.id === scopeId);
    if (!scope) return json(res, { ok: false, error: "Scope not found" }, 400);

    // Collect parent chain (for inherited items)
    const parentIds = [];
    let cur = scope;
    while (cur.parentId) {
      parentIds.push(cur.parentId);
      cur = cachedData.scopes.find(s => s.id === cur.parentId);
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

    // Items that are always loaded into context
    const ALWAYS_LOADED_CATEGORIES = new Set(["skill", "rule", "command", "agent"]);
    // Config items: CLAUDE.md is loaded, settings.json is NOT
    const LOADED_CONFIG_NAMES = new Set(["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.md (managed)"]);

    // Tokenize items, classifying as loaded vs not
    async function tokenizeItems(scopeIds) {
      const items = cachedData.items.filter(
        i => scopeIds.includes(i.scopeId) &&
          (ALWAYS_LOADED_CATEGORIES.has(i.category) ||
           (i.category === "config" && LOADED_CONFIG_NAMES.has(i.name)) ||
           i.category === "mcp")
      );
      const loaded = [];
      const deferred = [];

      for (const item of items) {
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
              text = await expandImports(text, dirname(item.path));
              text = stripHtmlComments(text);
            }

            // For rules: strip HTML comments too
            if (item.category === "rule") {
              text = stripHtmlComments(text);
            }
          }
        } catch {}

        const { tokens, confidence } = await countTokens(text);
        const scopeObj = cachedData.scopes.find(s => s.id === item.scopeId);
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
          deferred.push(entry);
        } else if (item.category === "rule" && text) {
          // Rules with `paths:` frontmatter are on-demand (loaded only when
          // Claude reads files matching the pattern). Rules without `paths:`
          // are loaded at session start alongside CLAUDE.md.
          const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
          if (/^paths:/m.test(fm)) {
            deferred.push(entry);
          } else {
            loaded.push(entry);
          }
        } else {
          loaded.push(entry);
        }
      }

      return { loaded, deferred };
    }

    const [currentResult, inheritedResult, method] = await Promise.all([
      tokenizeItems([scopeId]),
      tokenizeItems(parentIds),
      getMethod(),
    ]);

    // Add MEMORY.md files — always loaded (first 200 lines / 25KB)
    async function addMemoryIndexFiles(scopeIds, targetArray) {
      for (const sid of scopeIds) {
        const s = cachedData.scopes.find(sc => sc.id === sid);
        if (!s) continue;
        let memPath = null;
        if (s.id === "global") {
          memPath = join(CLAUDE_DIR, "memory", "MEMORY.md");
        } else if (s.claudeProjectDir) {
          memPath = join(s.claudeProjectDir, "memory", "MEMORY.md");
        }
        if (!memPath) continue;
        try {
          let text = await readFile(memPath, "utf-8");
          // Claude loads first 200 lines or 25KB of MEMORY.md
          const lines = text.split("\n").slice(0, 200);
          text = lines.join("\n").slice(0, 25000);
          const { tokens, confidence } = await countTokens(text);
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

    await Promise.all([
      addMemoryIndexFiles([scopeId], currentResult.loaded),
      addMemoryIndexFiles(parentIds, inheritedResult.loaded),
    ]);

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
    const SYSTEM_LOADED = 18000;
    const SYSTEM_DEFERRED = 7000;
    const hasSkills = [...currentResult.loaded, ...inheritedResult.loaded]
      .some(i => i.category === "skill");
    const SKILL_BOILERPLATE = hasSkills ? 400 : 0;

    // MCP tool schemas — deferred when ToolSearch active
    // Average ~3100 tokens per UNIQUE server based on /context measurements.
    // Real-world range: 385 (SQLite) to 17,000 (Jira). 3.1K is the median.
    // Note: /context has a known 3x inflation bug for MCP tools (counts hidden
    // tool-use system prompt per-tool instead of once). Our offline estimate
    // may actually be MORE accurate than /context for MCP tools.
    // Claude Code deduplicates by name (priority: local > project > user),
    // so we count unique names, not total entries.
    // Filter out disabled servers — Claude Code doesn't load them.
    const allMcpItems = cachedData.items.filter(
      i => i.category === "mcp" &&
        (i.scopeId === scopeId || parentIds.includes(i.scopeId)) &&
        !i.mcpConfig?.disabled
    );
    const uniqueMcpNames = new Set(allMcpItems.map(i => i.name));
    const mcpServerCount = allMcpItems.length; // total entries (for display)
    const mcpUniqueCount = uniqueMcpNames.size; // unique names (for estimation)
    const mcpToolSchemaEstimate = mcpUniqueCount * 3100;

    // CLAUDE.md injection wrapper (~100 tokens for <system-reminder> tags + headers).
    // Small enough that precision doesn't matter.
    const CLAUDEMD_WRAPPER = 100;

    // Autocompact buffer — Claude Code reserves ~33K for compaction (was 45K before 2026).
    // This changes occasionally. Don't over-tune it.
    const AUTOCOMPACT_BUFFER = 33000;

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
    const contextLimit = parseInt(url.searchParams.get("limit")) || 200000;

    return json(res, {
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
      percentUsed: Math.round((loadedTotal / contextLimit) * 1000) / 10,
      percentWithDeferred: Math.round((total / contextLimit) * 1000) / 10,
      method,
      // Keep old fields for backward compat with existing UI
      currentScope: { items: [...currentLoaded, ...currentDeferred], total: currentLoaded.reduce((s, i) => s + i.tokens, 0) + currentDeferred.reduce((s, i) => s + i.tokens, 0) },
      inherited: { items: [...inheritedLoaded, ...inheritedDeferred], total: inheritedLoaded.reduce((s, i) => s + i.tokens, 0) + inheritedDeferred.reduce((s, i) => s + i.tokens, 0) },
      systemOverhead: { base: SYSTEM_LOADED, skillBoilerplate: SKILL_BOILERPLATE, claudeMdWrapper: CLAUDEMD_WRAPPER, mcpServers: mcpServerCount, mcpUniqueServers: mcpUniqueCount, mcpEstimate: mcpToolSchemaEstimate, autocompactBuffer: AUTOCOMPACT_BUFFER, total: SYSTEM_LOADED + SYSTEM_DEFERRED + SKILL_BOILERPLATE + CLAUDEMD_WRAPPER + mcpToolSchemaEstimate, confidence: "estimated" },
    });
  }

  // POST /api/move — move an item to a different scope
  if (path === "/api/move" && req.method === "POST") {
    const { itemPath, toScopeId, category, name } = await readBody(req);

    if (!cachedData) await freshScan();

    // Find the item by path + optional category/name (needed to disambiguate
    // items sharing the same file, e.g. multiple MCP servers in one .mcp.json)
    const item = cachedData.items.find(i =>
      i.path === itemPath &&
      !i.locked &&
      (!category || i.category === category) &&
      (!name || i.name === name)
    );
    if (!item) return json(res, { ok: false, error: "Item not found or locked" }, 400);

    const result = await moveItem(item, toScopeId, cachedData.scopes);

    // Refresh cache after move
    if (result.ok) await freshScan();

    return json(res, result, result.ok ? 200 : 400);
  }

  // POST /api/delete — delete an item
  if (path === "/api/delete" && req.method === "POST") {
    const { itemPath, category, name } = await readBody(req);

    if (!cachedData) await freshScan();

    const item = cachedData.items.find(i =>
      i.path === itemPath &&
      !i.locked &&
      (!category || i.category === category) &&
      (!name || i.name === name)
    );
    if (!item) return json(res, { ok: false, error: "Item not found or locked" }, 400);

    const result = await deleteItem(item, cachedData.scopes);

    if (result.ok) await freshScan();

    return json(res, result, result.ok ? 200 : 400);
  }

  // GET /api/destinations?path=...&category=...&name=... — valid move destinations
  if (path === "/api/destinations" && req.method === "GET") {
    if (!cachedData) await freshScan();
    const itemPath = url.searchParams.get("path");
    const category = url.searchParams.get("category");
    const name = url.searchParams.get("name");
    // Match by path + category + name to disambiguate items sharing the same path (e.g. hooks vs config in settings.json)
    const item = cachedData.items.find(i =>
      i.path === itemPath &&
      (!category || i.category === category) &&
      (!name || i.name === name)
    );
    if (!item) return json(res, { ok: false, error: "Item not found" }, 400);

    const destinations = getValidDestinations(item, cachedData.scopes);
    return json(res, { ok: true, destinations, currentScopeId: item.scopeId });
  }

  // POST /api/restore — restore a deleted file (for undo)
  if (path === "/api/restore" && req.method === "POST") {
    const { filePath, content, isDir } = await readBody(req);
    if (!filePath || !isAbsolute(filePath) || !isPathAllowed(filePath)) {
      return json(res, { ok: false, error: "Invalid or disallowed path" }, 400);
    }
    try {
      const { mkdir, writeFile: wf } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(filePath), { recursive: true });
      if (isDir) {
        // For skills: restore SKILL.md inside the directory
        await mkdir(filePath, { recursive: true });
        const skillPath = join(filePath, "SKILL.md");
        await wf(skillPath, content, "utf-8");
      } else {
        await wf(filePath, content, "utf-8");
      }
      await freshScan();
      return json(res, { ok: true, message: "Restored successfully" });
    } catch (err) {
      return json(res, { ok: false, error: `Restore failed: ${err.message}` }, 400);
    }
  }

  // POST /api/restore-mcp — restore a deleted MCP server entry
  if (path === "/api/restore-mcp" && req.method === "POST") {
    const { name, config, mcpJsonPath } = await readBody(req);
    if (!name || !config || !mcpJsonPath || !isPathAllowed(mcpJsonPath)) {
      return json(res, { ok: false, error: "Missing name, config, or mcpJsonPath, or disallowed path" }, 400);
    }
    try {
      let content = { mcpServers: {} };
      try {
        content = JSON.parse(await readFile(mcpJsonPath, "utf-8"));
        if (!content.mcpServers) content.mcpServers = {};
      } catch { /* file doesn't exist, start fresh */ }
      content.mcpServers[name] = config;
      const { writeFile: wf, mkdir: mk } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mk(dirname(mcpJsonPath), { recursive: true });
      await wf(mcpJsonPath, JSON.stringify(content, null, 2) + "\n");
      await freshScan();
      return json(res, { ok: true, message: `Restored MCP server "${name}"` });
    } catch (err) {
      return json(res, { ok: false, error: `Restore failed: ${err.message}` }, 400);
    }
  }

  // GET /api/file-content?path=... — read file content for detail panel
  if (path === "/api/file-content" && req.method === "GET") {
    const filePath = url.searchParams.get("path");
    if (!filePath || !isAbsolute(filePath) || !isPathAllowed(filePath)) {
      return json(res, { ok: false, error: "Invalid or disallowed path" }, 400);
    }
    try {
      const content = await readFile(filePath, "utf-8");
      return json(res, { ok: true, content });
    } catch {
      return json(res, { ok: false, error: "Cannot read file" }, 400);
    }
  }

  // GET /api/session-preview?path=... — parse JSONL session into structured conversation
  if (path === "/api/session-preview" && req.method === "GET") {
    const filePath = url.searchParams.get("path");
    if (!filePath || !filePath.endsWith(".jsonl") || !isPathAllowed(filePath)) {
      return json(res, { ok: false, error: "Invalid or disallowed session path" }, 400);
    }
    try {
      const fileStat = await stat(filePath);
      const fileSize = fileStat.size;

      // Read first 4KB for title (aiTitle is near the top)
      const headSize = Math.min(4096, fileSize);
      const fh = await open(filePath, "r");
      const headBuf = Buffer.alloc(headSize);
      await fh.read(headBuf, 0, headSize, 0);
      let title = null;
      for (const line of headBuf.toString("utf-8").split("\n").slice(0, 10)) {
        try { const e = JSON.parse(line); if (e.aiTitle) { title = e.aiTitle; break; } } catch {}
      }

      // Read last 256KB for recent messages (enough for ~20 text messages)
      const tailSize = Math.min(256 * 1024, fileSize);
      const tailBuf = Buffer.alloc(tailSize);
      await fh.read(tailBuf, 0, tailSize, fileSize - tailSize);
      await fh.close();

      const tailRaw = tailBuf.toString("utf-8");
      // Skip first partial line if we didn't read from start
      const tailLines = tailSize < fileSize ? tailRaw.split("\n").slice(1) : tailRaw.split("\n");

      const messages = [];
      let totalMessages = 0;
      for (const line of tailLines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.message?.role && entry.message?.content) {
            const role = entry.message.role;
            const content = entry.message.content;
            const textParts = [];
            const toolUses = [];
            if (typeof content === "string") {
              textParts.push(content);
            } else if (Array.isArray(content)) {
              for (const c of content) {
                if (c.type === "text" && c.text?.trim()) textParts.push(c.text);
                else if (c.type === "tool_use") toolUses.push({ name: c.name, id: c.id });
              }
            }
            const text = textParts.join("\n");
            totalMessages++;
            if (text.trim()) {
              messages.push({
                role,
                text: text.length > 800 ? text.slice(0, 800) + "\n… (truncated)" : text,
                toolUses: toolUses.length ? toolUses : undefined,
              });
            }
          }
        } catch { /* skip malformed lines */ }
      }

      const last20 = messages.slice(-20);
      return json(res, {
        ok: true,
        title,
        totalMessages,
        showing: last20.length,
        messages: last20,
      });
    } catch {
      return json(res, { ok: false, error: "Cannot read session" }, 400);
    }
  }

  // GET /api/browse-dirs?path=... — list subdirectories for folder picker
  if (path === "/api/browse-dirs" && req.method === "GET") {
    const dirPath = url.searchParams.get("path") || HOME;
    const resolved = resolve(dirPath);

    // Only allow browsing under HOME for safety
    if (!resolved.startsWith(HOME) && resolved !== HOME) {
      return json(res, { ok: false, error: "Cannot browse outside HOME directory" }, 400);
    }

    try {
      const { readdir: rd, stat: st } = await import("node:fs/promises");
      const entries = await rd(resolved, { withFileTypes: true });
      const dirs = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue; // skip hidden
        dirs.push(entry.name);
      }
      dirs.sort();
      return json(res, { ok: true, path: resolved, dirs, parent: resolve(resolved, "..") });
    } catch {
      return json(res, { ok: false, error: "Cannot read directory" }, 400);
    }
  }

  // POST /api/export — export all scanned items to a folder
  if (path === "/api/export" && req.method === "POST") {
    let { exportDir } = await readBody(req);
    // Default to ~/.claude/exports/ if no path provided
    if (!exportDir) exportDir = join(CLAUDE_DIR, "exports");
    if (!isAbsolute(exportDir)) {
      return json(res, { ok: false, error: "Invalid exportDir (must be absolute path)" }, 400);
    }

    try {
      if (!cachedData) await freshScan();
      const { mkdir: mk, copyFile: cpf, writeFile: wf, cp: cpDir } = await import("node:fs/promises");
      const { dirname, relative, basename } = await import("node:path");

      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const backupRoot = join(exportDir, `cco-backup-${ts}`);
      let copied = 0;
      const errors = [];

      for (const item of cachedData.items) {
        try {
          const subDir = join(backupRoot, item.scopeId, item.category);
          await mk(subDir, { recursive: true });

          if (item.category === "skill") {
            // Skills are directories — copy whole dir
            const dest = join(subDir, item.fileName || basename(item.path));
            await cpDir(item.path, dest, { recursive: true });
          } else if (item.category === "mcp") {
            // MCP entries live inside JSON — export the full .mcp.json
            const dest = join(subDir, `${item.name}.json`);
            const config = item.mcpConfig || {};
            await wf(dest, JSON.stringify({ [item.name]: config }, null, 2) + "\n");
          } else {
            // Regular files — copy directly
            const dest = join(subDir, item.fileName || basename(item.path));
            await cpf(item.path, dest);
          }
          copied++;
        } catch (err) {
          errors.push(`${item.name}: ${err.message}`);
        }
      }

      // Write summary
      const summary = {
        exportedAt: new Date().toISOString(),
        totalItems: cachedData.items.length,
        copied,
        errors: errors.length,
        scopes: cachedData.scopes.map(s => ({ id: s.id, name: s.name, type: s.type })),
        categories: [...new Set(cachedData.items.map(i => i.category))],
      };
      await wf(join(backupRoot, "backup-summary.json"), JSON.stringify(summary, null, 2) + "\n");

      return json(res, {
        ok: true,
        message: `Exported ${copied} items to ${backupRoot}`,
        path: backupRoot,
        copied,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      return json(res, { ok: false, error: `Export failed: ${err.message}` }, 400);
    }
  }

  // ── Security Scan API ──────────────────────────────────────────────

  // GET /api/security-status — check if Claude Code CLI is available for LLM judge
  if (path === "/api/security-status" && req.method === "GET") {
    const status = await checkClaudeAvailable();
    return json(res, { ok: true, ...status });
  }

  // POST /api/security-scan — run full security scan (introspect + pattern + baseline)
  if (path === "/api/security-scan" && req.method === "POST") {
    try {
      if (!cachedData) await freshScan();

      // Get all MCP server items from scan data
      const mcpItems = cachedData.items.filter(i => i.category === "mcp" && i.mcpConfig);

      // Phase 1: Introspect MCP servers to get tool definitions
      const introspectionResults = await introspectServers(mcpItems);

      // Phase 2 + 3: Pattern scan + baseline comparison
      const scanResults = await runSecurityScan(introspectionResults, cachedData);

      return json(res, scanResults);
    } catch (err) {
      return json(res, { ok: false, error: `Security scan failed: ${err.message}` }, 500);
    }
  }

  // POST /api/security-rescan — run LLM judge on specific tools (user-triggered)
  if (path === "/api/security-rescan" && req.method === "POST") {
    try {
      const { toolsToJudge } = await readBody(req);
      if (!toolsToJudge || !Array.isArray(toolsToJudge) || toolsToJudge.length === 0) {
        return json(res, { ok: false, error: "No tools specified for rescan" }, 400);
      }

      // Check Claude availability first
      const status = await checkClaudeAvailable();
      if (!status.available) {
        return json(res, {
          ok: false,
          error: "Claude Code session not found. Please open Claude Code in a terminal first, then retry.",
          needsAuth: true,
        }, 503);
      }

      // Run LLM judge
      const llmResults = await llmJudge(toolsToJudge);
      return json(res, { ok: true, results: llmResults });
    } catch (err) {
      return json(res, { ok: false, error: `LLM rescan failed: ${err.message}` }, 500);
    }
  }

  // GET /api/security-baseline-check — compare current MCP servers against saved baselines (no scan needed)
  if (path === "/api/security-baseline-check" && req.method === "GET") {
    try {
      if (!cachedData) await freshScan();
      const mcpNames = new Set(cachedData.items.filter(i => i.category === "mcp" && i.mcpConfig).map(i => i.name));
      const { loadBaselines } = await import("./security-scanner.mjs");
      const baselines = await loadBaselines();
      const baselineNames = new Set(Object.keys(baselines));

      const newServers = [...mcpNames].filter(n => !baselineNames.has(n));
      // Changed detection requires introspection (can't do without scan), so only flag new
      return json(res, { ok: true, newServers });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // GET /api/security-cache — load cached scan results
  if (path === "/api/security-cache" && req.method === "GET") {
    try {
      const cachePath = join(CLAUDE_DIR, ".cco-security", "last-scan.json");
      const content = await readFile(cachePath, "utf-8");
      return json(res, { ok: true, data: JSON.parse(content) });
    } catch {
      return json(res, { ok: false });
    }
  }

  // POST /api/security-cache — save scan results for persistence
  if (path === "/api/security-cache" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { mkdir: mk, writeFile: wf } = await import("node:fs/promises");
      const cacheDir = join(CLAUDE_DIR, ".cco-security");
      await mk(cacheDir, { recursive: true });
      await wf(join(cacheDir, "last-scan.json"), JSON.stringify(body));
      return json(res, { ok: true });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // ── Static UI files ──

  if (path === "/" || path === "/index.html") {
    return serveFile(res, join(UI_DIR, "index.html"));
  }
  if (path === "/style.css") {
    return serveFile(res, join(UI_DIR, "style.css"));
  }
  if (path === "/app.js") {
    return serveFile(res, join(UI_DIR, "app.js"));
  }

  // Suppress favicon 404
  if (path === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  // ── 404 ──
  res.writeHead(404);
  res.end("Not found");
}

// ── Start server ─────────────────────────────────────────────────────

export function startServer(port = 3847, maxRetries = 10) {
  // ── Auto-shutdown when all browser tabs close (#2) ──
  // Uses SSE heartbeat: browser opens /heartbeat connection, server tracks
  // active clients. When all disconnect, starts idle countdown.
  const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — only used if NO browser ever connects
  const DISCONNECT_GRACE_MS = 30 * 1000; // 30s grace for SSE reconnects
  const clients = new Set();
  let idleTimer = null;
  let hadClientEver = false;

  function startIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    // If a browser connected before, use short grace period (SSE reconnect window).
    // If no browser ever connected, use the full safety-net timeout.
    const ms = hadClientEver ? DISCONNECT_GRACE_MS : IDLE_TIMEOUT_MS;
    idleTimer = setTimeout(() => {
      if (clients.size > 0) return; // a client reconnected, don't shut down
      console.log(hadClientEver
        ? "\nAll browser tabs closed. Shutting down."
        : "\nNo browser connected within 5 minutes. Shutting down.");
      console.log("Run again anytime with /cco or npx @mcpware/claude-code-organizer\n");
      process.exit(0);
    }, ms);
  }

  function cancelIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // SSE heartbeat endpoint — tracks connected browser tabs
    if (url.pathname === "/heartbeat") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(": connected\n\n");

      clients.add(res);
      hadClientEver = true;
      cancelIdleTimer();

      const keepalive = setInterval(() => res.write(": ping\n\n"), 30000);

      req.on("close", () => {
        clearInterval(keepalive);
        clients.delete(res);
        if (clients.size === 0) startIdleTimer();
      });
      return;
    }

    try {
      await handleRequest(req, res);
    } catch (err) {
      console.error("Error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  let attempt = 0;
  function tryListen(p) {
    server.listen(p, () => {
      console.log(`\nClaude Code Organizer running at http://localhost:${p}\n`);
      console.log(`Made by a CS dropout with no mass, no team, no budget \u2014 just Claude Code and ADHD.`);
      console.log(`This is my first open-source project. If it helped you, a star would make my week:`);
      console.log(`\u2B50 https://github.com/mcpware/claude-code-organizer`);
      console.log(`\uD83D\uDCEC Bugs, ideas, or just wanna say hi? https://github.com/mcpware/claude-code-organizer/issues \u2014 I fix things same day, I promise`);
      console.log(`\nPress Ctrl+C to stop. Server auto-shuts down when you close all browser tabs.\n`);
      startIdleTimer(); // safety net in case no browser connects
      // Non-blocking update check
      checkForUpdate().catch(() => {});
    });
  }

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < maxRetries) {
      attempt++;
      const nextPort = port + attempt;
      console.log(`Port ${port + attempt - 1} in use, trying ${nextPort}...`);
      tryListen(nextPort);
    } else {
      console.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    }
  });

  tryListen(port);
  return server;
}
