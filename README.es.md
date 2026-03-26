# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![npm downloads](https://img.shields.io/npm/dt/@mcpware/claude-code-organizer?label=downloads)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![GitHub stars](https://img.shields.io/github/stars/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mcpware/claude-code-organizer)](https://github.com/mcpware/claude-code-organizer/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | Español | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Organiza todas tus memories, skills, servidores MCP y hooks de Claude Code, visualízalos por jerarquía de scopes y muévelos entre scopes con drag-and-drop.**

![Claude Code Organizer Demo](docs/demo.gif)

## El problema

¿Te has dado cuenta de que cada vez que abres Claude Code, antes de escribir nada, tu context window ya perdió un tercio de su capacidad?

### Tu presupuesto de tokens ya se fue antes de empezar

Claude Code precarga automáticamente todos los archivos de configuración al iniciar — CLAUDE.md, memories, skills, definiciones de MCP servers, hooks, rules, etc. No escribiste nada y todo eso ya está metido en la context window.

Mira un proyecto real después de dos semanas de uso:

![Context Budget](docs/CB.png)

**69.2K tokens — el 34.6% de tu context window de 200K, desaparecido antes de que escribas un solo carácter.** Costo estimado solo de este overhead: Opus $1.04 USD / Sonnet $0.21 USD por sesión.

El 65.4% restante se lo reparten tus mensajes, las respuestas de Claude y los tool results. Cuanto más lleno el contexto, menos preciso es Claude — el famoso **context rot**.

¿De dónde salen los 69.2K? Es la suma de tokens de todos los archivos de config medibles offline, más un overhead de sistema estimado (~21K tokens) — system prompt, 23+ tool definitions integradas y MCP tool schemas, que se cargan en cada API call.

Pero eso es solo la parte **estática**. Estas **runtime injections** no están incluidas:

- **Rule re-injection** — todos tus archivos de rules se reinyectan en el contexto después de cada tool call. Tras ~30 tool calls, solo esto puede consumir ~46% de tu context window
- **File change diffs** — cuando un archivo que leíste o escribiste se modifica externamente (ej. un linter), el diff completo se inyecta como system-reminder oculto
- **System reminders** — avisos de malware, recordatorios de tokens y otras inyecciones ocultas
- **Conversation history** — tus mensajes, las respuestas de Claude y todos los tool results se reenvían en cada API call

Tu uso real a mitad de sesión es mucho mayor que 69.2K. Simplemente no lo ves.

### Tu configuración está en el scope equivocado

El otro problema: Claude Code crea silenciosamente memories, skills, MCP configs, commands y rules mientras trabajas, y los mete en el scope que corresponda a tu directorio actual.

Además, reinstala servidores MCP en silencio cuando los configuras en distintos scopes. No te das cuenta hasta que lo miras:

