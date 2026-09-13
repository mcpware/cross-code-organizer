/**
 * Session Distiller V4 — Extractive filtering for Claude Code sessions.
 *
 * V4: Large tool results (agent research, long bash output) saved as artifact
 * MD files alongside the session. Session keeps a reference path so Claude
 * can read them on demand without bloating the context window.
 *
 * All V3 fixes included (P0 bugs, tool_use_id matching, envelope stripping).
 * Target: 60-80% reduction.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { randomUUID } from "node:crypto";

const PASSTHROUGH = new Set(["queue-operation", "last-prompt"]);
const DROP = new Set(["file-history-snapshot", "attachment", "progress", "pr-link", "custom-title"]);

// Fields that repeat on every line — keep only on first occurrence
const ENVELOPE_ONCE = new Set(["userType", "entrypoint", "version", "gitBranch", "slug", "permissionMode"]);

// ── tool_use_id → tool_name map (P1 fix: parallel calls safe) ───────────

const toolIdMap = new Map();

// ── Artifact storage (V4: large results saved to single MD with index) ──

const ARTIFACT_THRESHOLD = 1500; // chars — above this, save as artifact
let artifacts = [];              // { id, label, toolName, content, lineNum }
let artifactPath = "";

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

      case "thinking":
        // P2: Keep first 200 chars as reasoning hint (not full drop)
        if (b.thinking?.trim()) {
          const hint = b.thinking.trim().slice(0, 200);
          out.push({ type: "text", text: `[thinking: ${hint}]` });
        }
        break;

      case "tool_use": {
        const name = b.name || "tool";
        if (b.id) toolIdMap.set(b.id, name);
        const inp = b.input || {};
        let hint = "";

        if (name === "Edit") {
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
          hint = inp.command?.slice(0, 250) || "";
        } else if (name === "Grep") {
          hint = `"${inp.pattern || ""}" ${inp.path || ""}`;
        } else if (name === "Glob") {
          hint = inp.pattern || "";
        } else if (name === "Agent") {
          hint = inp.description || inp.prompt?.slice(0, 250) || "";
        } else {
          // P0 fix: generic fallback covers MCP tools (selector, text, key, todos, etc.)
          hint = inp.file_path || inp.path || inp.command?.slice(0, 150)
            || inp.query?.slice(0, 120) || inp.prompt?.slice(0, 120)
            || inp.url?.slice(0, 120) || inp.skill
            || inp.selector?.slice(0, 100) || inp.text?.slice(0, 100)
            || inp.key || inp.description?.slice(0, 120)
            || (inp.todos ? `${inp.todos.length} items` : "")
            || "";
        }
        out.push({ type: "text", text: hint ? `[${name}: ${hint}]` : `[${name}]` });
        break;
      }

      case "tool_result": {
        // P1: Use tool_use_id matching instead of global lastToolName
        const toolName = toolIdMap.get(b.tool_use_id) || "unknown";

        const raw = typeof b.content === "string" ? b.content
          : Array.isArray(b.content) ? b.content.filter(c => c?.type === "text").map(c => c.text).join(" ")
          : "";

        if (b.is_error) {
          if (raw) out.push({ type: "text", text: `[error: ${raw.slice(0, 500)}]` });
          break;
        }

        const t = raw.trim();
        if (!t) break;

        if (toolName === "Read") {
          out.push({ type: "text", text: `[read: ${t.split("\n").length} lines]` });
        } else if (toolName === "Bash") {
          const lines = t.split("\n");
          if (lines.length <= 15) {
            out.push({ type: "text", text: `[output: ${t.slice(0, 800)}]` });
          } else if (t.length > ARTIFACT_THRESHOLD) {
            // V4: Large bash output → save as artifact
            const ref = saveArtifact(`bash-${artifacts.length + 1}`, t, toolName);
            const head = lines.slice(0, 3).join("\n");
            const tail = lines.slice(-3).join("\n");
            out.push({ type: "text", text: `[output (${lines.length} lines) → ${ref}:\n${head}\n...\n${tail}]` });
          } else {
            const head = lines.slice(0, 5).join("\n");
            const tail = lines.slice(-5).join("\n");
            out.push({ type: "text", text: `[output (${lines.length} lines):\n${head}\n...\n${tail}]` });
          }
        } else if (toolName === "Grep") {
          out.push({ type: "text", text: `[matches:\n${t.split("\n").slice(0, 25).join("\n")}]` });
        } else if (toolName === "Glob") {
          out.push({ type: "text", text: `[files:\n${t.split("\n").slice(0, 25).join("\n")}]` });
        } else if (toolName === "Edit") {
          out.push({ type: "text", text: `[edited ok]` });
        } else if (toolName === "Write") {
          out.push({ type: "text", text: `[written ok]` });
        } else if (toolName === "Agent") {
          // V4: Agent results are typically research reports — save full content as artifact
          if (t.length > ARTIFACT_THRESHOLD) {
            const ref = saveArtifact(`agent-${artifacts.length + 1}`, t, toolName);
            out.push({ type: "text", text: `[agent result (${t.length} chars) → ${ref}:\n${t.slice(0, 500)}]` });
          } else {
            out.push({ type: "text", text: `[agent result: ${t}]` });
          }
        } else {
          // MCP tools and other
          if (t.length > ARTIFACT_THRESHOLD) {
            const ref = saveArtifact(`${toolName}-${artifacts.length + 1}`, t, toolName);
            out.push({ type: "text", text: `[result (${t.length} chars) → ${ref}:\n${t.slice(0, 300)}]` });
          } else {
            out.push({ type: "text", text: `[result: ${t.slice(0, 500)}]` });
          }
        }
        break;
      }

      case "image":
        out.push({ type: "text", text: "[image]" });
        break;
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

function saveArtifact(label, content, toolName) {
  const id = artifacts.length + 1;
  // Use first line of content as description (often a heading or key output)
  const firstLine = content.split("\n").find(l => l.trim() && !l.startsWith("#"))?.trim().slice(0, 80) || label;
  artifacts.push({ id, label: firstLine, toolName, content });
  return `artifacts.md#${id}`;
}

// ── Envelope stripping (P1: reduce JSON overhead instead of content) ────

function stripEnvelope(entry, seenEnvelope) {
  const cleaned = { ...entry };
  for (const field of ENVELOPE_ONCE) {
    if (field in cleaned) {
      if (seenEnvelope.has(field)) {
        delete cleaned[field];
      } else {
        seenEnvelope.add(field);
      }
    }
  }
  return cleaned;
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
  let titleRaw = "";
  const seenEnvelope = new Set();

  // Clear state for this session
  toolIdMap.clear();
  artifacts = [];
  artifactPath = join(dirname(outputPath), `${newId}-artifacts.md`);

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
    if (type === "ai-title") { dropped++; continue; }

    // P1: Strip envelope redundancy on all kept lines
    e = stripEnvelope(e, seenEnvelope);

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
      // P0 fix: NEVER drop tool-only messages — they anchor tool_results
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

  if (!dryRun) {
    await writeFile(outputPath, outputStr, "utf-8");
    // Write single artifacts MD with index at top
    if (artifacts.length > 0) {
      const indexLines = ["# Session Artifacts", ""];
      indexLines.push(`Distilled from: ${basename(inputPath)}`);
      indexLines.push(`Artifacts: ${artifacts.length}`);
      indexLines.push("");
      indexLines.push("## Index");
      indexLines.push("");
      // Build index with line numbers so Claude can use offset to jump
      let lineNum = indexLines.length + artifacts.length + 3; // account for index + separator
      for (const a of artifacts) {
        indexLines.push(`- **#${a.id}** [${a.toolName}] ${a.label} (line ~${lineNum})`);
        lineNum += a.content.split("\n").length + 4; // content + header + separators
      }
      indexLines.push("");
      indexLines.push("---");
      indexLines.push("");

      const bodyLines = [];
      for (const a of artifacts) {
        bodyLines.push(`## #${a.id} — ${a.toolName}: ${a.label}`);
        bodyLines.push("");
        bodyLines.push(a.content);
        bodyLines.push("");
        bodyLines.push("---");
        bodyLines.push("");
      }

      await writeFile(artifactPath, indexLines.join("\n") + bodyLines.join("\n"), "utf-8");
    }
  }

  return {
    inputPath,
    outputPath: dryRun ? "(dry run)" : outputPath,
    sessionId: newId,
    stats: {
      inputLines: lines.length, keptLines: kept, droppedLines: dropped,
      inputBytes: inBytes, outputBytes: outBytes,
      reduction: Math.round((1 - outBytes / inBytes) * 100) + "%",
      artifacts: artifacts.length,
      artifactPath: artifacts.length > 0 ? artifactPath : null,
      byType,
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("session-distiller-v4.mjs")) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const inputPath = args.find(a => !a.startsWith("--"));

  if (!inputPath) {
    console.error("Usage: node session-distiller-v4.mjs <session.jsonl> [--dry-run]");
    process.exit(1);
  }

  const fmt = b => b < 1024 ? b + "B" : b < 1048576 ? (b / 1024).toFixed(1) + "K" : (b / 1048576).toFixed(1) + "M";

  try {
    const r = await distillSession(inputPath, { dryRun });
    const s = r.stats;
    console.log(`\nSession Distiller V4\n────────────────────`);
    console.log(`Input:  ${r.inputPath}`);
    console.log(`Output: ${r.outputPath}`);
    console.log(`Lines:  ${s.inputLines} → ${s.keptLines} (dropped ${s.droppedLines})`);
    console.log(`Size:   ${fmt(s.inputBytes)} → ${fmt(s.outputBytes)} (${s.reduction} reduction)`);
    if (s.artifacts > 0) {
      console.log(`Artifacts: ${s.artifacts} entries → ${s.artifactPath}`);
    }
    console.log("\nTypes:", Object.entries(s.byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`).join("  "));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
