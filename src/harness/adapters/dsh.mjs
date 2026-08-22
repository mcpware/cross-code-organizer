/**
 * DeepSeek Harness (DSH) adapter.
 *
 * Scans the DSH home configuration directory (~/.dsh) that controls the
 * harness: per-profile cordis.yml/cordis.patch.yml entry points, the global
 * settings.yaml, and user skills.
 *
 * DSH (https://github.com/deepseek-ai/deepseek-harness) stores its config under
 * the home dir: profiles/<name>/cordis.yml (the entry list), cordis.patch.yml
 * (user overlay), settings.yaml, and skills/. The adapter surfaces the parts
 * CCO can inspect and manage consistently with the Claude/Codex adapters.
 */

import { readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import {
  exists,
  formatSize,
  safeReadFile,
  safeStat,
} from "../fs-utils.mjs";

// Mirrors the adapter's home config dir; DSH defaults to ~/.dsh.
function dshDir(ctx) {
  return join(ctx.home, ".dsh");
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
    source: "~/.dsh/settings.yaml, ~/.dsh/profiles/<name>/cordis.yml and cordis.patch.yml",
    preview: "config file",
  }),
  defineCategory({
    id: "profile",
    label: "Profiles",
    filterLabel: "Profiles",
    icon: "👤",
    order: 20,
    group: "profile",
    source: "~/.dsh/profiles/<name>/",
    preview: "profile directory",
  }),
  defineCategory({
    id: "skill",
    label: "Skills",
    filterLabel: "Skills",
    icon: "⚡",
    order: 30,
    group: "skill",
    source: "~/.dsh/skills/",
    preview: "SKILL.md",
    deletable: true,
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
  mcpSecurity: false,
  sessions: true,
  effective: false,
  backup: true,
};

const DSH_PROMPTS = {
  actions: {
    common: {
      unlockedInfo: {
        ico: "●",
        label: "",
        prompt: null,
        info: "Use these prompts for guided changes - DSH will inspect the file, explain impact, and confirm before editing.",
      },
      explain: {
        ico: "📋",
        label: "Explain This",
        prompt: "I have a DSH {{category}} called \"{{name}}\" at:\n{{path}}\n\nPlease inspect it and explain:\n1. What does this {{category}} do?\n2. How does DeepSeek Harness load or use it?\n3. What would break if I removed or changed it?\n4. Are there related config files that reference it?",
      },
    },
    categories: {
      config: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Edit Config",
          prompt: "I want to modify this DeepSeek Harness config item: \"{{name}}\"\nPath: {{path}}\n\nBefore changing:\n1. Read the current YAML/JSON content\n2. Explain the current setting or plugin entry\n3. Ask what I want to change\n4. Show the exact before/after diff\n5. Warn if this affects an agent preset, model route, or the profile entry list\n6. Only save after I confirm",
        },
      ],
      profile: [
        { use: "common.explain" },
        {
          ico: "🗑️",
          label: "Remove",
          prompt: "I want to remove this DeepSeek Harness profile: \"{{name}}\"\nPath: {{path}}\n\nBefore removing:\n1. Read its package.json and cordis.yml\n2. Explain what plugins/agents this profile provides\n3. Check whether active sessions reference it\n4. Tell me what will stop working\n5. Only remove after I explicitly confirm",
        },
      ],
      skill: [
        { use: "common.explain" },
        {
          ico: "✏️",
          label: "Edit Skill",
          prompt: "I want to edit this DeepSeek Harness skill: \"{{name}}\"\nPath: {{path}}\n\nBefore editing:\n1. Read SKILL.md and related files in this skill directory\n2. Explain what this skill instructs the agent to do\n3. Ask what I want to change\n4. Show the before/after diff\n5. Only save after I confirm",
        },
      ],
      session: [{ use: "common.explain" }],
    },
  },
};

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

async function configFileItem({ scopeId, name, path, desc, subType, locked = false, sourceFile }) {
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
    sourceFile,
  };
}

async function scanConfig(scope, ctx) {
  const items = [];
  const root = dshDir(ctx);

  // Global settings.yaml.
  const settingsPath = join(root, "settings.yaml");
  const settingsItem = await configFileItem({
    scopeId: scope.id,
    name: "settings.yaml",
    path: settingsPath,
    desc: "DeepSeek Harness global settings",
    subType: "settings",
    locked: true,
    sourceFile: "~/.dsh/settings.yaml",
  });
  if (settingsItem) items.push(settingsItem);

  // Per-profile entry lists (cordis.yml + cordis.patch.yml).
  const profilesDir = join(root, "profiles");
  if (await exists(profilesDir)) {
    const names = await readdir(profilesDir).catch(() => []);
    for (const name of names) {
      const profileDir = join(profilesDir, name);
      const stat = await safeStat(profileDir);
      if (!stat || !stat.isDirectory()) continue;
      for (const fileName of ["cordis.yml", "cordis.patch.yml"]) {
        const p = join(profileDir, fileName);
        const item = await configFileItem({
          scopeId: scope.id,
          name: `${name}/${fileName}`,
          path: p,
          desc: `DeepSeek Harness profile entry list (${name})`,
          subType: "cordis",
          sourceFile: `~/.dsh/profiles/${name}/${fileName}`,
        });
        if (item) items.push(item);
      }
    }
  }

  return items;
}