![Servidores MCP duplicados](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams instalado dos veces, Gmail tres veces, Playwright tres veces — cada copia desperdiciando tokens en cada sesión. Las etiquetas de scope (`Global` / `nicole`) muestran exactamente dónde vive cada duplicado, para que decidas cuál conservar y cuál eliminar.

El resultado:
- Una preferencia que querías global queda encerrada en un proyecto
- Un deploy skill de un solo repo se filtra a global y contamina todo lo demás
- Un skill de Python pipeline en global se carga en tu sesión React frontend
- Entradas MCP duplicadas inicializan el mismo servidor dos veces
- Memories obsoletas contradicen tus instrucciones actuales

Cada elemento en el scope equivocado desperdicia tokens **y** degrada la precisión. Y no existe ningún comando que te muestre el panorama completo de todos los scopes.

### La solución: un comando, un dashboard

```bash
npx @mcpware/claude-code-organizer
```

Ve todo lo que Claude tiene guardado, organizado por jerarquía de scopes. **Ve tu presupuesto de tokens antes de empezar.** Arrastra entre scopes, borra memories obsoletas, encuentra duplicados.

> **La primera ejecución auto-instala un `/cco` skill** — después, escribe `/cco` en cualquier sesión de Claude Code para abrir el dashboard.

### Ejemplo: Encuentra qué se está comiendo tus tokens

Abre el dashboard, haz clic en **Context Budget**, cambia a **By Tokens** — los mayores consumidores arriba. ¿Un CLAUDE.md de 2.4K tokens que olvidaste? ¿Un skill duplicado en tres scopes? Ahora lo ves. Limpia y ahorra 10-20% de tu context window.

### Ejemplo: Corrige la contaminación de scopes

Le dijiste a Claude "I prefer TypeScript + ESM" dentro de un proyecto, pero esa preferencia debería ser global. Arrastra esa memory de Project a Global. **Listo. Un arrastre.** ¿Un deploy skill en global que solo sirve para un repo? Arrástralo al Project scope correspondiente — los demás proyectos dejan de verlo.

### Ejemplo: Borrar memories obsoletas

Claude crea memories automáticamente a partir de cosas que dijiste al pasar. Una semana después ya no sirven pero siguen cargándose en cada sesión. Navega, lee, borra. **Tú decides qué cree Claude que sabe de ti.**

---

## Características

- **Jerarquía basada en scopes** - Ve todos los elementos organizados como `Global` > `Workspace` > `Project`, con indicadores de herencia
- **Drag-and-drop** - Mueve memories entre scopes, skills entre `Global` y repos concretos, y servidores MCP entre configs
- **Confirmación antes de mover** - Cada movimiento muestra un modal de confirmación antes de tocar ningún archivo
- **Seguridad por tipo** - Las memories solo pueden moverse a carpetas de memories, los skills a carpetas de skills y MCP a configs de MCP
- **Búsqueda y filtros** - Busca al instante en todos los elementos y filtra por categoría (`Memory`, `Skills`, `MCP`, `Config`, `Hooks`, `Plugins`, `Plans`)
- **Context Budget** - Ve exactamente cuántos tokens consume tu config antes de escribir nada — desglose por elemento, costes heredados de scopes, estimación de overhead del sistema y % de los 200K de context usados
- **Panel de detalle** - Haz clic en cualquier elemento para ver todos sus metadatos, su descripción, la ruta del archivo y abrirlo en VS Code
- **Escaneo completo por proyecto** - Cada scope muestra todos los tipos de elementos: memories, skills, servidores MCP, config, hooks y plans
- **Movimientos de archivos reales** - Mueve archivos de verdad dentro de `~/.claude/`; no es solo un visor
- **100+ pruebas E2E** - Suite de Playwright que cubre verificación del filesystem, seguridad (path traversal, input malformado), context budget y las 11 categorías

## Inicio rápido

### Opción 1: npx (sin instalar nada)

```bash
npx @mcpware/claude-code-organizer
```

### Opción 2: instalación global

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### Opción 3: pídeselo a Claude

Pega esto en Claude Code:

> Run `npx @mcpware/claude-code-organizer` — it's a dashboard for managing Claude Code settings. Tell me the URL when it's ready.

Abre un dashboard en `http://localhost:3847`. Funciona sobre tu directorio real `~/.claude/`.

## Qué gestiona

| Tipo | Ver | Mover | Se escanea en | ¿Por qué está bloqueado? |
|------|:----:|:----:|:----------:|-------------|
| `Memory` entries (feedback, user, project, reference) | Sí | Sí | `Global` + `Project` | - |
| `Skills` | Sí | Sí | `Global` + `Project` | - |
| Servidores MCP | Sí | Sí | `Global` + `Project` | - |
| `Config` (CLAUDE.md, settings.json) | Sí | Bloqueado | `Global` + `Project` | Config del sistema: moverla puede romper la config |
| `Hooks` | Sí | Bloqueado | `Global` + `Project` | Dependen del contexto de `settings`: si los mueves, pueden fallar en silencio |
| `Plans` | Sí | Sí | `Global` + `Project` | - |
| `Plugins` | Sí | Bloqueado | Solo `Global` | Caché gestionada por Claude Code |

## Jerarquía de scopes

```
Global                       <- applies everywhere
  Company (workspace)        <- applies to all sub-projects
    CompanyRepo1             <- project-specific
    CompanyRepo2             <- project-specific
  SideProjects (project)     <- independent project
  Documents (project)        <- independent project
```

Los scopes hijo heredan las memories, skills y los servidores MCP del scope padre.

## Cómo funciona

1. **Escanea** `~/.claude/` - detecta todos los proyectos, memories, skills, servidores MCP, hooks, plugins y plans
2. **Determina la jerarquía de scopes** - infiere las relaciones padre-hijo a partir de las rutas del sistema de archivos
3. **Renderiza el dashboard** - encabezados de scope > barras de categoría > filas de elementos, con la indentación correcta
4. **Gestiona los movimientos** - cuando arrastras un elemento o haces clic en "Move to...", mueve archivos en disco con comprobaciones de seguridad

## Comparación

Revisamos todas las herramientas de config de Claude Code que pudimos encontrar. Ninguna ofrecía una jerarquía visual de scopes y movimientos entre scopes con drag-and-drop en un dashboard independiente.

| Lo que necesitaba | App de escritorio (600+⭐) | Extensión de VS Code | App web full-stack | **Claude Code Organizer** |
|---------|:---:|:---:|:---:|:---:|
| Árbol de jerarquía de scopes | No | Sí | Parcial | **Sí** |
| Movimientos con drag-and-drop | No | No | No | **Sí** |
| Movimientos entre scopes | No | Un clic | No | **Sí** |
| Borrar elementos obsoletos | No | No | No | **Sí** |
| Context budget (token breakdown) | No | No | No | **Sí** |
| Herramientas MCP | No | No | Sí | **Sí** |
| Cero dependencias | No (Tauri) | No (VS Code) | No (React+Rust+SQLite) | **Sí** |
| Independiente (sin IDE) | Sí | No | Sí | **Sí** |

## Compatibilidad de plataformas

| Plataforma | Estado |
|----------|:------:|
| Ubuntu / Linux | Compatible |
| macOS (Intel + Apple Silicon) | Compatible (probado por la comunidad en Sequoia M3) |
| Windows | Todavía no |
| WSL | Debería funcionar (sin probar) |

## Estructura del proyecto

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

El frontend y el backend están completamente separados. Edita `src/ui/` para cambiar la apariencia sin tocar la lógica.

## API

El dashboard se apoya en una REST API:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/scan` | GET | Escanea todas las personalizaciones y devuelve scopes + elementos + conteos |
| `/api/move` | POST | Mueve un elemento a otro scope (con soporte para desambiguar por categoría/nombre) |
| `/api/delete` | POST | Borra un elemento de forma permanente |
| `/api/restore` | POST | Restaura un archivo borrado (para deshacer) |
| `/api/restore-mcp` | POST | Restaura una entrada borrada de un servidor MCP |
| `/api/destinations` | GET | Devuelve los destinos válidos para mover un elemento |
| `/api/file-content` | GET | Lee el contenido del archivo para el panel de detalle |

## Licencia

MIT

## Más de @mcpware

| Proyecto | Qué hace | Instalación |
|---------|---|---|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | 23 herramientas de Instagram Graph API: posts, comentarios, DMs, stories y analytics | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | Etiquetas flotantes sobre cualquier página web: la IA puede referirse a los elementos por nombre | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | Graba sesiones del navegador como GIF o video vía MCP | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | Diseño de logos con IA → SVG → exportación de un brand kit completo | `npx @mcpware/logoloom` |

## Autor

[ithiria894](https://github.com/ithiria894) - Creando herramientas para el ecosistema de Claude Code.
````
