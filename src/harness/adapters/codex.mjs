/**
 * Codex CLI harness adapter.
 *
 * Scans the global Codex configuration directory at ~/.codex.
 */

import TOML from "@iarna/toml";
import { readdir } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import {
  exists,
  formatSize,
  parseJsonLine,
  parseFrontmatter,
  readFirstLines,
  readJson,
  readLastLines,
  safeReadFile,
  safeStat,
} from "../fs-utils.mjs";

function codexDir(ctx) {
  return join(ctx.home, ".codex");
}

function timestampFields(stat) {
  return {
    mtime: stat ? stat.mtime.toISOString().slice(0, 16) : "",
    ctime: stat ? stat.birthtime.toISOString().slice(0, 16) : "",
  };
}

function statFields(stat) {
  return {
    size: stat ? formatSize(stat.size) : "0B",
    sizeBytes: stat ? stat.size : 0,
    ...timestampFields(stat),
  };
}

function defineCategory({ id, label, filterLabel, icon, order, group, source, preview, movable = false, deletable = false, sortDefault = "name" }) {
  return {
    id,
    label,
    filterLabel,
    icon,
    order,
    group,
    source,
    preview,
    movable,
    deletable,
    participatesInEffective: false,
    effectiveRule: "",
    sortDefault,
  };
}

const categories = [
  defineCategory({
    id: "config",
    label: "Config",
    filterLabel: "Config",
    icon: "⚙️",
    order: 10,
    group: "config",
    source: "~/.codex/config.toml",
    preview: "TOML file",
  }),
  defineCategory({
    id: "memory",
    label: "Memories",
    filterLabel: "Memories",
    icon: "🧠",
    order: 20,
    group: "memory",
    source: "~/.codex/memories/*.md",
    preview: "*.md",
    deletable: true,
  }),
  defineCategory({
    id: "skill",
    label: "Skills",
    filterLabel: "Skills",
    icon: "⚡",
    order: 30,
    group: "skill",
    source: "~/.codex/skills/*/SKILL.md",
    preview: "SKILL.md",
    deletable: true,
  }),
  defineCategory({
    id: "mcp",
    label: "MCP Servers",
    filterLabel: "MCP",
    icon: "🔌",
    order: 40,
    group: "mcp",
    source: "~/.codex/config.toml mcp_servers",
    preview: "mcp_servers entry",
  }),
  defineCategory({
    id: "profile",
    label: "Profiles",
    filterLabel: "Profiles",
    icon: "👤",
    order: 50,
    group: "profile",
    source: "~/.codex/config.toml profiles",
    preview: "profiles entry",
  }),
  defineCategory({
    id: "rule",
    label: "Rules",
    filterLabel: "Rules",
    icon: "📏",
    order: 60,
    group: "rule",
    source: "~/.codex/rules",
    preview: "rule file",
    deletable: true,
  }),
  defineCategory({
    id: "plugin",
    label: "Plugins",
    filterLabel: "Plugins",
    icon: "🧩",
    order: 70,
    group: "plugin",
    source: "~/.codex/plugins",
    preview: "plugin directory",
  }),
  defineCategory({
    id: "session",
    label: "Sessions",
    filterLabel: "Sessions",
    icon: "💬",
    order: 80,
    group: "session",
    source: "~/.codex/sessions and ~/.codex/session_index.jsonl",
    preview: "session JSONL",
    sortDefault: "date",
  }),
];

const scopeTypes = [
  { id: "global", label: "Global", icon: "🌐", isGlobal: true },
];

const capabilities = {
  contextBudget: false,
  mcpControls: false,
  mcpPolicy: false,
  mcpSecurity: true,
  sessions: true,
  effective: false,
  backup: false,
};

async function discoverScopes(ctx) {
  return [{
    id: "global",
    name: "Global",
    type: "global",
    tag: "applies everywhere",
    parentId: null,
    repoDir: null,
    configDir: codexDir(ctx),
  }];
}

async function readCodexConfig(ctx) {
  const path = join(codexDir(ctx), "config.toml");
  const content = await safeReadFile(path);
  const stat = await safeStat(path);
  if (!content) return { path, content: null, stat, config: null, error: null };

  try {
    return { path, content, stat, config: TOML.parse(content), error: null };
  } catch (error) {
    return { path, content, stat, config: null, error };
  }
}

function objectEntries(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
    : [];
}

function compactText(value, maxLength = 120) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

