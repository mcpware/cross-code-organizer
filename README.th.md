# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | ไทย

**จัดระเบียบ memories, skills, MCP servers และ hooks ของ Claude Code ทั้งหมดในที่เดียว ดูตาม scope hierarchy และย้ายข้าม scope ด้วย drag-and-drop**

![Claude Code Organizer Demo](docs/demo.gif)

## ปัญหา

เคยสังเกตไหม? ทุกครั้งที่เปิด Claude Code ก่อนจะพิมพ์อะไรสักตัว context window หายไปเกือบหนึ่งในสามแล้ว

### Token budget หมดก่อนจะเริ่มทำงาน

Claude Code โหลด config ทั้งหมดอัตโนมัติตอนเปิด — CLAUDE.md, memories, skills, MCP server definitions, hooks, rules ฯลฯ ยังไม่ทันพิมพ์อะไร ทุกอย่างถูกยัดเข้า context window แล้ว

นี่คือ project จริงหลังใช้งานสองสัปดาห์:

![Context Budget](docs/CB.png)

**69.2K tokens — 34.6% ของ context window 200K หายไปก่อนพิมพ์แม้แต่ตัวเดียว** ค่าใช้จ่ายโดยประมาณของ overhead นี้: Opus $1.04 USD / Sonnet $0.21 USD ต่อ session

65.4% ที่เหลือต้องแบ่งกันระหว่างข้อความ, คำตอบของ Claude และ tool results ยิ่ง context เต็มเท่าไหร่ Claude ก็ยิ่งไม่แม่นยำ เรียกว่า **context rot**

69.2K มาจากไหน? คือผลรวม token ของ config files ทั้งหมดที่วัดแบบ offline ได้ บวกกับ system overhead โดยประมาณ (~21K tokens) — system prompt, 23+ tool definitions ในตัว และ MCP tool schemas ที่โหลดทุก API call

แต่นี่เป็นแค่ส่วน**คงที่** **Runtime injections** ต่อไปนี้ยังไม่ได้นับรวม:

- **Rule re-injection** — rule files ทั้งหมดถูกฉีดกลับเข้า context หลังทุก tool call หลัง ~30 tool calls แค่อันนี้ก็กิน ~46% ของ context window ได้
- **File change diffs** — ถ้าไฟล์ที่อ่านหรือเขียนถูกแก้จากข้างนอก (เช่น linter) diff ทั้งหมดถูกฉีดเป็น system-reminder ที่ซ่อนอยู่
- **System reminders** — คำเตือน malware, token reminders และ injections ซ่อนอื่น ๆ
- **Conversation history** — ข้อความ, คำตอบของ Claude และ tool results ทั้งหมดถูกส่งซ้ำทุก API call

การใช้จริงระหว่าง session สูงกว่า 69.2K มาก แค่มองไม่เห็น

### Config อยู่ผิด scope

อีกปัญหาหนึ่ง: Claude Code สร้าง memories, skills, MCP configs, commands และ rules เงียบ ๆ ทุกครั้งที่ทำงาน แล้วโยนลง scope ที่ตรงกับ directory ปัจจุบัน

นอกจากนี้ยังแอบติดตั้ง MCP server ซ้ำเมื่อคุณตั้งค่าใน scope ต่าง ๆ โดยคุณจะไม่รู้ตัวจนกว่าจะเปิดดู:

