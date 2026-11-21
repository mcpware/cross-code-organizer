/**
 * Read-only health report for a local shared MCP runtime.
 *
 * The first supported runtime is 1MCP on Linux. The collector reads only a
 * same-user config under HOME, procfs metadata, cgroup counters, and a
 * loopback-only health endpoint. Command lines are inspected in memory for
 * credential-shaped arguments but are never returned to the caller.
 */

import http from "node:http";
import { access, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SECRET_NAME = /(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|credential)/i;
const SECRET_OPTION_NAME = /^(?:-{1,2})?(?:[a-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|credential)s?$/i;
const NON_SECRET_OPTION = /(?:[_-](?:file|path|limit|count|max|min|budget|ttl|length|size))s?$|^(?:-{1,2})?(?:max|min)[_-]/i;
const BOOLEAN_TEXT = /^(?:true|false|yes|no|on|off|0|1)$/i;
const GENERIC_RUNNERS = new Set(["node", "npx", "npm", "python", "python3", "uv", "uvx", "bun", "deno"]);
const HARNESS_EXECUTABLES = new Map([
  ["claude", { id: "claude", label: "Claude Code" }],
  ["codex", { id: "codex", label: "Codex" }],
  ["opencode", { id: "opencode", label: "OpenCode" }],
  ["dsh", { id: "dsh", label: "DeepSeek Harness" }],
]);
const ISOLATE_MCP = /(?:agent[-_ ]?chrome|browser|chrome|chromium|playwright|puppeteer|filesystem|file[-_ ]?system|shell|terminal|sqlite|database|git(?:hub)?[-_ ]?(?:write|admin))/i;
const REVIEW_MCP = /(?:gmail|email|mail|calendar|drive|notion|slack|teams|discord|telegram|credential|oauth)/i;

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeRatio(value, limit) {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.min(value / limit, 10);
}

function isWithinHome(path, home) {
  if (!path || !home || !isAbsolute(path)) return false;
  const rel = relative(resolve(home), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function isWithinHomeResolved(path, home, fsApi) {
  if (!isWithinHome(path, home)) return false;
  if (typeof fsApi.realpath !== "function") return true;
  try {
    const [resolvedPath, resolvedHome] = await Promise.all([fsApi.realpath(path), fsApi.realpath(home)]);
    return isWithinHome(resolvedPath, resolvedHome);
  } catch {
    return false;
  }
}

function optionValue(tokens, name, fallback = null) {
  const equalsPrefix = `${name}=`;
  for (let index = 0; index < tokens.length; index++) {
    const token = String(tokens[index]);
    if (token.startsWith(equalsPrefix)) return token.slice(equalsPrefix.length);
    if (token === name && index + 1 < tokens.length) return String(tokens[index + 1]);
  }
  return fallback;
}

function hasFlag(tokens, name) {
  return tokens.some(token => token === name || String(token).startsWith(`${name}=`));
}

export function parseOneMcpFlags(tokens = []) {
  const port = finiteNumber(optionValue(tokens, "--port", 3050));
  const host = optionValue(tokens, "--host", "127.0.0.1");
  return {
    configPath: optionValue(tokens, "--config"),
    host,
    port: port !== null && port <= 65535 ? port : 3050,
    transport: optionValue(tokens, "--transport", "http"),
    asyncLoading: hasFlag(tokens, "--enable-async-loading"),
    lazyLoading: hasFlag(tokens, "--enable-lazy-loading"),
    lazyMode: optionValue(tokens, "--lazy-mode", "full"),
    configReload: hasFlag(tokens, "--enable-config-reload"),
    sessionPersistence: hasFlag(tokens, "--enable-session-persistence"),
  };
}

export function commandLineHasSecret(tokens = []) {
  const isSecretOption = name => SECRET_OPTION_NAME.test(name) && !NON_SECRET_OPTION.test(name);
  for (let index = 0; index < tokens.length; index++) {
    const token = String(tokens[index]);
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 0 && isSecretOption(token.slice(0, equalsIndex))) return true;
    if (/[?&](?:api[_-]?key|token|secret|password|auth)=/i.test(token)) return true;
    if (token.startsWith("-") && isSecretOption(token)) {
      const next = String(tokens[index + 1] || "");
      if (next && !next.startsWith("-") && !BOOLEAN_TEXT.test(next)) return true;
    }
  }
  return false;
}

function npxPackageSpec(config) {
  const command = basename(String(config?.command || "")).toLowerCase();
  const args = Array.isArray(config?.args) ? config.args.map(String) : [];
  let candidates = args;
  if (command === "npm" && args[0] === "exec") candidates = args.slice(1);
  else if (command !== "npx") return null;
  return candidates.find(arg => !arg.startsWith("-") && arg !== "exec") || null;
}

function hasExactPackageVersion(spec) {
  if (!spec) return false;
  const version = spec.startsWith("@")
    ? spec.match(/^@[^/]+\/[^@]+@(.+)$/)?.[1]
    : spec.match(/^[^@]+@(.+)$/)?.[1];
  return Boolean(version && /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version));
}

export function analyzeOneMcpConfig(config = {}) {
  const entries = Object.entries(config.mcpServers || config.servers || {});
  let enabledCount = 0;
  let floatingNpxCount = 0;
  let secretEnvKeyCount = 0;

  for (const [, server] of entries) {
    if (server?.disabled === true) continue;
    enabledCount++;
    const spec = npxPackageSpec(server);
    if (spec && !hasExactPackageVersion(spec)) floatingNpxCount++;
    for (const key of Object.keys(server?.env || {})) {
      if (SECRET_NAME.test(key)) secretEnvKeyCount++;
    }
  }

  return {
    configuredCount: entries.length,
    enabledCount,
    disabledCount: entries.length - enabledCount,
    floatingNpxCount,
    secretEnvKeyCount,
  };
}

export function buildRuntimeFindings(report) {
  const findings = [];
  const resources = report.resources || {};
  const inventory = report.inventory || {};
  const features = report.features || {};

  if (report.runtime?.unhealthyServers > 0) {
    findings.push({
      code: "unhealthy-upstreams", severity: "high",
      title: `${report.runtime.unhealthyServers} upstream server${report.runtime.unhealthyServers === 1 ? " is" : "s are"} unhealthy`,
      detail: "The shared runtime is reachable, but at least one configured MCP backend failed its health check.",
    });
  }
  if (report.exposure?.commandLineSecretProcesses > 0) {
    findings.push({
      code: "command-line-secret", severity: "high",
      title: "Credential material is visible in a process command line",
      detail: `${report.exposure.commandLineSecretProcesses} runtime process instance${report.exposure.commandLineSecretProcesses === 1 ? " has" : "s have"} a credential-shaped command-line argument. One credential may be repeated across parent and child processes. Other same-user processes and diagnostic tools can read it. Move the value to a protected environment or secret store and rotate the exposed credential.`,
    });
  }
  if (inventory.floatingNpxCount > 0) {
    findings.push({
      code: "floating-npx", severity: "medium",
      title: `${inventory.floatingNpxCount} npx server${inventory.floatingNpxCount === 1 ? " uses" : "s use"} a floating package version`,
      detail: "Pin exact package versions so a restart cannot silently execute a different upstream release.",
    });
  }
  if (resources.memoryMaxRatio !== null && resources.memoryMaxRatio >= 0.8) {
    findings.push({
      code: "memory-max", severity: "high", title: "Runtime memory is close to its hard limit",
      detail: `${Math.round(resources.memoryMaxRatio * 100)}% of the configured hard memory limit is in use. New MCP work may be killed by the service manager.`,
    });
  } else if (resources.memoryHighRatio !== null && resources.memoryHighRatio >= 0.8) {
    findings.push({
      code: "memory-high", severity: "medium", title: "Runtime memory is in the pressure zone",
      detail: `${Math.round(resources.memoryHighRatio * 100)}% of the configured soft memory limit is in use.`,
    });
  }
  if (resources.taskRatio !== null && resources.taskRatio >= 0.65) {
    findings.push({
      code: "task-pressure", severity: resources.taskRatio >= 0.85 ? "high" : "medium",
      title: "Runtime task count is approaching its limit",
      detail: `${Math.round(resources.taskRatio * 100)}% of the configured task limit is in use across the shared process group.`,
    });
  }
  if (!features.lazyLoading && inventory.enabledCount >= 10) {
    findings.push({
      code: "lazy-loading-off", severity: "info", title: "Lazy tool loading is off",
      detail: `${inventory.enabledCount} upstream servers load into the shared runtime. 1MCP lazy loading can reduce the tool schema surface exposed to each agent session.`,
    });
  }
  return findings;
}

async function readText(path, fsApi) {
  try { return await fsApi.readFile(path, "utf8"); } catch { return null; }
}

function parseCmdline(content) {
  if (content === null || content === undefined) return [];
  return String(content).split("\0").filter(Boolean);
}

function parseCgroupPath(content) {
  for (const line of String(content || "").split(/\r?\n/)) {
    const match = line.match(/^\d+::(.+)$/);
    if (match) return match[1];
  }
  return null;
}

function parseProcessUid(content) {
  const match = String(content || "").match(/^Uid:\s+(\d+)/m);
  return match ? Number(match[1]) : null;
}

function statusField(content, name) {
  return String(content || "").match(new RegExp(`^${name}:\\s+([^\\n]+)`, "m"))?.[1]?.trim() || null;
}

function parseProcessStatus(content) {
  const memoryKb = finiteNumber(statusField(content, "VmRSS")?.match(/^(\d+)/)?.[1]);
  const ppid = finiteNumber(statusField(content, "PPid"));
  const threads = finiteNumber(statusField(content, "Threads"));
  return {
    name: statusField(content, "Name") || "process",
    state: statusField(content, "State")?.slice(0, 1) || "?",
    uid: parseProcessUid(content),
    ppid: ppid === null ? 0 : ppid,
    memoryBytes: memoryKb === null ? 0 : memoryKb * 1024,
    threads: threads === null ? 1 : threads,
  };
}

function parseProcessStartTicks(content) {
  const text = String(content || "");
  const close = text.lastIndexOf(")");
  if (close < 0) return null;
  const fields = text.slice(close + 1).trim().split(/\s+/);
  return finiteNumber(fields[19]);
}

function harnessForProcess(processInfo) {
  const candidates = [processInfo.name, basename(String(processInfo.tokens?.[0] || ""))];
  for (const candidate of candidates) {
    const normalized = String(candidate).toLowerCase().replace(/\.exe$/, "");
    if (HARNESS_EXECUTABLES.has(normalized)) return HARNESS_EXECUTABLES.get(normalized);
  }
  return null;
}

function isHarnessMcpServer(processInfo) {
  const args = (processInfo.tokens || []).slice(1).map(value => String(value).toLowerCase());
  if (args.includes("mcp-server")) return true;
  const mcpIndex = args.indexOf("mcp");
  return mcpIndex >= 0 && args[mcpIndex + 1] === "serve";
}

async function collectProcessSnapshot(procRoot, currentUid, fsApi, clockTicks = 100) {
  const pids = await listPids(procRoot, fsApi);
  const uptimeSeconds = finiteNumber((await readText(join(procRoot, "uptime"), fsApi))?.trim().split(/\s+/)[0]);
  const processes = new Map();

  for (let offset = 0; offset < pids.length; offset += 64) {
    await Promise.all(pids.slice(offset, offset + 64).map(async pidText => {
      const [statusText, cmdlineText, cgroupText, statText] = await Promise.all([
        readText(join(procRoot, pidText, "status"), fsApi),
        readText(join(procRoot, pidText, "cmdline"), fsApi),
        readText(join(procRoot, pidText, "cgroup"), fsApi),
        readText(join(procRoot, pidText, "stat"), fsApi),
      ]);
      const status = parseProcessStatus(statusText);
      if (currentUid !== null && status.uid !== currentUid) return;
      const startTicks = parseProcessStartTicks(statText);
      const ageSeconds = uptimeSeconds !== null && startTicks !== null && clockTicks > 0
        ? Math.max(0, Math.floor(uptimeSeconds - startTicks / clockTicks))
        : null;
      const pid = Number(pidText);
      processes.set(pid, {
        pid,
        ...status,
        tokens: parseCmdline(cmdlineText),
        cgroupPath: parseCgroupPath(cgroupText),
        startTicks,
        ageSeconds,
      });
    }));
  }

  return processes;
}

function sessionIdFor(processInfo, harness) {
  return `${harness.id}:${processInfo.pid}:${processInfo.startTicks ?? "unknown"}`;
}

function nearestSession(processInfo, sessionByPid, processes) {
  let cursor = processInfo;
  const seen = new Set();
  while (cursor && !seen.has(cursor.pid)) {
    seen.add(cursor.pid);
    if (sessionByPid.has(cursor.pid)) return sessionByPid.get(cursor.pid);
    cursor = processes.get(cursor.ppid);
  }
  return null;
}

function safeProcessState(state) {
  if (state === "R") return "running";
  if (state === "Z") return "zombie";
  if (state === "T" || state === "t") return "stopped";
  if (state === "D") return "waiting";
  return "sleeping";
}

function buildSessions(processes, currentPid = process.pid) {
  const roots = [...processes.values()]
    .map(processInfo => ({ processInfo, harness: harnessForProcess(processInfo) }))
    .filter(entry => entry.harness && entry.processInfo.state !== "Z" && !isHarnessMcpServer(entry.processInfo))
    .sort((a, b) => a.processInfo.pid - b.processInfo.pid);
  const sessionByPid = new Map();
  const harnessCounts = new Map();
  const sessions = roots.map(({ processInfo, harness }) => {
    const harnessIndex = (harnessCounts.get(harness.id) || 0) + 1;
    harnessCounts.set(harness.id, harnessIndex);
    const session = {
      id: sessionIdFor(processInfo, harness),
      harness: harness.id,
      label: `${harness.label} #${harnessIndex}`,
      pid: processInfo.pid,
      state: safeProcessState(processInfo.state),
      ageSeconds: processInfo.ageSeconds,
      rootMemoryBytes: processInfo.memoryBytes,
      memoryBytes: 0,
      processCount: 0,
      threadCount: 0,
      controllable: true,
      mcpServers: [],
    };
    sessionByPid.set(processInfo.pid, session);
    return session;
  });

  const assignment = new Map();
  for (const processInfo of processes.values()) {
    const session = nearestSession(processInfo, sessionByPid, processes);
    if (!session) continue;
    assignment.set(processInfo.pid, session.id);
    session.memoryBytes += processInfo.memoryBytes;
    session.processCount++;
    session.threadCount += processInfo.threads;
  }

  // A harness can be nested inside another harness (for example,
  // Claude Code -> Codex -> CCO). Protect every session root on the CCO
  // process's ancestor chain so stopping an outer session cannot terminate
  // the server that is handling the request.
  let cursor = processes.get(currentPid);
  const seen = new Set();
  while (cursor && !seen.has(cursor.pid)) {
    seen.add(cursor.pid);
    const session = sessionByPid.get(cursor.pid);
    if (session) session.controllable = false;
    cursor = processes.get(cursor.ppid);
  }
  for (const session of sessions) {
    session.attention = [];
    if (session.memoryBytes >= 768 * 1024 * 1024) session.attention.push("high-memory");
    if (session.ageSeconds !== null && session.ageSeconds >= 24 * 60 * 60) session.attention.push("long-lived");
  }
  return { sessions, assignment };
}

function normalizedPackageMarker(config = {}) {
  const command = basename(String(config.command || "").trim().split(/\s+/)[0] || "").toLowerCase();
  const args = Array.isArray(config.args)
    ? config.args.map(value => String(value))
    : typeof config.command === "string"
      ? config.command.trim().split(/\s+/).slice(1)
      : [];
  let meaningful;
  if (command === "uv") {
    const runIndex = args.indexOf("run");
    meaningful = runIndex >= 0 ? args.slice(runIndex + 1).find(value => !value.startsWith("-")) : null;
  } else if (command === "npm") {
    const execIndex = args.indexOf("exec");
    meaningful = args.slice(execIndex >= 0 ? execIndex + 1 : 0).find(value => !value.startsWith("-"));
  } else {
    meaningful = args.find(value => !value.startsWith("-") && value !== "exec");
  }
  const marker = meaningful
    ? basename(meaningful.replace(/@(?:latest|next|canary|\d[^/]*)$/, ""))
    : command;
  const meaningfulText = String(meaningful || "");
  const fullPath = meaningfulText.includes("/") || meaningfulText.includes("\\")
    ? meaningfulText.replaceAll("\\", "/")
    : null;
  return { command, marker: String(marker || "").toLowerCase(), fullPath };
}

function recommendationForMcp(name, config = {}) {
  const { marker } = normalizedPackageMarker(config);
  const subject = `${name} ${marker}`;
  if (ISOLATE_MCP.test(subject)) {
    return {
      policy: "isolate",
      reason: "Browser, filesystem, shell, or mutable local state can collide across agent sessions.",
    };
  }
  if (REVIEW_MCP.test(subject)) {
    return {
      policy: "review",
      reason: "Sharing can save memory, but every session would use the same account, credentials, and server-side state.",
    };
  }
  return {
    policy: "shared-candidate",
    reason: "No session-bound browser or local-state marker was detected; verify the server's own concurrency contract before sharing.",
  };
}

function mcpIdentity(name, config = {}) {
  const safeConfig = {
    command: config.command || null,
    args: Array.isArray(config.args) ? config.args : null,
    url: config.url || null,
    type: config.type || null,
  };
  const digest = createHash("sha256").update(JSON.stringify(safeConfig)).digest("hex").slice(0, 12);
  return digest;
}

function buildMcpMatchers(mcpItems = []) {
  const seen = new Set();
  const matchers = [];
  for (const item of mcpItems) {
    if (item?.category && item.category !== "mcp") continue;
    const config = item?.mcpConfig || item?.config || {};
    if (!config.command) continue;
    const { command, marker, fullPath } = normalizedPackageMarker(config);
    const identity = mcpIdentity(item.name, config);
    if (seen.has(identity)) continue;
    seen.add(identity);
    matchers.push({
      identity,
      name: String(item.name || marker || command || "MCP server"),
      command,
      marker,
      fullPath,
      recommendation: recommendationForMcp(item.name, config),
    });
  }
  return matchers;
}

function processMatchesMcp(processInfo, matcher) {
  const rawTokens = processInfo.tokens.map(String);
  if (matcher.fullPath) {
    return rawTokens.some(token => token.replaceAll("\\", "/") === matcher.fullPath);
  }
  const tokens = rawTokens.map(token => token.toLowerCase());
  const tokenNames = tokens.map(token => basename(token));
  const packageMarkers = tokenNames.map(token => token.replace(/@(?:latest|next|canary|\d[^/]*)$/, ""));
  if (matcher.marker && matcher.marker.length >= 3 && (tokens.includes(matcher.marker) || tokenNames.includes(matcher.marker) || packageMarkers.includes(matcher.marker))) {
    return true;
  }
  return matcher.command && !GENERIC_RUNNERS.has(matcher.command) && tokenNames[0] === matcher.command;
}

function descendantsOf(rootPid, processes, allowedSessionId, assignment) {
  const result = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const processInfo of processes.values()) {
      if (result.has(processInfo.pid) || !result.has(processInfo.ppid)) continue;
      if (assignment.get(processInfo.pid) !== allowedSessionId) continue;
      result.add(processInfo.pid);
      changed = true;
    }
  }
  return result;
}

