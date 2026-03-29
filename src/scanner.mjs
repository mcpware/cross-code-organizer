/**
 * scanner.mjs — Scan all Claude Code customizations.
 * Returns a structured object describing every memory, skill, MCP server,
 * config file, hook, plugin, plan, command, and agent — grouped by scope.
 *
 * Pure data module. No HTTP, no UI, no side effects.
 */

import { readdir, stat, readFile, access, open } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import { homedir, platform } from "node:os";

const HOME = homedir();
const CLAUDE_DIR = join(HOME, ".claude");

// Platform-aware managed config directory
// Linux: /etc/claude-code/  macOS: /Library/Application Support/ClaudeCode/
const MANAGED_DIR = platform() === "darwin"
  ? "/Library/Application Support/ClaudeCode"
  : "/etc/claude-code";

/**
 * Check if a scope's .claude/ dir is the same as the global CLAUDE_DIR.
 * This happens when repoDir === HOME (e.g. /home/user).
 * In that case, project-scoped scanners should skip .claude/ to avoid
 * double-counting items already scanned by the global scope.
 */
function isGlobalClaudeDir(scope) {
  return scope.repoDir && join(scope.repoDir, ".claude") === CLAUDE_DIR;
}

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

function countNewlines(buffer) {
  let count = 0;
  for (const byte of buffer) {
    if (byte === 10) count++;
  }
  return count;
}

async function readFirstLines(p, maxLines, chunkSize = 8192) {
  let handle;
  try {
    handle = await open(p, "r");
    const chunks = [];
    let position = 0;
    let newlineCount = 0;

    while (newlineCount < maxLines) {
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, position);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      chunks.push(chunk);
      position += bytesRead;
      newlineCount += countNewlines(chunk);
    }

    return Buffer.concat(chunks).toString("utf-8").split(/\r?\n/).slice(0, maxLines);
  } catch {
    return [];
  } finally {
    if (handle) await handle.close();
  }
}

async function readLastLines(p, maxLines, fileSize, chunkSize = 8192) {
  if (!fileSize) return [];

  let handle;
  try {
    handle = await open(p, "r");
    const chunks = [];
    let position = fileSize;
    let newlineCount = 0;

    while (position > 0 && newlineCount < maxLines) {
      const start = Math.max(0, position - chunkSize);
      const length = position - start;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);
      position = start;
      newlineCount += countNewlines(chunk);
    }

    const lines = Buffer.concat(chunks).toString("utf-8").split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-maxLines);
  } catch {
    return [];
  } finally {
    if (handle) await handle.close();
  }
}

function parseJsonLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function formatSize(bytes) {
  if (!bytes) return "0B";
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "K";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + "GB";
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

// ── Settings overrides cache ─────────────────────────────────────────

let _settingsCache = null;

/** Read merged user settings (settings.json + settings.local.json) once. */
async function getSettingsOverrides() {
  if (_settingsCache) return _settingsCache;
  _settingsCache = {};
  for (const f of ["settings.json", "settings.local.json"]) {
    const content = await safeReadFile(join(CLAUDE_DIR, f));
    if (!content) continue;
    try { Object.assign(_settingsCache, JSON.parse(content)); } catch {}
  }
  return _settingsCache;
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

  // Windows: encoded paths look like "c--Users-user-Desktop-project"
  // The drive letter "c" becomes the first segment, followed by empty string from "--"
  // Need to detect and convert to "C:\"
  if (platform() === "win32" && segments.length >= 2 && segments[0].length === 1 && segments[1] === "") {
    currentPath = segments[0].toUpperCase() + ":\\";
    i = 2; // skip drive letter + empty segment
  }

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
    const projectDir = join(projectsDir, d.name);

    // Discover any project directory that has content (not just memory).
    // Sessions, plans, or other items may exist without a memory/ subfolder.
    const entries = await readdir(projectDir);
    const hasContent = entries.some(e => e !== ".DS_Store");

    if (hasContent) {
      projectEntries.push({
        encodedName: d.name,
        realPath,
        shortName,
        claudeProjectDir: projectDir,
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
  const settings = await getSettingsOverrides();
  const customMemDir = settings.autoMemoryDirectory;
  let memDir;
  if (scope.id === "global") {
    memDir = join(CLAUDE_DIR, "memory");
  } else if (customMemDir) {
    memDir = join(scope.repoDir || process.cwd(), customMemDir);
  } else {
    memDir = join(scope.claudeProjectDir, "memory");
  }

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
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
      ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
      path: fullPath,
    });
  }

  return items;
}

async function scanSkills(scope) {
  const items = [];
  let skillDirs = [];

  if (scope.id === "global") {
    // Global skills: ~/.claude/skills/ + managed
    const dir = join(CLAUDE_DIR, "skills");
    if (await exists(dir)) skillDirs.push(dir);
    const managedSkills = join(MANAGED_DIR, ".claude", "skills");
    if (await exists(managedSkills)) skillDirs.push(managedSkills);
  } else if (scope.repoDir && !isGlobalClaudeDir(scope)) {
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
        mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
        ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
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
    // 3. ~/.claude.json mcpServers (user scope — `claude mcp add` default)
    // 4. Enterprise managed: /etc/claude-code/managed-mcp.json
    // 5. mcpServers inside settings.json / settings.local.json
    mcpPaths.push({ path: join(CLAUDE_DIR, ".mcp.json"), label: "global" });
    mcpPaths.push({ path: join(HOME, ".mcp.json"), label: "global" });
    mcpPaths.push({ path: join(MANAGED_DIR, "managed-mcp.json"), label: "managed" });
  } else if (scope.repoDir) {
    // Project-scope MCP: repo/.mcp.json
    const repoMcp = join(scope.repoDir, ".mcp.json");
    if (await exists(repoMcp)) {
      mcpPaths.push({ path: repoMcp, label: scope.type });
    }
  }

  // Also scan ~/.claude.json — where `claude mcp add` stores servers
  // User-scope servers are at top-level mcpServers
  // Project-scope servers are at projects[repoDir].mcpServers
  const claudeJsonPath = join(HOME, ".claude.json");
  const claudeJsonContent = await safeReadFile(claudeJsonPath);
  const claudeJsonStat = await safeStat(claudeJsonPath);
  if (claudeJsonContent) {
    try {
      const claudeJson = JSON.parse(claudeJsonContent);
      // User-scope MCP servers (global)
      if (scope.id === "global" && claudeJson.mcpServers) {
        for (const [name, serverConfig] of Object.entries(claudeJson.mcpServers)) {
          if (!serverConfig || typeof serverConfig !== "object") continue;
          const cmd = serverConfig.command || serverConfig.url || "";
          const args = serverConfig.args || [];
          const desc = [cmd, ...args].filter(Boolean).join(" ").slice(0, 100);
          const cfgBytes = JSON.stringify(serverConfig).length;
          items.push({
            category: "mcp",
            scopeId: scope.id,
            name,
            fileName: ".claude.json",
            description: desc || "(HTTP MCP)",
            subType: "mcp",
            size: formatSize(cfgBytes),
            sizeBytes: cfgBytes,
            mtime: claudeJsonStat ? claudeJsonStat.mtime.toISOString().slice(0, 16) : "",
            ctime: claudeJsonStat ? claudeJsonStat.birthtime.toISOString().slice(0, 16) : "",
            path: claudeJsonPath,
            mcpConfig: serverConfig,
          });
        }
      }
      // Project-scope MCP servers
      if (scope.repoDir && claudeJson.projects?.[scope.repoDir]?.mcpServers) {
        const projMcp = claudeJson.projects[scope.repoDir].mcpServers;
        for (const [name, serverConfig] of Object.entries(projMcp)) {
          if (!serverConfig || typeof serverConfig !== "object") continue;
          const cmd = serverConfig.command || serverConfig.url || "";
          const args = serverConfig.args || [];
          const desc = [cmd, ...args].filter(Boolean).join(" ").slice(0, 100);
          const cfgBytes = JSON.stringify(serverConfig).length;
          items.push({
            category: "mcp",
            scopeId: scope.id,
            name,
            fileName: ".claude.json",
            description: desc || "(HTTP MCP)",
            subType: "mcp",
            size: formatSize(cfgBytes),
            sizeBytes: cfgBytes,
            mtime: claudeJsonStat ? claudeJsonStat.mtime.toISOString().slice(0, 16) : "",
            ctime: claudeJsonStat ? claudeJsonStat.birthtime.toISOString().slice(0, 16) : "",
            path: claudeJsonPath,
            mcpConfig: serverConfig,
            claudeJsonProjectKey: scope.repoDir, // for moveMcp to find the right nesting level (#11)
          });
        }
      }
    } catch {}
  }

  for (const { path: mcpPath, label } of mcpPaths) {
    const content = await safeReadFile(mcpPath);
    if (!content) continue;
    const mcpStat = await safeStat(mcpPath);
    try {
      const config = JSON.parse(content);
      const servers = config.mcpServers || {};
      for (const [name, serverConfig] of Object.entries(servers)) {
        const cmd = serverConfig.command || "";
        const args = serverConfig.args || [];
        const desc = [cmd, ...args].filter(Boolean).join(" ").slice(0, 100);
        const cfgBytes = JSON.stringify(serverConfig).length;

        items.push({
          category: "mcp",
          scopeId: scope.id,
          name,
          fileName: basename(mcpPath),
          description: desc,
          subType: "mcp",
          size: formatSize(cfgBytes),
          sizeBytes: cfgBytes,
          mtime: mcpStat ? mcpStat.mtime.toISOString().slice(0, 16) : "",
          ctime: mcpStat ? mcpStat.birthtime.toISOString().slice(0, 16) : "",
          path: mcpPath,
          mcpConfig: serverConfig,
        });
      }
    } catch {}
  }

  // Also scan mcpServers embedded inside settings files
  const settingsFiles = scope.id === "global"
    ? [join(CLAUDE_DIR, "settings.json"), join(CLAUDE_DIR, "settings.local.json")]
    : (scope.repoDir && !isGlobalClaudeDir(scope))
      ? [join(scope.repoDir, ".claude", "settings.json"), join(scope.repoDir, ".claude", "settings.local.json")]
      : [];

  for (const sPath of settingsFiles) {
    const content = await safeReadFile(sPath);
    if (!content) continue;
    const sStat = await safeStat(sPath);
    try {
      const settings = JSON.parse(content);
      const servers = settings.mcpServers || {};
      for (const [name, serverConfig] of Object.entries(servers)) {
        const cmd = serverConfig.command || "";
        const args = serverConfig.args || [];
        const desc = [cmd, ...args].filter(Boolean).join(" ").slice(0, 100);
        const cfgBytes = JSON.stringify(serverConfig).length;
        items.push({
          category: "mcp",
          scopeId: scope.id,
          name,
          fileName: basename(sPath),
          description: desc,
          subType: "mcp",
          size: formatSize(cfgBytes),
          sizeBytes: cfgBytes,
          mtime: sStat ? sStat.mtime.toISOString().slice(0, 16) : "",
          ctime: sStat ? sStat.birthtime.toISOString().slice(0, 16) : "",
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
  const configs = scope.id === "global"
    ? [
        { name: "CLAUDE.md", path: join(CLAUDE_DIR, "CLAUDE.md"), desc: "Global instructions" },
        { name: "settings.json", path: join(CLAUDE_DIR, "settings.json"), desc: "Global settings" },
        { name: "settings.local.json", path: join(CLAUDE_DIR, "settings.local.json"), desc: "Local settings override" },
        { name: "CLAUDE.md (managed)", path: join(MANAGED_DIR, "CLAUDE.md"), desc: "Enterprise managed instructions" },
        { name: "managed-settings.json", path: join(MANAGED_DIR, "managed-settings.json"), desc: "Enterprise managed settings" },
      ]
    : (scope.repoDir && !isGlobalClaudeDir(scope))
      ? [
          { name: "CLAUDE.md", path: join(scope.repoDir, "CLAUDE.md"), desc: "Project instructions" },
          { name: ".claude/CLAUDE.md", path: join(scope.repoDir, ".claude", "CLAUDE.md"), desc: "Project instructions" },
          { name: ".claude/settings.json", path: join(scope.repoDir, ".claude", "settings.json"), desc: "Project settings" },
          { name: ".claude/settings.local.json", path: join(scope.repoDir, ".claude", "settings.local.json"), desc: "Project local settings" },
        ]
      : [];

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
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
      ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
      path: cfg.path,
      locked: true,
    });
  }

  return items;
}

async function scanHooks(scope) {
  const items = [];

  const hookSources = scope.id === "global"
    ? [
        { path: join(CLAUDE_DIR, "settings.json"), label: "settings.json" },
        { path: join(CLAUDE_DIR, "settings.local.json"), label: "settings.local.json" },
        { path: join(MANAGED_DIR, "managed-settings.json"), label: "managed-settings.json" },
      ]
    : (scope.repoDir && !isGlobalClaudeDir(scope))
      ? [
          { path: join(scope.repoDir, ".claude", "settings.json"), label: "settings.json" },
          { path: join(scope.repoDir, ".claude", "settings.local.json"), label: "settings.local.json" },
        ]
      : [];

  for (const source of hookSources) {
    const content = await safeReadFile(source.path);
    if (!content) continue;
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
              fileName: source.label,
              description: cmd.command || cmd.prompt || "",
              subType: cmd.type || "command",
              size: "",
              sizeBytes: 0,
              mtime: "",
              ctime: "",
              path: source.path,
              locked: true,
            });
          }
        }
      }
    } catch {}
  }

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
          ctime: "",
          path: join(cacheDir, org.name, plugin.name),
          locked: true,
        });
      }
    }
  } catch {}

  return items;
}

