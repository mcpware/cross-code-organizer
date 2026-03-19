/**
 * scanner.mjs — Scan all Claude Code customizations.
 * Returns a structured object describing every memory, skill, MCP server,
 * config file, hook, plugin, plan, command, and agent — grouped by scope.
 *
 * Pure data module. No HTTP, no UI, no side effects.
 */

import { readdir, stat, readFile, access } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");

// ── Helpers ──────────────────────────────────────────────────────────

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function safeReadFile(p) {
  try { return await readFile(p, "utf-8"); } catch { return null; }
}

async function safeStat(p) {
  try { return await stat(p); } catch { return null; }
}

function formatSize(bytes) {
  if (!bytes) return "0B";
  if (bytes < 1024) return bytes + "B";
  return (bytes / 1024).toFixed(1) + "K";
}

function parseFrontmatter(content) {
  if (!content) return {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

// ── Path decoding ────────────────────────────────────────────────────

/**
 * Resolve an encoded project dir name back to a real filesystem path.
 * E.g. "-home-user-mycompany-repo1" → "/home/user/mycompany/repo1"
 *
 * Strategy: starting from root, greedily match the longest existing directory
 * at each level by consuming segments from the encoded name.
 */
async function resolveEncodedProjectPath(encoded) {
  // Remove leading dash, split by dash
  const segments = encoded.replace(/^-/, "").split("-");
  let currentPath = "/";
  let i = 0;

  while (i < segments.length) {
    // Try longest match first: join remaining segments and check if directory exists
    let matched = false;
    for (let end = segments.length; end > i; end--) {
      const candidate = segments.slice(i, end).join("-");
      const testPath = join(currentPath, candidate);
      if (await exists(testPath)) {
        const s = await safeStat(testPath);
        if (s && s.isDirectory()) {
          currentPath = testPath;
          i = end;
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      // Try single segment
      currentPath = join(currentPath, segments[i]);
      i++;
    }
  }

  // Verify the resolved path exists
  if (await exists(currentPath)) return currentPath;
  return null;
}

// ── Scope discovery ──────────────────────────────────────────────────

/**
 * Discover all scopes by scanning ~/.claude/projects/ and known repo dirs.
 * Returns an array of scope objects with parent-child relationships.
 */
async function discoverScopes() {
  const scopes = [];

  // Global scope
  scopes.push({
    id: "global",
    name: "Global",
    type: "global",
    tag: "applies everywhere",
    parentId: null,
    claudeProjectDir: null, // global uses ~/.claude/ directly
    repoDir: null,
  });

  // Scan ~/.claude/projects/ for project scopes
  const projectsDir = join(CLAUDE_DIR, "projects");
  if (!(await exists(projectsDir))) return scopes;

  const projectDirs = await readdir(projectsDir, { withFileTypes: true });
  const projectEntries = [];

  for (const d of projectDirs) {
    if (!d.isDirectory()) continue;

    // Decode encoded path: try to find the real directory on disk.
    // The encoding replaces / with - and prepends -.
    // E.g. -home-user-mycompany-repo1 → /home/user/mycompany/repo1
    // Since directory names can contain dashes, we resolve by checking which real path exists.
    const realPath = await resolveEncodedProjectPath(d.name);
    if (!realPath) continue;

    const shortName = basename(realPath);
    const hasMemory = await exists(join(projectsDir, d.name, "memory"));

    if (hasMemory) {
      projectEntries.push({
        encodedName: d.name,
        realPath,
        shortName,
        claudeProjectDir: join(projectsDir, d.name),
      });
    }
  }

  // Sort by path depth (shorter = parent) then alphabetically
  projectEntries.sort((a, b) => {
    const da = a.realPath.split("/").length;
    const db = b.realPath.split("/").length;
    if (da !== db) return da - db;
    return a.realPath.localeCompare(b.realPath);
  });

  // Build parent-child relationships based on path nesting
  for (const entry of projectEntries) {
    // Find parent: the deepest existing scope whose realPath is a prefix of this one
    let parentId = "global";
    for (const existing of scopes) {
      if (existing.repoDir && entry.realPath.startsWith(existing.repoDir + "/")) {
        parentId = existing.id;
      }
    }

    // Determine type: if parent is global → workspace/project, if parent is another project → sub-project
    const isWorkspace = parentId === "global" && projectEntries.some(
      e => e !== entry && e.realPath.startsWith(entry.realPath + "/")
    );

    scopes.push({
      id: entry.encodedName,
      name: entry.shortName,
      type: isWorkspace ? "workspace" : "project",
      tag: isWorkspace ? "workspace" : "project",
      parentId,
      claudeProjectDir: entry.claudeProjectDir,
      repoDir: entry.realPath,
    });
  }

  return scopes;
}

// ── Skill bundle detection (via skills-lock.json) ───────────────────

/**
 * Load skill bundle info from skills-lock.json files.
 * Returns a Map of skillName → { source, sourceType }.
 *
 * Checks:
 * 1. Project-level: <repoDir>/skills-lock.json (version 1)
 * 2. Global: ~/.agents/.skill-lock.json (version 3)
 */
async function loadSkillBundles(repoDir) {
  const bundles = new Map();

  // Paths to check (project-level first, then global)
  const lockPaths = [];
  if (repoDir) lockPaths.push(join(repoDir, "skills-lock.json"));
  lockPaths.push(join(HOME, ".agents", ".skill-lock.json"));

  for (const lockPath of lockPaths) {
    const content = await safeReadFile(lockPath);
    if (!content) continue;
    try {
      const lock = JSON.parse(content);
      const skills = lock.skills || {};
      for (const [name, entry] of Object.entries(skills)) {
        if (!bundles.has(name) && entry.source) {
          bundles.set(name, {
            source: entry.source,
            sourceType: entry.sourceType || "unknown",
          });
        }
      }
    } catch {}
  }

  return bundles;
}

// ── Item scanners ────────────────────────────────────────────────────

async function scanMemories(scope) {
  const items = [];
  const memDir = scope.id === "global"
    ? join(CLAUDE_DIR, "memory")
    : join(scope.claudeProjectDir, "memory");

  if (!(await exists(memDir))) return items;

  const files = await readdir(memDir);
  for (const f of files) {
    if (!f.endsWith(".md") || f === "MEMORY.md") continue;
    const fullPath = join(memDir, f);
    const s = await safeStat(fullPath);
    const content = await safeReadFile(fullPath);
    const fm = parseFrontmatter(content);

    items.push({
      category: "memory",
      scopeId: scope.id,
      name: fm.name || f.replace(".md", ""),
      fileName: f,
      description: fm.description || "",
      subType: fm.type || "memory", // feedback, user, project, reference
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 10) : "",
      path: fullPath,
    });
  }

  return items;
}

async function scanSkills(scope) {
  const items = [];
  let skillDirs = [];

  if (scope.id === "global") {
    // Global skills: ~/.claude/skills/
    const dir = join(CLAUDE_DIR, "skills");
    if (await exists(dir)) skillDirs.push(dir);
  } else if (scope.repoDir) {
    // Per-repo skills: repo/.claude/skills/
    const dir = join(scope.repoDir, ".claude", "skills");
    if (await exists(dir)) skillDirs.push(dir);
  }

  // Load bundle info from skills-lock.json
  const bundleMap = await loadSkillBundles(scope.repoDir);

  for (const skillsRoot of skillDirs) {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      // Support both real directories and symlinks pointing to directories
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      // Skip "private" directory (usually copies of global skills)
      if (entry.name === "private") continue;

      const skillDir = join(skillsRoot, entry.name);
      const skillMd = join(skillDir, "SKILL.md");
      if (!(await exists(skillMd))) continue;

      const s = await safeStat(skillMd);
      const content = await safeReadFile(skillMd);

      // Extract description: first meaningful paragraph line after the heading
      let description = "";
      if (content) {
        const lines = content.split("\n");
        let pastHeading = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("# ")) { pastHeading = true; continue; }
          if (!pastHeading) continue;
          // Skip empty lines, frontmatter-like lines, code blocks, list items
          if (!trimmed) continue;
          if (trimmed.startsWith("```") || trimmed.startsWith("-") || trimmed.startsWith("|")) continue;
          if (trimmed.match(/^\w+:\s/)) continue; // skip "name: foo" style lines
          if (trimmed.startsWith("##")) continue;
          description = trimmed.slice(0, 120);
          break;
        }
      }

      // Count files in skill directory
      const allFiles = await readdir(skillDir, { withFileTypes: true });
      const fileCount = allFiles.filter(f => f.isFile()).length;

      // Total size of skill directory
      let totalSize = 0;
      for (const f of allFiles.filter(f => f.isFile())) {
        const fs = await safeStat(join(skillDir, f.name));
        if (fs) totalSize += fs.size;
      }

      // Bundle detection from skills-lock.json
      const bundleInfo = bundleMap.get(entry.name);

      items.push({
        category: "skill",
        scopeId: scope.id,
        name: entry.name,
        fileName: entry.name, // directory name
        description,
        subType: "skill",
        size: formatSize(totalSize),
        sizeBytes: totalSize,
        fileCount,
        mtime: s ? s.mtime.toISOString().slice(0, 10) : "",
        path: skillDir,
        bundle: bundleInfo?.source || null,
      });
    }
  }

  return items;
}

