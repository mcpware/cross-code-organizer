# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | Italiano | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Organizza tutte le memory, le skill, i server MCP e gli hook di Claude Code: visualizzale per gerarchia di scope e spostale tra scope con il drag-and-drop.**

![Claude Code Organizer Demo](docs/demo.gif)

## Il problema

Ci hai mai fatto caso? Ogni volta che apri Claude Code, prima ancora di scrivere qualcosa, la tua context window ha già perso un terzo della capacità.

### Il budget di token è già consumato prima di iniziare

Claude Code precarica automaticamente tutti i file di configurazione all'avvio — CLAUDE.md, memory, skill, definizioni dei MCP server, hook, rules, ecc. Non hai ancora scritto niente e tutto questo è già nella context window.

Ecco un progetto reale dopo due settimane di utilizzo:

![Context Budget](docs/CB.png)

**69.2K token — il 34.6% della tua context window da 200K, spariti prima che tu digiti un singolo carattere.** Costo stimato solo per questo overhead: Opus $1.04 USD / Sonnet $0.21 USD per sessione.

Il restante 65.4% se lo contendono i tuoi messaggi, le risposte di Claude e i tool results. Più il contesto si riempie, meno preciso diventa Claude — il cosiddetto **context rot**.

Da dove vengono i 69.2K? Sono la somma dei token di tutti i file di config misurabili offline, più un overhead di sistema stimato (~21K tokens) — system prompt, 23+ definizioni di tool integrate e MCP tool schemas, caricati a ogni API call.

Ma questa è solo la parte **statica**. Queste **runtime injections** non sono incluse:

- **Rule re-injection** — tutti i tuoi file di rules vengono reiniettati nel contesto dopo ogni tool call. Dopo ~30 tool call, solo questo può consumare ~46% della context window
- **File change diffs** — quando un file che hai letto o scritto viene modificato esternamente (es. da un linter), l'intero diff viene iniettato come system-reminder nascosto
- **System reminders** — avvisi malware, promemoria sui token e altre iniezioni nascoste
- **Conversation history** — i tuoi messaggi, le risposte di Claude e tutti i tool results vengono rinviati a ogni API call

L'utilizzo reale a metà sessione è molto superiore a 69.2K. Semplicemente non lo vedi.

### Le configurazioni finiscono nello scope sbagliato

L'altro problema: Claude Code crea silenziosamente memory, skill, MCP config, commands e rules mentre lavori, e li butta nello scope che corrisponde alla directory corrente.

Inoltre, reinstalla silenziosamente i server MCP quando li configuri in scope diversi. Non te ne accorgi finché non controlli:

