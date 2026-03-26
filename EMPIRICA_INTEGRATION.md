# Empirica Integration — PR Proposal

## Summary

Add `.empirica/` directory awareness to the scanner and dashboard, giving users
visibility into their epistemic measurement data alongside existing config items.

## What is Empirica?

[Empirica](https://github.com/Nubaeon/empirica) is an epistemic measurement
system for AI agents — tracks what AI knows, prevents action before understanding,
compounds learning across sessions. Installs as a Claude Code plugin with 14 hooks,
8 skills, and a statusline.

When active, each project gets a `.empirica/` directory containing:
- `sessions/sessions.db` — SQLite with vectors, findings, goals, calibration
- `.breadcrumbs.yaml` — Session narrative and learning trajectory
- `project.yaml` — Project config (name, type, domain)
- `active_transaction*.json` — Active epistemic measurements

## Proposed Changes

### 1. Scanner: `scanEpistemics(scope)`

Add to `scan()` Promise.all alongside existing scanners. Read-only filesystem
discovery — no database queries, just presence detection and YAML/JSON metadata.

```javascript
async function scanEpistemics(scope) {
  const items = [];
  // Check for .empirica/ in project root
  const empiricaDir = join(scope.repoDir, '.empirica');
  // Read project.yaml for name/type/stats
  // Check active_transaction*.json for open transactions
  // Count session files for activity metric
  return items;
}
```

**New category:** `epistemic` with icon 📊

**Items discovered per project:**
- Project config summary (name, type, domain, status)
- Session activity (count, last active)
- Open transaction state (if any)
- Calibration snapshot (from `.breadcrumbs.yaml` if present)

### 2. Context Budget: Empirica overhead

Add to budget calculation in `server.mjs`:
- Empirica system prompt: ~1.2K tokens (lean) or ~6.3K tokens (full)
- Plugin hooks: 14 hooks registered (loaded per-event, not all at once)
- Skills available: ~30 tokens per skill description in skill list
- Statusline: ~200 tokens per refresh cycle

Detection: check for `empirica` in `~/.claude/plugins/local/` or
`empirica-integration` (pre-1.7.0 name).

### 3. Detail Panel: Epistemic summary

When clicking an epistemic item:
```
📊 Empirica Project: empirica
   Type: software | Domain: AI/ML
   Sessions: 47 | Last active: 2h ago
   Calibration: 0.28 (holistic)
   Open goals: 12 | Findings: 1794
   Transaction: open (praxic phase)

   [View in CLI: empirica project-bootstrap]
```

### What this does NOT include

- ❌ No dependency on Empirica being installed
- ❌ No SQLite database queries
- ❌ No real-time data streaming
- ❌ No write operations to `.empirica/`
- ❌ No Qdrant/vector store access

Everything is filesystem metadata only.

### Why this matters for organizer users

1. **Visibility** — See which projects have epistemic tracking active
2. **Token awareness** — Know Empirica's context budget cost (hooks + prompt)
3. **Scope discovery** — `.empirica/` dirs show up in project scope tree
4. **Cleanup** — Identify stale `.empirica/` dirs from old/abandoned projects
5. **Complementary** — Organizer manages CONFIG, Empirica manages INTELLIGENCE

### Symbiotic value

The organizer shows WHERE things are. Empirica tracks WHAT you know.
Together, users see both the configuration state and the intelligence
state of their Claude Code environment in one dashboard.

**Flow:** capture (empirica-extension) → process (empirica serve) →
store (.empirica/) → visualize (organizer) → manage (scope, prune)

### Implementation estimate

- `scanner.mjs`: ~60 lines (new `scanEpistemics` function)
- `server.mjs`: ~15 lines (context budget addition)
- `app.js`: ~40 lines (detail panel template, icon, category)
- `style.css`: ~5 lines (epistemic category color)
- Tests: ~20 lines (scanner accuracy for `.empirica/` detection)
- Total: ~140 lines, 0 new dependencies

### Related projects

- [Empirica](https://github.com/Nubaeon/empirica) — Epistemic measurement (MIT)
- [Empirica Extension](https://github.com/Nubaeon/empirica-extension) — Chrome AI conversation capture
- [Empirica Cortex](https://github.com/Nubaeon/empirica-cortex) — Intelligence serving layer (MCP)