![MCP Server ซ้ำซ้อน](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams ติดตั้งสองครั้ง, Gmail สามครั้ง, Playwright สามครั้ง — แต่ละสำเนากินเปลือง token ทุก session ป้าย scope (`Global` / `nicole`) บอกชัดเจนว่าแต่ละตัวที่ซ้ำอยู่ที่ไหน เพื่อให้คุณตัดสินใจว่าจะเก็บตัวไหนและลบตัวไหน

ผลลัพธ์:
- สิ่งที่อยากให้มีผลทุกที่ กลับติดอยู่ใน project เดียว
- deploy skill ที่ควรอยู่กับ repo เดียว หลุดไป global ปนเปื้อน project อื่น
- Python pipeline skill ใน global ถูกโหลดเข้า session React frontend
- MCP entry ซ้ำทำให้ server เดิม initialize สองครั้ง
- memory เก่าขัดแย้งกับคำสั่งปัจจุบัน

ทุก item ที่อยู่ผิด scope เปลือง token **และ**ลดความแม่นยำ และไม่มีคำสั่งไหนที่แสดงภาพรวมทุก scope ได้ในทีเดียว

### ทางออก: สั่งครั้งเดียวเปิด dashboard

```bash
npx @mcpware/claude-code-organizer
```

เห็นทุกอย่างที่ Claude เก็บไว้ จัดตาม scope hierarchy **เห็น token budget ก่อนเริ่มทำงาน** ลากข้าม scope, ลบ memory เก่า, หา item ซ้ำ

> **รันครั้งแรกจะติดตั้ง `/cco` skill อัตโนมัติ** — หลังจากนั้นแค่พิมพ์ `/cco` ใน session ไหนก็ได้

### ตัวอย่าง: หาว่าอะไรกิน token

เปิด dashboard คลิก **Context Budget** สลับไป **By Tokens** — ตัวกินใหญ่สุดอยู่ด้านบน CLAUDE.md 2.4K token ที่ลืมไป? skill ซ้ำในสาม scope? เห็นแล้ว ทำความสะอาดแล้วประหยัด context window 10-20%

### ตัวอย่าง: แก้ scope ปนเปื้อน

บอก Claude ว่า "I prefer TypeScript + ESM" ตอนอยู่ใน project แต่ preference นี้ควรมีผลทุกที่ ลาก memory จาก Project ไป Global **ลากครั้งเดียวจบ** deploy skill ใน global ที่จริง ๆ ใช้กับ repo เดียว? ลากไป Project scope นั้น — project อื่นจะไม่เห็นอีก

### ตัวอย่าง: ลบ memory เก่า

Claude สร้าง memory อัตโนมัติจากสิ่งที่พูดเล่น ๆ ผ่านไปสัปดาห์ไม่เกี่ยวแล้ว แต่ยังโหลดทุก session เปิดดู อ่าน ลบ **คุณเป็นคนกำหนดว่า Claude ควรรู้อะไรเกี่ยวกับคุณ**

---

## ฟีเจอร์

- **เห็นตาม scope hierarchy** — item ทั้งหมดถูกจัดเป็น Global > Workspace > Project พร้อมตัวบอกการสืบทอด
- **Drag-and-drop** — ย้าย memories ข้าม scope, ย้าย skills ระหว่าง Global กับ per-repo, ย้าย MCP servers ข้าม config
- **ยืนยันก่อนย้าย** — ทุกครั้งที่ย้าย จะมี modal ให้ยืนยันก่อนแตะไฟล์จริง
- **กันย้ายผิดประเภท** — items แต่ละประเภทย้ายได้เฉพาะปลายทางของประเภทตัวเอง: memories ไป folder ของ Memory, skills ไป folder ของ Skills, MCP ไป MCP config
- **Search & filter** — ค้นหาทุก item ได้ทันที และกรองตามหมวดหมู่ (Memory, Skills, MCP, Config, Hooks, Plugins, Plans)
- **Context Budget** — ดูได้เลยว่า config ของคุณกิน token ไปเท่าไหร่ก่อนพิมพ์อะไร — แยกรายละเอียดทีละ item, ค่าใช้จ่าย scope ที่สืบทอด, ประมาณการ system overhead และ % ของ 200K context ที่ใช้ไป
- **detail panel** — คลิก item ไหนก็ได้เพื่อดู metadata แบบเต็ม, description, file path และเปิดใน VS Code
- **สแกนครบทุก Project** — ทุก scope จะแสดง item ทุกประเภท: memories, skills, MCP servers, configs, hooks และ plans
- **ย้ายไฟล์จริง** — ย้ายไฟล์ใน `~/.claude/` จริง ไม่ใช่แค่ viewer
- **100+ E2E tests** — ชุดทดสอบ Playwright ที่ครอบคลุมการตรวจ filesystem, ความปลอดภัย (path traversal, input ที่ผิดรูปแบบ), context budget และทั้ง 11 หมวดหมู่

## เริ่มต้นใช้งาน

### วิธีที่ 1: ใช้ npx (ไม่ต้อง install)

```bash
npx @mcpware/claude-code-organizer
```

### วิธีที่ 2: ติดตั้งแบบ global

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### วิธีที่ 3: ให้ Claude รันให้

วางข้อความนี้ใน Claude Code:

> Run `npx @mcpware/claude-code-organizer` — it's a dashboard for managing Claude Code settings. Tell me the URL when it's ready.

เมื่อรันแล้ว dashboard จะเปิดที่ `http://localhost:3847` และทำงานกับ `~/.claude/` จริงของคุณ

## สิ่งที่จัดการได้

| ประเภท | ดูได้ | ย้ายได้ | สแกนที่ | ทำไมถึงล็อก? |
|------|:----:|:----:|:----------:|-------------|
| Memories (feedback, user, project, reference) | ได้ | ได้ | Global + Project | — |
| Skills | ได้ | ได้ | Global + Project | — |
| MCP Servers | ได้ | ได้ | Global + Project | — |
| Config (CLAUDE.md, settings.json) | ได้ | ล็อก | Global + Project | เป็น system settings ถ้าย้ายอาจทำให้ config พัง |
| Hooks | ได้ | ล็อก | Global + Project | ผูกกับ settings context ถ้าย้ายผิดที่อาจ fail แบบเงียบ ๆ |
| Plans | ได้ | ได้ | Global + Project | — |
| Plugins | ได้ | ล็อก | Global only | cache ที่ Claude Code จัดการเอง |

## ลำดับชั้นของ scope

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

scope ลูกจะได้รับ memories, skills และ MCP servers จาก scope แม่โดยอัตโนมัติ

## วิธีการทำงาน

1. **สแกน** `~/.claude/` — ค้นหา projects, memories, skills, MCP servers, hooks, plugins และ plans ทั้งหมด
2. **ระบุ scope hierarchy** — ระบุความสัมพันธ์แบบ parent-child จาก filesystem paths
3. **เรนเดอร์ dashboard** — แสดง scope headers > category bars > item rows พร้อมระยะย่อหน้าให้ถูกต้อง
4. **จัดการการย้าย** — เมื่อคุณลากหรือคลิก "Move to..." ระบบจะย้ายไฟล์บน disk จริงพร้อม safety checks

## เปรียบเทียบ

เราไล่ดูเครื่องมือจัดการ config ของ Claude Code เท่าที่หาเจอ ยังไม่พบตัวไหนที่มีทั้ง scope hierarchy แบบมองเห็นภาพ และการย้ายข้าม scope ด้วย drag-and-drop ใน dashboard แบบ standalone

| สิ่งที่ต้องการ | Desktop app (600+⭐) | VS Code extension | Full-stack web app | **Claude Code Organizer** |
|---------|:---:|:---:|:---:|:---:|
| มี tree ของ scope hierarchy | ไม่มี | มี | บางส่วน | **มี** |
| ย้ายด้วย drag-and-drop | ไม่มี | ไม่มี | ไม่มี | **มี** |
| ย้ายข้าม scope | ไม่มี | คลิกครั้งเดียว | ไม่มี | **มี** |
| ลบ item ที่ไม่อัปเดตแล้ว | ไม่มี | ไม่มี | ไม่มี | **มี** |
| Context budget (token breakdown) | ไม่มี | ไม่มี | ไม่มี | **มี** |
| เครื่องมือ MCP | ไม่มี | ไม่มี | มี | **มี** |
| ไม่มี dependencies เพิ่ม | ไม่มี (Tauri) | ไม่มี (VS Code) | ไม่มี (React+Rust+SQLite) | **มี** |
| ใช้งาน standalone (ไม่ต้องมี IDE) | มี | ไม่มี | มี | **มี** |

## การรองรับแพลตฟอร์ม

| Platform | สถานะ |
|----------|:------:|
| Ubuntu / Linux | รองรับ |
| macOS (Intel + Apple Silicon) | รองรับ (มีคนใน community ทดสอบบน Sequoia M3 แล้ว) |
| Windows | ยังไม่รองรับ |
| WSL | น่าจะใช้ได้ (ยังไม่ทดสอบ) |

## โครงสร้าง project

```
src/
  scanner.mjs       # Scans ~/.claude/ — pure data, no side effects
  mover.mjs         # Moves files between scopes — safety checks + rollback
  server.mjs        # HTTP server — routes only, no logic
  ui/
    index.html       # HTML structure
    style.css        # All styling (edit freely, won't break logic)
    app.js           # Frontend rendering + SortableJS + interactions
bin/
  cli.mjs            # Entry point
```

Frontend กับ backend แยกจากกันชัดเจน ถ้าอยากปรับหน้าตา ให้แก้ไฟล์ใน `src/ui/` ได้เลยโดยไม่ต้องแตะ logic

## API

dashboard ตัวนี้มี REST API รองรับอยู่ด้านหลัง:

| Endpoint | Method | คำอธิบาย |
|----------|--------|-------------|
| `/api/scan` | GET | สแกน customizations ทั้งหมด แล้วคืน scopes + items + counts |
| `/api/move` | POST | ย้าย item ไปยัง scope อื่น (รองรับการแยกกรณี category/name ซ้ำกัน) |
| `/api/delete` | POST | ลบ item ถาวร |
| `/api/restore` | POST | กู้คืนไฟล์ที่ลบไป (ใช้สำหรับ undo) |
| `/api/restore-mcp` | POST | กู้คืน MCP server entry ที่ลบไป |
| `/api/destinations` | GET | ดึงปลายทางที่ย้ายไปได้สำหรับ item |
| `/api/file-content` | GET | อ่านเนื้อหาไฟล์เพื่อใช้ใน detail panel |

## สัญญาอนุญาต

MIT

## โปรเจกต์อื่นจาก @mcpware

| Project | ทำอะไร | Install |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | เครื่องมือ Instagram Graph API 23 ตัว — posts, comments, DMs, stories, analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | แสดงป้ายชื่อเวลา hover บนเว็บเพจใดก็ได้ — ให้ AI อ้างอิง element ตามชื่อ | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | บันทึก browser sessions เป็น GIF หรือวิดีโอผ่าน MCP | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | ออกแบบโลโก้ด้วย AI → SVG → export brand kit ได้ครบชุด | `npx @mcpware/logoloom` |

## ผู้เขียน

[ithiria894](https://github.com/ithiria894) — พัฒนาเครื่องมือสำหรับ ecosystem ของ Claude Code.
