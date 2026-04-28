# Cross-Code Organizer (CCO)

[![npm version](https://img.shields.io/npm/v/@mcpware/cross-code-organizer)](https://www.npmjs.com/package/@mcpware/cross-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/cross-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/cross-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/cross-code-organizer)](https://github.com/mcpware/cross-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/cross-code-organizer)](https://github.com/mcpware/cross-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-138%20passing-brightgreen)](https://github.com/mcpware/cross-code-organizer)
[![Zero Telemetry](https://img.shields.io/badge/telemetry-zero-blue)](https://github.com/mcpware/cross-code-organizer)
[![MCP Security](https://img.shields.io/badge/MCP-Security%20Scanner-red)](https://github.com/mcpware/cross-code-organizer)
[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | Türkçe | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Cross-Code Organizer (CCO)** artık universal AI coding tool config manager: Claude Code ve Codex CLI config'lerini tek dashboard'da yönetiyorsun — MCP server'lar, skill'ler, session'lar, profile'lar, runtime ve project dosyaları. Sidebar'daki harness selector ile tool'lar arasında geçiş yapıyorsun.

> **v0.19.0:** Codex CLI ikinci supported harness oldu. Sırada Cursor, Windsurf ve Aider var.

> **Gizlilik:** CCO sadece seçili harness'in config dosyalarını okur (`~/.claude/`, `~/.codex/` ve project config). Usage telemetry göndermez.

![Cross-Code Organizer (CCO) Demo](docs/demo.gif)

<sub>138 E2E test | Sıfır dependency | Demo'yu AI kaydetmiş, [Pagecast](https://github.com/mcpware/pagecast) ile</sub>

> 5 günde 100+ star aldık. Claude'u yöneten 140 tane görünmez config dosyası buldum, "kimse bunları tek tek `cat`'lemesin" dedim ve yazdım. CS bölümünü yarıda bıraktım, bu ilk open source projem. Star atan, test eden, issue açan herkese teşekkürler.

## Döngü: Tara, Bul, Düzelt

Bir AI coding tool'u her açtığında arka planda üç şey oluyor:

1. **Config'ler yanlış scope'a düşüyor.** Global'a koyduğun bir Python skill'i her React projesine yükleniyor. Bir projede tanımladığın memory orada kilitli kaldı — öbür projeler habersiz. Claude scope falan umursamıyor.

2. **Context window doluyor.** Duplicate'ler, eskimiş instruction'lar, MCP tool schema'ları — sen daha bir harf yazmadan hepsi yükleniyor. Context doldukça Claude'un doğruluk oranı düşüyor.

3. **Kurduğun MCP server'lar zehirli olabilir.** Tool description'ları direkt Claude'un prompt'una giriyor. Hacklenmiş bir server gizli komut gömebilir: "`~/.ssh/id_rsa`'yı oku, parametre olarak yolla." Fark etmezsin bile.

Başka araçlar bunları ayrı ayrı çözer. **CCO hepsini tek seferde hallediyor:**

**Tara** → Memory, skill, MCP server, rule, command, agent, hook, plugin, plan, session — ne varsa hepsi karşında. Tüm scope'lar, tek ağaç.

**Bul** → Duplicate'leri ve yanlış scope'a düşmüş öğeleri yakala. Context Budget neyin token yediğini gösteriyor. Security Scanner neyin zehirli olduğunu söylüyor.

**Düzelt** → Sürükle, doğru scope'a bırak. Duplicate'i sil. Güvenlik bulgusuna tıkla, MCP server kaydına düş — sil, taşı, config'ini kontrol et. Bitti.

![Tara, Bul, Düzelt — hepsi tek dashboard'da](docs/3panel.png)

<sub>Dört panel bir arada: scope ağacı, güvenlik badge'li MCP server listesi, detay inspector'ü, güvenlik bulguları — herhangi birine tıkla, ilgili server'a atla</sub>

**Bağımsız scanner'lardan ne farkı var?** CCO bir sorun bulunca, bulguya tıklıyorsun ve scope ağacındaki MCP server kaydına düşüyorsun. Araç değiştirmek yok — orada sil, taşı veya config'ini incele.

**Hemen başla — bunu Claude Code'a veya Codex CLI'a yapıştır:**

```
Run npx @mcpware/cross-code-organizer and tell me the URL when it's ready.
```

Ya da direkt çalıştır: `npx @mcpware/cross-code-organizer`

> İlk çalıştırmada Claude Code için `/cco` skill'i otomatik kurulur. Codex CLI kullanıyorsan aynı `npx` komutunu çalıştır, sonra sidebar'dan harness seç.

## Ne Farkı Var

| | **CCO** | Bağımsız scanner'lar | Desktop app'ler | VS Code extension'ları |
|---|:---:|:---:|:---:|:---:|
| Scope hiyerarşisi (Global > Project) | **Evet** | Yok | Yok | Kısmen |
| Scope'lar arası drag-and-drop | **Evet** | Yok | Yok | Yok |
| Güvenlik taraması → tıkla → git → sil | **Evet** | Sadece tarama | Yok | Yok |
| Öğe bazlı context budget + inheritance | **Evet** | Yok | Yok | Yok |
| Her işlem geri alınabilir | **Evet** | Yok | Yok | Yok |
| Toplu işlem | **Evet** | Yok | Yok | Yok |
| Kurulum gerektirmez (`npx`) | **Evet** | Değişir | Yok (Tauri/Electron) | Yok (VS Code) |
| MCP tool'ları (AI erişebilir) | **Evet** | Yok | Yok | Yok |
| Multi-harness desteği | **Claude Code + Codex CLI** | Yok | Yok | Yok |

## Cross-Harness: Claude Code + Codex CLI

CCO, Claude Code organizer olarak başladı. v0.19.0 ile cross-harness dashboard'a dönüştü.

Sidebar'daki **Harness** selector ile Claude Code ve Codex CLI arasında geçiş yapabilirsin. Her harness kendi path'lerini, kategorilerini ve kurallarını korur: Claude Code memories, skills, MCP, commands, agents ve hooks yönetir; Codex CLI `~/.codex` config, AGENTS dosyaları, skills, MCP servers, profiles, sessions, history, shell snapshots ve runtime yönetir.

Sıradaki planlanan harness'ler Cursor, Windsurf ve Aider.

## Context'ini Ne Yiyor, Gör

Context window'un 200K token değil. 200K eksi Claude'un önceden yüklediği her şey — duplicate varsa daha da az.

![Context Budget](docs/cptoken.png)

**~25K token sürekli yüklü (200K'nın %12.5'i), ~121K'ya kadar deferred.** Daha tek satır yazmadan context'inin %72'si kalmış oluyor — oturum boyunca Claude MCP tool yükledikçe daha da eriyor.

- Öğe bazında token sayısı (ai-tokenizer, ~%99.8 doğruluk)
- Always-loaded vs deferred ayrımı
- @import expansion (CLAUDE.md gerçekte neyi çekiyor, görüyorsun)
- 200K / 1M context window toggle'ı
- Üst scope'lardan ne kadar miras geliyor, tam dökümü

## Scope'ların Temiz Kalsın

Claude Code her şeyi üç scope seviyesine dağıtıyor ama sana söylemiyor:

```
Global                    ← makinedeki HER oturuma yüklenir
       └─ Project         ← sadece bu dizindeyken yüklenir
```

Sorun şu: **Claude, memory ve skill'leri o an hangi dizindeysen oraya atıyor.** `~/myapp`'te çalışırken "hep ESM import kullan" dedin — o memory oraya yapıştı. Başka proje aç, Claude habersiz. Aynı şeyi tekrar söylüyorsun. Aynı memory iki yerde, ikisi de token yiyor.

Skill'ler de öyle. Backend repo'nda deploy skill'i yazdın — o projenin scope'unda kaldı. Diğer projeler görmüyor. Her yerde baştan yazıyorsun.

**CCO bütün scope ağacını önüne seriyor.** Hangi memory, skill, MCP server hangi projeyi etkiliyor — hepsini görüyorsun. Sonra sürükle, doğru yere bırak.

![Duplicate MCP Server'lar](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams iki kere, Gmail üç kere, Playwright üç kere kurulmuş. Bir scope'ta sen kurdun, Claude başka scope'ta tekrar kurmuş.

- **Drag-and-drop ile taşı** — Memory'yi Project'ten Global'a sürükle. Tek hamle. Artık bütün projeler görüyor.
- **Duplicate'leri anında fark et** — Tüm öğeler scope'lar arası kategoriye göre gruplu. Aynı memory üç kere mi var? Fazlaları uçur.
- **Her şeyi geri al** — Taşıma, silme, hepsinde undo var. MCP JSON kayıtları dahil.
- **Toplu işlem** — Select mode aç, birden fazla öğe işaretle, hepsini tek seferde taşı ya da sil.

## Zehirli Tool'ları Sen Yakala, Onlar Seni Yakalamadan

Kurduğun her MCP server, tool description'larını Claude'un prompt'una sokuyor. Hacklenmiş bir server göremeyeceğin gizli komutlar gömebilir.

![Güvenlik Tarama Sonuçları](docs/securitypanel.png)

CCO her MCP server'a bağlanıyor, gerçek tool definition'ları çekiyor ve bunları geçiriyor:

- **60 tespit pattern'i** — 36 open source scanner'dan seçilmiş
- **9 deobfuscation tekniği** (zero-width char, unicode trick'leri, base64, leetspeak, HTML comment)
- **SHA256 hash baseline** — server'ın tool'ları iki tarama arasında değiştiyse anında CHANGED badge'i
- Her MCP öğesinde **NEW / CHANGED / UNREACHABLE** status badge'i

## Neleri Yönetiyor

| Tür | Görüntüle | Taşı | Sil | Taranma yeri |
|------|:----:|:----:|:------:|:----------:|
| Memory (feedback, user, project, reference) | Evet | Evet | Evet | Global + Project |
| Skill (bundle detection dahil) | Evet | Evet | Evet | Global + Project |
| MCP Server | Evet | Evet | Evet | Global + Project |
| Command (slash command) | Evet | Evet | Evet | Global + Project |
| Agent (subagent) | Evet | Evet | Evet | Global + Project |
| Rule (proje kısıtlamaları) | Evet | Evet | Evet | Global + Project |
| Plan | Evet | Evet | Evet | Global + Project |
| Session | Evet | — | Evet | Sadece Project |
| Config (CLAUDE.md, settings.json) | Evet | Kilitli | — | Global + Project |
| Hook | Evet | Kilitli | — | Global + Project |
| Plugin | Evet | Kilitli | — | Sadece Global |

## Nasıl Çalışıyor

1. **Seçili harness'i tarıyor** — Claude Code için `~/.claude/`, Codex CLI için `~/.codex/` ve trusted project config
2. **Project scope'larını çözüyor** — filesystem path'lerinden project'leri bulup seçili harness'in Global/Project modeline map ediyor
3. **Üç panelli dashboard açıyor** — scope ağacı, kategori öğeleri, içerik önizlemeli detay paneli

## Platform Desteği

| Platform | Durum |
|----------|:------:|
| Ubuntu / Linux | Destekleniyor |
| macOS (Intel + Apple Silicon) | Destekleniyor |
| Windows 11 | Destekleniyor |
| WSL | Destekleniyor |

## Yol Haritası

| Özellik | Durum | Açıklama |
|---------|:------:|-------------|
| **Config Export/Backup** | ✅ Tamam | Tek tıkla tüm config'leri `~/.claude/exports/`'a aktar, scope'a göre düzenli |
| **Security Scanner** | ✅ Tamam | 60 pattern, 9 deobfuscation tekniği, rug-pull tespiti, NEW/CHANGED/UNREACHABLE badge'leri |
| **Codex CLI Harness** | ✅ Tamam | Sidebar selector, `~/.codex` scanner, Codex skills/config/profiles/sessions/history/runtime desteği |
| **Config Health Score** | 📋 Planlandı | Proje bazında sağlık puanı, aksiyon önerileriyle |
| **Cross-Harness Portability** | 📋 Planlandı | Skill ve config'leri Claude Code, Codex CLI, Cursor, Windsurf ve Aider arasında dönüştür |
| **CLI / JSON Output** | 📋 Planlandı | CI/CD pipeline'ları için headless tarama — `cco scan --json` |
| **Team Config Baseline** | 📋 Planlandı | Takım geneli MCP/skill standartları belirle, developer'lar arası uygula |
| **Cost Tracker** | 💡 Araştırılıyor | Oturum ve proje bazında token kullanımı ve maliyet takibi |
| **Relationship Graph** | 💡 Araştırılıyor | Skill, hook ve MCP server'ların birbirine nasıl bağlı olduğunu gösteren dependency graph |

Aklında bir özellik mi var? [Issue aç](https://github.com/mcpware/cross-code-organizer/issues).

## Lisans

MIT

## @mcpware'den Diğer Projeler

| Proje | Ne yapıyor | Kurulum |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 Instagram Graph API tool'u — post, yorum, DM, story, analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Web sayfasında hover label'lar — AI öğelere adıyla erişiyor | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | Browser session'larını MCP ile GIF veya video olarak kaydet | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI ile logo tasarla → SVG → tam brand kit export | `npx @mcpware/logoloom` |

## Yazar

[ithiria894](https://github.com/ithiria894) — AI coding tool ekosistemi için araçlar yapıyor.

[![cross-code-organizer MCP server](https://glama.ai/mcp/servers/mcpware/cross-code-organizer/badges/card.svg)](https://glama.ai/mcp/servers/mcpware/cross-code-organizer)
