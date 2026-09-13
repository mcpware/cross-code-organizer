# Product Positioning

This document defines what Claude Code Organizer (CCO) should be, what it should not be, and how Claude-specific depth should fit into a broader cross-provider product direction.

## One-Sentence Positioning

CCO is a local-first control panel for CLI agent users to see, launch, manage, and understand their artifacts and configuration across providers.

## Short Version

CCO should not position itself as:
- a clone of Claude Code's official configuration UI
- a reverse-engineered reimplementation of every Claude Code runtime detail
- a product whose value depends on knowing Claude Code better than Anthropic does

CCO should position itself as:
- a fast operational UI for power users
- a single place to inspect sessions, skills, MCPs, configs, and related artifacts
- a cross-provider management layer
- a local intelligence layer that makes agent setups understandable and usable

## Core User

Primary user:
- someone who actively uses terminal-based coding agents
- someone who installs skills, MCP servers, commands, prompts, plugins, or custom config
- someone who forgets what they already installed or configured
- someone who wants to reopen sessions, browse assets, and perform quick management actions without digging through directories

This user is usually:
- a power user
- a builder
- a local-first person
- someone comfortable with files and terminals, but still annoyed by fragmented configuration

## Core User Jobs

The most important jobs are practical and frequent:

1. See what I currently have.
2. Find a skill, session, MCP, command, or config quickly.
3. Preview it without opening random files manually.
4. Reopen or reuse a prior session quickly.
5. Perform quick actions like move, delete, enable, disable, or copy launch commands.
6. Understand what is active, what is duplicated, and what is risky.

These jobs matter more than perfect modeling of every internal vendor detail.

## Product Thesis

The product thesis is:

Users do not need another CLI. They need a visual operational layer over the CLIs and agent ecosystems they already use.

That means CCO's job is to reduce:
- memory load
- directory spelunking
- "what did I already install?"
- "where did this come from?"
- "why is this behaving this way?"

## The Big Strategic Call

CCO should be built in two layers.

### Layer 1: Cross-Provider Core

This is the real product.

It should work for Claude Code first, but the concepts should generalize to other providers and tools later.

Core concepts:
- sessions
- skills / prompts / commands
- MCP / connectors / tools
- config artifacts
- quick actions
- search, preview, sort, filter
- launcher / reopen workflows

### Layer 2: Provider Adapters

This is where deeper vendor-specific knowledge lives.

For Claude Code, this can include:
- effective settings
- policy-aware ignored state
- MCP transport and approval details
- parsed skill metadata
- plugin and marketplace governance

This lets CCO go deep where useful without making the whole product depend on one provider.

## What CCO Is Not

CCO is not:
- a replacement for the official runtime
- a promise to mirror every internal setting or feature flag
- a full settings editor for every provider from day one
- a security product first
- a vendor-specific companion app that only makes sense for Claude Code

## What CCO Is

CCO is:
- a control panel
- an inventory browser
- a preview surface
- a launcher
- a governance and explainability layer
- a local UX improvement for CLI agent users

## Why This Still Matters If Official Tools Improve

Even if Anthropic ships better official Claude Code management UX, CCO still has room if it stays focused on:
- power-user workflows
- local-first speed
- unified artifact browsing
- session reopening convenience
- cross-provider management

The defensible value is not:
- "we know Claude Code better than Anthropic"

The defensible value is:
- "we help users manage their real-world agent setup across tools, faster and more comfortably"

## What Makes CCO Valuable Today

The current real value is already visible:
- users can see installed skills in one place
- users can preview sessions
- users can recover or reopen prior work faster
- users can inspect MCPs and config without manual filesystem digging
- users can perform direct actions like move/delete

That is not trivial. That is daily-use utility.

## Why `CCsrc` Is Useful but Not the Product

`CCsrc` is useful as a reference corpus for:
- what Claude Code surfaces exist
- what settings are real
- what policy and precedence models exist
- what CCO can expose more intelligently

`CCsrc` should not become the product roadmap by itself.

Use it to:
- avoid modeling Claude Code incorrectly
- identify important surfaces
- enrich the Claude adapter

Do not use it to:
- chase every internal feature
- mirror every prompt section or experimental gate
- turn CCO into an unofficial clone of the Claude Code control plane

## Product Pillars

CCO should optimize for four pillars.

### 1. Inventory

Show users what exists:
- skills
- sessions
- MCPs
- commands
- configs
- plugins
- related artifacts

### 2. Speed

Help users act quickly:
- preview
- copy command
- reopen
- move
- delete
- enable/disable

### 3. Explainability

Help users understand:
- where something came from
- whether it is active
- why it is ignored
- what is duplicated
- what is risky

### 4. Portability

Keep the mental model broad enough that the product can support:
- Claude Code
- Cursor-adjacent artifacts
- OpenCode / OpenAI CLI style tools
- future providers

## Product Boundary

The clean boundary is:

CCO owns the user's local operational experience around agent artifacts.

It does not need to own:
- model execution
- cloud billing
- provider auth UX
- every vendor-specific runtime setting editor

## Recommended Messaging

Bad messaging:
- "The best way to manage Claude Code"
- "A better Claude Code settings panel"
- "The unofficial Claude Code control center"

Better messaging:
- "A local control panel for your coding-agent setup"
- "See, search, preview, and manage your agent artifacts in one place"
- "A visual workspace for sessions, skills, MCPs, and config"
- "A fast operations UI for CLI agent users"

## Product Direction for Claude-Specific Depth

Claude-specific features are still valuable.

They should be framed as:
- a deep adapter
- premium depth
- advanced inspector functionality

Not as:
- the entire reason the product exists

Good Claude-specific depth:
- effective settings
- active vs ignored explanations
- MCP transport / scope / policy / approval details
- skill metadata parsing
- plugin trust/governance

These are valuable because they strengthen the Claude adapter while still fitting the broader product thesis.

## Prioritization Rule

When deciding whether to build a feature, ask:

1. Does this help a user do a frequent job faster?
2. Does this improve understanding of their current setup?
3. Can this concept generalize beyond Claude Code?
4. If it is Claude-specific, does it make the Claude adapter materially stronger without locking the whole product to Claude?

If the answer is mostly no, it is probably roadmap noise.

## What To Avoid

Avoid:
- overfitting the entire UI to Claude Code internals
- shipping too many categories before the core inventory UX is excellent
- trying to model every internal feature flag or experiment
- making product identity depend on reverse-engineering official source
- optimizing for completeness over day-to-day usefulness

## Concrete Near-Term Product Shape

Near-term, CCO should feel like:
- a sessions browser
- a skills browser
- an MCP browser
- a config browser
- a launcher
- a quick-action panel
- an advanced inspector for Claude users

That is already a coherent and useful product.

## Long-Term Product Shape

Long-term, CCO should become:

a unified local workspace for managing agent artifacts across providers

with:
- adapters for provider-specific depth
- a common inventory model
- a fast operational UI
- explainability and governance where it matters

## Bottom Line

CCO should not try to win by being "more official than the official product."

CCO should win by being:
- faster
- clearer
- more operational
- more local-first
- more cross-provider
- more useful for real daily workflows

Claude Code depth is an advantage.
It should be an adapter strength, not the whole identity.