async function scanMcpServers(scope) {
  const items = [];
  let mcpPaths = [];

  if (scope.id === "global") {
    // All global MCP sources — show ALL entries so user can manage duplicates:
    // 1. ~/.claude/.mcp.json (user scope — `claude mcp add -s user`)
    // 2. ~/.mcp.json (alternate user location)
    // 3. Enterprise managed: /etc/claude-code/managed-mcp.json
    // 4. mcpServers inside settings.json / settings.local.json
    mcpPaths.push({ path: join(CLAUDE_DIR, ".mcp.json"), label: "global" });
    mcpPaths.push({ path: join(HOME, ".mcp.json"), label: "global" });
    mcpPaths.push({ path: "/etc/claude-code/managed-mcp.json", label: "managed" });
  } else if (scope.repoDir) {
    // Project-scope MCP: repo/.mcp.json
    const repoMcp = join(scope.repoDir, ".mcp.json");
    if (await exists(repoMcp)) {
      mcpPaths.push({ path: repoMcp, label: scope.type });
    }
  }

  for (const { path: mcpPath, label } of mcpPaths) {
    const content = await safeReadFile(mcpPath);
    if (!content) continue;
    try {
      const config = JSON.parse(content);
      const servers = config.mcpServers || {};
      for (const [name, serverConfig] of Object.entries(servers)) {
        const cmd = serverConfig.command || "";
        const args = serverConfig.args || [];
        const desc = [cmd, ...args].filter(Boolean).join(" ").slice(0, 100);

        items.push({
          category: "mcp",
          scopeId: scope.id,
          name,
          fileName: basename(mcpPath),
          description: desc,
          subType: "mcp",
          size: "",
          sizeBytes: 0,
          mtime: "",
          path: mcpPath,
          mcpConfig: serverConfig,
        });
      }
    } catch {}
  }

  // Also scan mcpServers embedded inside settings files
  const settingsFiles = scope.id === "global"
    ? [join(CLAUDE_DIR, "settings.json"), join(CLAUDE_DIR, "settings.local.json")]
    : scope.repoDir
      ? [join(scope.repoDir, ".claude", "settings.json"), join(scope.repoDir, ".claude", "settings.local.json")]
      : [];

  for (const sPath of settingsFiles) {
    const content = await safeReadFile(sPath);
    if (!content) continue;
    try {
      const settings = JSON.parse(content);
      const servers = settings.mcpServers || {};
      for (const [name, serverConfig] of Object.entries(servers)) {
        const cmd = serverConfig.command || "";
        const args = serverConfig.args || [];
        const desc = [cmd, ...args].filter(Boolean).join(" ").slice(0, 100);
        items.push({
          category: "mcp",
          scopeId: scope.id,
          name,
          fileName: basename(sPath),
          description: desc,
          subType: "mcp",
          size: "",
          sizeBytes: 0,
          mtime: "",
          path: sPath,
          mcpConfig: serverConfig,
        });
      }
    } catch {}
  }

  return items;
}