async function scanProfiles(scope, ctx) {
  const items = [];
  const root = join(dshDir(ctx), "profiles");
  if (!(await exists(root))) return items;

  const names = await readdir(root).catch(() => []);
  const INTERNAL_DIRS = new Set(["node_modules", ".git", ".dsh-mem.db", ".turbo"]);
  for (const name of names) {
    if (INTERNAL_DIRS.has(name)) continue;
    const profileDir = join(root, name);
    const stat = await safeStat(profileDir);
    if (!stat || !stat.isDirectory()) continue;

    const pkgRel = join(name, "package.json");
    const pkgPath = join(profileDir, "package.json");
    let description = `DeepSeek Harness profile (${name})`;
    let pkgValue;
    if (await exists(pkgPath)) {
      const pkgContent = await safeReadFile(pkgPath);
      try {
        pkgValue = JSON.parse(pkgContent);
        if (pkgValue?.description) description = pkgValue.description;
      } catch { /* not JSON */ }
    }

    const summary = statFields(stat);
    items.push({
      category: "profile",
      scopeId: scope.id,
      name,
      fileName: name,
      description,
      subType: "profile",
      ...summary,
      path: profileDir,
      openPath: join(profileDir, "cordis.yml"),
      value: pkgValue,
      valueType: pkgValue ? "json" : "directory",
      sourceFile: pkgRel,
    });
  }

  return items;
}

async function scanSkills(scope, ctx) {
  const items = [];
  const root = join(dshDir(ctx), "skills");

  // Similar to the Codex scanner: find any SKILL.md under the skills dir.
  const skillDirs = await findSkillDirs(root);
  for (const skillDir of skillDirs) {
    const skillMd = join(skillDir, "SKILL.md");
    const content = await safeReadFile(skillMd);
    const rel = relative(root, skillDir);
    const summary = await directorySummary(skillDir);
    items.push({
      category: "skill",
      scopeId: scope.id,
      name: skillDisplayName(root, skillDir),
      fileName: rel,
      description: markdownDescription(content),
      subType: rel.startsWith(".system/") ? "system-skill" : "skill",
      ...summary,
      path: skillDir,
      openPath: skillMd,
      sourceFile: "~/.dsh/skills",
    });
  }

  return items;
}

async function findSkillDirs(root, current = "", depth = 0) {
  const dirs = [];
  const dir = current ? join(root, current) : root;
  if (depth > 3 || !(await exists(dir))) return dirs;

  // A directory holding SKILL.md is a skill root; do NOT recurse inside it
  // (would double-count nested mirrors like skill/skill/SKILL.md). Non-skill
  // dirs (e.g. .system/, references/) are descended so nested skill dirs there
  // are still found — mirrors the Codex adapter.
  if (await exists(join(dir, "SKILL.md"))) {
    dirs.push(dir);
    return dirs;
  }

  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return dirs; }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (["node_modules", ".git"].includes(entry.name)) continue;
    dirs.push(...await findSkillDirs(root, join(current, entry.name), depth + 1));
  }

  return dirs;
}

// Resolve a display name for a skill under the skills root. Prefers the
// directory-relative path; falls back to "." when the root itself holds the
// SKILL.md so the item is never unnamed.
function skillDisplayName(root, skillDir) {
  const rel = relative(root, skillDir);
  return rel || ".";
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

const unsupportedOperations = {
  getValidDestinations() {
    return [];
  },
  async moveItem() {
    return { ok: false, error: "DSH adapter does not support moving items yet" };
  },
  async deleteItem(item) {
    if (item.locked) {
      return { ok: false, error: `${item.name} is locked and cannot be deleted` };
    }
    if (item.category === "skill") {
      const { rm } = await import("node:fs/promises");
      await rm(item.path, { recursive: true, force: true });
      return { ok: true, deleted: item.path, message: `Deleted DSH skill "${item.name}"` };
    }
    return { ok: false, error: `DSH ${item.category} items cannot be deleted` };
  },
};

const noEffectiveModel = {
  rules: [],
  includeGlobalCategories: [],
  shadowByName: false,
  conflictByName: false,
  ancestorCategories: [],
};

const DSH_LOGOMARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="7" fill="currentColor"/></svg>';

/**
 * @type {import("../interface.mjs").HarnessAdapter}
 */
export const dshAdapter = {
  id: "dsh",
  displayName: "DeepSeek Harness",
  shortName: "DSH",
  icon: "●",
  iconSvg: DSH_LOGOMARK_SVG,
  executable: "dsh",
  categories,
  scopeTypes,
  capabilities,
  prompts: DSH_PROMPTS,
  getPaths(ctx) {
    const rootDir = dshDir(ctx);
    return {
      rootDir,
      backupDir: join(ctx.home, ".dsh-backups"),
      safeRoots: [ctx.home, rootDir],
    };
  },
  discoverScopes(ctx) {
    return [{
      id: "global",
      name: "Global",
      type: "global",
      tag: "applies everywhere",
      parentId: null,
      repoDir: null,
      configDir: dshDir(ctx),
    }];
  },
  scanners: {
    config: scanConfig,
    profile: scanProfiles,
    skill: scanSkills,
  },
  afterScan() {
    return { effective: noEffectiveModel };
  },
  effective: noEffectiveModel,
  operations: unsupportedOperations,
};

export const adapter = dshAdapter;
export default dshAdapter;
