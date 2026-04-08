/**
 * backup-scheduler.mjs — Install/remove/status systemd timer (Linux) or launchd plist (macOS).
 * Used by Backup Center in CCO and by the standalone claude-code-backup CLI.
 */

import { writeFile, mkdir, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const HOME = homedir();
const SERVICE_NAME = "claude-code-backup";

// ── Linux (systemd user timer) ──────────────────────────────────────

function systemdDir() {
  return join(HOME, ".config", "systemd", "user");
}

function serviceContent(nodePath, cliPath) {
  return `[Unit]
Description=Claude Code Backup — scan and push settings to GitHub

[Service]
Type=oneshot
ExecStart=${nodePath} ${cliPath} run --quiet
Environment=HOME=${HOME}
`;
}

function timerContent(intervalHours) {
  return `[Unit]
Description=Claude Code Backup Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=${intervalHours}h
Persistent=true

[Install]
WantedBy=timers.target
`;
}

async function installSystemd(nodePath, cliPath, intervalHours) {
  const dir = systemdDir();
  await mkdir(dir, { recursive: true });

  await writeFile(join(dir, `${SERVICE_NAME}.service`), serviceContent(nodePath, cliPath));
  await writeFile(join(dir, `${SERVICE_NAME}.timer`), timerContent(intervalHours));

  await exec("systemctl", ["--user", "daemon-reload"]);
  await exec("systemctl", ["--user", "enable", "--now", `${SERVICE_NAME}.timer`]);

  return {
    servicePath: join(dir, `${SERVICE_NAME}.service`),
    timerPath: join(dir, `${SERVICE_NAME}.timer`),
  };
}

async function removeSystemd() {
  try { await exec("systemctl", ["--user", "disable", "--now", `${SERVICE_NAME}.timer`]); } catch {}
  const dir = systemdDir();
  try { await unlink(join(dir, `${SERVICE_NAME}.service`)); } catch {}
  try { await unlink(join(dir, `${SERVICE_NAME}.timer`)); } catch {}
  try { await exec("systemctl", ["--user", "daemon-reload"]); } catch {}
}

async function statusSystemd() {
  try {
    const { stdout } = await exec("systemctl", [
      "--user", "status", `${SERVICE_NAME}.timer`, "--no-pager",
    ]);
    return stdout;
  } catch (err) {
    return err.stdout || err.stderr || "Timer not installed";
  }
}

async function isInstalledSystemd() {
  try {
    await access(join(systemdDir(), `${SERVICE_NAME}.timer`));
    return true;
  } catch {
    return false;
  }
}

async function getNodeAndCliPathSystemd() {
  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(join(systemdDir(), `${SERVICE_NAME}.service`), "utf-8");
    const match = content.match(/ExecStart=(\S+)\s+(\S+)\s+run/);
    if (match) return { nodePath: match[1], cliPath: match[2] };
  } catch {}
  return null;
}

// ── macOS (launchd plist) ───────────────────────────────────────────

function launchdDir() {
  return join(HOME, "Library", "LaunchAgents");
}

function plistLabel() {
  return `com.mcpware.${SERVICE_NAME}`;
}

function plistContent(nodePath, cliPath, intervalSeconds) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistLabel()}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliPath}</string>
    <string>run</string>
    <string>--quiet</string>
  </array>
  <key>StartInterval</key>
  <integer>${intervalSeconds}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/.claude-backups/backup.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/.claude-backups/backup.log</string>
</dict>
</plist>
`;
}

async function installLaunchd(nodePath, cliPath, intervalHours) {
  const dir = launchdDir();
  await mkdir(dir, { recursive: true });
  const plistPath = join(dir, `${plistLabel()}.plist`);
  await writeFile(plistPath, plistContent(nodePath, cliPath, intervalHours * 3600));
  try { await exec("launchctl", ["unload", plistPath]); } catch {}
  await exec("launchctl", ["load", plistPath]);
  return { plistPath };
}

async function removeLaunchd() {
  const plistPath = join(launchdDir(), `${plistLabel()}.plist`);
  try { await exec("launchctl", ["unload", plistPath]); } catch {}
  try { await unlink(plistPath); } catch {}
}

async function statusLaunchd() {
  try {
    const { stdout } = await exec("launchctl", ["list", plistLabel()]);
    return stdout;
  } catch {
    return "LaunchAgent not installed";
  }
}

async function isInstalledLaunchd() {
  try {
    await access(join(launchdDir(), `${plistLabel()}.plist`));
    return true;
  } catch {
    return false;
  }
}

// ── Public API ──────────────────────────────────────────────────────

export async function install(nodePath, cliPath, intervalHours = 4) {
  if (platform() === "darwin") return installLaunchd(nodePath, cliPath, intervalHours);
  return installSystemd(nodePath, cliPath, intervalHours);
}

export async function remove() {
  if (platform() === "darwin") return removeLaunchd();
  return removeSystemd();
}

export async function status() {
  if (platform() === "darwin") return statusLaunchd();
  return statusSystemd();
}

export async function isInstalled() {
  if (platform() === "darwin") return isInstalledLaunchd();
  return isInstalledSystemd();
}

export async function getNodeAndCliPath() {
  if (platform() === "darwin") return null; // not implemented for macOS
  return getNodeAndCliPathSystemd();
}