async function scanConfigs(scope) {
  const items = [];
  if (scope.id !== "global") return items;

  const configs = [
    { name: "CLAUDE.md", path: join(CLAUDE_DIR, "CLAUDE.md"), desc: "Global instructions" },
    { name: "settings.json", path: join(CLAUDE_DIR, "settings.json"), desc: "Global settings" },
    { name: "settings.local.json", path: join(CLAUDE_DIR, "settings.local.json"), desc: "Local settings override" },
  ];

  for (const cfg of configs) {
    if (!(await exists(cfg.path))) continue;
    const s = await safeStat(cfg.path);
    items.push({
      category: "config",
      scopeId: scope.id,
      name: cfg.name,
      fileName: cfg.name,
      description: cfg.desc,
      subType: "config",
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 10) : "",
      path: cfg.path,
      locked: true,
    });
  }

  return items;
}

async function scanHooks(scope) {
  const items = [];
  if (scope.id !== "global") return items; // hooks in global settings for now

  const content = await safeReadFile(join(CLAUDE_DIR, "settings.json"));
  if (!content) return items;

  try {
    const settings = JSON.parse(content);
    const hooks = settings.hooks || {};
    for (const [event, hookArray] of Object.entries(hooks)) {
      for (const hookGroup of hookArray) {
        const cmds = hookGroup.hooks || [];
        for (const cmd of cmds) {
          items.push({
            category: "hook",
            scopeId: scope.id,
            name: event,
            fileName: "settings.json",
            description: cmd.command || cmd.prompt || "",
            subType: cmd.type || "command",
            size: "",
            sizeBytes: 0,
            mtime: "",
            path: join(CLAUDE_DIR, "settings.json"),
          });
        }
      }
    }
  } catch {}

  return items;
}

