import { access, open, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Check whether a path exists.
 *
 * @param {string} p
 * @returns {Promise<boolean>}
 */
export async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

/**
 * Read a file and return null when it cannot be read.
 *
 * @param {string} p
 * @param {BufferEncoding} [encoding]
 * @returns {Promise<string|null>}
 */
export async function safeReadFile(p, encoding = "utf-8") {
  try { return await readFile(p, encoding); } catch { return null; }
}

/**
 * Stat a path and return null when it cannot be read.
 *
 * @param {string} p
 * @returns {Promise<import("node:fs").Stats|null>}
 */
export async function safeStat(p) {
  try { return await stat(p); } catch { return null; }
}

function countNewlines(buffer) {
  let count = 0;
  for (const byte of buffer) {
    if (byte === 10) count++;
  }
  return count;
}

/**
 * Read the first n lines without loading the whole file.
 *
 * @param {string} p
 * @param {number} maxLines
 * @param {number} [chunkSize]
 * @returns {Promise<string[]>}
 */
export async function readFirstLines(p, maxLines, chunkSize = 8192) {
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

/**
 * Read the last n lines without loading the whole file.
 *
 * @param {string} p
 * @param {number} maxLines
 * @param {number} [fileSize]
 * @param {number} [chunkSize]
 * @returns {Promise<string[]>}
 */
export async function readLastLines(p, maxLines, fileSize, chunkSize = 8192) {
  const size = fileSize ?? (await safeStat(p))?.size ?? 0;
  if (!size) return [];

  let handle;
  try {
    handle = await open(p, "r");
    const chunks = [];
    let position = size;
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

/**
 * Parse one JSONL record.
 *
 * @param {string} line
 * @returns {*|null}
 */
export function parseJsonLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

/**
 * Format bytes using the same compact labels as scanner.mjs.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!bytes) return "0B";
  if (bytes < 1024) return bytes + "B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "K";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + "MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + "GB";
}

/**
 * Extract simple YAML frontmatter key/value pairs from markdown.
 *
 * @param {string|null} content
 * @returns {Record<string, string>}
 */
export function parseFrontmatter(content) {
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

/**
 * Safely parse a JSON file.
 *
 * @param {string} p
 * @returns {Promise<*|null>}
 */
export async function readJson(p) {
  const content = await safeReadFile(p);
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}

/**
 * Scan one directory for markdown files.
 *
 * @param {string} dir
 * @returns {Promise<Array<{ name: string, path: string, content: string, frontmatter: Record<string, string>, size: string, mtime: string }>>}
 */
export async function scanMarkdownFiles(dir) {
  const items = [];
  if (!(await exists(dir))) return items;

  let files;
  try { files = await readdir(dir); } catch { return items; }

  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const fullPath = join(dir, f);
    const s = await safeStat(fullPath);
    const content = await safeReadFile(fullPath) || "";
    items.push({
      name: parseFrontmatter(content).name || f.replace(".md", ""),
      path: fullPath,
      content,
      frontmatter: parseFrontmatter(content),
      size: s ? formatSize(s.size) : "0B",
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
    });
  }

  return items;
}

function matchesPattern(fileName, pattern) {
  if (!pattern) return true;
  if (pattern instanceof RegExp) return pattern.test(fileName);
  if (typeof pattern === "function") return pattern(fileName);
  if (typeof pattern === "string") return fileName.endsWith(pattern);
  return false;
}

/**
 * Scan one directory for files matching a suffix, RegExp, or predicate.
 *
 * @param {string} dir
 * @param {string|RegExp|((fileName: string) => boolean)} [pattern]
 * @returns {Promise<Array<{ name: string, path: string, size: string, sizeBytes: number, mtime: string }>>}
 */
export async function scanDirectoryItems(dir, pattern) {
  const items = [];
  if (!(await exists(dir))) return items;

  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return items; }

  for (const entry of entries) {
    if (!entry.isFile() || !matchesPattern(entry.name, pattern)) continue;
    const fullPath = join(dir, entry.name);
    const s = await safeStat(fullPath);
    items.push({
      name: entry.name,
      path: fullPath,
      size: s ? formatSize(s.size) : "0B",
      sizeBytes: s ? s.size : 0,
      mtime: s ? s.mtime.toISOString().slice(0, 16) : "",
    });
  }

  return items;
}
