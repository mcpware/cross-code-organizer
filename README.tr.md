# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | Türkçe | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Claude Code içindeki tüm memory, skill, MCP server ve hook'larınızı düzenleyin; scope hiyerarşisine göre görün, drag-and-drop ile scope'lar arasında taşıyın.**

![Claude Code Organizer Demo](docs/demo.gif)

## Sorun

Hiç fark ettin mi? Claude Code'u her açtığında, daha bir şey yazmadan context window'un üçte biri çoktan gitmiş oluyor.

### Token bütçen daha başlamadan tükeniyor

Claude Code başlarken tüm config dosyalarını otomatik yüklüyor — CLAUDE.md, memory'ler, skill'ler, MCP server tanımları, hook'lar, rule'lar vs. Sen daha hiçbir şey yazmadın ama hepsi zaten context window'a girmiş durumda.

İki haftalık gerçek bir projeye bak:

![Context Budget](docs/CB.png)

**69.2K token — 200K context window'unun %34.6'sı, tek karakter yazmadan uçmuş.** Bu overhead'in tahmini maliyeti: Opus $1.04 USD / Sonnet $0.21 USD (oturum başına).

Kalan %65.4'ü mesajların, Claude'un yanıtları ve tool results paylaşıyor. Context ne kadar dolarsa Claude o kadar yanlış yapıyor — buna **context rot** deniyor.

69.2K'nın kaynağı: offline ölçülebilen tüm config dosyalarının token toplamı + tahmini sistem overhead'i (~21K token) — system prompt, 23+ yerleşik tool tanımı ve MCP tool schemas. Bunlar her API call'da yükleniyor.

Ama bu sadece **statik** kısım. Şu **runtime injections** dahil değil:

- **Rule re-injection** — tüm rule dosyaların her tool call'dan sonra context'e tekrar enjekte ediliyor. ~30 tool call sonra, tek başına context window'un ~%46'sını yiyebilir
- **File change diffs** — okuduğun veya yazdığın bir dosya dışarıdan değiştirilirse (ör. linter), tüm diff gizli system-reminder olarak enjekte ediliyor
- **System reminders** — malware uyarıları, token hatırlatmaları ve diğer gizli injection'lar
- **Conversation history** — mesajların, Claude'un yanıtları ve tüm tool sonuçları her API call'da tekrar gönderiliyor

Oturum ortasındaki gerçek kullanımın 69.2K'dan çok daha yüksek. Sadece göremiyorsun.

### Config'lerin yanlış scope'ta

Diğer sorun: Claude Code çalışırken sessizce memory, skill, MCP config, command ve rule oluşturuyor ve bunları o anki dizinine uyan scope'a atıyor.

Bir de farklı scope'larda yapılandırdığın MCP server'ları sessizce tekrar yüklüyor. Bakana kadar fark etmiyorsun:

