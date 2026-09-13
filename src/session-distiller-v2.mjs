/**
 * Session Distiller — Lossless extractive filtering for Claude Code sessions.
 *
 * Strips tool results, thinking blocks, system noise. Keeps all conversation
 * text verbatim. Output is a resumable CC session (CLI + CCO recognise it).
 *
 * Based on CosmoNaught's finding (anthropics/claude-code#27293):
 *   60-70% of session = tool results (zero value on reload)
 *   15-20% = thinking blocks (zero value)
 *   10-15% = actual conversation (ALL value)
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

// CC structural lines — keep as-is, just rewrite sessionId
const PASSTHROUGH = new Set(["queue-operation", "last-prompt"]);
// Pure noise — drop entirely
const DROP = new Set(["file-history-snapshot", "attachment", "progress", "pr-link", "custom-title"]);

// Track last tool_use name so tool_result knows which tool produced it
let lastToolName = "";

function distillBlocks(blocks) {
  if (typeof blocks === "string") return blocks;
  if (!Array.isArray(blocks)) return [];

  const out = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    switch (b.type) {
      case "text":
        if (b.text?.trim()) out.push(b);
        break;

      case "tool_use": {
        const name = b.name || "tool";
        lastToolName = name;
        const inp = b.input || {};
        let hint = "";

        // Per-tool-type: keep the input that matters for understanding intent
        if (name === "Edit") {
          // Edit intent is CRITICAL — cannot be re-derived
          const old = inp.old_string?.slice(0, 200) || "";
          const nw = inp.new_string?.slice(0, 200) || "";
          hint = `${inp.file_path || ""}\n  old: ${old}\n  new: ${nw}`;
        } else if (name === "Write") {
          const content = inp.content || "";
          const lines = content.split("\n");
          const preview = lines.length <= 10 ? content.slice(0, 400)
            : [...lines.slice(0, 5), `... (${lines.length} lines)`, ...lines.slice(-3)].join("\n");
          hint = `${inp.file_path || ""}\n${preview.slice(0, 500)}`;
        } else if (name === "Read") {
          hint = inp.file_path || inp.path || "";
          if (inp.offset) hint += `:${inp.offset}`;
          if (inp.limit) hint += `+${inp.limit}`;
        } else if (name === "Bash") {
          hint = inp.command?.slice(0, 200) || "";
        } else if (name === "Grep") {
          hint = `"${inp.pattern || ""}" ${inp.path || ""}`;
        } else if (name === "Glob") {
          hint = inp.pattern || "";
        } else if (name === "Agent") {
          hint = inp.description || inp.prompt?.slice(0, 200) || "";
        } else {
          hint = inp.file_path || inp.path || inp.command?.slice(0, 120)
            || inp.query?.slice(0, 100) || inp.prompt?.slice(0, 100)
            || inp.url?.slice(0, 100) || inp.skill || inp.description?.slice(0, 100) || "";
        }
        out.push({ type: "text", text: hint ? `[${name}: ${hint}]` : `[${name}]` });
        break;
      }

      case "tool_result": {
        const raw = typeof b.content === "string" ? b.content
          : Array.isArray(b.content) ? b.content.filter(c => c?.type === "text").map(c => c.text).join(" ")
          : "";

        if (b.is_error) {
          if (raw) out.push({ type: "text", text: `[error: ${raw.slice(0, 500)}]` });
          break;
        }

        const t = raw.trim();
        if (!t) break;

        // Per-tool-type result extraction (CC engineer's recommendation)
        if (lastToolName === "Read") {
          // Safe to strip — model can re-read the file
          out.push({ type: "text", text: `[read: ${t.split("\n").length} lines]` });
        } else if (lastToolName === "Bash") {
          // Errors/results tend to be at the END, not the start
          const lines = t.split("\n");
          if (lines.length <= 12) {
            out.push({ type: "text", text: `[output: ${t.slice(0, 600)}]` });
          } else {
            const tail = lines.slice(-8).join("\n");
            out.push({ type: "text", text: `[output (${lines.length} lines, tail):\n${tail}]` });
          }
        } else if (lastToolName === "Grep") {
          // Keep matched file paths (up to 20), drop content
          out.push({ type: "text", text: `[matches:\n${t.split("\n").slice(0, 20).join("\n")}]` });
        } else if (lastToolName === "Glob") {
          out.push({ type: "text", text: `[files:\n${t.split("\n").slice(0, 20).join("\n")}]` });
        } else if (lastToolName === "Edit") {
          out.push({ type: "text", text: `[edited ok]` });
        } else if (lastToolName === "Write") {
          out.push({ type: "text", text: `[written ok]` });
        } else if (lastToolName === "Agent") {
          // Agent results can be huge — keep first 600 chars
          out.push({ type: "text", text: `[agent result: ${t.slice(0, 600)}]` });
        } else {
          out.push({ type: "text", text: `[result: ${t.slice(0, 300)}]` });
        }
        break;
      }

      case "image":
        out.push({ type: "text", text: "[image]" });
        break;
      // thinking: drop silently
    }
  }

  // Merge consecutive text blocks
  const merged = [];
  for (const b of out) {
    const prev = merged[merged.length - 1];
    if (b.type === "text" && prev?.type === "text") prev.text += "\n" + b.text;
    else merged.push({ ...b });
  }
  return merged;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function distillSession(inputPath, opts = {}) {
  const { outputDir, sessionId, dryRun = false } = opts;
  const raw = await readFile(inputPath, "utf-8");
  const lines = raw.split("\n").filter(l => l.trim());
  const newId = sessionId || randomUUID();
  const outputPath = join(outputDir || dirname(inputPath), `${newId}.jsonl`);

  let kept = 0, dropped = 0;
  const byType = {};
  const out = [];
  let titleRaw = "";  // will be patched with reduction % at the end

  // Pre-scan: find ai-title or first user text as fallback
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.type === "ai-title") { titleRaw = e.aiTitle || ""; break; }
      if (!titleRaw && e.type === "user" && e.message?.content) {
        const c = e.message.content;
        const t = typeof c === "string" ? c : Array.isArray(c)
          ? c.filter(b => b?.type === "text").map(b => b.text).join(" ") : "";
        if (t.trim()) titleRaw = t.trim().slice(0, 80);
      }
    } catch {}
  }

  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    const type = e.type || "unknown";
    byType[type] = (byType[type] || 0) + 1;

    if (DROP.has(type)) { dropped++; continue; }

    // Skip original ai-title — we'll inject our own at the top
    if (type === "ai-title") { dropped++; continue; }

    if (PASSTHROUGH.has(type)) {
      out.push(JSON.stringify({ ...e, sessionId: newId }));
      kept++;
      continue;
    }

    if (type === "system") {
      if (e.subtype === "compact_boundary") {
        out.push(JSON.stringify({ ...e, sessionId: newId }));
        kept++;
      } else { dropped++; }
      continue;
    }

    if ((type === "user" || type === "assistant") && e.message?.content) {
      const content = distillBlocks(e.message.content);
      if (Array.isArray(content) && content.length === 0) { dropped++; continue; }
      // Drop messages that are only tool markers (e.g. "[Bash]\n[Read]") with no real text
      if (Array.isArray(content) && content.every(b =>
        b.type === "text" && /^\s*(\[[\w. -]+\]\s*)+$/.test(b.text)
      )) { dropped++; continue; }
      const msg = { ...e.message, content };
      delete msg.usage;
      out.push(JSON.stringify({ ...e, sessionId: newId, message: msg }));
      kept++;
      continue;
    }

    dropped++;
  }

  // Calculate reduction %, build ai-title, inject near the top
  const inBytes = Buffer.byteLength(raw, "utf-8");
  const tempStr = out.join("\n");
  const pct = Math.round((1 - Buffer.byteLength(tempStr, "utf-8") / inBytes) * 100);
  const titleLine = JSON.stringify({
    type: "ai-title", sessionId: newId,
    aiTitle: `[distilled -${pct}%] ${titleRaw || "Untitled session"}`,
  });
  kept++;

  // Insert ai-title right after the leading queue-operation lines (so it's in first 4KB)
  let insertIdx = 0;
  for (let i = 0; i < out.length; i++) {
    try {
      const o = JSON.parse(out[i]);
      if (o.type === "queue-operation") { insertIdx = i + 1; continue; }
    } catch {}
    break;
  }
  out.splice(insertIdx, 0, titleLine);

  const outputStr = out.join("\n") + "\n";
  const outBytes = Buffer.byteLength(outputStr, "utf-8");

  if (!dryRun) await writeFile(outputPath, outputStr, "utf-8");

  return {
    inputPath,
    outputPath: dryRun ? "(dry run)" : outputPath,
    sessionId: newId,
    stats: {
      inputLines: lines.length, keptLines: kept, droppedLines: dropped,
      inputBytes: inBytes, outputBytes: outBytes,
      reduction: Math.round((1 - outBytes / inBytes) * 100) + "%",
      byType,
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("session-distiller-v2.mjs")) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const inputPath = args.find(a => !a.startsWith("--"));

  if (!inputPath) {
    console.error("Usage: node session-distiller-v2.mjs <session.jsonl> [--dry-run]");
    process.exit(1);
  }

  const fmt = b => b < 1024 ? b + "B" : b < 1048576 ? (b / 1024).toFixed(1) + "K" : (b / 1048576).toFixed(1) + "M";

  try {
    const r = await distillSession(inputPath, { dryRun });
    const s = r.stats;
    console.log(`\nSession Distiller\n─────────────────`);
    console.log(`Input:  ${r.inputPath}`);
    console.log(`Output: ${r.outputPath}`);
    console.log(`Lines:  ${s.inputLines} → ${s.keptLines} (dropped ${s.droppedLines})`);
    console.log(`Size:   ${fmt(s.inputBytes)} → ${fmt(s.outputBytes)} (${s.reduction} reduction)\n`);
    console.log("Types:", Object.entries(s.byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`).join("  "));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