function attachDirectMcpProcesses(sessions, assignment, processes, matchers) {
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const claimedPids = new Set();
  for (const matcher of matchers) {
    const matches = [...processes.values()].filter(processInfo => {
      const sessionId = assignment.get(processInfo.pid);
      return sessionId && !claimedPids.has(processInfo.pid) && processMatchesMcp(processInfo, matcher);
    });
    const matchedPids = new Set(matches.map(processInfo => processInfo.pid));
    const roots = matches.filter(processInfo => !matchedPids.has(processInfo.ppid));
    for (const root of roots) {
      const sessionId = assignment.get(root.pid);
      const session = sessionById.get(sessionId);
      if (!session) continue;
      let entry = session.mcpServers.find(server => server.identity === matcher.identity);
      if (!entry) {
        entry = {
          identity: matcher.identity,
          name: matcher.name,
          mode: "direct",
          instanceCount: 0,
          processCount: 0,
          memoryBytes: 0,
          ...matcher.recommendation,
        };
        session.mcpServers.push(entry);
      }
      const owned = descendantsOf(root.pid, processes, sessionId, assignment);
      for (const pid of owned) claimedPids.add(pid);
      entry.instanceCount++;
      entry.processCount += owned.size;
      for (const pid of owned) entry.memoryBytes += processes.get(pid)?.memoryBytes || 0;
    }
  }
}