async function scanPlugins() {
  const items = [];
  const cacheDir = join(CLAUDE_DIR, "plugins", "cache");
  if (!(await exists(cacheDir))) return items;

  try {
    const orgs = await readdir(cacheDir, { withFileTypes: true });
    for (const org of orgs) {
      if (!org.isDirectory()) continue;
      // Skip temp directories
      if (org.name.startsWith("temp_")) continue;
      const plugins = await readdir(join(cacheDir, org.name), { withFileTypes: true });
      for (const plugin of plugins) {
        if (!plugin.isDirectory()) continue;
        // Skip hidden dirs and version dirs (we want plugin name level)
        if (plugin.name.startsWith(".")) continue;
        items.push({
          category: "plugin",
          scopeId: "global",
          name: `${plugin.name}`,
          fileName: `${org.name}/${plugin.name}`,
          description: `${org.name}/${plugin.name}`,
          subType: "plugin",
          size: "",
          sizeBytes: 0,
          mtime: "",
          path: join(cacheDir, org.name, plugin.name),
          locked: true,
        });
      }
    }
  } catch {}

  return items;
}

async function scanPlans() {
  const items = [];
  const plansDir = join(CLAUDE_DIR, "plans");
  if (!(await exists(plansDir))) return items;

  const files = await readdir(plansDir);
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const fullPath = join(plansDir, f);
    const s = await safeStat(fullPath);
    const content = await safeReadFile(fullPath);

    // Extract first heading as description
    let desc = "";
    if (content) {
      const headingMatch = content.match(/^#\s+(.+)/m);
      if (headingMatch) desc = headingMatch[1].slice(0, 100);
    }

    items.push({
      category: "plan",
      scopeId: "global",
      name: f.replace(".md", ""),
      fileName: f,
      description: desc,
      subType: "plan",
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 10) : "",
      path: fullPath,
      locked: true, // plans are ephemeral, don't move
    });
  }

  return items;
}

// ── Main scan function ───────────────────────────────────────────────

/**
 * Scan everything. Returns:
 * {
 *   scopes: [ { id, name, type, tag, parentId, ... } ],
 *   items: [ { category, scopeId, name, description, subType, size, path, ... } ],
 *   counts: { memory: N, skill: N, mcp: N, config: N, hook: N, plugin: N, plan: N, total: N }
 * }
 */
export async function scan() {
  const scopes = await discoverScopes();
  const allItems = [];

  // Scan per-scope items
  for (const scope of scopes) {
    const [memories, skills, mcpServers, configs, hooks] = await Promise.all([
      scanMemories(scope),
      scanSkills(scope),
      scanMcpServers(scope),
      scanConfigs(scope),
      scanHooks(scope),
    ]);
    allItems.push(...memories, ...skills, ...mcpServers, ...configs, ...hooks);
  }

  // Scan global-only items
  const [plugins, plans] = await Promise.all([
    scanPlugins(),
    scanPlans(),
  ]);
  allItems.push(...plugins, ...plans);

  // Build counts
  const counts = { total: allItems.length };
  for (const item of allItems) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  return { scopes, items: allItems, counts };
}
