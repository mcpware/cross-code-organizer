# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[English](README.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**整理你所有 Claude Code 的記憶、skills、MCP servers、commands、agents、rules 和 hooks，依照 scope hierarchy 檢視，並透過 drag-and-drop 在不同 scopes 之間移動。**

> **5 天內突破 100+ stars！** 我第一次把它貼上 Reddit 的 3 天後，它還只有 [11 stars when I first posted it on Reddit 3 days ago](https://www.reddit.com/r/coolgithubprojects/comments/1s12n97/claude_code_organizer_dashboard_that_shows/)。真實使用者實際測試、提供回饋，也一起把它打磨成現在的樣子。這是我的第一個 open source project，謝謝每一位幫忙加星、測試與回報問題的人。這只是開始。

![Claude Code Organizer Demo](docs/demo.gif)

<sub>Demo video 由 AI 透過 [Pagecast](https://github.com/mcpware/pagecast) 自動錄製</sub>

## 問題

你有沒有想過，每次啟動 Claude Code 的時候，還沒開始對話，你的 context window 就已經少了三分之一？

### Token 預算：開始之前就被吃掉了

Claude Code 啟動時會自動預載所有設定檔 — CLAUDE.md、記憶、skills、MCP server 定義、hooks、rules 等等。你還沒打字，這些東西就已經全部塞進 context window。

這是一個用了兩週的真實 project：

![Context Budget](docs/CB.png)

**69.2K tokens — 佔你 200K context window 的 34.6%，還沒輸入一個字就沒了。** 每個 session 光是這些 overhead 的成本：Opus $1.04 USD，Sonnet $0.21 USD。

剩下的 65.4% 要跟你的對話、Claude 的回覆、tool results 共用空間。Context 越滿，Claude 越不準確 — 這就是所謂的 **context rot**。

69.2K 怎麼來的？就是所有能離線測量的 config 檔案 token 加總，再加上估算的系統 overhead（~21K tokens）— system prompt、23+ 個內建 tool 定義、MCP tool schemas，每次 API call 都會載入。

但這還只是**靜態**的部分。以下這些 **runtime injections** 完全沒有算進去：

- **Rule re-injection** — 所有 rule 檔案在每次 tool call 之後都會重新注入 context。大約 30 次 tool call 之後，光這一項就能佔掉 ~46% context window
- **File change diffs** — 你讀過或寫過的檔案被外部修改（例如 linter），整個 diff 會作為隱藏的 system-reminder 注入
- **System reminders** — malware 警告、token 提醒等隱藏 injections
- **Conversation history** — 你的訊息、Claude 的回覆和所有 tool results 每次 API call 都會重新發送

所以 session 進行到一半時，實際用量遠超 69.2K。你只是看不到。

### Config 散落在錯誤的 scope

另一個問題：Claude Code 工作時會默默建立記憶、skills、MCP configs、commands 和 rules，然後丟進當前目錄對應的 scope。

它還會在不同 scope 悄悄重複安裝 MCP server。你不仔細看根本不會發現：

![重複的 MCP 伺服器](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams 裝了兩次、Gmail 裝了三次、Playwright 裝了三次 — 每個副本每次 session 都在浪費 token。Scope 標籤（`Global` / `nicole`）清楚標示了每個重複項在哪裡，讓你決定要保留哪個、移除哪個。

結果就是：
- 你希望到處都生效的偏好，被困在某個 project 裡
- 只屬於單一 repo 的 deploy skill，跑到 global 去，污染其他所有 project
- Global 的 Python pipeline skill，在你開 React frontend session 時一起被載入
- 重複的 MCP entries 讓同一個 server 初始化兩次
- 過時的記憶和現在的指示互相矛盾

每一個放錯位置的項目都在浪費 tokens **並且**降低準確度。而且沒有任何一條 command 可以一次看清所有 scope 的全貌。

### 解法：一個 command 開 dashboard

```bash
npx @mcpware/claude-code-organizer
```

看到 Claude 存了什麼，按 scope hierarchy 排好。**開始之前就看到你的 token 預算。** 拖拉搬移 scope、刪過時記憶、找重複項目。

> **首次執行會自動安裝 `/cco` skill** — 之後在任何 Claude Code session 輸入 `/cco` 就能打開 dashboard。

### 範例：找出什麼在吃 tokens

打開 dashboard，點 **Context Budget**，切換到 **By Tokens** — 最大的消耗者排最上面。一個你忘了的 2.4K token CLAUDE.md？一個在三個 scope 都重複的 skill？現在看到了。清理掉，省下 10-20% context window。

### 範例：修復 scope 污染

你在某個 project 裡告訴 Claude「我偏好 TypeScript + ESM」，但這個偏好應該全域生效。把那條記憶從 Project 拖到 Global。**完成，拖一下。** Deploy skill 放在 global 但其實只有一個 repo 用到？拖進那個 Project scope — 其他 project 就不會再看到它。

### 範例：刪除過時記憶

Claude 會自動記住你隨口說的話。一週後已經沒用了，卻仍然每次 session 都載入。瀏覽、閱讀、刪除。**Claude 以為自己知道你什麼，應該由你決定。**

---

## 比較

我們分析了所有找得到的 Claude Code tools 原始碼，包括 analytics dashboards (9K+ stars)、desktop apps (600+ stars)、VS Code extensions、TUI session managers 與 terminal statuslines。沒有任何一個提供真正的 scope hierarchy + drag-and-drop cross-scope moves，而且還是 standalone dashboard。

| 功能 | **Claude Code Organizer** | Desktop app (600+⭐) | VS Code extension | Analytics dashboards | TUI tools |
|---------|:---:|:---:|:---:|:---:|:---:|
| 真正的 scope hierarchy (Global > Workspace > Project) | **Yes** | No | Partial (no workspace) | No | No |
| Drag-and-drop moves | **Yes** | No | No | No | No |
| Cross-scope moves | **Yes** | No | One-click | No | No |
| 每個操作都能 undo | **Yes** | No | No | No | No |
| Bulk operations | **Yes** | No | No | No | No |
| 真正的 MCP server 管理 | **Yes** | Global only | Stub (icon only) | No | No |
| Context budget (token breakdown) | **Yes** | No | No | No | No |
| Commands + Agents + Rules | **Yes** | No | No | No | No |
| Session 管理 | **Yes** | No | No | Yes | Yes |
| Search & filter | **Yes** | No | Yes | Yes | No |
| MCP tools (AI-accessible) | **Yes** | No | No | No | No |
| Zero dependencies | **Yes** | No (Tauri+React) | No (VS Code) | No (Next.js/FastAPI) | No (Python) |
| Standalone (no IDE) | **Yes** | Yes | No | Yes | Yes |

## 功能

- **Scope-aware hierarchy** — 以 Global > Workspace > Project 顯示所有 items，並標示 inheritance
- **Drag-and-drop** — 在不同 scopes 之間移動記憶、skills、commands、agents、rules、MCP servers 和 plans
- **Undo everything** — 每一次移動和刪除都有 undo button，可立即還原，包含 MCP JSON entries
- **Bulk operations** — 進入 select mode，一次勾選多個 items，批次移動或刪除
- **Same-type safety** — 每個 category 只會移動到對應的 directory，記憶到 `memory/`、skills 到 `skills/`、commands 到 `commands/`，依此類推
- **Search & filter** — 即時搜尋所有 items，依 category 過濾，並支援 smart pill hiding (zero-count pills 會收合成 "+N more")
- **Context Budget** — 在你輸入任何東西之前就看到你的 config 佔了多少 tokens — 逐項分析、繼承的 scope 成本、系統 overhead 估算、以及佔 200K context 的百分比
- **Detail panel** — 點選任何 item 都能查看完整 metadata、content preview、file path，並直接在 VS Code 開啟
- **Session inspector** — 解析後的 conversation previews，含 speaker labels、session titles 與 metadata
- **11 categories** — 記憶、skills、MCP servers、commands、agents、rules、configs、hooks、plugins、plans 和 sessions
- **Bundled skill detection** — 透過 `skills-lock.json` 依來源 bundle 分組 skills
- **Contextual Claude Code prompts** — "Explain This"、"Edit Content"、"Edit Command"、"Edit Agent"、"Resume Session" buttons 會直接複製到 clipboard
- **Auto-hide detail panel** — 在你點選 item 之前，panel 會保持隱藏，讓內容區域最大化
- **Resizable panels** — 拖曳分隔線調整 sidebar、內容區域與 detail panel 大小
- **Real file moves** — 真正移動 `~/.claude/` 裡的檔案，不只是 viewer
- **Path traversal protection** — 所有 file endpoints 都會驗證 path 是否位於 HOME directory 內
- **Cross-device support** — 當 rename 在不同 filesystems 之間失敗時，會自動 fallback 成 copy+delete (Docker/WSL)
- **100+ E2E tests** — Playwright test suite 涵蓋 filesystem verification、安全性 (path traversal、malformed input)、context budget 與全部 11 categories

## 快速開始

### 選項 1：npx（不需安裝）

```bash
npx @mcpware/claude-code-organizer
```

### 選項 2：Global install

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### 選項 3：Ask Claude

把這段貼進 Claude Code:

> 執行 `npx @mcpware/claude-code-organizer`，這是一個用來管理 Claude Code 設定的 dashboard。準備好之後把 URL 告訴我。

會在 `http://localhost:3847` 打開 dashboard，直接操作你實際的 `~/.claude/` 目錄。

## 它能管理什麼

| 類型 | 檢視 | 移動 | 刪除 | 掃描範圍 |
|------|:----:|:----:|:------:|:----------:|
| 記憶 (feedback, user, project, reference) | Yes | Yes | Yes | Global + Project |
| Skills (with bundle detection) | Yes | Yes | Yes | Global + Project |
| MCP Servers | Yes | Yes | Yes | Global + Project |
| Commands (slash commands) | Yes | Yes | Yes | Global + Project |
| Agents (subagents) | Yes | Yes | Yes | Global + Project |
| Rules (project constraints) | Yes | Yes | Yes | Global + Project |
| Plans | Yes | Yes | Yes | Global + Project |
| Sessions | Yes | — | Yes | Project only |
| Config (CLAUDE.md, settings.json) | Yes | Locked | — | Global + Project |
| Hooks | Yes | Locked | — | Global + Project |
| Plugins | Yes | Locked | — | Global only |

## Scope Hierarchy

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

子 scopes 會繼承 parent scope 的記憶、skills、MCP servers、commands、agents 和 rules。

## 運作方式

1. **Scans** `~/.claude/` — 掃描所有 projects、記憶、skills、MCP servers、commands、agents、rules、hooks、plugins、plans 和 sessions
2. **Resolves scope hierarchy** — 從 filesystem paths 判斷 parent-child relationships
3. **Renders dashboard** — 三欄 layout: sidebar scope tree、依 category 分組的 items，以及帶 content preview 的 detail panel
4. **Handles moves** — 透過拖曳或點擊 "Move to..." 來移動，實際在磁碟上搬檔案，並附帶 safety checks 與 undo support
5. **Handles deletes** — 支援刪除後 undo、bulk delete 與 session cleanup

## 平台支援

| Platform | Status |
|----------|:------:|
| Ubuntu / Linux | Supported |
| macOS (Intel + Apple Silicon) | Supported (community-tested on Sequoia M3) |
| Windows | Not yet |
| WSL | Should work (untested) |

## 專案結構

```
src/
  scanner.mjs       # Scans ~/.claude/ — 11 categories, pure data, no side effects
  mover.mjs         # Moves/deletes files between scopes — safety checks + undo support
  server.mjs        # HTTP server — 8 REST endpoints
  mcp-server.mjs    # MCP server — 4 tools for AI clients (scan, move, delete, destinations)
  ui/
    index.html       # Three-panel layout with resizable dividers
    style.css        # All styling (edit freely, won't break logic)
    app.js           # Frontend: drag-drop, search, filters, bulk ops, undo, session preview
bin/
  cli.mjs            # Entry point (--mcp flag for MCP server mode)
```

Frontend 和 backend 完全分離。只要修改 `src/ui/` 裡的檔案，就能調整外觀而不用碰任何邏輯。

## API

這個 dashboard 背後是一組 REST API：

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scan` | GET | 掃描所有自訂內容，回傳 scopes、items 和 counts |
| `/api/move` | POST | 將 item 移動到不同 scope（支援 category/name disambiguation） |
| `/api/delete` | POST | 刪除 item（memory、skill、MCP、command、agent、rule、plan、session） |
| `/api/restore` | POST | 還原已刪除的檔案（undo support） |
| `/api/restore-mcp` | POST | 還原已刪除的 MCP server JSON entry（undo support） |
| `/api/destinations` | GET | 取得 item 可移動到的有效 destinations |
| `/api/file-content` | GET | 讀取檔案內容，提供 detail panel preview |
| `/api/session-preview` | GET | 將 JSONL session 解析成可閱讀的對話，包含 speaker labels |

## Roadmap

| Feature | Status | Description |
|---------|:------:|-------------|
| **Config Export/Backup** | 🔜 Next | 一鍵把所有掃描到的檔案匯出到備份資料夾，建立你自己的 snapshot |
| **Skill Quality Scoring** | 📋 Planned | 從生態系中 5,000+ 個 skills 裡評分並凸顯最好的項目，不再靠猜 |
| **Security Audit** | 📋 Planned | 掃描你的 `.claude/`，找出高風險權限、外洩 secrets 或可疑 hooks |
| **Cross-Harness Portability** | 📋 Planned | 在 Claude Code、Cursor、Codex、Gemini CLI 之間轉換 skills/configs |
| **Cost Tracker** | 💡 Exploring | 追蹤每個 session、每個 project 的 token 使用量與成本 |
| **Diff View** | 💡 Exploring | 比較不同 scopes 之間，或不同 snapshots 之間的 configs |

有功能想法嗎？[Open an issue](https://github.com/mcpware/claude-code-organizer/issues)。

## License

MIT

## 更多來自 @mcpware 的專案

| Project | 功能 | Install |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 個 Instagram Graph API tools，可處理貼文、留言、DM、限時動態與 analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | 在任何網頁上顯示 hover labels，讓 AI 可以用名稱指認元素 | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | 透過 MCP 將 browser sessions 錄成 GIF 或影片 | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI logo 設計 → SVG → 匯出完整 brand kit | `npx @mcpware/logoloom` |
## 作者

[ithiria894](https://github.com/ithiria894) — 為 Claude Code 生態系打造工具。

[![claude-code-organizer MCP server](https://glama.ai/mcp/servers/mcpware/claude-code-organizer/badges/card.svg)](https://glama.ai/mcp/servers/mcpware/claude-code-organizer)