async function findFilesBySuffix(root, suffix, maxDepth = 8, current = root, depth = 0) {
  const files = [];
  if (depth > maxDepth || !(await exists(current))) return files;

  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return files; }

  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFilesBySuffix(root, suffix, maxDepth, path, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      files.push(path);
    }
  }

  return files;
}

function extractSessionId(fileName) {
  const rollout = fileName.match(/rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f-]{36})\.jsonl$/i);
  if (rollout) return rollout[1];
  return fileName.replace(/\.jsonl$/, "");
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => typeof part?.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function userTextFromRecord(record) {
  if (record?.type === "user_message" && typeof record?.payload?.message === "string") {
    return record.payload.message;
  }
  if (record?.type === "response_item" && record?.payload?.role === "user") {
    return contentText(record.payload.content);
  }
  if (record?.payload?.type === "message" && record?.payload?.role === "user") {
    return contentText(record.payload.content);
  }
  return "";
}

async function readSessionIndex(ctx) {
  const path = join(codexDir(ctx), "session_index.jsonl");
  const content = await safeReadFile(path);
  const stat = await safeStat(path);
  const entries = new Map();

  if (content) {
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const record = parseJsonLine(line);
      if (!record?.id) continue;
      entries.set(record.id, record);
    }
  }

  return { path, stat, entries, lineCount: entries.size };
}

async function sessionMetadata(path, stat) {
  const [headLines, tailLines] = await Promise.all([
    readFirstLines(path, 12),
    readLastLines(path, 40, stat?.size || 0),
  ]);

  let meta = null;
  for (const line of headLines) {
    const record = parseJsonLine(line);
    if (record?.type === "session_meta" && record.payload) {
      meta = record.payload;
      break;
    }
  }

  let description = "";
  for (let i = tailLines.length - 1; i >= 0; i--) {
    const text = compactText(userTextFromRecord(parseJsonLine(tailLines[i])), 120);
    if (!text || text.startsWith("<environment_context>")) continue;
    description = text;
    break;
  }

  return { meta, description };
}

function configDescription(config) {
  if (!config || typeof config !== "object") return "Codex CLI configuration";
  const parts = [
    config.model ? `model: ${config.model}` : "",
    config.approval_policy ? `approval: ${config.approval_policy}` : "",
    config.sandbox_mode ? `sandbox: ${config.sandbox_mode}` : "",
  ].filter(Boolean);
  return parts.join(", ") || "Codex CLI configuration";
}

async function scanConfig(scope, ctx) {
  const parsed = await readCodexConfig(ctx);
  if (!parsed.content) return [];

  return [{
    category: "config",
    scopeId: scope.id,
    name: "config.toml",
    fileName: "config.toml",
    description: parsed.error ? `TOML parse error: ${parsed.error.message}` : configDescription(parsed.config),
    subType: "config",
    ...statFields(parsed.stat),
    path: parsed.path,
    locked: true,
    valueType: parsed.error ? "invalid-toml" : "toml",
  }];
}

function markdownDescription(content) {
  if (!content) return "";
  const lines = content.split("\n");
  let pastHeading = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) { pastHeading = true; continue; }
    if (!pastHeading && trimmed.startsWith("---")) continue;
    if (!trimmed || trimmed.startsWith("```") || trimmed.startsWith("-") || trimmed.startsWith("|")) continue;
    if (trimmed.match(/^\w+:\s/)) continue;
    if (trimmed.startsWith("#")) continue;
    return trimmed.slice(0, 120);
  }
  return "";
}

async function scanMemories(scope, ctx) {
  const dir = join(codexDir(ctx), "memories");
  const items = [];
  if (!(await exists(dir))) return items;

  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return items; }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(dir, entry.name);
    const stat = await safeStat(path);
    const content = await safeReadFile(path);
    const frontmatter = parseFrontmatter(content);
    items.push({
      category: "memory",
      scopeId: scope.id,
      name: frontmatter.name || entry.name.replace(/\.md$/, ""),
      fileName: entry.name,
      description: frontmatter.description || markdownDescription(content),
      subType: frontmatter.type || "memory",
      ...statFields(stat),
      path,
    });
  }

  return items;
}

async function findSkillDirs(root, current = root, depth = 0) {
  const dirs = [];
  if (depth > 3 || !(await exists(current))) return dirs;

  if (await exists(join(current, "SKILL.md"))) {
    dirs.push(current);
    return dirs;
  }

  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return dirs; }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (["node_modules", ".git"].includes(entry.name)) continue;
    dirs.push(...await findSkillDirs(root, join(current, entry.name), depth + 1));
  }

  return dirs;
}

