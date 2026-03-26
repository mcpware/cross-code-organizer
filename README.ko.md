# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | [日本語](README.ja.md) | 한국어 | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Claude Code의 메모리, 스킬, MCP 서버, 훅을 한눈에 관리하는 대시보드. 스코프 계층으로 정리하고, 드래그 앤 드롭으로 스코프 간 이동.**

![Claude Code Organizer Demo](docs/demo.gif)

## 문제

혹시 느낀 적 있나요? Claude Code 세션을 시작하면, 아무것도 하기 전에 이미 context window가 꽤 많이 차 있다는 걸.

### Token 예산: 대화 시작 전에 이미 3분의 1이 사라져 있어요

Claude Code는 시작할 때 설정 파일들을 자동으로 미리 로드합니다 — CLAUDE.md, 메모리, 스킬, MCP server 정의, hooks, rules 등등. 아무것도 입력하지 않았는데 이것들이 전부 context window에 들어갑니다.

2주간 사용한 실제 프로젝트를 보세요:

![Context Budget](docs/CB.png)

**69.2K tokens — 200K context window의 34.6%가 한 글자도 치기 전에 사라집니다.** 이 overhead만의 비용: Opus $1.04 USD / Sonnet $0.21 USD (세션당).

남은 65.4%는 대화, Claude 응답, tool results가 나눠 쓰게 됩니다. Context가 차면 찰수록 Claude 정확도가 떨어지는데, 이걸 **context rot**이라고 해요.

69.2K의 구성: 오프라인에서 측정 가능한 모든 config 파일의 token 합계 + 추정 시스템 overhead (~21K tokens). 시스템 overhead는 system prompt, 23+ 개 내장 tool 정의, MCP tool schemas로 매번 API call에서 로드돼요.

그런데 이건 **정적인** 부분만이에요. 아래 **runtime injections**은 포함되지 않았습니다:

- **Rule re-injection** — 모든 rule 파일이 tool call마다 context에 재주입됩니다. ~30번 tool call 후, 이것만으로 context window의 ~46%를 차지할 수 있어요
- **File change diffs** — 읽거나 쓴 파일이 외부에서 수정되면 (예: linter), 전체 diff가 숨겨진 system-reminder로 주입돼요
- **System reminders** — 맬웨어 경고, token 알림 등 숨겨진 injections
- **Conversation history** — 메시지, Claude 응답, 모든 tool results가 매 API call마다 재전송

세션 중반의 실제 사용량은 69.2K보다 훨씬 높아요. 그냥 안 보일 뿐이에요.

### 설정이 엉뚱한 scope에 흩어져 있어요

또 하나의 문제: Claude Code는 작업하면서 메모리, 스킬, MCP config, commands, rules를 조용히 만들고, 현재 디렉토리에 맞는 scope에 넣어버려요.

게다가 다른 scope에서 MCP 서버를 설정하면 같은 서버가 조용히 중복 설치돼요. 직접 확인하기 전까진 모릅니다:

![중복된 MCP 서버](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams가 2개, Gmail이 3개, Playwright가 3개 — 각 복사본이 매 세션마다 token을 낭비하고 있어요. scope 라벨(`Global` / `nicole`)이 각 중복이 어디 있는지 정확히 보여주니까, 뭘 남기고 뭘 지울지 판단할 수 있습니다.

그 결과:
- 모든 곳에서 쓰고 싶은 설정이 하나의 프로젝트에 갇힘
- 하나의 레포 전용 배포 스킬이 global로 새서 다른 프로젝트 전부 오염
- Global의 Python pipeline 스킬이 React frontend 세션에도 로드됨
- 중복 MCP entry가 같은 서버를 두 번 초기화
- 오래된 메모리가 현재 지시와 모순

잘못된 scope의 항목마다 token을 낭비하고 **게다가** 정확도도 떨어뜨려요. 그런데 모든 scope를 한눈에 보여주는 명령어는 없습니다.

### 해결: 명령어 하나로 대시보드 열기

```bash
npx @mcpware/claude-code-organizer
```

Claude가 저장한 모든 걸 scope 계층별로 정리해서 보여줘요. **시작 전에 token 예산을 확인하세요.** 드래그로 scope 간 이동, 오래된 메모리 삭제, 중복 찾기.

> **첫 실행 시 `/cco` skill 자동 설치** — 이후 아무 세션에서나 `/cco` 입력하면 대시보드가 열려요.

### 예시: token 잡아먹는 놈 찾기

대시보드를 열고 **Context Budget** → **By Tokens**로 전환. 가장 큰 소비자가 맨 위에 와요. 잊고 있던 2.4K token CLAUDE.md? 세 scope에 중복된 스킬? 정리하면 context window 10-20% 절약 가능.

### 예시: scope 오염 수정

프로젝트에서 Claude에게 "TypeScript + ESM 선호"라고 했는데, 이건 모든 곳에 적용돼야 하는 설정이에요. 그 메모리를 Project에서 Global로 드래그. **끝. 한 번 드래그.** Global에 있는 배포 스킬이 실제로는 하나의 레포에서만 쓰인다면? 해당 Project scope로 드래그하면 다른 프로젝트에서 안 보여요.

### 예시: 오래된 메모리 삭제

Claude는 대수롭지 않게 한 말에서도 자동으로 메모리를 만들어요. 일주일 후엔 쓸모없는데 매 세션 로드됨. 둘러보고, 읽고, 삭제. **Claude가 나에 대해 뭘 안다고 생각하는지, 내가 정합니다.**

---

## 기능

- **스코프 계층 뷰** — Global > Workspace > Project로 정리, 상속 관계도 한눈에
- **드래그 앤 드롭** — 메모리, 스킬, MCP 서버를 스코프 간에 바로 이동
- **이동 전 확인** — 파일 건드리기 전에 반드시 확인 모달 표시
- **타입 안전성** — 메모리는 메모리 폴더로만, 스킬은 스킬 폴더로만 이동 가능
- **검색 & 필터** — 모든 항목 실시간 검색, 카테고리별 필터 (메모리, 스킬, MCP, 설정, 훅, 플러그인, 플랜)
- **Context Budget** — 아무것도 입력하기 전에 config가 얼마나 많은 tokens을 소비하는지 확인 — 항목별 분석, 상속된 scope 비용, 시스템 오버헤드 추정, 200K context 사용률
- **상세 패널** — 항목 클릭하면 메타데이터, 설명, 파일 경로 확인 + VS Code에서 바로 열기
- **의존성 제로** — 순수 Node.js 내장 모듈, SortableJS는 CDN으로
- **진짜 파일 이동** — `~/.claude/` 안의 파일을 실제로 옮깁니다. 보기만 하는 뷰어가 아닙니다
- **100+ E2E 테스트** — Playwright 테스트 스위트, filesystem 검증・보안(경로 순회, 잘못된 입력)・context budget・전체 11 카테고리 커버

## 빠른 시작

### 방법 1: npx (설치 불필요)

```bash
npx @mcpware/claude-code-organizer
```

### 방법 2: 글로벌 설치

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### 방법 3: Claude한테 부탁

Claude Code한테 이렇게 말하세요:

> `npx @mcpware/claude-code-organizer` 실행해줘. Claude Code 설정 관리하는 대시보드야. 준비되면 URL 알려줘.

`http://localhost:3847`에서 대시보드가 열립니다. 실제 `~/.claude/` 디렉토리를 직접 조작합니다.

## 관리 대상

| 타입 | 보기 | 스코프 간 이동 |
|------|:----:|:------------:|
| 메모리 (feedback, user, project, reference) | ✅ | ✅ |
| 스킬 | ✅ | ✅ |
| MCP 서버 | ✅ | ✅ |
| 설정 (CLAUDE.md, settings.json) | ✅ | 🔒 |
| 훅 | ✅ | 🔒 |
| 플러그인 | ✅ | 🔒 |
| 플랜 | ✅ | 🔒 |

## 스코프 계층

```
Global                       <- 모든 곳에 적용
  회사 (Workspace)            <- 하위 모든 프로젝트에 적용
    회사레포1                  <- 이 프로젝트 전용
    회사레포2                  <- 이 프로젝트 전용
  사이드프로젝트 (Project)      <- 독립 프로젝트
  문서 (Project)               <- 독립 프로젝트
```

하위 스코프는 상위 스코프의 메모리, 스킬, MCP 서버를 자동으로 상속합니다.

## 작동 방식

1. **스캔** `~/.claude/` — 모든 프로젝트, 메모리, 스킬, MCP 서버, 훅, 플러그인, 플랜 탐색
2. **계층 파악** — 파일 시스템 경로에서 부모-자식 관계 추론
3. **대시보드 렌더링** — 스코프 헤더 > 카테고리 바 > 항목 목록, 자동 들여쓰기
4. **이동 처리** — 드래그하거나 "이동…" 클릭하면 안전 검사 후 파일을 실제로 이동

## 플랫폼

| 플랫폼 | 상태 |
|--------|:----:|
| Ubuntu / Linux | ✅ 지원 |
| macOS | 아마 됩니다 (미테스트) |
| Windows | 미지원 |
| WSL | 아마 됩니다 (미테스트) |

## 라이선스

MIT

## 만든 사람

[ithiria894](https://github.com/ithiria894) — Claude Code 생태계를 위한 도구 제작.
