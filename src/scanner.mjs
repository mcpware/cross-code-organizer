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
 * Ground-truth resolver: read a session file inside the encoded project dir
 * and pull the `cwd` field from any entry. Claude Code writes the real
 * working directory into every session entry, so this gives us an exact
 * answer without any pattern-matching guesswork.
 *
 * This handles collisions in the encoding — e.g. "E--PycharmProjects----------"
 * could match both "...\人生管理\情報系統" and "...\人生管理\靈魂養成" via
 * character pattern matching, but the session file tells us which one the
 * user actually ran Claude Code from.
 */
async function resolveViaSessionCwd(claudeProjectDir) {
  let entries;
  try {
    entries = await readdir(claudeProjectDir, { withFileTypes: true });
  } catch {
    return null;
  }

  // Try up to a few jsonl files — first one usually suffices
  const sessionFiles = entries
    .filter(e => e.isFile() && e.name.endsWith(".jsonl"))
    .slice(0, 3);

  for (const entry of sessionFiles) {
    const fullPath = join(claudeProjectDir, entry.name);
    const lines = await readFirstLines(fullPath, 20);
    for (const line of lines) {
      const parsed = parseJsonLine(line);
      const cwd = parsed?.cwd;
      if (typeof cwd === "string" && cwd.length > 0) {
        return cwd;
      }
    }
  }
  return null;
}

/**
 * Character-level fallback resolver for encoded project paths that contain
 * Unicode characters (e.g. CJK paths on Windows).
 *
 * Claude Code's encoding is character-preserving: each char in the original
 * path maps to exactly one char in the encoded name. The encoding rule is:
 *   - [A-Za-z0-9] and '-' are preserved as-is
 *   - Everything else (separators / \ :, underscores, dots, Unicode chars,
 *     etc.) becomes '-'
 *
 * This means we can match real directory names against the encoded pattern
 * by treating each '-' in the pattern as a "non-alphanumeric" wildcard:
 * it matches anything except [A-Za-z0-9]. This correctly rejects matches
 * like "1688" against pattern "----" (because digits ARE preserved, so
 * a real "1688" dir would have encoded as "1688", not as dashes).
 *
 * Walks the real filesystem from the root, at each level enumerating actual
 * directory entries and checking which ones fit the pattern at the current
 * position. Unlike the segment-based resolver, this handles names containing
 * arbitrary Unicode characters that would otherwise collapse to empty segments.
 *
 * Returns the resolved absolute path, or null if no match.
 */