async function directorySummary(dir) {
  let sizeBytes = 0;
  let fileCount = 0;
  let newest = null;
  let oldest = null;

  async function walk(current, depth = 0) {
    if (depth > 3) return;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await safeStat(path);
      if (!stat) continue;
      fileCount += 1;
      sizeBytes += stat.size;
      newest = !newest || stat.mtime > newest ? stat.mtime : newest;
      oldest = !oldest || stat.birthtime < oldest ? stat.birthtime : oldest;
    }
  }

  await walk(dir);

  return {
    fileCount,
    size: formatSize(sizeBytes),
    sizeBytes,
    mtime: newest ? newest.toISOString().slice(0, 16) : "",
    ctime: oldest ? oldest.toISOString().slice(0, 16) : "",
  };
}

async function scanSkills(scope, ctx) {
  const root = join(codexDir(ctx), "skills");
  const items = [];
  const skillDirs = await findSkillDirs(root);

  for (const skillDir of skillDirs) {
    const skillMd = join(skillDir, "SKILL.md");
    const content = await safeReadFile(skillMd);
    const rel = relative(root, skillDir);
    const summary = await directorySummary(skillDir);
    items.push({
      category: "skill",
      scopeId: scope.id,
      name: rel,
      fileName: rel,
      description: markdownDescription(content),
      subType: rel.startsWith(".system/") ? "system-skill" : "skill",
      ...summary,
      path: skillDir,
      openPath: skillMd,
    });
  }

  return items;
}

function mcpDescription(config) {
  const cmd = config?.command || config?.url || "";
  const args = Array.isArray(config?.args) ? config.args : [];
  return [cmd, ...args].filter(Boolean).join(" ").slice(0, 120) || "(MCP server)";
}

async function scanMcpServers(scope, ctx) {
  const parsed = await readCodexConfig(ctx);
  const servers = parsed.config?.mcp_servers || parsed.config?.mcpServers || {};
  const items = [];

  for (const [name, serverConfig] of objectEntries(servers)) {
    if (!serverConfig || typeof serverConfig !== "object") continue;
    const cfgBytes = JSON.stringify(serverConfig).length;
    items.push({
      category: "mcp",
      scopeId: scope.id,
      name,
      fileName: "config.toml",
      description: mcpDescription(serverConfig),
      subType: "mcp",
      size: formatSize(cfgBytes),
      sizeBytes: cfgBytes,
      ...timestampFields(parsed.stat),
      path: parsed.path,
      mcpConfig: serverConfig,
    });
  }

  return items;
}

function profileDescription(profile) {
  const parts = [
    profile?.model ? `model: ${profile.model}` : "",
    profile?.approval_policy ? `approval: ${profile.approval_policy}` : "",
    profile?.sandbox_mode ? `sandbox: ${profile.sandbox_mode}` : "",
  ].filter(Boolean);
  return parts.join(", ") || "Codex profile";
}

async function scanProfiles(scope, ctx) {
  const parsed = await readCodexConfig(ctx);
  const profiles = parsed.config?.profiles || {};
  const items = [];

  for (const [name, profileConfig] of objectEntries(profiles)) {
    if (!profileConfig || typeof profileConfig !== "object") continue;
    const cfgBytes = JSON.stringify(profileConfig).length;
    items.push({
      category: "profile",
      scopeId: scope.id,
      name,
      fileName: "config.toml",
      description: profileDescription(profileConfig),
      subType: "profile",
      size: formatSize(cfgBytes),
      sizeBytes: cfgBytes,
      ...timestampFields(parsed.stat),
      path: parsed.path,
      value: profileConfig,
      valueType: "toml-table",
    });
  }

  return items;
}

async function scanRules(scope, ctx) {
  const dir = join(codexDir(ctx), "rules");
  const items = [];
  if (!(await exists(dir))) return items;

  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return items; }

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    const stat = await safeStat(path);
    const content = await safeReadFile(path);
    const ext = extname(entry.name).replace(/^\./, "") || "rule";
    items.push({
      category: "rule",
      scopeId: scope.id,
      name: entry.name,
      fileName: entry.name,
      description: markdownDescription(content) || "Codex rule",
      subType: ext,
      ...statFields(stat),
      path,
    });
  }

  return items;
}

