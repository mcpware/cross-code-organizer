import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAdapter } from "../../src/harness/registry.mjs";
import { scanHarness } from "../../src/harness/scanner-framework.mjs";
import { opencodeAdapter } from "../../src/harness/adapters/opencode.mjs";

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "cco-opencode-"));
  const globalDir = join(home, ".config", "opencode");
  const projectDir = join(home, "work", "demo");
  const nestedDir = join(projectDir, "src");

  await Promise.all([
    mkdir(join(globalDir, "agents"), { recursive: true }),
    mkdir(join(globalDir, "skills", "global-skill"), { recursive: true }),
    mkdir(join(home, ".agents", "skills", "shared-skill"), { recursive: true }),
    mkdir(join(projectDir, ".git"), { recursive: true }),
    mkdir(join(projectDir, ".opencode", "commands"), { recursive: true }),
    mkdir(join(projectDir, ".opencode", "skills", "repo-skill"), { recursive: true }),
    mkdir(join(projectDir, ".opencode", "plugins"), { recursive: true }),
    mkdir(nestedDir, { recursive: true }),
  ]);

  await writeFile(join(globalDir, "opencode.jsonc"), `{
    // OpenCode accepts JSONC
    "model": "openai/gpt-5",
    "username": "comma, } stays inside a string",
    "mcp": { "docs": { "type": "remote", "url": "https://example.com/mcp" } },
    "plugin": ["opencode-demo"],
  }`);
  await writeFile(join(globalDir, "agents", "review.md"), "---\ndescription: Review code\n---\n# Review\n");
  await writeFile(join(globalDir, "skills", "global-skill", "SKILL.md"), "---\nname: global-skill\ndescription: Global helper\n---\n");
  await writeFile(join(home, ".agents", "skills", "shared-skill", "SKILL.md"), "---\nname: shared-skill\ndescription: Shared helper\n---\n");

  await writeFile(join(projectDir, "opencode.json"), JSON.stringify({ instructions: ["STYLE.md"] }));
  await writeFile(join(projectDir, "AGENTS.md"), "# Project rules\nRun tests.\n");
  await writeFile(join(projectDir, "STYLE.md"), "# Style\nUse ESM.\n");
  await writeFile(join(projectDir, ".opencode", "commands", "deploy.md"), "---\ndescription: Deploy\n---\nShip it.\n");
  await writeFile(join(projectDir, ".opencode", "skills", "repo-skill", "SKILL.md"), "---\nname: repo-skill\ndescription: Repo helper\n---\n");
  await writeFile(join(projectDir, ".opencode", "plugins", "local.ts"), "export const Demo = {};\n");

  return { home, projectDir, nestedDir, cleanup: () => rm(home, { recursive: true, force: true }) };
}

describe("OpenCode adapter", () => {
  it("is discovered through the harness registry", async () => {
    const adapter = await getAdapter("opencode");
    assert.strictEqual(adapter.displayName, "OpenCode");
  });

  it("scans global, project, and compatibility sources without enabling destructive operations", async () => {
    const env = await fixture();
    try {
      const result = await scanHarness(opencodeAdapter, {
        home: env.home,
        cwd: env.nestedDir,
        // Keep the fixture deterministic on runners that define a host-level
        // XDG_CONFIG_HOME. OpenCode correctly gives that variable precedence.
        env: { ...process.env, XDG_CONFIG_HOME: join(env.home, ".config") },
      });
      const project = result.scopes.find(scope => scope.repoDir === env.projectDir);

      assert.ok(project);
      assert.ok(result.items.some(item => item.scopeId === "global" && item.category === "config" && item.value.model === "openai/gpt-5"));
      assert.strictEqual(result.items.find(item => item.scopeId === "global" && item.category === "config").value.username, "comma, } stays inside a string");
      assert.ok(result.items.some(item => item.scopeId === "global" && item.category === "mcp" && item.name === "docs"));
      assert.ok(result.items.some(item => item.scopeId === "global" && item.category === "plugin" && item.name === "opencode-demo"));
      assert.ok(result.items.some(item => item.scopeId === "global" && item.category === "skill" && item.name === "global-skill"));
      assert.ok(result.items.some(item => item.scopeId === "global" && item.category === "skill" && item.name === "shared-skill"));
      assert.ok(result.items.some(item => item.scopeId === project.id && item.category === "instruction" && item.name === "AGENTS"));
      assert.ok(result.items.some(item => item.scopeId === project.id && item.category === "instruction" && item.fileName === "STYLE.md"));
      assert.ok(result.items.some(item => item.scopeId === project.id && item.category === "command" && item.name === "deploy"));
      assert.ok(result.items.some(item => item.scopeId === project.id && item.category === "skill" && item.name === "repo-skill"));
      assert.ok(result.items.some(item => item.scopeId === project.id && item.category === "plugin" && item.name === "local.ts"));
      assert.strictEqual(result.items.find(item => item.category === "skill").editable, true);
      assert.deepStrictEqual(opencodeAdapter.operations.getValidDestinations(), []);
    } finally {
      await env.cleanup();
    }
  });
});