async function resolveEncodedProjectPathUnicode(encoded) {
  // Strip leading dash
  let pattern = encoded.replace(/^-/, "");
  let rootPath;

  // Windows drive letter: "c--" at start becomes "C:\"
  if (platform() === "win32" && /^[a-z]--/i.test(pattern)) {
    rootPath = pattern[0].toUpperCase() + ":\\";
    pattern = pattern.slice(3);
  } else {
    rootPath = "/";
  }

  const ALNUM = /[A-Za-z0-9]/;

  // Walk char-by-char. At each step, try every dir entry that fits the
  // pattern starting at the current position.
  async function walk(currentPath, pos) {
    if (pos >= pattern.length) {
      return (await exists(currentPath)) ? currentPath : null;
    }

    let entries;
    try {
      entries = (await readdir(currentPath, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      return null;
    }

    // Find every entry that could match the pattern at pos
    const candidates = [];
    for (const name of entries) {
      const nameLen = name.length;
      if (pos + nameLen > pattern.length) continue;

      let ok = true;
      for (let i = 0; i < nameLen; i++) {
        const pc = pattern[pos + i];
        const nc = name[i];
        if (pc === "-") {
          // '-' is a non-alphanumeric wildcard: matches anything that
          // would encode to '-' (i.e. NOT [A-Za-z0-9]). A literal '-'
          // in the real name also passes since '-' is non-alphanumeric.
          if (ALNUM.test(nc)) {
            ok = false;
            break;
          }
        } else if (pc.toLowerCase() !== nc.toLowerCase()) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // After the name, either end-of-pattern or a '-' (separator)
      const nextPos = pos + nameLen;
      if (nextPos === pattern.length) {
        candidates.push({ name, nextPos });
      } else if (pattern[nextPos] === "-") {
        candidates.push({ name, nextPos: nextPos + 1 });
      }
    }

    // Try longest matches first so we don't prematurely match a shorter prefix
    candidates.sort((a, b) => b.name.length - a.name.length);

    for (const c of candidates) {
      const result = await walk(join(currentPath, c.name), c.nextPos);
      if (result) return result;
    }

    return null;
  }

  return walk(rootPath, 0);
}

/**
 * Last-resort display name for projects whose encoded path cannot be decoded
 * even by the Unicode resolver. Runs of dashes become "…" to indicate
 * unknown characters.
 */
function prettifyEncodedPath(encoded) {
  let cleaned = encoded.replace(/^-/, "");
  if (/^[a-z]--/i.test(cleaned)) {
    cleaned = cleaned[0].toUpperCase() + ":/" + cleaned.slice(3);
  }
  cleaned = cleaned.replace(/-{2,}/g, "/…/");
  cleaned = cleaned.replace(/-/g, "/");
  cleaned = cleaned.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  return cleaned || encoded;
}

/**
 * Resolve an encoded project dir name back to a real filesystem path.
 * E.g. "-home-user-mycompany-repo1" → "/home/user/mycompany/repo1"
 *
 * Strategy: starting from root, greedily match the longest existing directory
 * at each level by consuming segments from the encoded name.
 */
async function resolveEncodedProjectPath(encoded) {
  const segments = encoded.replace(/^-/, "").split("-");
  let rootPath = "/";
  let startIdx = 0;

  // Windows: encoded paths look like "c--Users-user-Desktop-project"
  // The drive letter "c" becomes the first segment, followed by empty string from "--"
  // Need to detect and convert to "C:\"
  if (platform() === "win32" && segments.length >= 2 && segments[0].length === 1 && segments[1] === "") {
    rootPath = segments[0].toUpperCase() + ":\\";
    startIdx = 2;
  }

  // Normalize for comparison: lowercase, replace _ with -
  // Claude Code's encoding replaces both / and _ with -, making it lossy.
  // By normalizing both sides we can match "My_Projects" against "My-Projects".
  const norm = (s) => s.toLowerCase().replace(/_/g, "-");

  // DFS resolver with backtracking — lists actual directory entries at each
  // level instead of guessing paths, so underscore/hyphen ambiguity is handled.
  async function resolve(currentPath, i) {
    if (i >= segments.length) {
      return (await exists(currentPath)) ? currentPath : null;
    }

    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
      entries = entries.filter(e => e.isDirectory());
    } catch {
      return null;
    }

    // Map normalized directory names → actual names on disk
    const entryMap = new Map();
    for (const e of entries) {
      const key = norm(e.name);
      if (!entryMap.has(key)) entryMap.set(key, []);
      entryMap.get(key).push(e.name);
    }

    // Try longest match first, backtrack on failure
    for (let end = segments.length; end > i; end--) {
      const candidate = norm(segments.slice(i, end).join("-"));
      const matches = entryMap.get(candidate);
      if (matches) {
        for (const actualName of matches) {
          const nextPath = join(currentPath, actualName);
          const result = await resolve(nextPath, end);
          if (result) return result;
        }
      }
    }

    return null;
  }

  return resolve(rootPath, startIdx);
}

// ── Scope discovery ──────────────────────────────────────────────────

/**
 * Discover all scopes by scanning ~/.claude/projects/ and known repo dirs.
 * Returns an array of scope objects (global + projects, all with parentId: "global").
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

    // Decode encoded path to a real filesystem path. Three strategies:
    //  1. Ground truth: read a session file's `cwd` field — unambiguous
    //     even when encoding collides (e.g. two CJK sibling dirs of
    //     equal length encode to the same string).
    //  2. Segment-based resolver (fast, handles normal ASCII paths).
    //  3. Character-level Unicode resolver (handles CJK and other
    //     non-alphanumeric names).
    // If all fail, keep the project with a prettified display name so
    // its memories/sessions are still scannable.
    const projectDir = join(projectsDir, d.name);
    let realPath = await resolveViaSessionCwd(projectDir);
    if (!realPath) realPath = await resolveEncodedProjectPath(d.name);
    if (!realPath) realPath = await resolveEncodedProjectPathUnicode(d.name);

    // Discover any project directory that has content (not just memory).
    // Sessions, plans, or other items may exist without a memory/ subfolder.
    const entries = await readdir(projectDir);
    const hasContent = entries.some(e => e !== ".DS_Store");
    if (!hasContent) continue;

    const shortName = realPath ? basename(realPath) : prettifyEncodedPath(d.name);

    projectEntries.push({
      encodedName: d.name,
      realPath,
      shortName,
      claudeProjectDir: projectDir,
    });
  }

  // Sort: projects with resolved paths first (by depth), unresolved last
  projectEntries.sort((a, b) => {
    if (!a.realPath && !b.realPath) return a.shortName.localeCompare(b.shortName);
    if (!a.realPath) return 1;
    if (!b.realPath) return -1;
    const da = a.realPath.split("/").length;
    const db = b.realPath.split("/").length;
    if (da !== db) return da - db;
    return a.realPath.localeCompare(b.realPath);
  });

  // Disambiguate duplicate shortNames by prepending the parent dir name
  const nameCount = new Map();
  for (const p of projectEntries) {
    nameCount.set(p.shortName, (nameCount.get(p.shortName) || 0) + 1);
  }
  for (const p of projectEntries) {
    if (nameCount.get(p.shortName) > 1 && p.realPath) {
      const parts = p.realPath.split(/[\/\\]/).filter(Boolean);
      if (parts.length >= 2) {
        p.shortName = parts[parts.length - 2] + "/" + p.shortName;
      }
    }
  }

  // Claude Code has two scopes: User (global) and Project.
  // Every project's parent is always global — there is no intermediate workspace scope.
  // Filesystem nesting (e.g. CompanyRepo/api inside CompanyRepo/) does NOT create
  // inheritance between projects; the sidebar may group them visually but Claude Code
  // loads each project's .claude/ independently alongside ~/.claude/.
  for (const entry of projectEntries) {
    scopes.push({
      id: entry.encodedName,
      name: entry.shortName,
      type: "project",
      tag: "project",
      parentId: "global",
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

/**
 * Encode a real filesystem path into Claude Code's project dir naming scheme.
 * Every non-alphanumeric character (except '-') becomes '-'. Used to match
 * scopes to plugin installs whose projectPath is a real filesystem path.
 */
function encodeClaudeProjectName(realPath) {
  return realPath.replace(/[^A-Za-z0-9-]/g, "-");
}

/**
 * Read one skill directory and emit a skill item. Used by both the classic
 * skills dirs (~/.claude/skills, repo/.claude/skills) and by plugin-provided
 * skills dirs.
 */
async function readSkillEntry(skillsRoot, entryName, scope, bundleMap, pluginName = null) {
  const skillDir = join(skillsRoot, entryName);
  const skillMd = join(skillDir, "SKILL.md");
  if (!(await exists(skillMd))) return null;

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
      if (!trimmed) continue;
      if (trimmed.startsWith("```") || trimmed.startsWith("-") || trimmed.startsWith("|")) continue;
      if (trimmed.match(/^\w+:\s/)) continue;
      if (trimmed.startsWith("##")) continue;
      description = trimmed.slice(0, 120);
      break;
    }
  }

  const allFiles = await readdir(skillDir, { withFileTypes: true });
  const fileCount = allFiles.filter(f => f.isFile()).length;

  let totalSize = 0;
  for (const f of allFiles.filter(f => f.isFile())) {
    const fs = await safeStat(join(skillDir, f.name));
    if (fs) totalSize += fs.size;
  }

  const bundleInfo = bundleMap?.get(entryName);

  return {
    category: "skill",
    scopeId: scope.id,
    name: entryName,
    fileName: entryName,
    description,
    subType: pluginName ? "plugin-skill" : "skill",
    size: formatSize(totalSize),
    sizeBytes: totalSize,
    fileCount,
    mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
    ctime: s ? s.birthtime.toISOString().slice(0, 16) : "",
    path: skillDir,
    bundle: pluginName || bundleInfo?.source || null,
  };
}