async function findPluginManifests(root, current = root, depth = 0) {
  const manifests = [];
  if (depth > 6 || !(await exists(current))) return manifests;

  const manifestPath = join(current, ".codex-plugin", "plugin.json");
  if (await exists(manifestPath)) {
    manifests.push({ dir: current, manifestPath });
    return manifests;
  }

  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return manifests; }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (["node_modules", ".git"].includes(entry.name)) continue;
    manifests.push(...await findPluginManifests(root, join(current, entry.name), depth + 1));
  }

  return manifests;
}

async function scanPlugins(scope, ctx) {
  const root = join(codexDir(ctx), "plugins");
  const items = [];
  const manifests = await findPluginManifests(root);

  for (const { dir, manifestPath } of manifests) {
    const manifest = await readJson(manifestPath) || {};
    const summary = await directorySummary(dir);
    const rel = relative(root, dir);
    const name = manifest.name || manifest.id || basename(dir);
    items.push({
      category: "plugin",
      scopeId: scope.id,
      name,
      fileName: rel,
      description: manifest.description || manifest.displayName || "Codex plugin",
      subType: "plugin",
      ...summary,
      path: dir,
      openPath: manifestPath,
      value: manifest,
      valueType: "json",
    });
  }

  return items;
}

async function scanSessions(scope, ctx) {
  if (scope.id !== "global") return [];

  const items = [];
  const root = join(codexDir(ctx), "sessions");
  const index = await readSessionIndex(ctx);

  if (index.stat) {
    items.push({
      category: "session",
      scopeId: scope.id,
      name: "session_index.jsonl",
      fileName: "session_index.jsonl",
      description: `${index.lineCount} indexed Codex sessions`,
      subType: "session-index",
      ...statFields(index.stat),
      path: index.path,
      valueType: "jsonl",
    });
  }

  const sessionFiles = await findFilesBySuffix(root, ".jsonl", 8);
  sessionFiles.sort();

  for (const path of sessionFiles) {
    const stat = await safeStat(path);
    const fileName = basename(path);
    const sessionId = extractSessionId(fileName);
    const indexed = index.entries.get(sessionId);
    const { meta, description } = await sessionMetadata(path, stat);
    const cwd = meta?.cwd || "";
    const rel = relative(root, path);
    const datePath = rel.split("/").slice(0, 3).join("/");

    items.push({
      category: "session",
      scopeId: scope.id,
      name: indexed?.thread_name || sessionId,
      fileName,
      description: description || cwd || datePath,
      subType: indexed ? "indexed-session" : "session",
      ...statFields(stat),
      path,
      sessionId,
      cwd,
      model: meta?.model_provider || "",
      cliVersion: meta?.cli_version || "",
      value: {
        indexed: Boolean(indexed),
        updatedAt: indexed?.updated_at || meta?.timestamp || "",
        datePath,
      },
      valueType: "session-jsonl",
    });
  }

  return items;
}

const unsupportedOperations = {
  getValidDestinations() {
    return [];
  },
  async moveItem() {
    throw new Error("Codex adapter does not support moving items yet");
  },
  async deleteItem() {
    throw new Error("Codex adapter does not support deleting items yet");
  },
};

const noEffectiveModel = {
  rules: [],
  includeGlobalCategories: [],
  shadowByName: false,
  conflictByName: false,
  ancestorCategories: [],
};

const OPENAI_LOGOMARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>';

/**
 * @type {import("../interface.mjs").HarnessAdapter}
 */
export const codexAdapter = {
  id: "codex",
  displayName: "Codex CLI",
  shortName: "Codex",
  icon: "●",
  iconSvg: OPENAI_LOGOMARK_SVG,
  executable: "codex",
  categories,
  scopeTypes,
  capabilities,
  getPaths(ctx) {
    const rootDir = codexDir(ctx);
    return {
      rootDir,
      backupDir: join(ctx.home, ".codex-backups"),
      safeRoots: [ctx.home, rootDir],
    };
  },
  discoverScopes,
  scanners: {
    config: scanConfig,
    memory: scanMemories,
    skill: scanSkills,
    mcp: scanMcpServers,
    profile: scanProfiles,
    rule: scanRules,
    plugin: scanPlugins,
    session: scanSessions,
  },
  afterScan() {
    return { effective: noEffectiveModel };
  },
  effective: noEffectiveModel,
  operations: unsupportedOperations,
};

export const adapter = codexAdapter;
export default codexAdapter;