async function scanPlans(scope) {
  const items = [];
  let plansDir = null;
  if (scope.id === "global") {
    const settings = await getSettingsOverrides();
    plansDir = settings.plansDirectory
      ? join(process.cwd(), settings.plansDirectory)
      : join(CLAUDE_DIR, "plans");
  } else if (scope.claudeProjectDir) {
    plansDir = join(scope.claudeProjectDir, "plans");
  }

  if (!plansDir || !(await exists(plansDir))) return items;

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
      scopeId: scope.id,
      name: f.replace(".md", ""),
      fileName: f,
      description: desc,
      subType: "plan",
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
      ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
      path: fullPath,
      // plans are standalone .md files, movable like memories
    });
  }

  return items;
}

async function scanRules(scope) {
  const items = [];
  let rulesDirs = [];

  if (scope.id === "global") {
    const dir = join(CLAUDE_DIR, "rules");
    if (await exists(dir)) rulesDirs.push(dir);
  } else if (scope.repoDir && !isGlobalClaudeDir(scope)) {
    const dir = join(scope.repoDir, ".claude", "rules");
    if (await exists(dir)) rulesDirs.push(dir);
  }

  if (rulesDirs.length === 0) return items;
  const rulesDir = rulesDirs[0];
  if (!(await exists(rulesDir))) return items;

  const files = await readdir(rulesDir);
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const fullPath = join(rulesDir, f);
    const s = await safeStat(fullPath);
    const content = await safeReadFile(fullPath);

    // Extract first heading as description
    let desc = "";
    if (content) {
      const headingMatch = content.match(/^#\s+(.+)/m);
      if (headingMatch) desc = headingMatch[1].slice(0, 120);
    }

    items.push({
      category: "rule",
      scopeId: scope.id,
      name: f.replace(".md", ""),
      fileName: f,
      description: desc,
      subType: "rule",
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
      ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
      path: fullPath,
    });
  }

  return items;
}

