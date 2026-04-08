/**
 * backup-git.mjs — Git operations for Claude Code backup repo.
 * Used by Backup Center in CCO and by the standalone claude-code-backup CLI.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

function git(args, cwd) {
  return exec("git", args, {
    cwd,
    timeout: 30_000,
    env: { ...process.env, GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || "ssh" },
  });
}

export async function isGitRepo(dir) {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function initRepo(dir) {
  await git(["init", "-b", "main"], dir);
}

export async function hasRemote(dir) {
  try {
    const { stdout } = await git(["remote"], dir);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function addRemote(dir, url) {
  await git(["remote", "add", "origin", url], dir);
}

export async function getRemoteUrl(dir) {
  try {
    const { stdout } = await git(["remote", "get-url", "origin"], dir);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getLastCommit(dir) {
  try {
    const { stdout } = await git(["log", "-1", "--format=%s|||%ai"], dir);
    const [msg, date] = stdout.trim().split("|||");
    return { msg: msg?.trim() || null, date: date?.trim() || null };
  } catch {
    return { msg: null, date: null };
  }
}

/**
 * Stage all changes, commit, and push.
 * Returns { committed, pushed, message }
 */
export async function commitAndPush(dir) {
  await git(["add", "-A"], dir);

  try {
    await git(["diff", "--cached", "--quiet"], dir);
    return { committed: false, pushed: false, message: "No changes to backup" };
  } catch {
    // Changes exist — commit
  }

  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const commitMsg = `backup: ${ts}`;
  await git(["commit", "-m", commitMsg], dir);

  if (await hasRemote(dir)) {
    try {
      await git(["push", "-u", "origin", "main"], dir);
      return { committed: true, pushed: true, message: `Committed and pushed: ${commitMsg}` };
    } catch (err) {
      return { committed: true, pushed: false, message: `Committed but push failed: ${err.message}` };
    }
  }

  return { committed: true, pushed: false, message: `Committed (no remote): ${commitMsg}` };
}
