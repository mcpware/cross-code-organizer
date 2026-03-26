# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | Bahasa Indonesia | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Rapikan semua memory, skill, MCP server, dan hook Claude Code Anda — lihat berdasarkan hierarki scope, pindahkan antar-scope lewat drag-and-drop.**

![Claude Code Organizer Demo](docs/demo.gif)

## Masalahnya

Pernah sadar nggak? Setiap kali buka Claude Code, context window kamu sudah kehilangan sepertiga kapasitas bahkan sebelum kamu mengetik apa pun.

### Budget token habis duluan sebelum mulai kerja

Claude Code otomatis memuat semua file konfigurasi saat startup — CLAUDE.md, memory, skill, definisi MCP server, hooks, rules, dan sebagainya. Belum ketik apa-apa, semuanya sudah masuk context window.

Ini contoh project nyata setelah dua minggu dipakai:

![Context Budget](docs/CB.png)

**69.2K tokens — 34.6% dari context window 200K kamu, hilang sebelum mengetik satu karakter pun.** Estimasi biaya overhead ini saja: Opus $1.04 USD / Sonnet $0.21 USD per session.

Sisa 65.4% harus dibagi antara pesan kamu, jawaban Claude, dan tool results. Makin penuh context-nya, makin nggak akurat Claude — ini yang disebut **context rot**.

69.2K itu dari mana? Total token dari semua file config yang bisa diukur offline, ditambah estimasi system overhead (~21K tokens) — system prompt, 23+ definisi tool bawaan, dan MCP tool schemas yang dimuat setiap API call.

Tapi itu baru bagian **statis**-nya. **Runtime injections** berikut ini belum termasuk sama sekali:

- **Rule re-injection** — semua file rule kamu di-inject ulang ke context setelah setiap tool call. Setelah ~30 tool call, ini saja bisa makan ~46% context window
- **File change diffs** — kalau file yang kamu baca atau tulis diubah dari luar (misal oleh linter), seluruh diff di-inject sebagai system-reminder tersembunyi
- **System reminders** — peringatan malware, pengingat token, dan injeksi tersembunyi lainnya
- **Conversation history** — pesan kamu, jawaban Claude, dan semua tool results dikirim ulang di setiap API call

Jadi pemakaian sebenarnya di tengah session jauh lebih tinggi dari 69.2K. Kamu cuma nggak bisa lihat.

### Konfigurasi nyasar di scope yang salah

Masalah lainnya: Claude Code diam-diam bikin memory, skill, MCP config, commands, dan rules setiap kali kamu kerja, lalu ditaruh di scope yang cocok dengan direktori saat itu.

Selain itu, MCP server juga diam-diam diinstal ulang kalau kamu mengkonfigurasinya di scope yang berbeda. Kamu nggak sadar sampai benar-benar cek:

