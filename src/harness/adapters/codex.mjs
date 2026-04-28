/**
 * Codex CLI harness adapter.
 *
 * Scans the global Codex configuration directory at ~/.codex.
 */

import TOML from "@iarna/toml";
import { readdir } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
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
    source: "~/.codex/config.toml, $CODEX_HOME/AGENTS*.md, repo AGENTS*.md, and repo .codex/config.toml",
    preview: "config file",
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
    source: "~/.codex/skills, ~/.agents/skills, <repo>/.codex/skills, and <repo>/.agents/skills",
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
    source: "~/.codex/config.toml and trusted <repo>/.codex/config.toml mcp_servers",
    preview: "mcp_servers entry",
  }),
  defineCategory({
    id: "profile",
    label: "Profiles",
    filterLabel: "Profiles",
    icon: "👤",
    order: 50,
    group: "profile",
    source: "~/.codex/config.toml and trusted <repo>/.codex/config.toml profiles",
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
  defineCategory({
    id: "history",
    label: "History",
    filterLabel: "History",
    icon: "🕘",
    order: 90,
    group: "history",
    source: "~/.codex/history.jsonl",
    preview: "prompt history JSONL",
    sortDefault: "date",
  }),
  defineCategory({
    id: "shell",
    label: "Shell Snapshots",
    filterLabel: "Shell",
    icon: "💻",
    order: 100,
    group: "shell",
    source: "~/.codex/shell_snapshots/*.sh",
    preview: "shell snapshot",
    sortDefault: "date",
  }),
  defineCategory({
    id: "runtime",
    label: "Runtime",
    filterLabel: "Runtime",
    icon: "🗄️",
    order: 110,
    group: "runtime",
    source: "~/.codex runtime metadata, caches, logs, and databases",
    preview: "runtime file",
    sortDefault: "date",
  }),
];

const scopeTypes = [
  { id: "global", label: "Global", icon: "🌐", isGlobal: true },
  { id: "project", label: "Project", icon: "📂", isGlobal: false },
];

const capabilities = {
  contextBudget: false,
  mcpControls: false,
  mcpPolicy: false,
  mcpSecurity: true,
  sessions: true,
  effective: false,
  backup: true,
};

const CODEX_PROMPTS = {
  actions: {
    common: {
      unlockedInfo: {
        ico: "●",
        label: "",
        prompt: null,
        info: "Use these prompts for guided changes - Codex will inspect the file, explain impact, and confirm before editing.",
      },
      explain: {
        ico: "📋",
        label: "Explain This",
        prompt: "I have a Codex CLI {{category}} called \"{{name}}\" at:\n{{path}}\n\nPlease inspect it and explain:\n1. What does this {{category}} do?\n2. How does Codex load or use it?\n3. What would break if I removed or changed it?\n4. Are there related config files that reference it?",
      },
    },
    categories: {
      session: [
        {
          ico: "💬",
          label: "Resume Session",
          prompt: "{{cdCmd}}{{executable}} resume {{sessionId}}\n\n# Session file: {{path}}",
        },
        {
          ico: "📋",
          label: "Summarize",
          prompt: "I have a Codex CLI session at:\n{{path}}\n\nPlease read this session file and summarize:\n1. What was this session about?\n2. What was accomplished?\n3. Were there unfinished tasks or pending actions?\n4. What files or commands were involved?",
        },
      ],
      config: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Edit Config",
          prompt: "I want to modify this Codex CLI config item: \"{{name}}\"\nPath: {{path}}\nType: {{subType}}\n\nBefore changing:\n1. Read the current TOML/Markdown/JSON content\n2. Explain the current setting or instruction\n3. Ask what I want to change\n4. Show the exact before/after diff\n5. Warn if this affects sandboxing, approvals, model selection, MCP, or project trust\n6. Only save after I confirm",
        },
      ],
      memory: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Edit Memory",
          prompt: "I want to edit this Codex CLI memory: \"{{name}}\"\nPath: {{path}}\n\nBefore editing:\n1. Read the current memory\n2. Explain what context it gives Codex\n3. Ask what I want to change\n4. Show the before/after diff\n5. Only save after I confirm",
        },
      ],
      skill: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Edit Skill",
          prompt: "I want to edit this Codex CLI skill: \"{{name}}\"\nPath: {{path}}\n\nBefore editing:\n1. Read SKILL.md and related files in this skill directory\n2. Explain when this skill triggers and what it instructs Codex to do\n3. Ask what I want to change\n4. Show the before/after diff\n5. Warn if the change could affect automatic skill selection\n6. Only save after I confirm",
        },
      ],
      mcp: [
        {
          ico: "📋",
          label: "Explain This",
          prompt: "I have a Codex CLI MCP server called \"{{name}}\" configured at:\n{{path}}\n\nConfig:\n{{mcpConfigJson}}\n\nPlease explain:\n1. What this server likely does\n2. How Codex connects to it\n3. Which command, args, URL, and env vars matter\n4. Whether the command or URL looks reachable from this machine",
        },
        {
          ico: "🔧",
          label: "Edit Config",
          prompt: "I want to modify this Codex CLI MCP server: \"{{name}}\"\nConfig path: {{path}}\nCurrent config:\n{{mcpConfigJson}}\n\nBefore changing:\n1. Read the current config.toml entry\n2. Show the current command, args, url, and env settings\n3. Ask what I want to change\n4. Show the before/after TOML diff\n5. Warn if this could break Codex MCP tools\n6. Only save after I confirm",
        },
        {
          ico: "🩺",
          label: "Fix Server",
          when: "securitySeverityUnreachable",
          prompt: "My Codex CLI MCP server \"{{name}}\" is unreachable during a CCO security scan.\nConfig path: {{path}}\nConfig:\n{{mcpConfigJson}}\n\nPlease diagnose and fix:\n1. Check whether the command exists: which {{mcpCommand}}\n2. If it uses npx, check the package or args\n3. Check required env vars\n4. Try running the server command manually to capture the error\n5. Suggest the safest fix\n6. Only make changes after I confirm",
        },
      ],
      profile: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Modify Profile",
          prompt: "I want to modify this Codex CLI profile: \"{{name}}\"\nPath: {{path}}\n\nBefore changing:\n1. Read the profile entry in config.toml\n2. Explain model, sandbox, and approval behavior\n3. Ask what I want to change\n4. Show the exact TOML diff\n5. Only save after I confirm",
        },
      ],
      rule: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Modify Rule",
          prompt: "I want to modify this Codex CLI rule: \"{{name}}\"\nPath: {{path}}\n\nBefore changing:\n1. Read the rule\n2. Explain what behavior it enforces\n3. Ask what I want to change\n4. Show the before/after diff\n5. Only save after I confirm",
        },
      ],
      plugin: [
        { use: "common.explain" },
        {
          ico: "🗑️",
          label: "Remove",
          prompt: "I want to remove this Codex CLI plugin: \"{{name}}\"\nPath: {{path}}\n\nBefore removing:\n1. Read its plugin.json and any bundled skills/tools metadata\n2. Explain what features it provides\n3. Check whether any skills or config reference it\n4. Tell me what will stop working\n5. Only remove after I explicitly confirm",
        },
      ],
      history: [{ use: "common.explain" }],
      shell: [{ use: "common.explain" }],
      runtime: [{ use: "common.explain" }],
      default: [{ use: "common.explain" }],
    },
  },
};