function buildDuplicateMcpSummary(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    for (const server of session.mcpServers) {
      if (!groups.has(server.identity)) groups.set(server.identity, { ...server, sessions: [], memoryBytes: 0, instanceCount: 0 });
      const group = groups.get(server.identity);
      group.sessions.push({ id: session.id, label: session.label });
      group.memoryBytes += server.memoryBytes;
      group.instanceCount += server.instanceCount;
    }
  }
  return [...groups.values()]
    .filter(group => group.sessions.length > 1 || group.instanceCount > 1)
    .map(({ identity, name, policy, reason, sessions: groupSessions, memoryBytes, instanceCount }) => ({
      identity, name, policy, reason, sessions: groupSessions, memoryBytes, instanceCount,
    }))
    .sort((a, b) => b.memoryBytes - a.memoryBytes || a.name.localeCompare(b.name));
}

function parseTcpClientInodes(content, targetPort) {
  const inodes = new Set();
  for (const line of String(content || "").split(/\r?\n/).slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10 || fields[3] !== "01") continue;
    const remotePort = Number.parseInt(fields[2]?.split(":").at(-1) || "", 16);
    if (remotePort !== targetPort) continue;
    const inode = fields[9];
    if (/^\d+$/.test(inode)) inodes.add(inode);
  }
  return inodes;
}

