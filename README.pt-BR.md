# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | Português | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Organize todas as memories, skills, servidores MCP e hooks do Claude Code — veja tudo pela hierarquia de scopes e mova itens entre scopes com drag-and-drop.**

![Claude Code Organizer Demo](docs/demo.gif)

## O problema

Você já reparou que toda vez que abre o Claude Code, antes de digitar qualquer coisa, sua context window já perdeu um terço da capacidade?

### Seu budget de tokens já foi antes de começar

O Claude Code carrega automaticamente todos os arquivos de configuração na inicialização — CLAUDE.md, memories, skills, definições de MCP servers, hooks, rules, etc. Você não digitou nada e tudo isso já está dentro da context window.

Olha um projeto real depois de duas semanas de uso:

![Context Budget](docs/CB.png)

**69.2K tokens — 34.6% da sua context window de 200K, sumiu antes de você digitar um caractere.** Custo estimado só desse overhead: Opus $1.04 USD / Sonnet $0.21 USD por sessão.

Os 65.4% restantes são disputados pelas suas mensagens, as respostas do Claude e os tool results. Quanto mais cheio o contexto, menos preciso o Claude fica — o chamado **context rot**.

De onde vêm os 69.2K? É a soma dos tokens de todos os arquivos de config mensuráveis offline, mais um overhead de sistema estimado (~21K tokens) — system prompt, 23+ definições de tools embutidas e MCP tool schemas, carregados em toda API call.

Mas isso é só a parte **estática**. Estas **runtime injections** não estão incluídas:

- **Rule re-injection** — todos os seus arquivos de rules são reinjetados no contexto após cada tool call. Após ~30 tool calls, só isso pode consumir ~46% da context window
- **File change diffs** — quando um arquivo que você leu ou escreveu é modificado externamente (ex: linter), o diff completo é injetado como system-reminder oculto
- **System reminders** — avisos de malware, lembretes de tokens e outras injeções ocultas
- **Conversation history** — suas mensagens, as respostas do Claude e todos os tool results são reenviados em cada API call

Seu uso real no meio da sessão é muito maior que 69.2K. Você só não vê.

### Suas configs estão no scope errado

O outro problema: o Claude Code cria silenciosamente memories, skills, MCP configs, commands e rules enquanto você trabalha, e joga tudo no scope correspondente ao diretório atual.

Ele também reinstala servidores MCP silenciosamente quando você os configura em scopes diferentes. Você nem percebe até olhar de perto:

![Servidores MCP duplicados](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams instalado duas vezes, Gmail três vezes, Playwright três vezes — cada cópia desperdiçando tokens a cada sessão. Os rótulos de scope (`Global` / `nicole`) mostram exatamente onde cada duplicata mora, para você decidir qual manter e qual remover.

O resultado:
- Uma preferência que deveria ser global fica presa num projeto
- Uma skill de deploy de um único repo vaza para global e contamina tudo
- Uma skill de pipeline Python no global é carregada na sessão React frontend
- Entradas MCP duplicadas inicializam o mesmo servidor duas vezes
- Memories obsoletas contradizem suas instruções atuais

Cada item no scope errado desperdiça tokens **e** degrada a precisão. E não existe nenhum comando que mostre o quadro completo de todos os scopes.

### A solução: um comando, um dashboard

```bash
npx @mcpware/claude-code-organizer
```

Veja tudo que o Claude guardou, organizado pela hierarquia de scopes. **Veja seu budget de tokens antes de começar.** Arraste entre scopes, apague memories obsoletas, encontre duplicatas.

> **A primeira execução auto-instala uma `/cco` skill** — depois basta digitar `/cco` em qualquer sessão para abrir o dashboard.

### Exemplo: Descubra o que está comendo seus tokens

Abra o dashboard, clique em **Context Budget**, mude para **By Tokens** — os maiores consumidores no topo. Um CLAUDE.md de 2.4K tokens esquecido? Uma skill duplicada em três scopes? Agora você vê. Limpe e economize 10-20% da context window.

### Exemplo: Corrija a contaminação de scopes

Você disse ao Claude "I prefer TypeScript + ESM" num projeto, mas essa preferência vale em todo lugar. Arraste essa memory de Project para Global. **Pronto. Um arraste.** Uma skill de deploy no global que só serve para um repo? Arraste para aquele Project scope — os outros projetos não veem mais.

### Exemplo: Apagar memories obsoletas

O Claude cria memories automáticas a partir de coisas que você falou sem pensar. Uma semana depois não servem mais, mas continuam carregando em toda sessão. Navegue, leia, apague. **Você decide o que o Claude acha que sabe sobre você.**

---

## funcionalidades

- **Hierarquia por scope** — Veja todos os itens organizados como `Global` > `Workspace` > `Project`, com indicadores de herança
- **Drag-and-drop** — Mova memories entre scopes, skills entre `Global` e scopes por repo, servidores MCP entre configs
- **Confirmação de move** — Todo move abre um modal de confirmação antes de tocar em qualquer arquivo
- **Segurança por tipo** — Memories só podem ir para pastas de memory, skills para pastas de skill, MCP para configs de MCP
- **Busca e filtro** — Pesquise instantaneamente em todos os itens e filtre por categoria (`Memory`, `Skills`, `MCP`, `Config`, `Hooks`, `Plugins`, `Plans`)
- **Context Budget** — Veja exatamente quantos tokens sua config consome antes de digitar qualquer coisa — detalhamento por item, custos herdados dos scopes, estimativa de overhead do sistema e % dos 200K de context usados
- **Painel de detalhes** — Clique em qualquer item para ver metadados completos, descrição, caminho do arquivo e abrir no VS Code
- **Scan completo por projeto** — Cada scope mostra todos os tipos de item: memories, `Skills`, servidores MCP, `Config`, `Hooks` e `Plans`
- **Move real de arquivos** — Move de verdade arquivos em `~/.claude/`; não é só um viewer
- **100+ testes E2E** — Suite de testes Playwright cobrindo verificação de filesystem, segurança (path traversal, input malformado), context budget e todas as 11 categorias

## início rápido

### opção 1: npx (sem instalar)

```bash
npx @mcpware/claude-code-organizer
```

### opção 2: instalação global

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### opção 3: pedir ao Claude

Cole isto no Claude Code:

> Rode `npx @mcpware/claude-code-organizer` — é um dashboard para gerenciar a config do Claude Code. Me diga a URL quando estiver pronto.

Abre um dashboard em `http://localhost:3847`. Funciona com o seu diretório real em `~/.claude/`.

## o que ele gerencia

| Tipo | Ver | Mover | Faz scan em | Por que fica bloqueado? |
|------|:----:|:----:|:----------:|-------------|
| `Memory` (feedback, user, project, reference) | Sim | Sim | `Global` + `Project` | — |
| `Skills` | Sim | Sim | `Global` + `Project` | — |
| MCP Servers | Sim | Sim | `Global` + `Project` | — |
| `Config` (CLAUDE.md, settings.json) | Sim | Bloqueado | `Global` + `Project` | Config de sistema — mover pode quebrar a config |
| `Hooks` | Sim | Bloqueado | `Global` + `Project` | Dependem do contexto das settings — mover pode causar falhas silenciosas |
| `Plans` | Sim | Sim | `Global` + `Project` | — |
| `Plugins` | Sim | Bloqueado | Só `Global` | Cache gerenciado pelo Claude Code |

## hierarquia de scopes

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

Scopes filhos herdam memories, skills e servidores MCP dos scopes pai.

## como funciona

1. **Faz scan em** `~/.claude/` — descobre todos os projetos, memories, skills, servidores MCP, hooks, plugins e plans
2. **Determina a hierarquia de scopes** — identifica as relações de pai e filho a partir dos paths no filesystem
3. **Renderiza o dashboard** — cabeçalhos de scope > barras de categoria > linhas de item, com a indentação correta
4. **Executa os moves** — quando você arrasta ou clica em "Move to...", os arquivos são realmente movidos no disco com safety checks

## comparação

Analisamos todas as ferramentas de config do Claude Code que conseguimos encontrar. Nenhuma oferecia hierarquia visual de scopes + moves entre scopes com drag-and-drop em um dashboard standalone.

| O que eu precisava | Desktop app (600+⭐) | VS Code extension | Full-stack web app | **Claude Code Organizer** |
|---------|:---:|:---:|:---:|:---:|
| Árvore de scopes | No | Yes | Partial | **Yes** |
| Moves com drag-and-drop | No | No | No | **Yes** |
| Moves entre scopes | No | One-click | No | **Yes** |
| Apagar itens antigos | No | No | No | **Yes** |
| Context budget (token breakdown) | No | No | No | **Yes** |
| Ferramentas MCP | No | No | Yes | **Yes** |
| Zero dependências | No (Tauri) | No (VS Code) | No (React+Rust+SQLite) | **Yes** |
| Standalone (sem IDE) | Yes | No | Yes | **Yes** |

## suporte de plataforma

| Platform | Status |
|----------|:------:|
| Ubuntu / Linux | Supported |
| macOS (Intel + Apple Silicon) | Supported (community-tested on Sequoia M3) |
| Windows | Not yet |
| WSL | Should work (untested) |

## estrutura do projeto

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

Frontend e backend são totalmente separados. Edite os arquivos em `src/ui/` para mudar o visual sem tocar na lógica.

## API

O dashboard é sustentado por uma REST API:

| Endpoint | Método | Descrição |
|----------|--------|-------------|
| `/api/scan` | GET | Faz scan de todas as customizações e retorna scopes + items + contagens |
| `/api/move` | POST | Move um item para outro scope (com suporte a desambiguação por categoria/nome) |
| `/api/delete` | POST | Apaga um item permanentemente |
| `/api/restore` | POST | Restaura um arquivo apagado (para desfazer) |
| `/api/restore-mcp` | POST | Restaura uma entrada apagada de servidor MCP |
| `/api/destinations` | GET | Retorna os destinos válidos de move para um item |
| `/api/file-content` | GET | Lê o conteúdo do arquivo para o painel de detalhes |

## licença

MIT

## mais de @mcpware

| Project | O que faz | Install |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 ferramentas da Instagram Graph API — posts, comentários, DMs, stories e analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Labels de hover em qualquer página web — a IA referencia elementos pelo nome | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | Grava sessões do navegador como GIF ou vídeo via MCP | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | Design de logo com IA → SVG → exportação completa de brand kit | `npx @mcpware/logoloom` |

## autor

[ithiria894](https://github.com/ithiria894) — Criando ferramentas para o ecossistema do Claude Code.