function projectScopeId(projectPath) {
  return `project:${Buffer.from(projectPath, "utf-8").toString("base64url")}`;
}

function projectScopeName(projectPath) {
  return basename(projectPath) || projectPath;
}

function normalizeProjectPath(projectPath) {
  return projectPath ? resolve(projectPath) : "";
}

function defaultProjectRootMarkers(config) {
  const markers = config?.project_root_markers;
  return Array.isArray(markers) && markers.every(marker => typeof marker === "string")
    ? markers
    : [".git"];
}

async function findProjectRoot(startDir, markers) {
  let current = normalizeProjectPath(startDir);
  if (!current) return "";
  if (!markers.length) return current;

  while (current && current !== "/") {
    for (const marker of markers) {
      if (await exists(join(current, marker))) return current;
    }
    const next = resolve(current, "..");
    if (next === current) break;
    current = next;
  }

  return normalizeProjectPath(startDir);
}

function dirsBetweenProjectRootAndCwd(projectRoot, cwd) {
  const root = normalizeProjectPath(projectRoot);
  let current = normalizeProjectPath(cwd);
  const dirs = [];

  while (current) {
    dirs.push(current);
    if (current === root || current === "/") break;
    const next = resolve(current, "..");
    if (next === current) break;
    current = next;
  }

  return dirs.reverse();
}

