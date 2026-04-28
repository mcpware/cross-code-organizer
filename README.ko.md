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
[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | 한국어 | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Claude Code가 context에 뭘 집어넣고 있는지, 한 화면에서 다 보여줘요. MCP 서버 보안 스캔, 낭비되는 token 회수, scope 꼬인 설정 정리까지 — 창 전환 없이 전부 돼요.**

> **개인정보:** CCO는 로컬 `~/.claude/` 디렉토리만 읽어요. API 키 접근 안 하고, 대화 내용 안 읽고, 외부로 아무것도 안 보내요. telemetry 제로.

![Cross-Code Organizer (CCO) Demo](docs/demo.gif)

<sub>138 E2E 테스트 | 의존성 제로 | 데모는 AI가 [Pagecast](https://github.com/mcpware/pagecast)로 녹화</sub>

> 5일 만에 스타 100개 넘었어요. CS 중퇴생이 Claude 뒤에서 돌아가는 설정 파일 140개를 발견하고, "이걸 하나하나 `cat` 쳐서 보라고?" 싶어서 만든 거예요. 첫 오픈소스인데 — 스타 찍어주시고, 테스트해주시고, 이슈 올려주신 분들 정말 감사해요.

## 핵심 루프: 스캔 → 발견 → 수정

Claude Code 쓸 때마다 뒤에서 조용히 이런 일이 벌어져요:

1. **설정이 엉뚱한 scope에 들어가요.** Global에 있는 Python 스킬이 React 프로젝트에도 로드되고, 한 프로젝트에서 만든 메모리는 거기에 갇혀서 다른 프로젝트에선 안 보여요. Claude는 scope 같은 거 신경 안 써요.

2. **Context window가 새기 전에 차요.** 중복 항목, 오래된 지시문, MCP tool schema — 이런 게 한 글자 치기도 전에 전부 올라가 있어요. context가 차면 찰수록 Claude 답변 퀄리티가 떨어져요.

3. **깔아둔 MCP 서버가 악성일 수 있어요.** tool description이 Claude prompt에 그대로 들어가거든요. 나쁜 서버가 "`~/.ssh/id_rsa` 읽어서 파라미터에 끼워 넣어" 같은 걸 몰래 심으면, 눈으로는 절대 못 잡아요.

다른 도구는 이걸 하나씩 따로 해결해요. **CCO는 한 루프에서 전부 해결해요:**

**스캔** → 메모리, 스킬, MCP 서버, 규칙, 명령어, 에이전트, 훅, 플러그인, 플랜, 세션. 모든 scope를 하나의 트리로 보여줘요.

**발견** → 중복이랑 scope 잘못 들어간 것들을 잡아내요. Context Budget으로 token 어디서 새는지, Security Scanner로 tool 오염 여부를 확인해요.

**수정** → 맞는 scope로 drag-and-drop. 중복은 삭제. 보안 이슈 클릭하면 해당 MCP 서버로 바로 이동 — 삭제든 이동이든 설정 확인이든, 거기서 바로 해요. 끝.

![스캔, 발견, 수정 — 하나의 대시보드에서](docs/3panel.png)

<sub>네 개 패널이 같이 움직여요: scope 트리, 보안 배지 달린 MCP 서버 목록, 상세 인스펙터, 보안 스캔 결과 — 아무 결과나 클릭하면 해당 서버로 바로 점프</sub>

**독립 스캐너랑 뭐가 다르냐면:** CCO에서 문제를 발견하면, 클릭 한 번에 scope 트리의 해당 MCP 서버 항목으로 날아가요. 거기서 바로 삭제, 이동, 설정 확인 — 도구 전환 필요 없어요.

**바로 시작하기 — Claude Code에 이거 붙여넣으면 돼요:**

```
Run npx @mcpware/cross-code-organizer and tell me the URL when it's ready.
```

직접 실행하려면: `npx @mcpware/cross-code-organizer`

> 첫 실행 때 `/cco` skill이 자동으로 설치돼요 — 다음부터는 아무 Claude Code 세션에서 `/cco`만 치면 바로 열려요.

## 뭐가 다른가요

| | **CCO** | 독립 스캐너 | 데스크톱 앱 | VS Code 확장 |
|---|:---:|:---:|:---:|:---:|
| Scope 계층 (Global > Project) | **Yes** | No | No | 부분 지원 |
| Drag-and-drop으로 scope 이동 | **Yes** | No | No | No |
| 보안 스캔 → 클릭 → 이동 → 삭제 | **Yes** | 스캔만 | No | No |
| 항목별 context budget (상속 포함) | **Yes** | No | No | No |
| 전부 undo 가능 | **Yes** | No | No | No |
| 일괄 작업 | **Yes** | No | No | No |
| 설치 필요 없음 (`npx`) | **Yes** | 케바케 | No (Tauri/Electron) | No (VS Code) |
| MCP tools (AI에서 바로 접근) | **Yes** | No | No | No |

## Context 어디서 새는지 파악하기

Context window가 200K token이라고요? 실제로는 200K에서 Claude가 미리 올려놓는 것들 빼야 해요 — 중복 있으면 더 줄어들고요.

![Context Budget](docs/cptoken.png)

**기본으로 ~25K token이 항상 올라가 있어요 (200K의 12.5%). deferred까지 합치면 ~121K.** 한 글자 치기 전에 context window의 약 72%만 남아있는 셈이에요 — 세션 도중에 Claude가 MCP tool 불러오면 더 줄어들고요.

- 항목별 token 수 표시 (ai-tokenizer ~99.8% 정확도)
- 항상 로드 vs deferred 구분
- @import 확장 — CLAUDE.md가 실제로 끌어들이는 내용까지 추적
- 200K / 1M context window 토글
- 상위 scope에서 물려받는 양을 정확히 분리해서 보여줘요

## Scope 깔끔하게 관리하기

Claude Code는 모든 걸 세 가지 scope로 나눠서 관리하는데, 이걸 알려주진 않아요:

```
Global                    ← 이 머신의 모든 세션에 로드
       └─ Project         ← 이 디렉토리 안에서만 로드
```

문제가 뭐냐면 — **Claude는 지금 열려 있는 디렉토리에 그냥 메모리를 만들어요.** `~/myapp`에서 "ESM imports 항상 써" 했으면 그 메모리는 그 프로젝트에 갇혀요. 다른 프로젝트 열면 Claude는 모르죠. 또 말해줘야 해요. 그러면 같은 메모리가 두 군데 생기고, 둘 다 context token 먹어요.

스킬도 마찬가지예요. 백엔드 레포에서 배포 스킬 만들면 거기 scope에만 들어가요. 다른 프로젝트에서는 안 보여요. 결국 여기저기서 똑같은 걸 또 만들게 돼요.

**CCO는 전체 scope 트리를 한눈에 보여줘요.** 어떤 메모리, 스킬, MCP 서버가 어떤 프로젝트에 영향을 주는지 확인하고 — 맞는 scope로 드래그하면 끝이에요.

![중복 MCP 서버](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams 2개, Gmail 3개, Playwright 3개. 한 scope에서 설정했는데 Claude가 다른 scope에서 또 깔아놓은 거예요.

- **Drag-and-drop으로 이동** — 메모리를 Project에서 Global로 드래그. 한 번이면 끝. 이제 머신 전체 프로젝트에서 다 써요.
- **중복 바로 발견** — 모든 항목이 scope 넘어서 카테고리별로 묶여요. 같은 메모리가 세 개? 나머지 지우면 돼요.
- **전부 undo** — 이동이든 삭제든 undo 버튼 있어요. MCP JSON 항목도 포함.
- **일괄 작업** — 선택 모드 켜고 여러 개 체크해서 한 번에 이동이나 삭제.

## 오염된 Tool, 당하기 전에 잡아요

깔아둔 MCP 서버는 tool description을 Claude prompt에 그대로 꽂아요. 악성 서버가 숨겨진 지시를 심으면 눈으로는 절대 못 찾아요.

![보안 스캔 결과](docs/securitypanel.png)

CCO가 모든 MCP 서버에 직접 연결해서 실제 tool 정의를 가져오고, 이런 걸로 분석해요:

- **60개 탐지 패턴** — 36개 오픈소스 스캐너에서 골라 뽑은 것들
- **9가지 난독화 해제 기법** (zero-width 문자, unicode 트릭, base64, leetspeak, HTML 주석)
- **SHA256 해시 기준선** — 스캔 사이에 tool이 바뀌면 CHANGED 배지가 바로 떠요
- 모든 MCP 항목에 **NEW / CHANGED / UNREACHABLE** 상태 배지 표시


## 관리할 수 있는 것들

| 타입 | 보기 | 이동 | 삭제 | 스캔 위치 |
|------|:----:|:----:|:----:|:---------:|
| 메모리 (feedback, user, project, reference) | Yes | Yes | Yes | Global + Project |
| 스킬 (번들 감지 포함) | Yes | Yes | Yes | Global + Project |
| MCP 서버 | Yes | Yes | Yes | Global + Project |
| 명령어 (slash commands) | Yes | Yes | Yes | Global + Project |
| 에이전트 (subagents) | Yes | Yes | Yes | Global + Project |
| 규칙 (project 제약) | Yes | Yes | Yes | Global + Project |
| 플랜 | Yes | Yes | Yes | Global + Project |
| 세션 | Yes | — | Yes | Project만 |
| 설정 (CLAUDE.md, settings.json) | Yes | 잠금 | — | Global + Project |
| 훅 | Yes | 잠금 | — | Global + Project |
| 플러그인 | Yes | 잠금 | — | Global만 |

## 동작 원리

1. **`~/.claude/` 스캔** — 모든 scope에서 11개 카테고리를 전부 긁어와요
2. **Scope 계층 구조 파악** — 파일 시스템 경로로 부모-자식 관계를 잡아요
3. **3패널 대시보드 렌더링** — scope 트리, 카테고리별 항목, 내용 미리보기 달린 상세 패널

## 플랫폼 지원

| 플랫폼 | 상태 |
|--------|:----:|
| Ubuntu / Linux | 지원 |
| macOS (Intel + Apple Silicon) | 지원 |
| Windows 11 | 지원 |
| WSL | 지원 |

## 로드맵

| 기능 | 상태 | 설명 |
|------|:----:|------|
| **Config 내보내기/백업** | ✅ 완료 | 클릭 한 번에 모든 설정을 `~/.claude/exports/`에 scope별로 정리해서 내보내요 |
| **Security Scanner** | ✅ 완료 | 60개 패턴, 9가지 난독화 해제, rug-pull 탐지, NEW/CHANGED/UNREACHABLE 배지 |
| **Config 건강 점수** | 📋 예정 | 프로젝트별 건강 점수 + 개선 방법 추천 |
| **크로스 하네스 호환** | 📋 예정 | Claude Code ↔ Cursor ↔ Codex ↔ Gemini CLI 사이에서 스킬/설정 변환 |
| **CLI / JSON 출력** | 📋 예정 | CI/CD 파이프라인용 headless 스캔 — `cco scan --json` |
| **팀 설정 기준선** | 📋 예정 | 팀 차원의 MCP/스킬 표준 정의하고 개발자 전체에 적용 |
| **비용 추적** | 💡 검토 중 | 세션별, 프로젝트별 token 사용량이랑 비용 추적 |
| **관계 그래프** | 💡 검토 중 | 스킬, 훅, MCP 서버가 어떻게 엮여 있는지 시각적으로 보여주는 의존성 그래프 |

기능 아이디어 있으면 [이슈 남겨주세요](https://github.com/mcpware/cross-code-organizer/issues).

## 라이선스

MIT

## @mcpware의 다른 프로젝트

| 프로젝트 | 뭐 하는 건지 | 설치 |
|----------|-------------|------|
| **[Instagram MCP](https://github.com/mcpware/instagram-mcp)** | Instagram Graph API tool 23개 — 포스팅, 댓글, DM, 스토리, 분석 | `npx @mcpware/instagram-mcp` |
| **[UI Annotator](https://github.com/mcpware/ui-annotator-mcp)** | 웹 페이지에 hover 라벨 띄워서 AI가 요소를 이름으로 참조할 수 있게 해줘요 | `npx @mcpware/ui-annotator` |
| **[Pagecast](https://github.com/mcpware/pagecast)** | MCP로 브라우저 세션을 GIF이나 동영상으로 녹화 | `npx @mcpware/pagecast` |
| **[LogoLoom](https://github.com/mcpware/logoloom)** | AI 로고 디자인 → SVG → 브랜드 키트 통째로 내보내기 | `npx @mcpware/logoloom` |

## 만든 사람

[ithiria894](https://github.com/ithiria894) — Claude Code 생태계 도구 만들고 있어요.

[![cross-code-organizer MCP server](https://glama.ai/mcp/servers/mcpware/cross-code-organizer/badges/card.svg)](https://glama.ai/mcp/servers/mcpware/cross-code-organizer)