async function scanCommands(scope) {
  const items = [];
  let cmdDirs = [];

  if (scope.id === "global") {
    const dir = join(CLAUDE_DIR, "commands");
    if (await exists(dir)) cmdDirs.push(dir);
  } else if (scope.repoDir && !isGlobalClaudeDir(scope)) {
    const dir = join(scope.repoDir, ".claude", "commands");
    if (await exists(dir)) cmdDirs.push(dir);
  }

  for (const cmdDir of cmdDirs) {
    const files = await readdir(cmdDir);
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const fullPath = join(cmdDir, f);
      const s = await safeStat(fullPath);
      const content = await safeReadFile(fullPath);
      const fm = parseFrontmatter(content);

      items.push({
        category: "command",
        scopeId: scope.id,
        name: fm.name || f.replace(".md", ""),
        fileName: f,
        description: fm.description || "",
        subType: "command",
        size: s ? formatSize(s.size) : "0B",
        sizeBytes: s ? s.size : 0,
        mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
        ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
        path: fullPath,
      });
    }
  }

  return items;
}

async function scanAgents(scope) {
  const items = [];
  let agentDirs = [];

  if (scope.id === "global") {
    const dir = join(CLAUDE_DIR, "agents");
    if (await exists(dir)) agentDirs.push(dir);
  } else if (scope.repoDir && !isGlobalClaudeDir(scope)) {
    const dir = join(scope.repoDir, ".claude", "agents");
    if (await exists(dir)) agentDirs.push(dir);
  }

  for (const agentDir of agentDirs) {
    const files = await readdir(agentDir);
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const fullPath = join(agentDir, f);
      const s = await safeStat(fullPath);
      const content = await safeReadFile(fullPath);
      const fm = parseFrontmatter(content);

      items.push({
        category: "agent",
        scopeId: scope.id,
        name: fm.name || f.replace(".md", ""),
        fileName: f,
        description: fm.description || "",
        subType: "agent",
        size: s ? formatSize(s.size) : "0B",
        sizeBytes: s ? s.size : 0,
        mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
        ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
        path: fullPath,
      });
    }
  }

  return items;
}

