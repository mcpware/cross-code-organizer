# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 廣東話 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**管理晒你所有 Claude Code 嘅記憶、技能、MCP 伺服器、指令、代理、規則同 Hook — 按 scope 層級顯示，拖拉就搬得。**

![Claude Code Organizer Demo](docs/demo.gif)

<sub>Demo 影片由 AI 用 [Pagecast](https://github.com/mcpware/pagecast) 自動錄製</sub>

## 問題

你有冇留意到，每次開 Claude Code 嗰陣，其實背後已經靜靜雞食咗好多嘢？

### 你嘅 token 預算，開波前已經蝕咗三成

Claude Code 每次啟動，都會先 load 一堆 config — CLAUDE.md、記憶、技能、MCP server 定義、Hook、規則嗰啲。你仲未打字，佢已經全部塞晒入 context window。

呢個係一個用咗兩個禮拜嘅真實 project：

![Context Budget](docs/CB.png)

**69.2K tokens — 你 200K context window 嘅 34.6%，你未開口已經冇咗。** 每次 session 淨係呢啲 overhead 嘅成本：Opus $1.04 USD、Sonnet $0.21 USD。

剩返嗰 65.4% 要同你嘅對話、Claude 嘅回覆、tool results 搶位，而且 context 越滿 Claude 就越唔準 — 呢個叫 **context rot**。

69.2K 點嚟？包括我哋可以離線量度嘅所有 config 檔案，加埋一個估計嘅系統 overhead（~21K tokens）— 即係 system prompt、23+ 個內建 tool 定義同 MCP tool schemas，每次 API call 都會 load。

但呢個仲只係**靜態**部分。以下呢啲 **runtime injections** 完全冇計埋：

- **Rule re-injection** — 你所有 rule 檔案喺每次 tool call 之後都會重新注入。大約 30 次 tool call 之後，單係呢樣就食咗 ~46% context window
- **File change diffs** — 你讀過或者寫過嘅檔案俾外部改咗（例如 linter），成個 diff 會以隱藏嘅 system-reminder 注入
- **System reminders** — malware 警告、token 提醒同其他隱藏嘅 injections
- **Conversation history** — 你嘅 messages、Claude 嘅回覆同所有 tool results 每次 API call 都重新發送

所以你 session 做到一半嘅實際用量，遠遠超過 69.2K。你只係睇唔到。

### 你嘅 config 擺錯晒位

另一個問題：Claude Code 每次做嘢都會靜靜雞幫你 create 記憶、技能、MCP config、指令同規則，然後就 dump 落你當時所在嘅 scope。

仲有，佢會靜靜雞喺唔同 scope 重複安裝 MCP server。你唔睇清楚根本唔會發現：

![重複嘅 MCP 伺服器](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams 裝咗兩次、Gmail 裝咗三次、Playwright 裝咗三次 — 每個副本每次 session 都嘥緊 token。Scope 標籤（`Global` / `nicole`）清楚標示咗每個重複項喺邊度，等你決定邊個留、邊個刪。

結果就係：
- 你想全域生效嘅偏好，困死咗喺一個 project 入面
- 一個只屬於某個 repo 嘅 deploy 技能，漏咗去 global，污染埋其他 project
- Python pipeline 技能坐喺 global，你開 React session 都俾佢 load 埋
- 重複嘅 MCP entry 令同一個 server 初始化兩次
- 過期嘅記憶同你而家嘅指示互相矛盾

每一個擺錯位嘅項目都嘥 token **仲**降低準確度。而你冇任何 command 可以一次過睇晒所有 scope 嘅全貌。

### 搞掂佢：一條 command 開儀表板

```bash
npx @mcpware/claude-code-organizer
```

睇晒 Claude 儲咗啲乜，按 scope 層級排好。**開波之前就知你嘅 token 預算。** 拖拉搬 scope、刪過期記憶、搵重複項目。

> **首次運行會自動安裝 `/cco` skill** — 之後喺任何 Claude Code session 入面打 `/cco` 就可以開儀表板。

### 例子：搵出邊啲嘢食緊你嘅 tokens

開儀表板，撳 **Context Budget**，切換去 **By Tokens** — 最大嘅消耗者排喺最上面。一個你忘記咗嘅 2.4K token CLAUDE.md？一個喺三個 scope 都重複嘅技能？而家你睇到喇。清理佢，慳返 10-20% context window。

### 例子：修復 scope 污染

你喺一個 project 入面同 Claude 講「我鍾意 TypeScript + ESM」，但其實你想全域生效。將嗰條記憶由 Project 拖去 Global。**搞掂，拖一下。** 一個 deploy 技能坐咗喺 global 但其實得一個 repo 用到？拖佢入去嗰個 Project scope — 其他 project 即刻睇唔到。

### 例子：刪過期記憶

Claude 會自動記住你隨口講嘅嘢，一個禮拜之後已經冇用但仲係每次 session 都 load。瀏覽、閱讀、刪除。**你話事 Claude 以為自己知道你啲乜。**

---

## 對比

我哋分析咗搵到嘅所有 Claude Code 工具嘅原始碼 — analytics dashboard（9K+ stars）、桌面 app（600+ stars）、VS Code 擴充、TUI session manager、terminal statusline。冇一個有真正嘅 scope 層級 + 拖拉跨 scope 搬移。

| 功能 | **Claude Code Organizer** | 桌面 App (600+⭐) | VS Code 擴充 | Analytics Dashboard | TUI 工具 |
|------|:---:|:---:|:---:|:---:|:---:|
| 真正 scope 層級 (Global > Workspace > Project) | **有** | 冇 | 部分（冇 workspace） | 冇 | 冇 |
| 拖拉搬移 | **有** | 冇 | 冇 | 冇 | 冇 |
| 跨 scope 搬移 | **有** | 冇 | 一鍵 | 冇 | 冇 |
| 每個操作都可以 Undo | **有** | 冇 | 冇 | 冇 | 冇 |
| 批量操作 | **有** | 冇 | 冇 | 冇 | 冇 |
| 真正 MCP 伺服器管理 | **有** | 只有 Global | 空殼（得個 icon） | 冇 | 冇 |
| Context budget (token 分析) | **有** | 冇 | 冇 | 冇 | 冇 |
| 指令 + 代理 + 規則 | **有** | 冇 | 冇 | 冇 | 冇 |
| Session 管理 | **有** | 冇 | 冇 | 有 | 有 |
| 搜尋 & 篩選 | **有** | 冇 | 有 | 有 | 冇 |
| MCP 工具（AI 可存取） | **有** | 冇 | 冇 | 冇 | 冇 |
| 零依賴 | **有** | 冇 (Tauri+React) | 冇 (VS Code) | 冇 (Next.js/FastAPI) | 冇 (Python) |
| 獨立運行（唔使 IDE） | **有** | 有 | 冇 | 有 | 有 |

## 功能

- **Scope 分層檢視** — Global > Workspace > Project，層級一目瞭然，附繼承標記
- **拖拉搬移** — 記憶、技能、指令、代理、規則、MCP 伺服器、計劃，拖一下就換 scope
- **乜都可以 Undo** — 每個搬移同刪除都有 undo 掣 — 即時還原，包括 MCP JSON entry
- **批量操作** — 選擇模式：剔多個項目，一次過搬或刪
- **同類型安全** — 每個類別只能搬去自己嘅目錄 — 記憶去 memory/、技能去 skills/、指令去 commands/ 等等
- **搜尋 & 篩選** — 即時搜尋所有項目，按類別篩選（零項目嘅 pill 自動收埋去「+N 更多」）
- **Context Budget** — 喺你打字之前就睇到你嘅 config 食咗幾多 tokens — 逐項分析、繼承嘅 scope 成本、系統 overhead 估計、同 200K context 嘅使用百分比
- **詳情面板** — 撳任何項目睇完整 metadata、內容預覽、檔案路徑，直接用 VS Code 開
- **Session 檢視器** — 解析對話預覽，有講者標籤、session 標題同 metadata
- **11 個類別** — 記憶、技能、MCP 伺服器、指令、代理、規則、設定、Hook、Plugin、計劃、Session
- **打包技能偵測** — 透過 `skills-lock.json` 識別技能嘅來源套件
- **Claude Code 情境提示** — 「解釋呢個」、「編輯內容」、「編輯指令」、「編輯代理」、「繼續 Session」按鈕，一撳就 copy 去 clipboard
- **自動隱藏詳情面板** — 未撳項目之前面板收埋，慳返空間
- **可調大小面板** — 拖分隔線調整側欄、內容區域同詳情面板大小
- **真・檔案搬移** — 直接動 `~/.claude/` 入面嘅檔案，唔係得個睇字
- **路徑穿越保護** — 所有檔案 endpoint 都驗證路徑喺 HOME 目錄入面
- **跨裝置支援** — rename 跨 filesystem 失敗時自動 fallback 去 copy + delete（Docker/WSL）
- **100+ E2E 測試** — Playwright 測試套件，覆蓋 filesystem 驗證、安全性（路徑穿越、格式錯誤輸入）、context budget 同所有 11 個類別

## 快速開始

### 方式 1：npx（免安裝）

```bash
npx @mcpware/claude-code-organizer
```

### 方式 2：全域安裝

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### 方式 3：叫 Claude 幫你跑

直接貼呢段話俾 Claude Code：

> 幫我跑 `npx @mcpware/claude-code-organizer` — 呢個係管理 Claude Code 設定嘅儀表板。跑起嚟之後話我知個 URL。

開 `http://localhost:3847`，直接操作你本機嘅 `~/.claude/` 目錄。

## 管理範圍

| 類型 | 檢視 | 搬移 | 刪除 | 掃描位置 |
|------|:----:|:----:|:----:|:--------:|
| 記憶（feedback、user、project、reference） | 有 | 有 | 有 | Global + Project |
| 技能（有打包偵測） | 有 | 有 | 有 | Global + Project |
| MCP 伺服器 | 有 | 有 | 有 | Global + Project |
| 指令（slash commands） | 有 | 有 | 有 | Global + Project |
| 代理（subagents） | 有 | 有 | 有 | Global + Project |
| 規則（project 限制） | 有 | 有 | 有 | Global + Project |
| 計劃 | 有 | 有 | 有 | Global + Project |
| Session | 有 | — | 有 | 只有 Project |
| 設定（CLAUDE.md、settings.json） | 有 | 鎖住 | — | Global + Project |
| Hook | 有 | 鎖住 | — | Global + Project |
| Plugin | 有 | 鎖住 | — | 只有 Global |

## Scope 層級

```
Global                        <- 到處生效
  公司 (Workspace)             <- 底下所有子專案繼承
    公司Repo1                  <- 僅限呢個專案
    公司Repo2                  <- 僅限呢個專案
  Side Project (Project)       <- 獨立專案
  Docs (Project)               <- 獨立專案
```

子 scope 會自動繼承 parent scope 嘅記憶、技能、MCP 伺服器、指令、代理同規則。

## 運作原理

1. **掃描** `~/.claude/` — 搵出所有專案、記憶、技能、MCP 伺服器、指令、代理、規則、Hook、Plugin、計劃同 Session
2. **解析 scope 層級** — 由 filesystem 路徑推導出 parent-child 關係
3. **畫儀表板** — 三欄 layout：sidebar scope tree、按類別分組嘅項目、詳情面板連內容預覽
4. **處理搬移** — 拖拉或撳「移動到…」，server 做完安全檢查先搬檔案，支援 undo
5. **處理刪除** — 刪除有 undo、批量刪除、session 清理

## 平台支援

| 平台 | 狀態 |
|------|:----:|
| Ubuntu / Linux | 已支援 |
| macOS (Intel + Apple Silicon) | 已支援（社群喺 Sequoia M3 測試過） |
| Windows | 暫未支援 |
| WSL | 應該冇問題（未測試） |

## 專案結構

```
src/
  scanner.mjs       # 掃描 ~/.claude/ — 11 個類別，純資料，冇副作用
  mover.mjs         # 喺 scope 之間搬 / 刪檔案 — 安全檢查 + undo 支援
  server.mjs        # HTTP 伺服器 — 8 個 REST endpoint
  mcp-server.mjs    # MCP 伺服器 — 4 個工具俾 AI client 用（scan、move、delete、destinations）
  ui/
    index.html       # 三欄 layout，可調大小分隔線
    style.css        # 所有樣式（隨便改，唔會 break 邏輯）
    app.js           # 前端：拖拉、搜尋、篩選、批量操作、undo、session 預覽
bin/
  cli.mjs            # 入口（--mcp flag 開 MCP 伺服器模式）
```

前端同後端完全分開。改 `src/ui/` 嘅檔案唔會影響任何邏輯。

## API

儀表板背後有 REST API：

| Endpoint | Method | 描述 |
|----------|--------|------|
| `/api/scan` | GET | 掃描所有自訂項目，回傳 scope + 項目 + 計數 |
| `/api/move` | POST | 搬一個項目去其他 scope（支援類別/名稱消歧義） |
| `/api/delete` | POST | 刪除項目（記憶、技能、MCP、指令、代理、規則、計劃、session） |
| `/api/restore` | POST | 還原已刪除嘅檔案（undo 支援） |
| `/api/restore-mcp` | POST | 還原已刪除嘅 MCP 伺服器 JSON entry（undo 支援） |
| `/api/destinations` | GET | 攞一個項目嘅有效搬移目的地 |
| `/api/file-content` | GET | 讀檔案內容俾詳情面板預覽 |
| `/api/session-preview` | GET | 解析 JSONL session 做可讀對話，有講者標籤 |

## 授權

MIT

## 更多 @mcpware 嘅嘢

| 專案 | 做咩嘅 | 安裝 |
|------|--------|------|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 個 Instagram Graph API 工具 — 貼文、留言、DM、限動、分析 | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | 喺任何網頁上面加懸浮標籤 — AI 可以用名稱指定元素 | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | 用 MCP 錄瀏覽器 session 做 GIF 或影片 | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI logo 設計 → SVG → 完整品牌套件匯出 | `npx @mcpware/logoloom` |

## 作者

[ithiria894](https://github.com/ithiria894) — 替 Claude Code 生態系打造工具。

[![claude-code-organizer MCP server](https://glama.ai/mcp/servers/mcpware/claude-code-organizer/badges/card.svg)](https://glama.ai/mcp/servers/mcpware/claude-code-organizer)