![MCP Server Duplikat](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams terinstal dua kali, Gmail tiga kali, Playwright tiga kali — setiap salinan membuang token di setiap session. Label scope (`Global` / `nicole`) menunjukkan persis di mana setiap duplikat berada, jadi kamu bisa tentukan mana yang dipertahankan dan mana yang dihapus.

Hasilnya:
- Preferensi yang harusnya berlaku di mana-mana, malah terkunci di satu project
- Skill deploy yang cuma untuk satu repo, bocor ke global dan mencemari semua project lain
- Skill Python pipeline di global ikut dimuat saat buka session React frontend
- Entry MCP duplikat bikin server yang sama diinisialisasi dua kali
- Memory usang bertentangan dengan instruksi terbaru

Setiap item di scope yang salah membuang token **dan** menurunkan akurasi. Dan nggak ada command yang bisa menampilkan semua scope secara lengkap sekaligus.

### Solusinya: satu command, satu dashboard

```bash
npx @mcpware/claude-code-organizer
```

Lihat semua yang disimpan Claude, tersusun menurut hierarki scope. **Lihat budget token sebelum mulai.** Drag antar-scope, hapus memory usang, temukan duplikat.

> **Pertama kali dijalankan, `/cco` skill otomatis terinstal** — setelah itu cukup ketik `/cco` di session Claude Code mana pun untuk buka dashboard.

### Contoh: Cari apa yang menghabiskan token kamu

Buka dashboard, klik **Context Budget**, pilih **By Tokens** — konsumen terbesar di atas. CLAUDE.md 2.4K token yang kamu lupa? Skill duplikat di tiga scope? Sekarang kelihatan. Bersihkan, hemat 10-20% context window.

### Contoh: Perbaiki scope yang tercampur

Kamu bilang ke Claude "I prefer TypeScript + ESM" di satu project, padahal preferensi itu berlaku global. Drag memory itu dari Project ke Global. **Selesai. Sekali drag.** Skill deploy di global tapi cuma relevan untuk satu repo? Drag ke Project scope itu — project lain nggak akan lihat lagi.

### Contoh: Hapus memory usang

Claude bikin memory otomatis dari hal yang kamu ucapkan sambil lalu. Seminggu kemudian sudah nggak relevan tapi tetap dimuat tiap session. Jelajahi, baca, hapus. **Kamu yang tentukan apa yang Claude anggap dia tahu soal kamu.**

---

## fitur

- **Hierarki berbasis scope** — Semua item terlihat dalam susunan Global > Workspace > Project, lengkap dengan indikator inheritance
- **Drag-and-drop** — Pindahkan memory antar-scope, skill antara Global dan per-repo, MCP server antar-config
- **Konfirmasi perpindahan** — Setiap perpindahan selalu memunculkan modal konfirmasi sebelum file apa pun disentuh
- **Pembatasan berdasarkan tipe** — Memory hanya bisa dipindahkan ke folder Memory, skill ke folder skill, dan MCP ke config MCP
- **Search & filter** — Cari item seketika di seluruh daftar, lalu filter berdasarkan kategori (Memory, Skills, MCP, Config, Hooks, Plugins, Plans)
- **Context Budget** — Lihat persis berapa token yang dikonsumsi config Anda sebelum mengetik apa pun — rincian per item, biaya scope yang diwarisi, estimasi system overhead, dan % dari 200K context yang terpakai
- **Detail panel** — Klik item mana pun untuk melihat metadata lengkap, deskripsi, file path, dan membukanya di VS Code
- **Scan penuh per-project** — Setiap scope menampilkan semua jenis item: memory, skill, MCP server, config, hook, dan plan
- **Perpindahan file sungguhan** — File benar-benar dipindahkan di `~/.claude/`, bukan sekadar viewer
- **100+ E2E tests** — Test suite Playwright yang mencakup verifikasi filesystem, keamanan (path traversal, input malformed), context budget, dan semua 11 kategori

## mulai cepat

### opsi 1: npx (tanpa install)

```bash
npx @mcpware/claude-code-organizer
```

### opsi 2: install global

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### opsi 3: minta Claude

Tempelkan ini ke Claude Code:

> Jalankan `npx @mcpware/claude-code-organizer` — ini dashboard untuk mengelola pengaturan Claude Code. Beri tahu saya URL-nya saat sudah siap.

Dashboard akan terbuka di `http://localhost:3847`. Aplikasi ini bekerja langsung dengan direktori `~/.claude/` Anda yang sebenarnya.

## yang dikelola

| Tipe | Lihat | Pindah | Di-scan di | Kenapa dikunci? |
|------|:----:|:----:|:----------:|-------------|
| Memories (feedback, user, project, reference) | Ya | Ya | Global + Project | — |
| Skills | Ya | Ya | Global + Project | — |
| MCP Servers | Ya | Ya | Global + Project | — |
| Config (CLAUDE.md, settings.json) | Ya | Dikunci | Global + Project | System settings — perpindahan bisa merusak config |
| Hooks | Ya | Dikunci | Global + Project | Bergantung pada context settings — jika dipindah bisa gagal diam-diam |
| Plans | Ya | Ya | Global + Project | — |
| Plugins | Ya | Dikunci | Global only | Cache yang dikelola Claude Code |

## hierarki scope

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

Scope turunan mewarisi memory, skill, dan MCP server dari parent scope.

## cara kerjanya

1. **Memindai** `~/.claude/` — menemukan semua project, memory, skill, MCP server, hook, plugin, dan plan
2. **Menentukan hierarki scope** — memetakan relasi parent-child dari path filesystem
3. **Merender dashboard** — header scope > bar kategori > baris item, dengan indentasi yang tepat
4. **Menangani perpindahan** — saat Anda drag item atau mengklik "Move to...", file di disk benar-benar dipindahkan dengan safety check

## perbandingan

Kami meninjau semua tool config Claude Code yang bisa kami temukan. Tidak ada satu pun yang menawarkan hierarki scope visual plus perpindahan lintas-scope via drag-and-drop dalam dashboard standalone.

| Yang saya butuhkan | Desktop app (600+⭐) | VS Code extension | Full-stack web app | **Claude Code Organizer** |
|---------|:---:|:---:|:---:|:---:|
| Tree hierarki scope | No | Yes | Partial | **Yes** |
| Perpindahan drag-and-drop | No | No | No | **Yes** |
| Perpindahan lintas-scope | No | One-click | No | **Yes** |
| Hapus item usang | No | No | No | **Yes** |
| Context budget (token breakdown) | No | No | No | **Yes** |
| Tool MCP | No | No | Yes | **Yes** |
| Zero dependencies | No (Tauri) | No (VS Code) | No (React+Rust+SQLite) | **Yes** |
| Standalone (tanpa IDE) | Yes | No | Yes | **Yes** |

## dukungan platform

| Platform | Status |
|----------|:------:|
| Ubuntu / Linux | Didukung |
| macOS (Intel + Apple Silicon) | Didukung (sudah diuji komunitas di Sequoia M3) |
| Windows | Belum |
| WSL | Seharusnya bisa jalan (belum diuji) |

## struktur project

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

Frontend dan backend dipisahkan sepenuhnya. Anda bisa mengubah tampilan lewat file di `src/ui/` tanpa menyentuh logic apa pun.

## API

Dashboard ini berjalan di atas REST API:

| Endpoint | Method | Deskripsi |
|----------|--------|-------------|
| `/api/scan` | GET | Scan semua kustomisasi, lalu mengembalikan scope + item + count |
| `/api/move` | POST | Memindahkan item ke scope lain (mendukung disambiguasi kategori/nama) |
| `/api/delete` | POST | Menghapus item secara permanen |
| `/api/restore` | POST | Memulihkan file yang sudah dihapus (untuk undo) |
| `/api/restore-mcp` | POST | Memulihkan entri MCP server yang dihapus |
| `/api/destinations` | GET | Mengambil tujuan perpindahan yang valid untuk sebuah item |
| `/api/file-content` | GET | Membaca isi file untuk detail panel |

## lisensi

MIT

## proyek lain dari @mcpware

| Project | Apa fungsinya | Install |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 tool Instagram Graph API — posts, comments, DMs, stories, analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Label hover di halaman web mana pun — AI mereferensikan elemen berdasarkan nama | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | Rekam sesi browser sebagai GIF atau video lewat MCP | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | Desain logo dengan AI → SVG → ekspor brand kit lengkap | `npx @mcpware/logoloom` |

## penulis

[ithiria894](https://github.com/ithiria894) — Membangun tool untuk ekosistem Claude Code.
