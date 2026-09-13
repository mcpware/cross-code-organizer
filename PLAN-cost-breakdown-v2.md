# Cost Breakdown Feature — Session Handoff

## Current State (committed on feature/cost-breakdown branch)

### What's Built (v1 — commit a737088)
- **API endpoint** `/api/session-cost?path=...` in `src/server.mjs`
  - Parses entire JSONL file, groups assistant messages by model (skips `<synthetic>`)
  - Computes per-model token totals: input, output, cacheRead, cacheWrite, webSearches, turns
  - Applies pricing from CCsrc `utils/modelCost.ts` (verified against official Anthropic pricing)
  - Returns `{ totalCostUSD, durationMs, breakdown: [{model, tokens, costUSD}] }`

- **Frontend** in `src/ui/app.js`
  - "💰 Cost Breakdown" button replaces breadcrumb area (`detailCrumb`) for session items only
  - Click toggles: hides `detail-body`, shows `costBreakdown` panel
  - Shows: total tokens, duration, "API equivalent: $X.XX", per-model cards with token breakdown
  - "← Back to Detail" button returns to normal view
  - Functions: `showCostBreakdown()`, `formatTokenCount()`, `formatDurationMs()`

- **HTML** in `src/ui/index.html`
  - `#costBreakdown` div with `#costTotal`, `#costDuration`, `#costModels` containers
  - `#costBackBtn` for returning to detail view

- **CSS** in `src/ui/style.css`
  - `.d-cost-*` classes matching existing design system (OKLch colors, same radius/fonts)
  - Dark mode support for cost button

### Pricing Table (verified from CCsrc modelCost.ts, source: platform.claude.com/docs/en/about-claude/pricing)
```
Opus 4.5/4.6:     $5/$25 per Mtok (input/output), cache read $0.50, cache write $6.25
Opus 4.6 fast:    $30/$150 per Mtok, cache read $3, cache write $37.50
Opus 4/4.1:       $15/$75 per Mtok, cache read $1.50, cache write $18.75
Sonnet (all):     $3/$15 per Mtok, cache read $0.30, cache write $3.75
Haiku 4.5:        $1/$5 per Mtok, cache read $0.10, cache write $1.25
Haiku 3.5:        $0.80/$4 per Mtok, cache read $0.08, cache write $1
Web search:       $0.01 per request (all models)
```

## What Needs to Change (v2)

### Nicole's Feedback
1. **Dollar cost is misleading for subscription users** — they pay ~$200/month fixed, showing "$217 per session" is wrong framing
2. **Raw token count without context is meaningless** — users don't know their total quota so "1.2M tokens" means nothing
3. **Real question: "why are my tokens burning fast?"** — need diagnostic breakdown, not just totals
4. **Anthropic doesn't expose total weekly quota in tokens** — only % via status line, and that's live-only (not stored in JSONL)

### Agreed Design Direction

**Purpose:** Help users understand WHERE their tokens go so they can take action (via CCO config management)

**UI Layout:**
```
┌─────────────────────────────────┐
│ Session: [title]                │
│ 💰 Cost Breakdown               │
├─────────────────────────────────┤
│                                 │
│ Total: 1.2M tokens · 47 turns  │
│ Cache hit: 78%                  │
│ Models: Opus 60% · Sonnet 40%  │
│                                 │
│ ─── Heaviest Turns ───          │
│                                 │
│ #1  Turn 15    52K input        │
│     Read src/server.mjs         │
│                                 │
│ #2  Turn 31    48K input        │
│     Bash: npm test              │
│                                 │
│ #3  Turn 8     45K input        │
│     Read + Edit × 3 files       │
│                                 │
│ ─── Token Breakdown ───         │
│                                 │
│ [per-model cards as v1]         │
│                                 │
│ ← Back to Detail                │
└─────────────────────────────────┘
```

**Three sections:**

1. **Summary bar** — total tokens, cache hit rate, model mix %
   - Cache hit rate = cache_read_tokens / (cache_read_tokens + cache_creation_tokens) — higher = better
   - Model mix = % of tokens per model