async function hasCodexProjectArtifacts(projectPath, fallbackNames = []) {
  if (!projectPath) return false;
  const candidates = [
    "AGENTS.override.md",
    "AGENTS.md",
    ...fallbackNames,
    ".codex",
    ".agents/skills",
  ];

  for (const relPath of candidates) {
    if (relPath && await exists(join(projectPath, relPath))) return true;
  }

  return false;
}

async function addProjectCandidate(candidates, projectPath, source, options = {}) {
  const normalized = normalizeProjectPath(projectPath);
  if (!normalized) return;

  const existing = candidates.get(normalized) || {
    path: normalized,
    sources: new Set(),
    trustLevel: "",
    codexProjectConfig: null,
  };

  existing.sources.add(source);
  if (options.trustLevel) existing.trustLevel = options.trustLevel;
  if (options.codexProjectConfig) existing.codexProjectConfig = options.codexProjectConfig;
  candidates.set(normalized, existing);
}

async function discoverProjectCandidates(ctx, parsed) {
  const candidates = new Map();
  const fallbackNames = Array.isArray(parsed.config?.project_doc_fallback_filenames)
    ? parsed.config.project_doc_fallback_filenames.filter(name => typeof name === "string")
    : [];
  const markers = defaultProjectRootMarkers(parsed.config);

  for (const [projectPath, projectConfig] of objectEntries(parsed.config?.projects)) {
    if (!projectPath || !projectConfig || typeof projectConfig !== "object") continue;
    await addProjectCandidate(candidates, projectPath, "trust", {
      trustLevel: projectConfig.trust_level || "",
      codexProjectConfig: projectConfig,
    });
  }

  const cwdRoot = await findProjectRoot(ctx.cwd, markers);
  for (const dir of dirsBetweenProjectRootAndCwd(cwdRoot, ctx.cwd)) {
    if (normalizeProjectPath(dir) === normalizeProjectPath(ctx.home)) continue;
    if (await hasCodexProjectArtifacts(dir, fallbackNames)) {
      await addProjectCandidate(candidates, dir, "cwd");
    }
  }

  return [...candidates.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function assignProjectParents(scopes) {
  const projectScopes = scopes
    .filter(scope => scope.repoDir && scope.codexScopeSources?.includes("cwd"))
    .sort((a, b) => a.repoDir.length - b.repoDir.length);

  for (const scope of projectScopes) {
    let parent = null;
    for (const candidate of projectScopes) {
      if (candidate.id === scope.id) continue;
      if (scope.repoDir === candidate.repoDir) continue;
      if (scope.repoDir.startsWith(`${candidate.repoDir}/`)) parent = candidate;
    }
    scope.parentId = parent?.id || "global";
  }
}

async function discoverScopes(ctx) {
  const scopes = [{
    id: "global",
    name: "Global",
    type: "global",
    tag: "applies everywhere",
    parentId: null,
    repoDir: null,
    configDir: codexDir(ctx),
  }];

  const parsed = await readCodexConfig(ctx);
  const projects = await discoverProjectCandidates(ctx, parsed);

  for (const project of projects) {
    scopes.push({
      id: projectScopeId(project.path),
      name: projectScopeName(project.path),
      type: "project",
      tag: project.trustLevel || (project.sources.has("trust") ? "project trust" : "repo context"),
      parentId: "global",
      repoDir: project.path,
      configDir: join(project.path, ".codex"),
      trustLevel: project.trustLevel,
      codexProjectConfig: project.codexProjectConfig,
      codexScopeSources: [...project.sources].sort(),
    });
  }

  assignProjectParents(scopes);
  return scopes;
}

async function readCodexConfig(ctx) {
  const path = join(codexDir(ctx), "config.toml");
  return readTomlFile(path);
}

async function readTomlFile(path) {
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

function nonEmptyLines(content) {
  return content ? content.split(/\r?\n/).filter(Boolean) : [];
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

async function configFileItem({ scopeId, name, path, desc, subType, locked = false, value, valueType }) {
  const stat = await safeStat(path);
  if (!stat) return null;
  const content = await safeReadFile(path);
  return {
    category: "config",
    scopeId,
    name,
    fileName: basename(path),
    description: markdownDescription(content) || desc,
    subType,
    ...statFields(stat),
    path,
    locked,
    value,
    valueType: valueType || extname(path).replace(/^\./, "") || "file",
  };
}

function projectConfigDescription(scope) {
  const trust = scope.trustLevel ? `trust: ${scope.trustLevel}` : "project scope";
  return `${trust} (${scope.repoDir})`;
}

async function scanProjectLocalConfigs(scope, ctx) {
  const items = [];
  if (!scope.repoDir) return items;

  const parsed = await readCodexConfig(ctx);
  const fallbackNames = Array.isArray(parsed.config?.project_doc_fallback_filenames)
    ? parsed.config.project_doc_fallback_filenames.filter(name => typeof name === "string")
    : [];
  const candidates = [
    { name: "AGENTS.override.md", path: join(scope.repoDir, "AGENTS.override.md"), desc: "Project-local override instructions", subType: "instructions-override" },
    { name: "AGENTS.md", path: join(scope.repoDir, "AGENTS.md"), desc: "Project instructions", subType: "instructions" },
    ...fallbackNames.map(fileName => ({
      name: fileName,
      path: join(scope.repoDir, fileName),
      desc: "Project instruction fallback",
      subType: "instructions-fallback",
    })),
    { name: ".codex/config.toml", path: join(scope.repoDir, ".codex", "config.toml"), desc: "Project Codex config layer", subType: "project-config" },
  ];

  for (const candidate of candidates) {
    const item = await configFileItem({
      scopeId: scope.id,
      name: candidate.name,
      path: candidate.path,
      desc: candidate.desc,
      subType: candidate.subType,
    });
    if (item) items.push(item);
  }

  return items;
}

async function scanConfig(scope, ctx) {
  const parsed = await readCodexConfig(ctx);
  if (scope.id !== "global") {
    const items = [];

    if (parsed.content && scope.codexProjectConfig) {
      const cfgBytes = JSON.stringify(scope.codexProjectConfig).length;
      items.push({
        category: "config",
        scopeId: scope.id,
        name: "config.toml project entry",
        fileName: "config.toml",
        description: projectConfigDescription(scope),
        subType: "project-trust",
        size: formatSize(cfgBytes),
        sizeBytes: cfgBytes,
        ...timestampFields(parsed.stat),
        path: parsed.path,
        value: scope.codexProjectConfig,
        valueType: "toml-table",
      });
    }

    items.push(...await scanProjectLocalConfigs(scope, ctx));
    return items;
  }

  const items = [];
  if (parsed.content) {
    items.push({
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
    });
  }

  for (const candidate of [
    { name: "AGENTS.override.md", path: join(codexDir(ctx), "AGENTS.override.md"), desc: "Global Codex override instructions", subType: "instructions-override" },
    { name: "AGENTS.md", path: join(codexDir(ctx), "AGENTS.md"), desc: "Global Codex instructions", subType: "instructions" },
  ]) {
    const item = await configFileItem({
      scopeId: scope.id,
      name: candidate.name,
      path: candidate.path,
      desc: candidate.desc,
      subType: candidate.subType,
      locked: true,
    });
    if (item) items.push(item);
  }

  return items;
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
  if (scope.id !== "global") return [];

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

async function scanSkillRoot(scope, root, rootLabel, defaultSubType) {
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
      subType: rel.startsWith(".system/") ? "system-skill" : defaultSubType,
      ...summary,
      path: skillDir,
      openPath: skillMd,
      sourceFile: rootLabel,
    });
  }

  return items;
}

async function scanSkills(scope, ctx) {
  const roots = scope.id === "global"
    ? [
      { root: join(codexDir(ctx), "skills"), label: "$CODEX_HOME/skills", subType: "skill" },
      { root: join(ctx.home, ".agents", "skills"), label: "~/.agents/skills", subType: "skill" },
    ]
    : [
      { root: join(scope.repoDir, ".codex", "skills"), label: ".codex/skills", subType: "repo-skill" },
      { root: join(scope.repoDir, ".agents", "skills"), label: ".agents/skills", subType: "repo-skill" },
    ];

  const items = [];
  for (const entry of roots) {
    items.push(...await scanSkillRoot(scope, entry.root, entry.label, entry.subType));
  }
  return items;
}

function mcpDescription(config) {
  const cmd = config?.command || config?.url || "";
  const args = Array.isArray(config?.args) ? config.args : [];
  return [cmd, ...args].filter(Boolean).join(" ").slice(0, 120) || "(MCP server)";
}

function projectConfigEnabled(scope) {
  return scope.id === "global" || scope.trustLevel === "trusted";
}

async function readScopeConfig(scope, ctx) {
  if (scope.id === "global") return readCodexConfig(ctx);
  return readTomlFile(join(scope.repoDir, ".codex", "config.toml"));
}

async function scanMcpServers(scope, ctx) {
  if (!projectConfigEnabled(scope)) return [];

  const parsed = await readScopeConfig(scope, ctx);
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
      sourceFile: scope.id === "global" ? "config.toml" : ".codex/config.toml",
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
  if (!projectConfigEnabled(scope)) return [];

  const parsed = await readScopeConfig(scope, ctx);
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
      sourceFile: scope.id === "global" ? "config.toml" : ".codex/config.toml",
    });
  }

  return items;
}