![Tekrarlanan MCP Server'lar](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams iki kez, Gmail üç kez, Playwright üç kez kurulmuş — her kopya her oturumda token yiyor. Scope etiketleri (`Global` / `nicole`) her tekrarın tam olarak nerede olduğunu gösteriyor; hangisini tutacağına, hangisini sileceğine sen karar verirsin.

Sonuç:
- Her yerde geçerli olması gereken bir tercih tek projede sıkışıyor
- Tek repo'ya ait deploy skill'i global'a sızıp diğer her şeyi kirletiyor
- Global'daki Python pipeline skill'i React frontend oturumuna da yükleniyor
- Tekrarlanan MCP kayıtları aynı server'ı iki kez başlatıyor
- Eski memory'ler güncel talimatlarınla çelişiyor

Yanlış scope'taki her öğe token harcıyor **ve** doğruluğu düşürüyor. Üstelik tüm scope'ları bir arada gösteren bir komut yok.

### Çözüm: tek komutla dashboard aç

```bash
npx @mcpware/claude-code-organizer
```

Claude'un sakladığı her şeyi scope hiyerarşisine göre gör. **Başlamadan önce token bütçeni gör.** Scope'lar arası sürükle, eski memory'leri sil, kopyaları bul.

> **İlk çalıştırma `/cco` skill'i otomatik yükler** — sonra herhangi bir oturumda `/cco` yazman yeterli.

### Örnek: Token'larını neyin yediğini bul

Dashboard'u aç, **Context Budget**'a tıkla, **By Tokens**'a geç — en büyük tüketiciler en üstte. Unuttuğun 2.4K token'lık CLAUDE.md? Üç scope'ta tekrarlanan skill? Artık görüyorsun. Temizle, context window'un %10-20'sini kurtar.

### Örnek: Scope kirliliğini düzelt

Bir proje içinde Claude'a "I prefer TypeScript + ESM" dedin ama bu tercih her yerde geçerli olmalı. O memory'yi Project'ten Global'a sürükle. **Bitti. Tek hareket.** Global'daki deploy skill'i aslında tek bir repo için mi? İlgili Project scope'una sürükle — diğer projeler artık görmez.

### Örnek: Eski memory'leri sil

Claude günlük sohbette söylediğin şeylerden otomatik memory üretiyor. Bir hafta sonra alakası kalmıyor ama her oturumda yüklenmeye devam ediyor. Göz at, oku, sil. **Claude'un senin hakkında ne bildiğini sandığına sen karar verirsin.**

---

## Özellikler

- **Scope hiyerarşisi görünümü** — Tüm öğeleri Global > Workspace > Project düzeninde, miras göstergeleriyle birlikte görün
- **Drag-and-drop** — memory'leri scope'lar arasında, skill'leri Global ile repo bazlı klasörler arasında, MCP server'larını config'ler arasında taşıyın
- **Taşıma onayı** — Her taşıma işleminde, dosyalara dokunmadan önce bir onay modal'ı açılır
- **Aynı tür güvenliği** — Memory öğeleri yalnızca memory klasörlerine, skill öğeleri skill klasörlerine, MCP kayıtları yalnızca MCP config'lerine taşınabilir
- **Arama ve filtreleme** — Tüm öğelerde anında arama yapın; kategoriye göre filtreleyin (Memory, Skills, MCP, Config, Hooks, Plugins, Plans)
- **Context Budget** — Herhangi bir şey yazmadan önce config'inizin kaç token tükettiğini görün — öğe bazında döküm, miras alınan scope maliyetleri, tahmini sistem overhead'i ve kullanılan 200K context yüzdesi
- **Detay paneli** — Herhangi bir öğeye tıklayıp tam metadata'yı, açıklamayı, dosya yolunu görün ve VS Code'da açın
- **Project bazında tam tarama** — Her scope'ta tüm öğe türleri taranır: memory'ler, skill'ler, MCP server'ları, config'ler, hook'lar ve planlar
- **Gerçek dosya taşıma** — Sadece görüntülemez; `~/.claude/` içindeki dosyaları gerçekten taşır
- **100+ E2E test** — Dosya sistemi doğrulaması, güvenlik (path traversal, hatalı input), context budget ve tüm 11 kategoriyi kapsayan Playwright test paketi

## Hızlı başlangıç

### Seçenek 1: npx (kurulum gerekmez)

```bash
npx @mcpware/claude-code-organizer
```

### Seçenek 2: Global kurulum

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### Seçenek 3: Claude'a sor

Bunu Claude Code içine yapıştırın:

> `npx @mcpware/claude-code-organizer` komutunu çalıştır; bu araç Claude Code ayarlarını yönetmek için bir dashboard açar. Hazır olunca URL'yi söyle.

`http://localhost:3847` adresinde bir dashboard açılır. Gerçek `~/.claude/` dizininizle çalışır.

## Neleri yönetir

| Tür | Görüntüle | Taşı | Nerede taranır | Neden kilitli? |
|------|:----:|:----:|:----------:|-------------|
| Memory (feedback, user, project, reference) | Evet | Evet | Global + Project | — |
| Skills | Evet | Evet | Global + Project | — |
| MCP Servers | Evet | Evet | Global + Project | — |
| Config (CLAUDE.md, settings.json) | Evet | Kilitli | Global + Project | Sistem ayarları; taşınırsa config bozulabilir |
| Hooks | Evet | Kilitli | Global + Project | Settings context'ine bağlıdır; taşınırsa sessiz hatalara yol açabilir |
| Plans | Evet | Evet | Global + Project | — |
| Plugins | Evet | Kilitli | Global only | Claude Code'un yönettiği cache |

## Scope hiyerarşisi

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

Alt scope'lar, üst scope'lardaki memory, skill ve MCP server'larını miras alır.

## Nasıl çalışır

1. **`~/.claude/` dizinini tarar** — tüm project'leri, memory'leri, skill'leri, MCP server'larını, hook'ları, plugin'leri ve planları keşfeder
2. **Scope hiyerarşisini belirler** — file system path'lerinden parent-child ilişkilerini çıkarır
3. **Dashboard'u render eder** — scope başlıkları > kategori çubukları > öğe satırları; doğru girintilemeyle
4. **Taşımaları yönetir** — bir öğeyi sürüklediğinizde ya da "Move to..." seçeneğine tıkladığınızda, güvenlik kontrolleriyle dosyaları diskte gerçekten taşır

## Karşılaştırma

Bulabildiğimiz tüm Claude Code config araçlarına baktık. Hiçbiri, bağımsız bir dashboard içinde görsel scope hiyerarşisini ve scope'lar arası drag-and-drop taşımayı birlikte sunmuyordu.

| İhtiyacım olan | Desktop app (600+⭐) | VS Code extension | Full-stack web app | **Claude Code Organizer** |
|---------|:---:|:---:|:---:|:---:|
| Scope hiyerarşisi ağacı | Hayır | Evet | Kısmen | **Evet** |
| Drag-and-drop taşıma | Hayır | Hayır | Hayır | **Evet** |
| Scope'lar arası taşıma | Hayır | Tek tık | Hayır | **Evet** |
| Eski öğeleri silme | Hayır | Hayır | Hayır | **Evet** |
| Context budget (token breakdown) | Hayır | Hayır | Hayır | **Evet** |
| MCP araçları | Hayır | Hayır | Evet | **Evet** |
| Sıfır bağımlılık | Hayır (Tauri) | Hayır (VS Code) | Hayır (React+Rust+SQLite) | **Evet** |
| Bağımsız çalışma (IDE gerekmez) | Evet | Hayır | Evet | **Evet** |

## Platform desteği

| Platform | Durum |
|----------|:------:|
| Ubuntu / Linux | Destekleniyor |
| macOS (Intel + Apple Silicon) | Destekleniyor (topluluk tarafından Sequoia M3 üzerinde test edildi) |
| Windows | Henüz yok |
| WSL | Muhtemelen çalışır (test edilmedi) |

## Proje yapısı

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

Frontend ile backend tamamen ayrıdır. Görünümü değiştirmek için `src/ui/` altını düzenlemeniz yeterlidir; logic katmanına dokunmanız gerekmez.

## API

Dashboard bir REST API ile çalışır:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scan` | GET | Tüm özelleştirmeleri tarar; scope'ları, öğeleri ve sayıları döndürür |
| `/api/move` | POST | Bir öğeyi başka bir scope'a taşır (category/name ayrıştırmasını destekler) |
| `/api/delete` | POST | Bir öğeyi kalıcı olarak siler |
| `/api/restore` | POST | Silinen bir dosyayı geri yükler (undo için) |
| `/api/restore-mcp` | POST | Silinen bir MCP server kaydını geri yükler |
| `/api/destinations` | GET | Bir öğe için geçerli taşıma hedeflerini getirir |
| `/api/file-content` | GET | Detay paneli için dosya içeriğini okur |

## Lisans

MIT

## @mcpware'den diğer projeler

| Project | What it does | Install |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 Instagram Graph API aracı; post'lar, yorumlar, DM'ler, story'ler, analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Herhangi bir web sayfasında hover label'ları gösterir; AI öğelere adıyla referans verir | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | MCP üzerinden tarayıcı oturumlarını GIF ya da video olarak kaydeder | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI logo tasarımı → SVG → tam brand kit export'u | `npx @mcpware/logoloom` |

## Yazar

[ithiria894](https://github.com/ithiria894) - Claude Code ekosistemi için araçlar geliştiriyor.
````

İsterseniz bir sonraki adımda bunu mevcut [README.tr.md](/home/nicole/MyGithub/claude-code-organizer/README.tr.md) dosyasına uygulanacak tek parça patch formatında da hazırlayabilirim.