async function scanSessions(scope) {
  if (scope.id === "global" || !scope.claudeProjectDir) return [];

  const items = [];
  const entries = await readdir(scope.claudeProjectDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

    const fullPath = join(scope.claudeProjectDir, entry.name);
    const s = await safeStat(fullPath);
    const sessionId = entry.name.replace(/\.jsonl$/, "");
    const [headLines, tailLines] = await Promise.all([
      readFirstLines(fullPath, 10),  // aiTitle is at line 4-6
      readLastLines(fullPath, 30, s?.size || 0),
    ]);

    // aiTitle appears near the TOP of the file (line 4-6), not the end
    let name = sessionId;
    for (const line of headLines) {
      const parsed = parseJsonLine(line);
      const aiTitle = parsed?.aiTitle;
      if (typeof aiTitle === "string" && aiTitle.trim()) {
        name = aiTitle.trim();
        break;
      }
    }

    // Use last real user message as description (matches Claude Code extension behavior).
    // Read from tail — the most recent user message best represents the session's current state.
    let description = "";
    for (let i = tailLines.length - 1; i >= 0; i--) {
      const parsed = parseJsonLine(tailLines[i]);
      if (parsed?.message?.role !== "user") continue;
      const content = parsed.message.content;
      let text = null;
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content.find(c => c.type === "text")?.text;
      }
      if (typeof text !== "string" || !text.trim()) continue;
      if (text.startsWith("<") || text.startsWith("[{\"tool_use_id")) continue;
      description = text.replace(/\s+/g, " ").trim().slice(0, 80);
      break;
    }

    items.push({
      category: "session",
      scopeId: scope.id,
      name,
      fileName: entry.name,
      description,
      subType: "session",
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
      ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
      path: fullPath,
      deletable: true, // sessions can be deleted but not moved
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
 *   counts: { memory: N, skill: N, mcp: N, config: N, hook: N, plugin: N, plan: N, session: N, total: N }
 * }
 */
export async function scan() {
  _settingsCache = null; // reset cache each scan
  const scopes = await discoverScopes();
  const allItems = [];

  // Scan per-scope items
  for (const scope of scopes) {
    const [memories, skills, mcpServers, configs, hooks, plans, sessions, rules, commands, agents] = await Promise.all([
      scanMemories(scope),
      scanSkills(scope),
      scanMcpServers(scope),
      scanConfigs(scope),
      scanHooks(scope),
      scanPlans(scope),
      scanSessions(scope),
      scanRules(scope),
      scanCommands(scope),
      scanAgents(scope),
    ]);
    allItems.push(...memories, ...skills, ...mcpServers, ...configs, ...hooks, ...plans, ...sessions, ...rules, ...commands, ...agents);
  }

  // Scan global-only items
  const plugins = await scanPlugins();
  allItems.push(...plugins);

  // Build counts
  const counts = { total: allItems.length };
  for (const item of allItems) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  return { scopes, items: allItems, counts };
}