async function scanRules(scope, ctx) {
  if (scope.id !== "global") return [];

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
  if (scope.id !== "global") return [];

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

async function scanHistory(scope, ctx) {
  if (scope.id !== "global") return [];

  const path = join(codexDir(ctx), "history.jsonl");
  const stat = await safeStat(path);
  if (!stat) return [];

  const lines = nonEmptyLines(await safeReadFile(path));
  const last = parseJsonLine(lines.at(-1) || "");
  const lastText = compactText(last?.text, 120);

  return [{
    category: "history",
    scopeId: scope.id,
    name: "history.jsonl",
    fileName: "history.jsonl",
    description: `${lines.length} prompt history entries${lastText ? `; latest: ${lastText}` : ""}`,
    subType: "prompt-history",
    ...statFields(stat),
    path,
    value: {
      entries: lines.length,
      latestSessionId: last?.session_id || "",
      latestTimestamp: last?.ts || null,
    },
    valueType: "jsonl",
  }];
}

function shellSnapshotSessionId(fileName) {
  const match = fileName.match(/^([0-9a-f-]{36})\./i);
  return match ? match[1] : "";
}

async function scanShellSnapshots(scope, ctx) {
  if (scope.id !== "global") return [];

  const dir = join(codexDir(ctx), "shell_snapshots");
  const items = [];
  if (!(await exists(dir))) return items;

  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return items; }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sh")) continue;
    const path = join(dir, entry.name);
    const stat = await safeStat(path);
    const sessionId = shellSnapshotSessionId(entry.name);
    items.push({
      category: "shell",
      scopeId: scope.id,
      name: sessionId ? `Snapshot ${sessionId.slice(0, 8)}` : entry.name,
      fileName: entry.name,
      description: sessionId ? `Shell environment snapshot for session ${sessionId}` : "Shell environment snapshot",
      subType: "shell-snapshot",
      ...statFields(stat),
      path,
      sessionId,
    });
  }

  return items;
}