async function findConnectedSessions(port, procRoot, processes, assignment, fsApi) {
  if (!Number.isInteger(port) || typeof fsApi.readlink !== "function") {
    return { sessionIds: [], evidence: "unavailable" };
  }
  const [tcp, tcp6] = await Promise.all([
    readText(join(procRoot, "net", "tcp"), fsApi),
    readText(join(procRoot, "net", "tcp6"), fsApi),
  ]);
  const inodes = new Set([
    ...parseTcpClientInodes(tcp, port),
    ...parseTcpClientInodes(tcp6, port),
  ]);
  if (!inodes.size) return { sessionIds: [], evidence: "tcp-snapshot" };

  const sessionIds = new Set();
  await Promise.all([...assignment.keys()].map(async pid => {
    let entries;
    try { entries = await fsApi.readdir(join(procRoot, String(pid), "fd")); } catch { return; }
    for (const entry of entries) {
      let target;
      try { target = await fsApi.readlink(join(procRoot, String(pid), "fd", String(entry))); } catch { continue; }
      const inode = String(target).match(/^socket:\[(\d+)\]$/)?.[1];
      if (inode && inodes.has(inode)) sessionIds.add(assignment.get(pid));
    }
  }));
  return { sessionIds: [...sessionIds].filter(Boolean), evidence: "tcp-snapshot" };
}

