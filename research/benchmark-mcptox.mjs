/**
 * Benchmark CCO security scanner against MCPTox dataset.
 * Tests how many poisoned tool descriptions the deterministic rule set catches.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import scanner functions
const scannerPath = join(__dirname, "..", "src", "security-scanner.mjs");
const scanner = await import(scannerPath);

const MCPTOX_PATH = join(__dirname, "datasets", "MCPTox-Benchmark", "pure_tool.json");

async function run() {
  // Load MCPTox dataset
  const raw = await readFile(MCPTOX_PATH, "utf-8");
  const data = JSON.parse(raw);

  // Flatten all poisoned tools
  const poisonedTools = [];
  for (const server of data) {
    for (const [key, tool] of Object.entries(server)) {
      poisonedTools.push({
        id: key,
        server: tool.server_name,
        name: tool.tool_name,
        description: tool.tool_content,
        query: tool.query
      });
    }
  }

  console.log(`\n=== MCPTox Benchmark ===`);
  console.log(`Total poisoned tools: ${poisonedTools.length}`);
  console.log(`Attack categories: 11 (Credential Leakage, Privacy Leakage, Message Hijacking, Code Injection, Data Tampering, Instruction Tampering, Information Manipulation, Financial Loss, Service Disruption, Infrastructure Damage, Other)\n`);

  let detected = 0;
  let missed = 0;
  const missedExamples = [];
  const findingsByCategory = {};
  const serverStats = {};

  for (const tool of poisonedTools) {
    // Run deobfuscation + pattern scan on tool description
    const deobfuscated = scanner.deobfuscate(tool.description);
    const findings = scanner.scanText(deobfuscated, "tool", tool.name);

    // Track server stats
    if (!serverStats[tool.server]) {
      serverStats[tool.server] = { total: 0, detected: 0 };
    }
    serverStats[tool.server].total++;

    if (findings.length > 0) {
      detected++;
      serverStats[tool.server].detected++;

      // Track which pattern categories fire
      for (const f of findings) {
        findingsByCategory[f.category] = (findingsByCategory[f.category] || 0) + 1;
      }
    } else {
      missed++;
      if (missedExamples.length < 10) {
        missedExamples.push({
          id: tool.id,
          server: tool.server,
          name: tool.name,
          desc: tool.description.substring(0, 200) + "..."
        });
      }
    }
  }

  const detectionRate = ((detected / poisonedTools.length) * 100).toFixed(1);

  console.log(`\n=== RESULTS ===`);
  console.log(`Detected: ${detected}/${poisonedTools.length} (${detectionRate}%)`);
  console.log(`Missed:   ${missed}/${poisonedTools.length} (${(100 - parseFloat(detectionRate)).toFixed(1)}%)`);

  console.log(`\n=== DETECTION BY PATTERN CATEGORY ===`);
  const sorted = Object.entries(findingsByCategory).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count} hits`);
  }

  console.log(`\n=== DETECTION BY SERVER ===`);
  const serverSorted = Object.entries(serverStats).sort((a, b) => b[1].total - a[1].total);
  for (const [server, stats] of serverSorted) {
    const rate = ((stats.detected / stats.total) * 100).toFixed(0);
    const bar = rate >= 80 ? "✅" : rate >= 50 ? "⚠️" : "❌";
    console.log(`  ${bar} ${server}: ${stats.detected}/${stats.total} (${rate}%)`);
  }

  if (missedExamples.length > 0) {
    console.log(`\n=== MISSED EXAMPLES (first 10) ===`);
    for (const ex of missedExamples) {
      console.log(`\n  [${ex.id}] ${ex.server} / ${ex.name}`);
      console.log(`  "${ex.desc}"`);
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Deterministic scanner detection rate against MCPTox: ${detectionRate}%`);
  console.log(`(MCPTox paper reports 84.2% attack success rate across 12 LLM agents)`);
}

run().catch(console.error);