function runtimeDescription(fileName, value, stat) {
  if (fileName === "version.json" && value) {
    return [
      value.latest_version ? `latest: ${value.latest_version}` : "",
      value.last_checked_at ? `checked: ${value.last_checked_at}` : "",
    ].filter(Boolean).join(", ") || "Codex version metadata";
  }
  if (fileName === "models_cache.json" && value) {
    const modelCount = Array.isArray(value.models) ? value.models.length : objectEntries(value.models).length;
    return [
      modelCount ? `${modelCount} cached models` : "model cache",
      value.client_version ? `client: ${value.client_version}` : "",
      value.fetched_at ? `fetched: ${value.fetched_at}` : "",
    ].filter(Boolean).join(", ");
  }
  if (fileName === "installation_id") {
    return stat?.size ? "Codex installation identifier" : "Empty Codex installation identifier";
  }
  if (fileName.endsWith(".sqlite")) return "Codex SQLite state database";
  if (fileName.endsWith(".sqlite-shm")) return "SQLite shared-memory sidecar";
  if (fileName.endsWith(".sqlite-wal")) return "SQLite write-ahead log";
  if (fileName.endsWith(".log")) return "Codex TUI log";
  if (fileName.endsWith(".sh")) return "Codex notification script";
  if (fileName === ".personality_migration") return "Personality migration marker";
  return "Codex runtime file";
}

