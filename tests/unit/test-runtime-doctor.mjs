import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  analyzeOneMcpConfig,
  buildRuntimeFindings,
  collectProcessGroup,
  collectRuntimeDoctorReport,
  commandLineHasSecret,
  fetchLoopbackHealth,
  parseOneMcpFlags,
  stopRuntimeSession,
} from "../../src/runtime-doctor.mjs";

describe("MCP Runtime Doctor", () => {
  it("extracts only operational 1MCP flags", () => {
    const flags = parseOneMcpFlags([
      "node", "/opt/bin/1mcp", "serve", "--transport", "http", "--port=3050",
      "--host", "127.0.0.1", "--enable-async-loading", "--enable-session-persistence",
    ]);
    assert.equal(flags.port, 3050);
    assert.equal(flags.host, "127.0.0.1");
    assert.equal(flags.asyncLoading, true);
    assert.equal(flags.lazyLoading, false);
    assert.equal(flags.sessionPersistence, true);
    assert.equal(parseOneMcpFlags(["1mcp", "serve", "--port", ""]).port, 3050);
  });

  it("detects but never needs to return command-line credential values", () => {
    assert.equal(commandLineHasSecret(["node", "server", "--api-token=redacted-value"]), true);
    assert.equal(commandLineHasSecret(["node", "server", "--password", "redacted-value"]), true);
    assert.equal(commandLineHasSecret(["node", "server", "--enable-auth"]), false);
    assert.equal(commandLineHasSecret(["node", "server", "--max-tokens", "4096"]), false);
    assert.equal(commandLineHasSecret(["node", "server", "--token-limit", "8000"]), false);
    assert.equal(commandLineHasSecret(["node", "server", "--password-file", "/run/secrets/demo"]), false);
    assert.equal(commandLineHasSecret(["node", "server", "max_tokens=4096"]), false);
  });

  it("uses only the runtime descendant tree when its cgroup is shared", async () => {
    const processes = new Map([
      [100, { pid: 100, ppid: 1, cgroupPath: "/shared.scope", tokens: ["1mcp", "serve"] }],
      [101, { pid: 101, ppid: 100, cgroupPath: "/shared.scope", tokens: ["node", "backend", "--api-token=redacted"] }],
      [200, { pid: 200, ppid: 1, cgroupPath: "/shared.scope", tokens: ["editor"] }],
    ]);
    const resources = await collectProcessGroup(
      { pid: 100, cgroupPath: "/shared.scope" },
      processes,
      "/sys/fs/cgroup",
      {},
    );
    assert.equal(resources.processCount, 2);
    assert.equal(resources.commandLineSecretProcesses, 1);
    assert.equal(resources.memoryBytes, null);
    assert.equal(resources.taskCount, null);
  });

  it("counts floating npx packages without exposing environment values", () => {
    const summary = analyzeOneMcpConfig({
      mcpServers: {
        floating: { command: "npx", args: ["-y", "demo-mcp@latest"] },
        exact: { command: "npx", args: ["@scope/server@1.2.3"], env: { API_TOKEN: "redacted" } },
        disabled: { command: "npx", args: ["unused"], disabled: true },
      },
    });
    assert.deepEqual(summary, {
      configuredCount: 3,
      enabledCount: 2,
      disabledCount: 1,
      floatingNpxCount: 1,
      secretEnvKeyCount: 1,
    });
  });

  it("turns runtime pressure and exposure into explainable findings", () => {
    const findings = buildRuntimeFindings({
      runtime: { unhealthyServers: 1 },
      inventory: { enabledCount: 17, floatingNpxCount: 2 },
      resources: { memoryMaxRatio: 0.4, memoryHighRatio: 0.5, taskRatio: 0.7 },
      features: { lazyLoading: false },
      exposure: { commandLineSecretProcesses: 1 },
    });
    assert.deepEqual(findings.map(finding => finding.code), [
      "unhealthy-upstreams", "command-line-secret", "floating-npx", "task-pressure", "lazy-loading-off",
    ]);
  });

  it("settles safely when a loopback health response exceeds 64 KiB", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write("x".repeat(65536));
      setTimeout(() => response.end("x"), 10);
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const result = await Promise.race([
        fetchLoopbackHealth("127.0.0.1", address.port, 500),
        new Promise((_, reject) => setTimeout(() => reject(new Error("health request did not settle")), 1000)),
      ]);
      assert.equal(result, null);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it("collects a bounded report from a fake procfs and cgroup", async () => {
    const root = await mkdtemp(join(tmpdir(), "cco-runtime-doctor-"));
    const home = join(root, "home");
    const procRoot = join(root, "proc");
    const cgroupRoot = join(root, "cgroup");
    const group = "user.slice/1mcp.service";
    const configPath = join(home, ".config", "1mcp", "mcp.json");
    try {
      await Promise.all([
        mkdir(join(procRoot, "100"), { recursive: true }),
        mkdir(join(procRoot, "101"), { recursive: true }),
        mkdir(join(cgroupRoot, group), { recursive: true }),
        mkdir(join(home, ".config", "1mcp"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(join(procRoot, "100", "cmdline"), [
          "node", join(home, "bin", "1mcp"), "serve", "--transport", "http",
          "--port", "3050", "--config", configPath, "--enable-async-loading", "",
        ].join("\0")),
        writeFile(join(procRoot, "101", "cmdline"), "node\0backend\0--api-token=redacted\0"),
        writeFile(join(procRoot, "100", "cgroup"), `0::/${group}\n`),
        writeFile(join(procRoot, "101", "cgroup"), `0::/${group}\n`),
        writeFile(join(procRoot, "100", "status"), "Name:\t1mcp\nPPid:\t1\nUid:\t1000\t1000\t1000\t1000\n"),
        writeFile(join(procRoot, "101", "status"), "Name:\tnode\nPPid:\t100\nUid:\t1000\t1000\t1000\t1000\n"),
        writeFile(join(cgroupRoot, group, "memory.current"), "2048\n"),
        writeFile(join(cgroupRoot, group, "memory.high"), "4096\n"),
        writeFile(join(cgroupRoot, group, "memory.max"), "8192\n"),
        writeFile(join(cgroupRoot, group, "pids.current"), "7\n"),
        writeFile(join(cgroupRoot, group, "pids.max"), "10\n"),
        writeFile(configPath, JSON.stringify({ mcpServers: { demo: { command: "npx", args: ["demo-mcp"] } } })),
      ]);

      const report = await collectRuntimeDoctorReport({
        home, procRoot, cgroupRoot, platform: "linux", uid: 1000, env: {},
        healthFetcher: async () => ({
          status: "healthy", version: "0.39.3", system: { uptime: 60 },
          servers: { healthy: 1, unhealthy: 0 },
        }),
      });
      assert.equal(report.detected, true);
      assert.equal(report.runtime.version, "0.39.3");
      assert.equal(report.resources.processCount, 2);
      assert.equal(report.resources.taskRatio, 0.7);
      assert.equal(report.exposure.commandLineSecretProcesses, 1);
      assert.equal(report.methodology.secretValuesReturned, false);
      assert.ok(report.findings.some(finding => finding.code === "command-line-secret"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("maps live sessions, duplicate direct MCPs, shared sockets, and IntentProbe readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "cco-runtime-map-"));
    const home = join(root, "home");
    const bin = join(root, "bin");
    const procRoot = join(root, "proc");
    const cgroupRoot = join(root, "cgroup");
    const group = "user.slice/1mcp.service";
    const configPath = join(home, ".config", "1mcp", "mcp.json");
    const processRows = [
      { pid: 100, ppid: 1, name: "claude", rss: 1000, start: 1000, cmd: ["claude"] },
      { pid: 101, ppid: 100, name: "npm exec gmail", rss: 200, start: 1010, cmd: ["npx", "-y", "gmail-mcp@1.2.3"] },
      { pid: 102, ppid: 101, name: "node", rss: 300, start: 1020, cmd: ["node", "gmail-mcp"] },
      { pid: 103, ppid: 100, name: "codex", rss: 50, start: 1030, cmd: ["codex", "mcp-server"] },
      { pid: 104, ppid: 100, name: "node", rss: 111, start: 1040, cmd: ["node", "/srv/mcp-a/build/index.js"] },
      { pid: 105, ppid: 100, name: "npm exec tool", rss: 33, start: 1050, cmd: ["npx", "tool@1.0.0", "--profile", "a"] },
      { pid: 200, ppid: 100, name: "codex", rss: 2000, start: 2000, cmd: ["codex"] },
      { pid: 201, ppid: 200, name: "npm exec gmail", rss: 200, start: 2010, cmd: ["npx", "-y", "gmail-mcp@1.2.3"] },
      { pid: 202, ppid: 201, name: "node", rss: 300, start: 2020, cmd: ["node", "gmail-mcp"] },
      { pid: 203, ppid: 200, name: "node", rss: 100, start: 2030, cmd: ["node", "cco-server"] },
      { pid: 204, ppid: 200, name: "node", rss: 222, start: 2040, cmd: ["node", "/srv/mcp-b/build/index.js"] },
      { pid: 300, ppid: 1, name: "node", rss: 400, start: 3000, cmd: ["node", join(home, "bin", "1mcp"), "serve", "--port", "3050", "--config", configPath] },
      { pid: 301, ppid: 300, name: "node", rss: 600, start: 3010, cmd: ["node", "search-mcp"] },
    ];
    const statText = row => `${row.pid} (${row.name}) S ${row.ppid} ${Array(17).fill("0").join(" ")} ${row.start}\n`;
    const statusText = row => [
      `Name:\t${row.name}`,
      "State:\tS (sleeping)",
      `PPid:\t${row.ppid}`,
      "Uid:\t1000\t1000\t1000\t1000",
      `VmRSS:\t${row.rss} kB`,
      "Threads:\t2",
      "",
    ].join("\n");
    try {
      await Promise.all([
        mkdir(join(procRoot, "net"), { recursive: true }),
        mkdir(join(cgroupRoot, group), { recursive: true }),
        mkdir(join(home, ".config", "1mcp"), { recursive: true }),
        mkdir(join(home, ".claude"), { recursive: true }),
        mkdir(bin, { recursive: true }),
      ]);
      for (const row of processRows) {
        await mkdir(join(procRoot, String(row.pid)), { recursive: true });
        await Promise.all([
          writeFile(join(procRoot, String(row.pid), "status"), statusText(row)),
          writeFile(join(procRoot, String(row.pid), "cmdline"), `${row.cmd.join("\0")}\0`),
          writeFile(join(procRoot, String(row.pid), "stat"), statText(row)),
          writeFile(join(procRoot, String(row.pid), "cgroup"), row.pid >= 300 ? `0::/${group}\n` : "0::/user.slice\n"),
        ]);
      }
      await mkdir(join(procRoot, "102", "fd"), { recursive: true });
      await symlink("socket:[12345]", join(procRoot, "102", "fd", "5"));
      await Promise.all([
        writeFile(join(procRoot, "uptime"), "1000.00 0.00\n"),
        writeFile(join(procRoot, "net", "tcp"), "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n   0: 0100007F:C350 0100007F:0BEA 01 00000000:00000000 00:00000000 00000000  1000 0 12345\n"),
        writeFile(join(procRoot, "net", "tcp6"), "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n"),
        writeFile(join(cgroupRoot, group, "memory.current"), "1024000\n"),
        writeFile(join(cgroupRoot, group, "memory.high"), "4096000\n"),
        writeFile(join(cgroupRoot, group, "memory.max"), "8192000\n"),
        writeFile(join(cgroupRoot, group, "pids.current"), "4\n"),
        writeFile(join(cgroupRoot, group, "pids.max"), "20\n"),
        writeFile(configPath, JSON.stringify({ mcpServers: { search: { command: "npx", args: ["search-mcp@2.0.0"] } } })),
        writeFile(join(home, ".claude", "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ command: "intentprobe runtime scan --stdin" }] } })),
        writeFile(join(bin, "intentprobe"), "#!/bin/sh\nexit 0\n"),
      ]);
      await chmod(join(bin, "intentprobe"), 0o755);

      const report = await collectRuntimeDoctorReport({
        home, procRoot, cgroupRoot, platform: "linux", uid: 1000, currentPid: 203,
        env: { PATH: bin },
        mcpItems: [
          { category: "mcp", name: "gmail", mcpConfig: { command: "npx", args: ["-y", "gmail-mcp@1.2.3"] } },
          { category: "mcp", name: "local-a", mcpConfig: { command: "node", args: ["/srv/mcp-a/build/index.js"] } },
          { category: "mcp", name: "local-b", mcpConfig: { command: "node", args: ["/srv/mcp-b/build/index.js"] } },
          { category: "mcp", name: "profile-a", mcpConfig: { command: "npx", args: ["tool@1.0.0", "--profile", "a"] } },
          { category: "mcp", name: "profile-b", mcpConfig: { command: "npx", args: ["tool@1.0.0", "--profile", "b"] } },
        ],
        healthFetcher: async () => ({ status: "healthy", version: "0.40.0", servers: { healthy: 1, unhealthy: 0 } }),
      });

      assert.equal(report.methodology.version, 2);
      assert.equal(report.topology.sessions.length, 2);
      assert.deepEqual(report.topology.sessions.map(session => session.memoryBytes), [1694 * 1024, 2822 * 1024]);
      assert.deepEqual(report.topology.sessions.map(session => session.controllable), [false, false]);
      assert.deepEqual(
        report.topology.sessions[0].mcpServers.map(server => server.name).sort(),
        ["gmail", "local-a", "profile-a"],
      );
      assert.deepEqual(
        report.topology.sessions[1].mcpServers.map(server => server.name).sort(),
        ["gmail", "local-b"],
      );
      assert.equal(report.topology.duplicateDirectMcps.length, 1);
      assert.equal(report.topology.duplicateDirectMcps[0].name, "gmail");
      assert.equal(report.topology.duplicateDirectMcps[0].sessions.length, 2);
      assert.equal(report.topology.duplicateDirectMcps[0].instanceCount, 2);
      assert.equal(report.topology.duplicateDirectMcps[0].memoryBytes, 1000 * 1024);
      assert.equal(report.topology.sharedRuntimes[0].connectedSessions.length, 1);
      assert.equal(report.topology.sharedRuntimes[0].connectedSessions[0].label, "Claude Code #1");
      assert.equal(report.intentProbe.installed, true);
      assert.equal(report.intentProbe.hookConfigured, true);
      assert.equal(report.intentProbe.receiptIngestion, "not-connected");
      assert.equal(JSON.stringify(report).includes("gmail-mcp@1.2.3"), false);

      const signals = [];
      const stopped = await stopRuntimeSession(report.topology.sessions[0].id, {
        procRoot, platform: "linux", uid: 1000, currentPid: 9999,
        env: {}, sendSignal: (pid, signal) => signals.push([pid, signal]),
      });
      assert.equal(stopped.ok, true);
      assert.deepEqual(signals, [[100, "SIGTERM"]]);

      const stale = await stopRuntimeSession("claude:100:999999", {
        procRoot, platform: "linux", uid: 1000, currentPid: 9999, env: {},
        sendSignal: () => assert.fail("stale identity must never be signalled"),
      });
      assert.equal(stale.ok, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