2. **Heaviest Turns (top 5-10)** — ranked by input_tokens descending
   - Each "turn" = one API call (one assistant entry in JSONL with non-synthetic usage)
   - Show: turn number, input tokens, what tool_use calls were in that response
   - Tool calls are inside `message.content` array as `{type: "tool_use", name: "Read"/"Bash"/etc.}`
   - This tells users: "this turn burned 50K input because it involved reading a huge file"

3. **Per-model breakdown** — same as v1 but with tokens as primary, $ as secondary

### Key Implementation Notes

**JSONL structure for tool calls (from CCsrc):**
```jsonl
{"type":"assistant","message":{"role":"assistant","model":"claude-opus-4-6","content":[{"type":"text","text":"..."},{"type":"tool_use","id":"toolu_xxx","name":"Read","input":{"file_path":"/foo/bar.js"}}],"usage":{"input_tokens":45000,"output_tokens":1200,"cache_read_input_tokens":30000,"cache_creation_input_tokens":5000}}}
```

So for each assistant entry, we can extract:
- `message.usage.input_tokens` — how heavy this turn was
- `message.content[].type === "tool_use"` → `name` field = which tool was called
- Turn number = sequential count of non-synthetic assistant messages

**Cache hit rate formula:**
```
cache_hit_rate = total_cache_read / (total_cache_read + total_cache_creation)
```
- 100% = everything cached (cheapest)
- 0% = nothing cached (most expensive)
- This is a meaningful metric because it tells you if your prompts are being cached effectively

**What still needs per-session % of weekly quota (roadmap Step 3):**
- Requires CCO to install a Claude Code status line hook
- Status line hook receives JSON with `rate_limits.seven_day.used_percentage`
- CCO would need to record this at session start and end, compute delta
- NOT possible with just JSONL parsing — needs live integration

### Backend Changes Needed for v2
- `/api/session-cost` endpoint needs to also return:
  - `turns[]` — array of ALL turns with: `{turnIndex, inputTokens, outputTokens, cacheRead, cacheWrite, toolCalls: [{name, input_summary}]}`
  - `cacheHitRate` — computed server-side
  - `modelMix` — `{model: percentage}` 
  - Client will sort and display top N heaviest

### Files to Modify
- `src/server.mjs` — enhance `/api/session-cost` response
- `src/ui/app.js` — `showCostBreakdown()` function to render new sections
- `src/ui/style.css` — styles for heaviest turns list
- `src/ui/index.html` — no changes needed (container already exists)

## Data Verification

**Confirmed from CCsrc (read actual source files, not guessing):**

| What | File | Verified |
|------|------|----------|
| Usage fields (input/output/cache) | `cost-tracker.ts:1` — imports `BetaUsage` from Anthropic SDK | ✅ |
| Pricing tiers | `utils/modelCost.ts:25-88` — all tiers with `@see` link to official docs | ✅ |
| Cost formula | `utils/modelCost.ts:131-142` — `tokensToUSDCost()` | ✅ |
| Opus 4.6 fast mode pricing | `utils/modelCost.ts:94-99` — checks `usage.speed === 'fast'` | ✅ |
| Session JSONL has tool_use in content | `server.mjs:632-705` — existing session-preview parses `c.type === "tool_use"` | ✅ |
| Status line rate limit data | `tools/AgentTool/built-in/statuslineSetup.ts:54-76` — JSON with `rate_limits` | ✅ |

## How to Test
```bash
cd ~/MyGithub/claude-code-organizer
git checkout feature/cost-breakdown
npm start
# Open http://localhost:3847
# Navigate to any project > Sessions > click a session > click "💰 Cost Breakdown"
```

Multi-model test sessions (confirmed to have both Opus + Sonnet):
- `5db29aaa-9109-4a38-9d98-dbbc70b28de0.jsonl` — "Graph-based repo traversal with BFS and LSP" (MyGithub project)
- `3823ac93-2efb-423b-99b6-de5c7a01e6f*.jsonl`
- `9f579d1c-a685-46fa-bdf5-63fcc48e1d0*.jsonl`