function objectContainsIntentProbeHook(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return false;
  if (typeof value === "string") return /intentprobe(?:-hook)?\s+runtime\s+(?:scan|serve-jsonl)/i.test(value);
  if (Array.isArray(value)) return value.some(item => objectContainsIntentProbeHook(item, depth + 1));
  if (typeof value === "object") return Object.values(value).some(item => objectContainsIntentProbeHook(item, depth + 1));
  return false;
}

async function executableExists(name, runtimeEnv, fsApi) {
  if (typeof fsApi.access !== "function") return false;
  const directories = String(runtimeEnv.PATH || "").split(":").filter(Boolean);
  for (const directory of directories) {
    try {
      await fsApi.access(join(directory, name), fsConstants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

async function collectIntentProbeStatus(home, runtimeEnv, processes, fsApi) {
  const daemonRunning = [...processes.values()].some(processInfo =>
    processInfo.tokens.some(token => /(?:^|\/)intentprobe(?:-hook)?$/.test(String(token))) &&
    processInfo.tokens.includes("serve-jsonl")
  );
  const installed = daemonRunning || await executableExists("intentprobe", runtimeEnv, fsApi) || await executableExists("intentprobe-hook", runtimeEnv, fsApi);
  let hookConfigured = false;
  for (const path of [join(home, ".claude", "settings.json"), join(home, ".claude", "settings.local.json")]) {
    const text = await readText(path, fsApi);
    if (!text) continue;
    try {
      if (objectContainsIntentProbeHook(JSON.parse(text))) {
        hookConfigured = true;
        break;
      }
    } catch {}
  }
  return {
    installed,
    daemonRunning,
    hookConfigured,
    eventBoundaryScanning: installed && hookConfigured,
    receiptIngestion: "not-connected",
    supportedEvents: ["tool_definition", "before_tool_call", "after_tool_call"],
  };
}

function sharedServerInventory(config = {}) {
  return Object.entries(config.mcpServers || config.servers || {})
    .filter(([, server]) => server?.disabled !== true)
    .map(([name, server]) => ({
      identity: mcpIdentity(name, server),
      name,
      mode: "shared",
      ...recommendationForMcp(name, server),
    }));
}

function isOneMcpServe(tokens) {
  return tokens.includes("serve") && tokens.some(token => basename(String(token)) === "1mcp");
}

async function listPids(procRoot, fsApi) {
  try {
    return (await fsApi.readdir(procRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

function findOneMcpProcess(processes, home) {
  for (const processInfo of processes.values()) {
    if (!isOneMcpServe(processInfo.tokens)) continue;
    const flags = parseOneMcpFlags(processInfo.tokens);
    if (flags.configPath && !isWithinHome(flags.configPath, home)) continue;
    return { pid: processInfo.pid, flags, cgroupPath: processInfo.cgroupPath };
  }
  return null;
}

async function readCounter(path, fsApi) {
  const value = (await readText(path, fsApi))?.trim();
  if (!value || value === "max") return null;
  return finiteNumber(value);
}

export async function collectProcessGroup(runtime, processes, cgroupRoot, fsApi) {
  const tree = new Set([runtime.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const processInfo of processes.values()) {
      if (tree.has(processInfo.pid) || !tree.has(processInfo.ppid)) continue;
      tree.add(processInfo.pid);
      changed = true;
    }
  }
  let processCount = 0;
  let commandLineSecretProcesses = 0;
  for (const processInfo of processes.values()) {
    if (!tree.has(processInfo.pid)) continue;
    processCount++;
    if (commandLineHasSecret(processInfo.tokens)) commandLineSecretProcesses++;
  }

  const sharedCgroup = !runtime.cgroupPath || [...processes.values()].some(processInfo =>
    processInfo.cgroupPath === runtime.cgroupPath && !tree.has(processInfo.pid)
  );
  if (sharedCgroup) return {
    processCount, taskCount: null, taskMax: null, memoryBytes: null,
    memoryHighBytes: null, memoryMaxBytes: null, commandLineSecretProcesses,
  };

  const counterRoot = resolve(cgroupRoot, runtime.cgroupPath.replace(/^\/+/, ""));
  if (!isWithinHome(counterRoot, cgroupRoot)) return {
    processCount, taskCount: null, taskMax: null, memoryBytes: null,
    memoryHighBytes: null, memoryMaxBytes: null, commandLineSecretProcesses,
  };
  return {
    processCount,
    taskCount: await readCounter(join(counterRoot, "pids.current"), fsApi),
    taskMax: await readCounter(join(counterRoot, "pids.max"), fsApi),
    memoryBytes: await readCounter(join(counterRoot, "memory.current"), fsApi),
    memoryHighBytes: await readCounter(join(counterRoot, "memory.high"), fsApi),
    memoryMaxBytes: await readCounter(join(counterRoot, "memory.max"), fsApi),
    commandLineSecretProcesses,
  };
}

export async function fetchLoopbackHealth(host, port, timeoutMs = 900) {
  if (!LOOPBACK_HOSTS.has(host) || !Number.isInteger(port)) return null;
  return new Promise(resolveHealth => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolveHealth(value);
    };
    const request = http.get({ hostname: host, port, path: "/health", timeout: timeoutMs }, response => {
      let body = "";
      let bodyBytes = 0;
      response.setEncoding("utf8");
      response.on("data", chunk => {
        bodyBytes += Buffer.byteLength(chunk, "utf8");
        if (bodyBytes > 65536) {
          finish(null);
          request.destroy();
          return;
        }
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) return finish(null);
        try { finish(JSON.parse(body)); } catch { finish(null); }
      });
      response.on("aborted", () => finish(null));
      response.on("error", () => finish(null));
      response.on("close", () => finish(null));
    });
    request.on("timeout", () => { request.destroy(); finish(null); });
    request.on("error", () => finish(null));
  });
}

/**
 * Collect a privacy-bounded report. Dependency injection keeps procfs and the
 * loopback request deterministic in tests.
 */
export async function collectRuntimeDoctorReport(options = {}) {
  const runtimeHome = options.home || homedir();
  const runtimeEnv = options.env || process.env;
  const runtimePlatform = options.platform || process.platform;
  const fsApi = options.fs || { access, readFile, readdir, readlink, realpath };
  const procRoot = options.procRoot || "/proc";
  const cgroupRoot = options.cgroupRoot || "/sys/fs/cgroup";
  const healthFetcher = options.healthFetcher || fetchLoopbackHealth;
  const currentUid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : null);

  if (runtimeEnv.CCO_RUNTIME_DOCTOR_DISABLED === "1" || runtimePlatform !== "linux") {
    return {
      ok: true,
      detected: false,
      supported: runtimePlatform === "linux",
      findings: [],
      topology: { sessions: [], duplicateDirectMcps: [], sharedRuntimes: [] },
    };
  }

  const processes = await collectProcessSnapshot(procRoot, currentUid, fsApi, options.clockTicks || 100);
  const { sessions, assignment } = buildSessions(processes, options.currentPid ?? process.pid);
  const matchers = buildMcpMatchers(options.mcpItems || []);
  attachDirectMcpProcesses(sessions, assignment, processes, matchers);
  const intentProbe = await collectIntentProbeStatus(runtimeHome, runtimeEnv, processes, fsApi);
  const baseReport = {
    ok: true,
    detected: false,
    supported: true,
    methodology: {
      version: 2,
      readOnly: true,
      secretValuesReturned: false,
      memory: "sum of same-user VmRSS assigned to the nearest harness process",
      directMcpAttribution: "configured command markers matched inside each session process tree",
      sharedClientAttribution: "live loopback TCP socket snapshot; short-lived requests may be missed",
      semanticActivity: "requires IntentProbe event receipts; process names are not treated as intent",
    },
    topology: {
      sessions,
      duplicateDirectMcps: buildDuplicateMcpSummary(sessions),
      sharedRuntimes: [],
    },
    intentProbe,
    findings: [],
  };

  const runtime = findOneMcpProcess(processes, runtimeHome);
  if (!runtime) return baseReport;

  const defaultConfigPath = join(runtimeEnv.XDG_CONFIG_HOME || join(runtimeHome, ".config"), "1mcp", "mcp.json");
  const configPath = runtime.flags.configPath || runtimeEnv.ONE_MCP_CONFIG || defaultConfigPath;
  if (!await isWithinHomeResolved(configPath, runtimeHome, fsApi)) {
    return baseReport;
  }

  let config = {};
  const configText = await readText(configPath, fsApi);
  if (configText) {
    try { config = JSON.parse(configText); } catch { config = {}; }
  }
  const inventory = analyzeOneMcpConfig(config);
  const group = await collectProcessGroup(runtime, processes, cgroupRoot, fsApi);
  const health = runtime.flags.transport === "http"
    ? await healthFetcher(runtime.flags.host, runtime.flags.port)
    : null;
  const connectionEvidence = runtime.flags.transport === "http" && LOOPBACK_HOSTS.has(runtime.flags.host)
    ? await findConnectedSessions(runtime.flags.port, procRoot, processes, assignment, fsApi)
    : { sessionIds: [], evidence: "unavailable" };
  const sessionLabels = new Map(sessions.map(session => [session.id, session.label]));

  const resources = {
    memoryBytes: group.memoryBytes,
    memoryHighBytes: group.memoryHighBytes,
    memoryMaxBytes: group.memoryMaxBytes,
    memoryHighRatio: safeRatio(group.memoryBytes, group.memoryHighBytes),
    memoryMaxRatio: safeRatio(group.memoryBytes, group.memoryMaxBytes),
    processCount: group.processCount,
    taskCount: group.taskCount,
    taskMax: group.taskMax,
    taskRatio: safeRatio(group.taskCount, group.taskMax),
  };
  const report = {
    ...baseReport,
    detected: true,
    runtime: {
      name: "1MCP",
      status: typeof health?.status === "string" ? health.status : "running",
      version: typeof health?.version === "string" ? health.version : null,
      transport: runtime.flags.transport,
      host: LOOPBACK_HOSTS.has(runtime.flags.host) ? runtime.flags.host : "non-loopback",
      port: runtime.flags.port,
      uptimeSeconds: finiteNumber(health?.system?.uptime),
      healthyServers: finiteNumber(health?.servers?.healthy),
      unhealthyServers: finiteNumber(health?.servers?.unhealthy) || 0,
    },
    inventory,
    resources,
    features: {
      asyncLoading: runtime.flags.asyncLoading,
      lazyLoading: runtime.flags.lazyLoading,
      lazyMode: runtime.flags.lazyMode,
      configReload: runtime.flags.configReload,
      sessionPersistence: runtime.flags.sessionPersistence,
    },
    exposure: { commandLineSecretProcesses: group.commandLineSecretProcesses },
  };
  report.topology.sharedRuntimes.push({
    id: "1mcp",
    name: "1MCP",
    serverCount: inventory.enabledCount,
    memoryBytes: resources.memoryBytes,
    processCount: resources.processCount,
    connectedSessions: connectionEvidence.sessionIds.map(id => ({ id, label: sessionLabels.get(id) || "Agent session" })),
    connectionEvidence: connectionEvidence.evidence,
    servers: sharedServerInventory(config),
  });
  report.findings = buildRuntimeFindings(report);
  return report;
}

/**
 * Gracefully ask one still-identical harness root to stop. The opaque session
 * id includes procfs start ticks, preventing a recycled PID from being killed.
 */
export async function stopRuntimeSession(sessionId, options = {}) {
  const runtimePlatform = options.platform || process.platform;
  if (runtimePlatform !== "linux") return { ok: false, error: "Session stop is currently supported on Linux only" };
  const runtimeEnv = options.env || process.env;
  if (runtimeEnv.CCO_RUNTIME_DOCTOR_DISABLED === "1") return { ok: false, error: "Runtime Doctor is disabled" };
  const fsApi = options.fs || { access, readFile, readdir, readlink, realpath };
  const procRoot = options.procRoot || "/proc";
  const currentUid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : null);
  const processes = await collectProcessSnapshot(procRoot, currentUid, fsApi, options.clockTicks || 100);
  const { sessions } = buildSessions(processes, options.currentPid ?? process.pid);
  const session = sessions.find(candidate => candidate.id === sessionId);
  if (!session) return { ok: false, error: "That session ended or changed identity; refresh the runtime map" };
  if (!session.controllable) return { ok: false, error: "CCO is running inside that session and will not stop its own process tree" };
  if (!Number.isInteger(session.pid) || session.pid <= 1) return { ok: false, error: "Invalid session process" };
  const [freshStatusText, freshCmdlineText, freshStatText] = await Promise.all([
    readText(join(procRoot, String(session.pid), "status"), fsApi),
    readText(join(procRoot, String(session.pid), "cmdline"), fsApi),
    readText(join(procRoot, String(session.pid), "stat"), fsApi),
  ]);
  const freshStatus = parseProcessStatus(freshStatusText);
  const freshProcess = {
    ...freshStatus,
    pid: session.pid,
    tokens: parseCmdline(freshCmdlineText),
    startTicks: parseProcessStartTicks(freshStatText),
  };
  const freshHarness = harnessForProcess(freshProcess);
  if (freshStatus.uid !== currentUid || !freshHarness || sessionIdFor(freshProcess, freshHarness) !== session.id) {
    return { ok: false, error: "That session ended or changed identity; refresh the runtime map" };
  }
  const sendSignal = options.sendSignal || ((pid, signal) => process.kill(pid, signal));
  try {
    sendSignal(session.pid, "SIGTERM");
  } catch (error) {
    return { ok: false, error: error?.code === "ESRCH" ? "That session already ended" : "The session could not be stopped" };
  }
  return {
    ok: true,
    sessionId: session.id,
    signal: "SIGTERM",
    message: `Asked ${session.label} to stop gracefully`,
  };
}
