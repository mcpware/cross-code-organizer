/**
 * server.mjs — HTTP server for Cross-Code Organizer (CCO).
 * Routes only. All logic is in scanner.mjs and mover.mjs.
 * All UI is in src/ui/ (html, css, js).
 */

import { createServer } from "node:http";
import { readFile, stat, open } from "node:fs/promises";
import { join, extname, resolve, sep, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import https from "node:https";
import {
  scan,
  scanMcpPolicy,
  checkMcpPolicy,
  getDisabledMcpServers,
  setDisabledMcpServers,
} from "./scanner.mjs";
import { moveItem, deleteItem, getValidDestinations } from "./mover.mjs";
import { introspectServers } from "./mcp-introspector.mjs";
import { runSecurityScan, checkClaudeAvailable, llmJudge, detectMcpDuplicates } from "./security-scanner.mjs";
import { computeClaudeContextBudget } from "./harness/adapters/claude-context-budget.mjs";
import { getAdapter, getDefaultAdapterId, listAdapters } from "./harness/registry.mjs";
import { scanHarness as runHarnessScan } from "./harness/scanner-framework.mjs";

// ── Update check ─────────────────────────────────────────────────────
async function checkForUpdate() {
  const require = createRequire(import.meta.url);
  const { version: local } = require("../package.json");
  const data = await new Promise((resolve, reject) => {
    const req = https.get("https://registry.npmjs.org/@mcpware/cross-code-organizer/latest", { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
  const { version: latest } = JSON.parse(data);
  if (latest && latest !== local) {
    console.log(`\uD83D\uDCE6 Update available: ${local} \u2192 ${latest}  Run: npm update -g @mcpware/cross-code-organizer\n`);
  }
}

// ── Path safety ──────────────────────────────────────────────────────

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");
const BACKUP_DIR = join(HOME, ".claude-backups");
const BACKUP_CONFIG = join(BACKUP_DIR, "config.json");

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
const cachedDataByHarness = new Map();

function requestHarnessId(url) {
  return url.searchParams.get("harness") || getDefaultAdapterId();
}

async function scanForCache(harnessId) {
  if (harnessId === getDefaultAdapterId()) return scan();
  const adapter = await getAdapter(harnessId);
  return runHarnessScan(adapter);
}

async function refreshScanCache(harnessId = getDefaultAdapterId()) {
  const data = await scanForCache(harnessId);
  cachedDataByHarness.set(harnessId, data);
  return data;
}

function getCachedData(harnessId = getDefaultAdapterId()) {
  return cachedDataByHarness.get(harnessId) || null;
}

function invalidateCachedData(harnessId = getDefaultAdapterId()) {
  cachedDataByHarness.delete(harnessId);
}

async function getHarnessOperations(harnessId = getDefaultAdapterId()) {
  const adapter = await getAdapter(harnessId);
  return adapter.operations || { moveItem, deleteItem, getValidDestinations };
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
  const harnessId = requestHarnessId(url);
  let cachedData = getCachedData(harnessId);
  async function freshScan() {
    cachedData = await refreshScanCache(harnessId);
    return cachedData;
  }

  // ── API routes ──

  // GET /api/harnesses — list registered harness adapters and metadata
  if (path === "/api/harnesses" && req.method === "GET") {
    const summaries = await listAdapters();
    const harnesses = await Promise.all(summaries.map(async ({ id }) => {
      const adapter = await getAdapter(id);
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        shortName: adapter.shortName,
        icon: adapter.icon,
        executable: adapter.executable,
        categories: adapter.categories,
        scopeTypes: adapter.scopeTypes,
        capabilities: adapter.capabilities,
      };
    }));
    return json(res, { ok: true, defaultHarness: getDefaultAdapterId(), harnesses });
  }

  if (path.startsWith("/api/") && path !== "/api/version") {
    try {
      await getAdapter(harnessId);
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 400);
    }
  }

  // GET /api/version — check for updates (UI calls this)
  if (path === "/api/version" && req.method === "GET") {
    const require = createRequire(import.meta.url);
    const { version: local } = require("../package.json");
    try {
      const data = await new Promise((resolve, reject) => {
        const req = https.get("https://registry.npmjs.org/@mcpware/cross-code-organizer/latest", { timeout: 3000 }, (res) => {
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

  // GET /api/settings?scope=<id> — structured settings for a scope
  if (path === "/api/settings" && req.method === "GET") {
    const scopeId = url.searchParams.get("scope");
    if (!scopeId) return json(res, { ok: false, error: "Missing scope parameter" }, 400);

    if (!cachedData) await freshScan();

    const records = cachedData.items.filter(
      i => i.category === "setting" && i.scopeId === scopeId
    );

    // Group records by settingGroup
    const groups = {};
    for (const r of records) {
      const g = r.settingGroup || "other";
      if (!groups[g]) groups[g] = [];
      groups[g].push(r);
    }

    // Collect distinct source files for this scope
    const sourceMap = new Map();
    for (const r of records) {
      if (!sourceMap.has(r.sourceFile)) {
        sourceMap.set(r.sourceFile, { file: r.sourceFile, tier: r.sourceTier });
      }
    }

    return json(res, {
      scopeId,
      sources: [...sourceMap.values()],
      records,
      groups,
    });
  }

  // GET /api/context-budget?scope=<id> — token budget breakdown for a scope
  if (path === "/api/context-budget" && req.method === "GET") {
    const scopeId = url.searchParams.get("scope");
    if (!scopeId) return json(res, { ok: false, error: "Missing scope parameter" }, 400);

    if (!cachedData) await freshScan();

    const contextLimit = parseInt(url.searchParams.get("limit")) || 200000;
    const result = await computeClaudeContextBudget({ data: cachedData, scopeId, contextLimit, home: HOME });
    return json(res, result, result.ok ? 200 : 400);
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

    const operations = await getHarnessOperations(harnessId);
    const result = await operations.moveItem(item, toScopeId, cachedData.scopes);

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

    const operations = await getHarnessOperations(harnessId);
    const result = await operations.deleteItem(item, cachedData.scopes);

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

    const operations = await getHarnessOperations(harnessId);
    const destinations = operations.getValidDestinations(item, cachedData.scopes);
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

  // POST /api/save-frontmatter — write updated markdown file content (skills, agents, memories)
  if (path === "/api/save-frontmatter" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { path: filePath, content } = body;
      if (!filePath || !isAbsolute(filePath) || !isPathAllowed(filePath)) {
        return json(res, { ok: false, error: "Invalid or disallowed path" }, 400);
      }
      if (!filePath.endsWith(".md")) {
        return json(res, { ok: false, error: "Only .md files can be updated" }, 400);
      }
      const { writeFile: wf } = await import("node:fs/promises");
      await wf(filePath, content, "utf-8");
      invalidateCachedData(harnessId);
      cachedData = null;
      return json(res, { ok: true });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
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

  // GET /api/session-cost?path=... — parse JSONL session and compute per-model cost breakdown
  if (path === "/api/session-cost" && req.method === "GET") {
    const filePath = url.searchParams.get("path");
    if (!filePath || !filePath.endsWith(".jsonl") || !isPathAllowed(filePath)) {
      return json(res, { ok: false, error: "Invalid or disallowed session path" }, 400);
    }
    // pricing per million tokens [input, output, cacheRead, cacheWrite, webSearch per req]
    const PRICING = {
      "claude-opus-4-6":       { i: 5,  o: 25,  cr: 0.5,  cw: 6.25, ws: 0.01 },
      "claude-opus-4-5":       { i: 5,  o: 25,  cr: 0.5,  cw: 6.25, ws: 0.01 },
      "claude-opus-4-1":       { i: 15, o: 75,  cr: 1.5,  cw: 18.75, ws: 0.01 },
      "claude-sonnet-4-6":     { i: 3,  o: 15,  cr: 0.3,  cw: 3.75, ws: 0.01 },
      "claude-sonnet-4-5":     { i: 3,  o: 15,  cr: 0.3,  cw: 3.75, ws: 0.01 },
      "claude-sonnet-4-1":     { i: 3,  o: 15,  cr: 0.3,  cw: 3.75, ws: 0.01 },
      "claude-haiku-4-5":      { i: 1,  o: 5,   cr: 0.1,  cw: 1.25, ws: 0.01 },
      "claude-haiku-3-5":      { i: 0.8, o: 4,  cr: 0.08, cw: 1,    ws: 0.01 },
    };
    const DEFAULT_PRICING = { i: 3, o: 15, cr: 0.3, cw: 3.75, ws: 0.01 };

    try {
      const content = await readFile(filePath, "utf-8");
      const models = {};  // { modelName: { inputTokens, outputTokens, cacheRead, cacheWrite, webSearches, turns } }
      let firstTs = null, lastTs = null;

      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.timestamp) {
            const ts = entry.timestamp;
            if (!firstTs || ts < firstTs) firstTs = ts;
            if (!lastTs || ts > lastTs) lastTs = ts;
          }
          if (entry.type === "assistant" && entry.message?.usage && entry.message?.model !== "<synthetic>") {
            const model = entry.message.model || "unknown";
            const u = entry.message.usage;
            if (!models[model]) models[model] = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0, turns: 0 };
            models[model].inputTokens += u.input_tokens || 0;
            models[model].outputTokens += u.output_tokens || 0;
            models[model].cacheRead += u.cache_read_input_tokens || 0;
            models[model].cacheWrite += u.cache_creation_input_tokens || 0;
            models[model].webSearches += (u.server_tool_use?.web_search_requests || 0);
            models[model].turns++;
          }
        } catch { /* skip malformed */ }
      }

      // calculate cost per model
      let totalCost = 0;
      const breakdown = [];
      for (const [model, m] of Object.entries(models)) {
        const p = PRICING[model] || DEFAULT_PRICING;
        const cost = (m.inputTokens * p.i + m.outputTokens * p.o + m.cacheRead * p.cr + m.cacheWrite * p.cw) / 1_000_000 + m.webSearches * p.ws;
        totalCost += cost;
        breakdown.push({ model, ...m, costUSD: Math.round(cost * 10000) / 10000 });
      }
      breakdown.sort((a, b) => b.costUSD - a.costUSD);

      // duration
      let durationMs = 0;
      if (firstTs && lastTs) {
        durationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime();
      }

      return json(res, {
        ok: true,
        totalCostUSD: Math.round(totalCost * 10000) / 10000,
        durationMs,
        breakdown,
      });
    } catch {
      return json(res, { ok: false, error: "Cannot read session" }, 400);
    }
  }

  // POST /api/session-distill?path=... — distill a session (backup + clean JSONL + index)
  if (path === "/api/session-distill" && req.method === "POST") {
    const filePath = url.searchParams.get("path");
    if (!filePath || !filePath.endsWith(".jsonl") || !isPathAllowed(filePath)) {
      return json(res, { ok: false, error: "Invalid or disallowed session path" }, 400);
    }
    try {
      const { distillSession } = await import("./session-distiller.mjs");
      const result = await distillSession(filePath);
      invalidateCachedData(harnessId); // bust scan cache so new session appears
      cachedData = null;
      return json(res, {
        ok: true,
        distilled: result.outputPath,
        backup: result.backupPath,
        sessionId: result.sessionId,
        stats: result.stats,
      });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
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

  // ── Backup Center API ─────────────────────────────────────────────

  // GET /api/backup/status — current backup state, git info, scheduler info
  if (path === "/api/backup/status" && req.method === "GET") {
    try {
      const { readFile: rf } = await import("node:fs/promises");
      const { isGitRepo, hasRemote, getRemoteUrl, getLastCommit } = await import("./backup-git.mjs");
      const { isInstalled } = await import("./backup-scheduler.mjs");

      let config = {};
      try { config = JSON.parse(await rf(BACKUP_CONFIG, "utf-8")); } catch {}

      const gitRepo = await isGitRepo(BACKUP_DIR);
      const remote = gitRepo ? await hasRemote(BACKUP_DIR) : false;
      const remoteUrl = remote ? await getRemoteUrl(BACKUP_DIR) : null;
      const lastCommit = gitRepo ? await getLastCommit(BACKUP_DIR) : { msg: null, date: null };
      const schedulerInstalled = await isInstalled();

      const counts = cachedData ? { ...cachedData.counts } : {};
      const totalItems = cachedData ? cachedData.items.length : 0;
      const scopeCount = cachedData ? cachedData.scopes.length : 0;

      return json(res, {
        ok: true,
        counts, totalItems, scopeCount,
        lastRun: config.lastRun || null,
        lastCopied: config.lastCopied || 0,
        lastErrors: config.lastErrors || 0,
        interval: config.interval || 4,
        isGitRepo: gitRepo,
        hasRemote: remote,
        remoteUrl,
        lastCommitMsg: lastCommit.msg,
        lastCommitDate: lastCommit.date,
        schedulerInstalled,
      });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // POST /api/backup/run — export to latest/ + git commit + push
  if (path === "/api/backup/run" && req.method === "POST") {
    try {
      const { rm, mkdir: mk, copyFile: cpf, writeFile: wf, cp: cpDir } = await import("node:fs/promises");
      const { basename } = await import("node:path");
      const { commitAndPush } = await import("./backup-git.mjs");
      const { readFile: rf } = await import("node:fs/promises");

      const scanData = await freshScan();
      const latestDir = join(BACKUP_DIR, "latest");

      try { await rm(latestDir, { recursive: true, force: true }); } catch {}

      let copied = 0;
      const errors = [];
      const exportableItems = scanData.items.filter(
        item => item.category !== "setting" && item.category !== "hook"
      );

      for (const item of exportableItems) {
        try {
          const subDir = join(latestDir, item.scopeId, item.category);
          await mk(subDir, { recursive: true });
          if (item.category === "skill") {
            await cpDir(item.path, join(subDir, item.fileName || basename(item.path)), { recursive: true });
          } else if (item.category === "mcp") {
            await wf(join(subDir, `${item.name}.json`), JSON.stringify({ [item.name]: item.mcpConfig || {} }, null, 2) + "\n");
          } else if (item.category === "plugin" && item.path) {
            await cpDir(item.path, join(subDir, item.fileName || basename(item.path)), { recursive: true });
          } else if (item.path) {
            await cpf(item.path, join(subDir, item.fileName || basename(item.path)));
          }
          copied++;
        } catch (e) {
          errors.push(`${item.category}/${item.name}: ${e.message}`);
        }
      }

      await wf(join(latestDir, "backup-summary.json"), JSON.stringify({
        exportedAt: new Date().toISOString(), totalItems: exportableItems.length, copied, errors: errors.length, counts: scanData.counts,
      }, null, 2) + "\n");

      const gitResult = await commitAndPush(BACKUP_DIR);

      let config = {};
      try { config = JSON.parse(await rf(BACKUP_CONFIG, "utf-8")); } catch {}
      await wf(BACKUP_CONFIG, JSON.stringify({ ...config, lastRun: new Date().toISOString(), lastCopied: copied, lastErrors: errors.length }, null, 2) + "\n");

      return json(res, { ok: true, copied, errors: errors.length, gitResult, counts: scanData.counts, totalItems: scanData.items.length, scopeCount: scanData.scopes.length });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // POST /api/backup/sync — git commit + push only
  if (path === "/api/backup/sync" && req.method === "POST") {
    try {
      const { commitAndPush } = await import("./backup-git.mjs");
      const result = await commitAndPush(BACKUP_DIR);
      return json(res, { ok: true, ...result });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // POST /api/backup/scheduler/install — update interval, reinstall systemd timer
  if (path === "/api/backup/scheduler/install" && req.method === "POST") {
    try {
      const { intervalHours = 4 } = await readBody(req);
      const { readFile: rf, writeFile: wf } = await import("node:fs/promises");
      const { install, getNodeAndCliPath } = await import("./backup-scheduler.mjs");

      const paths = await getNodeAndCliPath();
      if (!paths) return json(res, { ok: false, error: "Backup scheduler not initialized. Run `claude-code-backup init` first." }, 400);

      await install(paths.nodePath, paths.cliPath, intervalHours);

      let config = {};
      try { config = JSON.parse(await rf(BACKUP_CONFIG, "utf-8")); } catch {}
      await wf(BACKUP_CONFIG, JSON.stringify({ ...config, interval: intervalHours }, null, 2) + "\n");

      return json(res, { ok: true, interval: intervalHours });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // POST /api/backup/remote — set or update git remote URL
  if (path === "/api/backup/remote" && req.method === "POST") {
    try {
      const { url } = await readBody(req);
      if (!url) return json(res, { ok: false, error: "Missing url" }, 400);
      const { mkdir: mk, writeFile: wf } = await import("node:fs/promises");
      const { execFile } = await import("node:child_process");
      const { promisify: prom } = await import("node:util");
      const exec = prom(execFile);
      const { isGitRepo, hasRemote, addRemote, initRepo } = await import("./backup-git.mjs");

      await mk(BACKUP_DIR, { recursive: true });
      if (!(await isGitRepo(BACKUP_DIR))) {
        await initRepo(BACKUP_DIR);
        await wf(join(BACKUP_DIR, ".gitignore"), "backup-*/\n*.log\nconfig.json\n");
      }
      if (await hasRemote(BACKUP_DIR)) {
        await exec("git", ["remote", "set-url", "origin", url], { cwd: BACKUP_DIR });
      } else {
        await addRemote(BACKUP_DIR, url);
      }
      return json(res, { ok: true, url });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // ── MCP Controls API ───────────────────────────────────────────────

  // GET /api/mcp-disabled?project=<absolutePath> — get disabled servers for a project
  if (path === "/api/mcp-disabled" && req.method === "GET") {
    const projectPath = url.searchParams.get("project");
    if (!projectPath) return json(res, { ok: false, error: "Missing project param" }, 400);
    const disabled = await getDisabledMcpServers(projectPath);
    return json(res, { ok: true, disabled });
  }

  // POST /api/mcp-disabled — add or remove from disabled list
  if (path === "/api/mcp-disabled" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { project, action, serverName } = body;
      if (!project || !action || !serverName) return json(res, { ok: false, error: "Missing project, action, or serverName" }, 400);

      const current = await getDisabledMcpServers(project);
      let updated;
      if (action === "disable") {
        updated = current.includes(serverName) ? current : [...current, serverName];
      } else if (action === "enable") {
        updated = current.filter(n => n !== serverName);
      } else {
        return json(res, { ok: false, error: `Unknown action: ${action}` }, 400);
      }

      await setDisabledMcpServers(project, updated);
      invalidateCachedData(harnessId);
      cachedData = null;
      return json(res, { ok: true, disabled: updated });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // ── MCP Policy API ─────────────────────────────────────────────────

  // GET /api/mcp-policy — return allowlist/denylist + per-server policy status
  if (path === "/api/mcp-policy" && req.method === "GET") {
    try {
      if (!cachedData) await freshScan();
      const policy = await scanMcpPolicy();
      const mcpItems = cachedData.items.filter(i => i.category === "mcp" && i.mcpConfig);
      const serverStatuses = mcpItems.map(item => ({
        name: item.name,
        scopeId: item.scopeId,
        status: checkMcpPolicy(item.name, item.mcpConfig, policy),
      }));
      return json(res, { ok: true, ...policy, servers: serverStatuses });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
    }
  }

  // POST /api/mcp-policy — add/remove allowlist or denylist entries in user settings
  if (path === "/api/mcp-policy" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { action, entry } = body;
      if (!action || !entry) return json(res, { ok: false, error: "Missing action or entry" }, 400);

      const settingsPath = join(homedir(), ".claude", "settings.json");
      let settings = {};
      try { settings = JSON.parse(await readFile(settingsPath, "utf-8")); } catch { /* new file */ }

      const field = action.includes("allow") ? "allowedMcpServers" : "deniedMcpServers";
      if (!Array.isArray(settings[field])) settings[field] = [];

      if (action.startsWith("add-")) {
        // Avoid duplicate entries
        const entryJson = JSON.stringify(entry);
        if (!settings[field].some(e => JSON.stringify(e) === entryJson)) {
          settings[field].push(entry);
        }
      } else if (action.startsWith("remove-")) {
        const entryJson = JSON.stringify(entry);
        settings[field] = settings[field].filter(e => JSON.stringify(e) !== entryJson);
      } else {
        return json(res, { ok: false, error: `Unknown action: ${action}` }, 400);
      }

      const { writeFile: writeFileFs } = await import("node:fs/promises");
      await writeFileFs(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      invalidateCachedData(harnessId); // invalidate cache
      cachedData = null;
      return json(res, { ok: true });
    } catch (err) {
      return json(res, { ok: false, error: err.message }, 500);
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

      // Phase 4: Detect duplicate MCP servers (ccsrc signature-based dedup)
      scanResults.duplicates = detectMcpDuplicates(mcpItems);

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
  if (path === "/effective.mjs") {
    // Serve as browser-compatible IIFE: strip ES exports, wrap in scope
    // Node.js unit tests import the .mjs directly; browser uses window.Effective
    try {
      const content = await readFile(join(import.meta.dirname, "effective.mjs"), "utf-8");
      const browserCode = "(function(){\n" + content.replace(/^export /gm, "") + "\n})();";
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end(browserCode);
    } catch { res.writeHead(404); return res.end(); }
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
      console.log("Run again anytime with /cco or npx @mcpware/cross-code-organizer\n");
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
      console.log(`\nCross-Code Organizer (CCO) running at http://localhost:${p}\n`);
      console.log(`Made by a CS dropout with no mass, no team, no budget \u2014 just Claude Code and ADHD.`);
      console.log(`This is my first open-source project. If it helped you, a star would make my week:`);
      console.log(`\u2B50 https://github.com/mcpware/cross-code-organizer`);
      console.log(`\uD83D\uDCEC Bugs, ideas, or just wanna say hi? https://github.com/mcpware/cross-code-organizer/issues \u2014 I fix things same day, I promise`);
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