![Server MCP duplicati](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams installato due volte, Gmail tre volte, Playwright tre volte — ogni copia spreca token a ogni sessione. Le etichette di scope (`Global` / `nicole`) mostrano esattamente dove si trova ogni duplicato, così puoi decidere quale tenere e quale eliminare.

Il risultato:
- Una preferenza che volevi globale resta bloccata in un singolo progetto
- Una skill di deploy per un solo repo trapela in global e contamina tutto il resto
- Una skill per pipeline Python in global viene caricata anche nella sessione React frontend
- Voci MCP duplicate inizializzano lo stesso server due volte
- Memory obsolete contraddicono le tue istruzioni attuali

Ogni elemento nello scope sbagliato spreca token **e** degrada la precisione. E non esiste nessun comando che ti mostri il quadro completo di tutti gli scope.

### La soluzione: un comando, una dashboard

```bash
npx @mcpware/claude-code-organizer
```

Vedi tutto quello che Claude ha salvato, organizzato per gerarchia di scope. **Vedi il tuo budget di token prima di iniziare.** Trascina tra scope, elimina memory obsolete, trova duplicati.

> **La prima esecuzione auto-installa una `/cco` skill** — dopodiché basta digitare `/cco` in qualsiasi sessione per aprire la dashboard.

### Esempio: Trova cosa sta divorando i tuoi token

Apri la dashboard, clicca **Context Budget**, passa a **By Tokens** — i maggiori consumatori in cima. Un CLAUDE.md da 2.4K token dimenticato? Una skill duplicata in tre scope? Adesso la vedi. Pulisci e risparmia il 10-20% della context window.

### Esempio: Correggi la contaminazione degli scope

Hai detto a Claude "preferisco TypeScript + ESM" dentro un progetto, ma quella preferenza vale ovunque. Trascina quella memory da Project a Global. **Fatto. Un drag.** Una skill di deploy in global che serve solo per un repo? Trascinala nel Project scope giusto — gli altri progetti non la vedranno più.

### Esempio: Eliminare memory obsolete

Claude crea automaticamente memory da cose dette al volo. Dopo una settimana non servono più, ma continuano a essere caricate in ogni sessione. Sfoglia, leggi, elimina. **Sei tu a decidere cosa Claude pensa di sapere su di te.**

---

## Funzionalità

- **Gerarchia degli scope**: tutti gli elementi sono organizzati come Global > Workspace > Project, con indicatori di ereditarietà
- **Drag-and-drop**: sposta memory tra scope, skill tra Global e singoli repo, server MCP tra config diverse
- **Finestra di conferma per gli spostamenti**: ogni spostamento apre una finestra di conferma prima di modificare qualsiasi file
- **Sicurezza per tipo**: le memory possono essere spostate solo in cartelle di memory, le skill solo in cartelle di skill, i server MCP solo in config MCP
- **Ricerca e filtro**: cerca subito tra tutti gli elementi e filtra per categoria (Memory, Skills, MCP, Config, Hooks, Plugins, Plans)
- **Context Budget**: vedi esattamente quanti token consuma la tua config prima di digitare qualsiasi cosa — dettaglio per elemento, costi ereditati dagli scope, stima dell'overhead di sistema e % dei 200K di context utilizzati
- **Pannello dettagli**: clicca un elemento per vedere metadati completi, descrizione, file path e aprirlo in VS Code
- **Scansione completa per progetto**: ogni scope mostra tutti i tipi di elementi: Memory, Skills, MCP, Config, Hooks e Plans
- **Spostamenti reali dei file**: sposta davvero i file in `~/.claude/`, non è solo un visualizzatore
- **100+ test E2E**: suite Playwright che copre verifica del filesystem, sicurezza (path traversal, input malformato), context budget e tutte le 11 categorie

## Avvio rapido

### Opzione 1: npx (nessuna installazione necessaria)

```bash
npx @mcpware/claude-code-organizer
```

### Opzione 2: installazione globale

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### Opzione 3: chiedilo a Claude

Incolla questo messaggio in Claude Code:

> Esegui `npx @mcpware/claude-code-organizer` - è una dashboard per gestire le impostazioni di Claude Code. Dimmi l'URL quando è pronto.

Si apre una dashboard su `http://localhost:3847`. Funziona con la tua directory `~/.claude/` reale.

## Cosa gestisce

| Tipo | Visualizza | Sposta | Scansionato in | Perché è bloccato? |
|------|:----------:|:------:|:--------------:|--------------------|
| Memory (feedback, user, project, reference) | Sì | Sì | Global + Project | - |
| Skills | Sì | Sì | Global + Project | - |
| Server MCP | Sì | Sì | Global + Project | - |
| Config (CLAUDE.md, settings.json) | Sì | Bloccato | Global + Project | Sono impostazioni di sistema: spostarle potrebbe rompere la config |
| Hooks | Sì | Bloccato | Global + Project | Dipendono dal contesto delle impostazioni: se li sposti puoi avere errori silenziosi |
| Plans | Sì | Sì | Global + Project | - |
| Plugins | Sì | Bloccato | Solo Global | Cache gestita da Claude Code |

## Gerarchia degli scope

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

Gli scope figli ereditano memory, skill e server MCP dallo scope padre.

## Come funziona

1. **Scansiona** `~/.claude/` - individua tutti i progetti, le memory, le skill, i server MCP, gli hook, i plugin e i plan
2. **Determina la gerarchia degli scope** - ricava le relazioni padre-figlio dai path del filesystem
3. **Renderizza la dashboard** - intestazioni degli scope > barre di categoria > righe degli elementi, con l'indentazione corretta
4. **Gestisce gli spostamenti** - quando trascini un elemento o fai clic su "Move to...", sposta davvero i file su disco con controlli di sicurezza

## Confronto

Abbiamo passato in rassegna tutti gli strumenti per la config di Claude Code che siamo riusciti a trovare. Nessuno offriva una gerarchia visiva degli scope più spostamenti tra scope via drag-and-drop in una dashboard standalone.

| Cosa mi serviva | App desktop (600+⭐) | Estensione VS Code | Web app full-stack | **Claude Code Organizer** |
|---------|:---:|:---:|:---:|:---:|
| Albero degli scope | No | Sì | Parziale | **Sì** |
| Spostamenti via drag-and-drop | No | No | No | **Sì** |
| Spostamenti tra scope | No | Con un clic | No | **Sì** |
| Eliminare elementi obsoleti | No | No | No | **Sì** |
| Context budget (token breakdown) | No | No | No | **Sì** |
| Tool MCP | No | No | Sì | **Sì** |
| Zero dipendenze | No (Tauri) | No (VS Code) | No (React+Rust+SQLite) | **Sì** |
| Standalone (senza IDE) | Sì | No | Sì | **Sì** |

## Supporto delle piattaforme

| Piattaforma | Stato |
|----------|:------:|
| Ubuntu / Linux | Supportato |
| macOS (Intel + Apple Silicon) | Supportato (testato dalla community su Sequoia M3) |
| Windows | Non ancora |
| WSL | Dovrebbe funzionare (non testato) |

## Struttura del progetto

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

Frontend e backend sono completamente separati. Per cambiare l'aspetto senza toccare la logica, intervieni sui file in `src/ui/`.

## API

La dashboard espone una REST API:

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/scan` | GET | Scansiona tutte le personalizzazioni e restituisce scope, elementi e conteggi |
| `/api/move` | POST | Sposta un elemento in uno scope diverso (con supporto alla disambiguazione categoria/nome) |
| `/api/delete` | POST | Elimina definitivamente un elemento |
| `/api/restore` | POST | Ripristina un file eliminato (per l'undo) |
| `/api/restore-mcp` | POST | Ripristina una voce di server MCP eliminata |
| `/api/destinations` | GET | Restituisce le destinazioni valide per spostare un elemento |
| `/api/file-content` | GET | Legge il contenuto del file per il pannello dettagli |

## Licenza

MIT

## Altri progetti di @mcpware

| Progetto | Cosa fa | Installazione |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 tool della Instagram Graph API - post, commenti, DM, storie, analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Etichette hover su qualsiasi pagina web - l'AI fa riferimento agli elementi per nome | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | Registra sessioni del browser come GIF o video via MCP | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | Design di loghi con AI → SVG → esportazione del brand kit completo | `npx @mcpware/logoloom` |

## Autore

[ithiria894](https://github.com/ithiria894) - Sviluppa tool per l'ecosistema Claude Code.