async function scanSkills(scope) {
  const items = [];
  const skillDirs = [];

  if (scope.id === "global") {
    const dir = join(CLAUDE_DIR, "skills");
    if (await exists(dir)) skillDirs.push(dir);
    const managedSkills = join(MANAGED_DIR, ".claude", "skills");
    if (await exists(managedSkills)) skillDirs.push(managedSkills);
  } else if (scope.repoDir && !isGlobalClaudeDir(scope)) {
    const dir = join(scope.repoDir, ".claude", "skills");
    if (await exists(dir)) skillDirs.push(dir);
  }

  // Load bundle info from skills-lock.json
  const bundleMap = await loadSkillBundles(scope.repoDir);

  // Classic skill directories
  for (const skillsRoot of skillDirs) {
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name === "private") continue;
      const item = await readSkillEntry(skillsRoot, entry.name, scope, bundleMap);
      if (item) items.push(item);
    }
  }

  // Plugin-provided skills from ~/.claude/plugins/installed_plugins.json.
  // Each installed plugin may ship a skills/ subdirectory under its installPath.
  // User-scope plugins contribute to Global; project-scope plugins contribute
  // to the matching project scope (matched by encoded dir name to tolerate
  // lossy path encoding on Windows/CJK).
  const installedPluginsFile = join(CLAUDE_DIR, "plugins", "installed_plugins.json");
  const installedContent = await safeReadFile(installedPluginsFile);
  if (installedContent) {
    let installedData;
    try { installedData = JSON.parse(installedContent); } catch { installedData = null; }
    const plugins = installedData?.plugins || {};
    for (const [pluginName, installs] of Object.entries(plugins)) {
      for (const inst of installs || []) {
        const isUserScope = inst.scope === "user";
        const isProjectScope = inst.scope === "project" && inst.projectPath;

        let belongs = false;
        if (scope.id === "global" && isUserScope) {
          belongs = true;
        } else if (scope.type === "project" && isProjectScope) {
          // Compare by encoded dir name so a plugin installed from
          // 團隊模式_第一代 still matches the (collided) scope derived
          // from 團隊模式_第二代 sessions.
          const pluginEncoded = encodeClaudeProjectName(inst.projectPath);
          if (pluginEncoded === scope.id) belongs = true;
          // Also accept exact repoDir match as a fallback
          else if (scope.repoDir && inst.projectPath.toLowerCase() === scope.repoDir.toLowerCase()) {
            belongs = true;
          }
        }
        if (!belongs) continue;

        const pluginSkillsDir = join(inst.installPath, "skills");
        if (!(await exists(pluginSkillsDir))) continue;

        let entries;
        try {
          entries = await readdir(pluginSkillsDir, { withFileTypes: true });
        } catch { continue; }
        for (const entry of entries) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          if (entry.name === "private") continue;
          const item = await readSkillEntry(pluginSkillsDir, entry.name, scope, bundleMap, pluginName);
          if (item) items.push(item);
        }
      }
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

  // Add approval state for project-scoped servers from .mcp.json
  // Mirrors ccsrc getProjectMcpServerStatus: approved/rejected/pending
  // CC merges settings from multiple sources; read both settings.json and
  // settings.local.json then merge (local wins for enableAllProjectMcpServers).
  if (scope.id !== "global") {
    try {
      const enabled = new Set();
      const disabled = new Set();
      let enableAll = false;
      for (const sf of ["settings.json", "settings.local.json"]) {
        const raw = await safeReadFile(join(CLAUDE_DIR, sf));
        if (!raw) continue;
        const s = JSON.parse(raw);
        if (Array.isArray(s.enabledMcpjsonServers)) s.enabledMcpjsonServers.forEach(n => enabled.add(n));
        if (Array.isArray(s.disabledMcpjsonServers)) s.disabledMcpjsonServers.forEach(n => disabled.add(n));
        if (s.enableAllProjectMcpServers) enableAll = true;
      }
      for (const item of items) {
        if (item.fileName === ".mcp.json") {
          if (disabled.has(item.name)) item.approvalState = "rejected";
          else if (enableAll || enabled.has(item.name)) item.approvalState = "approved";
          else item.approvalState = "pending";
        }
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

// ── Settings parser ──────────────────────────────────────────────────

const SETTING_KEY_GROUP = {
  // permissions — expanded to sub-keys in emitSettingRecords
  permissions: "permissions",
  // mcp (mcpServers skipped — handled by scanMcpServers)
  allowedMcpServers: "mcp",
  deniedMcpServers: "mcp",
  enabledMcpjsonServers: "mcp",
  disabledMcpjsonServers: "mcp",
  // runtime
  outputStyle: "runtime",
  language: "runtime",
  statusLine: "runtime",
  fastMode: "runtime",
  fastModePerSessionOptIn: "runtime",
  effortLevel: "runtime",
  sandbox: "runtime",
  assistant: "runtime",
  assistantName: "runtime",
  channelsEnabled: "runtime",
  allowedChannelPlugins: "runtime",
  worktree: "runtime",
  remote: "runtime",
  // memory
  autoMemoryEnabled: "memory",
  autoMemoryDirectory: "memory",
  autoDreamEnabled: "memory",
  plansDirectory: "memory",
  // plugins
  enabledPlugins: "plugins",
  pluginConfigs: "plugins",
  extraKnownMarketplaces: "plugins",
  strictKnownMarketplaces: "plugins",
  blockedMarketplaces: "plugins",
};

function getValueType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function emitSettingRecords(settings, scopeId, sourceFile, sourceTier) {
  const records = [];
  for (const [key, value] of Object.entries(settings)) {
    // hooks already handled by scanHooks — skip
    if (key === "hooks") continue;
    // mcpServers already handled by scanMcpServers — skip
    if (key === "mcpServers") continue;

    // permissions: expand to permissions.allow / .deny / .ask sub-records
    if (key === "permissions" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        records.push({
          category: "setting",
          scopeId,
          name: `permissions.${subKey}`,
          value: subValue,
          valueType: getValueType(subValue),
          sourceFile,
          sourceTier,
          settingGroup: "permissions",
          locked: true,
        });
      }
      continue;
    }

    records.push({
      category: "setting",
      scopeId,
      name: key,
      value,
      valueType: getValueType(value),
      sourceFile,
      sourceTier,
      settingGroup: SETTING_KEY_GROUP[key] || "other",
      locked: true,
    });
  }
  return records;
}

async function scanSettings(scope) {
  const sources = scope.id === "global"
    ? [
        { path: join(CLAUDE_DIR, "settings.json"), sourceFile: "settings.json", sourceTier: "user" },
        { path: join(CLAUDE_DIR, "settings.local.json"), sourceFile: "settings.local.json", sourceTier: "local" },
        { path: join(MANAGED_DIR, "managed-settings.json"), sourceFile: "managed-settings.json", sourceTier: "managed" },
      ]
    : (scope.repoDir && !isGlobalClaudeDir(scope))
      ? [
          { path: join(scope.repoDir, ".claude", "settings.json"), sourceFile: "settings.json", sourceTier: "project" },
          { path: join(scope.repoDir, ".claude", "settings.local.json"), sourceFile: "settings.local.json", sourceTier: "local" },
        ]
      : [];

  const records = [];
  for (const source of sources) {
    const content = await safeReadFile(source.path);
    if (!content) continue;
    try {
      const settings = JSON.parse(content);
      records.push(...emitSettingRecords(settings, scope.id, source.sourceFile, source.sourceTier));
    } catch {}
  }
  return records;
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

    const isDistilled = name.startsWith("[distilled");
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
      deletable: true,
      bundle: isDistilled ? name : undefined,   // distilled sessions become bundle parents
    });

    // Check for distill folder (same name as session ID) — add child items
    if (isDistilled) {
      const distillDir = join(scope.claudeProjectDir, sessionId);
      try {
        const distillEntries = await readdir(distillDir, { withFileTypes: true });
        for (const de of distillEntries) {
          if (!de.isFile()) continue;
          const childPath = join(distillDir, de.name);
          const cs = await safeStat(childPath);
          const childLabel = de.name.startsWith("backup-") ? "📦 Backup: " + de.name
            : de.name === "index.md" ? "📑 Index" : de.name;
          items.push({
            category: "session",
            scopeId: scope.id,
            name: childLabel,
            fileName: de.name,
            description: cs ? formatSize(cs.size) : "",
            subType: "distill-artifact",
            size: cs ? formatSize(cs.size) : "0B",
            sizeBytes: cs ? cs.size : 0,
            mtime: cs ? cs.mtime.toISOString().slice(0, 16) : "",
            ctime: cs ? cs.birthtime.toISOString().slice(0, 16) : "",
            path: childPath,
            deletable: true,
            bundle: name,   // same bundle as parent → shows as child
          });
        }
      } catch { /* no distill folder — normal */ }
    }
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
/**
 * Detect enterprise MCP exclusive control mode.
 * When managed-mcp.json exists, Claude Code ignores ALL user/project/plugin servers.
 * Also checks managed settings for allowManagedMcpServersOnly policy.
 */
export async function detectEnterpriseMcp() {
  const mcpPaths = [
    join(MANAGED_DIR, "managed-mcp.json"),
    join(HOME, ".claude", "managed", "managed-mcp.json"),
  ];

  for (const mcpPath of mcpPaths) {
    const content = await safeReadFile(mcpPath);
    if (content) {
      try {
        const config = JSON.parse(content);
        const servers = config.mcpServers || {};
        return { active: true, path: mcpPath, serverCount: Object.keys(servers).length, serverNames: Object.keys(servers) };
      } catch {
        return { active: true, path: mcpPath, serverCount: 0, serverNames: [] };
      }
    }
  }

  // Also check managed settings for allowManagedMcpServersOnly
  const managedSettingsPath = join(MANAGED_DIR, "managed-settings.json");
  const msContent = await safeReadFile(managedSettingsPath);
  if (msContent) {
    try {
      const ms = JSON.parse(msContent);
      if (ms.allowManagedMcpServersOnly === true) {
        return { active: true, path: managedSettingsPath, serverCount: 0, serverNames: [], policyOnly: true };
      }
    } catch {}
  }

  return { active: false, path: null, serverCount: 0, serverNames: [] };
}

export async function scan() {
  _settingsCache = null; // reset cache each scan
  const scopes = await discoverScopes();
  const allItems = [];

  // Scan per-scope items
  for (const scope of scopes) {
    const [memories, skills, mcpServers, configs, hooks, plans, sessions, rules, commands, agents, settings] = await Promise.all([
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
      scanSettings(scope),
    ]);
    allItems.push(...memories, ...skills, ...mcpServers, ...configs, ...hooks, ...plans, ...sessions, ...rules, ...commands, ...agents, ...settings);
  }

  // Scan global-only items
  const plugins = await scanPlugins();
  allItems.push(...plugins);

  // Build counts
  const counts = { total: allItems.length };
  for (const item of allItems) {
    counts[item.category] = (counts[item.category] || 0) + 1;
  }

  // Detect enterprise MCP mode
  const enterpriseMcp = await detectEnterpriseMcp();

  return { scopes, items: allItems, counts, enterpriseMcp };
}

/**
 * Read disabled MCP servers for a project from ~/.claude.json.
 * Mirrors ccsrc: projects[absolutePath].disabledMcpServers
 */
export async function getDisabledMcpServers(projectPath) {
  const claudeJsonPath = join(HOME, ".claude.json");
  try {
    const raw = await readFile(claudeJsonPath, "utf-8");
    const config = JSON.parse(raw);
    const projectConfig = config.projects?.[projectPath];
    return Array.isArray(projectConfig?.disabledMcpServers) ? projectConfig.disabledMcpServers : [];
  } catch {
    return [];
  }
}

/**
 * Set disabled MCP servers for a project in ~/.claude.json.
 * Matches the behavior of `/mcp disable <name>` in Claude Code.
 */
export async function setDisabledMcpServers(projectPath, disabledList) {
  const claudeJsonPath = join(HOME, ".claude.json");
  let config = {};
  try { config = JSON.parse(await readFile(claudeJsonPath, "utf-8")); } catch { /* new file */ }
  if (!config.projects) config.projects = {};
  if (!config.projects[projectPath]) config.projects[projectPath] = {};
  config.projects[projectPath].disabledMcpServers = disabledList;
  const { writeFile: wf } = await import("node:fs/promises");
  await wf(claudeJsonPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Scan MCP allowlist/denylist policy from settings files.
 * Returns structured policy data for the policy editor UI.
 */
export async function scanMcpPolicy() {
  const settingsFiles = [
    { path: join(HOME, ".claude", "settings.json"), tier: "user" },
    { path: join(HOME, ".claude", "settings.local.json"), tier: "local" },
    { path: "/etc/claude-code/managed-settings.json", tier: "managed" },
  ];

  const allowlist = [];
  const denylist = [];

  for (const { path: filePath, tier } of settingsFiles) {
    try {
      const raw = await readFile(filePath, "utf-8");
      const settings = JSON.parse(raw);

      if (Array.isArray(settings.allowedMcpServers)) {
        for (const entry of settings.allowedMcpServers) {
          allowlist.push({ ...entry, source: filePath, tier });
        }
      }
      if (Array.isArray(settings.deniedMcpServers)) {
        for (const entry of settings.deniedMcpServers) {
          denylist.push({ ...entry, source: filePath, tier });
        }
      }
    } catch {
      // File doesn't exist or invalid JSON — skip
    }
  }

  return { allowlist, denylist };
}

/**
 * Check if an MCP server is allowed by the current policy.
 * Mirrors ccsrc isMcpServerAllowedByPolicy logic:
 *   - Denylist has absolute precedence
 *   - Allowlist: undefined = all allowed, empty [] = block all
 *   - Match by serverName, serverCommand, or serverUrl
 */
export function checkMcpPolicy(serverName, mcpConfig, policy) {
  // Check denylist first (absolute precedence)
  for (const entry of policy.denylist) {
    if (entry.serverName && entry.serverName === serverName) return "denied";
    if (entry.serverCommand && mcpConfig?.command) {
      const cmd = [mcpConfig.command, ...(mcpConfig.args || [])];
      if (JSON.stringify(entry.serverCommand) === JSON.stringify(cmd)) return "denied";
    }
    if (entry.serverUrl && mcpConfig?.url) {
      const pattern = entry.serverUrl.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      if (new RegExp(`^${pattern}$`).test(mcpConfig.url)) return "denied";
    }
  }

  // No allowlist = all allowed
  if (policy.allowlist.length === 0) return "no-policy";

  // Check allowlist
  for (const entry of policy.allowlist) {
    if (entry.serverName && entry.serverName === serverName) return "allowed";
    if (entry.serverCommand && mcpConfig?.command) {
      const cmd = [mcpConfig.command, ...(mcpConfig.args || [])];
      if (JSON.stringify(entry.serverCommand) === JSON.stringify(cmd)) return "allowed";
    }
    if (entry.serverUrl && mcpConfig?.url) {
      const pattern = entry.serverUrl.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      if (new RegExp(`^${pattern}$`).test(mcpConfig.url)) return "allowed";
    }
  }

  return "denied"; // Allowlist exists but server not in it
}