function runtimeValue(fileName, value) {
  if (!value) return undefined;
  if (fileName === "models_cache.json") {
    return {
      fetchedAt: value.fetched_at || "",
      clientVersion: value.client_version || "",
      modelCount: Array.isArray(value.models) ? value.models.length : objectEntries(value.models).length,
    };
  }
  return value;
}

async function scanRuntime(scope, ctx) {
  if (scope.id !== "global") return [];

  const root = codexDir(ctx);
  const runtimeFiles = [
    "version.json",
    "installation_id",
    "models_cache.json",
    "state_5.sqlite",
    "state_5.sqlite-shm",
    "state_5.sqlite-wal",
    "logs_2.sqlite",
    "logs_2.sqlite-shm",
    "logs_2.sqlite-wal",
    ".personality_migration",
    "log/codex-tui.log",
    "bin/codex-notify-focus.sh",
    "bin/codex-notify-turn.sh",
  ];
  const items = [];

  for (const relPath of runtimeFiles) {
    const path = join(root, relPath);
    const stat = await safeStat(path);
    if (!stat) continue;
    const fileName = basename(path);
    const isJson = fileName.endsWith(".json");
    const value = isJson ? await readJson(path) : null;

    items.push({
      category: "runtime",
      scopeId: scope.id,
      name: relPath,
      fileName,
      description: runtimeDescription(fileName, value, stat),
      subType: fileName.endsWith(".sqlite") || fileName.includes(".sqlite-")
        ? "database"
        : fileName.endsWith(".sh")
          ? "script"
          : "runtime",
      ...statFields(stat),
      path,
      value: isJson ? runtimeValue(fileName, value) : undefined,
      valueType: isJson ? "json" : extname(fileName).replace(/^\./, "") || "file",
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
  prompts: CODEX_PROMPTS,
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
    history: scanHistory,
    shell: scanShellSnapshots,
    runtime: scanRuntime,
  },
  afterScan() {
    return { effective: noEffectiveModel };
  },
  effective: noEffectiveModel,
  operations: unsupportedOperations,
};

export const adapter = codexAdapter;
export default codexAdapter;
