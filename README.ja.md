# Claude Code Organizer

[![npm version](https://img.shields.io/npm/v/@mcpware/claude-code-organizer)](https://www.npmjs.com/package/@mcpware/claude-code-organizer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [廣東話](README.zh-HK.md) | 日本語 | [한국어](README.ko.md) | [Español](README.es.md) | [Bahasa Indonesia](README.id.md) | [Italiano](README.it.md) | [Português](README.pt-BR.md) | [Türkçe](README.tr.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md)

**Claude Code のメモリ・スキル・MCPサーバー・フックをまとめて管理できるダッシュボード。スコープ階層で一覧表示、ドラッグ＆ドロップでスコープ間を移動。**

![Claude Code Organizer Demo](docs/demo.gif)

## 問題

Claude Code を使っていて、気づいたことはありますか？セッションを始める前に、context window はすでにかなり埋まっています。

### token 予算：会話を始める前に3割消えている

Claude Code は起動時にすべての設定ファイルを自動的にプリロードします — CLAUDE.md、メモリ、スキル、MCP server 定義、hooks、rules など。あなたが何も入力していなくても、これらはすべて context window に詰め込まれます。

これは2週間使用した実際のプロジェクトです：

![Context Budget](docs/CB.png)

**69.2K tokens — 200K context window の 34.6% が、一文字も打つ前に消えている。** このオーバーヘッドだけの推定コスト：Opus $1.04 USD / Sonnet $0.21 USD（セッションごと）。

残りの 65.4% は、あなたのメッセージ・Claude の応答・tool results で奪い合いになります。context が埋まるほど Claude の精度は落ちる — いわゆる **context rot** です。

69.2K の内訳：オフラインで計測できるすべての config ファイルの token 合計に、推定システムオーバーヘッド（~21K tokens）を加えたもの。後者は system prompt、23+ 個のビルトイン tool 定義、MCP tool schemas で、毎回の API call でロードされます。

ただし、これは**静的な**部分だけ。以下の **runtime injections** は含まれていません：

- **Rule re-injection** — すべての rule ファイルが tool call のたびに context に再注入される。~30回の tool call 後、これだけで context window の ~46% を消費し得る
- **File change diffs** — 読み書きしたファイルが外部で変更された場合（例：linter）、差分全体が隠れた system-reminder として注入される
- **System reminders** — マルウェア警告、token ナッジなどの隠れた injection
- **Conversation history** — あなたのメッセージ、Claude の応答、すべての tool results が毎回の API call で再送される

セッション中盤の実際の使用量は 69.2K よりはるかに多い。ただ見えないだけです。

### 設定が間違った scope に散らばっている

もう1つの問題：Claude Code は作業中に、メモリ・スキル・MCP config・commands・rules を自動で作成し、現在のディレクトリに対応する scope に放り込みます。

さらに、異なる scope で MCP サーバーを設定すると、気づかないうちに同じサーバーが重複インストールされます。確認するまで気づきません：

![重複した MCP サーバー](docs/reloaded%20mcp%20form%20diff%20scope.png)

Teams が2つ、Gmail が3つ、Playwright が3つ — それぞれのコピーが毎セッション token を浪費しています。scope ラベル（`Global` / `nicole`）で各重複がどこにあるか一目瞭然なので、どれを残してどれを消すか判断できます。

その結果：
- どこでも使いたい設定が、1つのプロジェクトに閉じ込められる
- 1つのリポ専用のデプロイスキルが global に漏れて、全プロジェクトを汚染する
- global にある Python pipeline スキルが React フロントエンドのセッションにもロードされる
- 重複した MCP エントリが同じサーバーを2回初期化する
- 古いメモリが現在の指示と矛盾する

scope を間違えたアイテムはすべて token を浪費し、**さらに**精度を下げます。そして、すべての scope を横断して全体像を見せてくれるコマンドは存在しません。

### 解決策：コマンド1つでダッシュボードを開く

```bash
npx @mcpware/claude-code-organizer
```

Claude が保存しているすべてを scope 階層ごとに表示。**始める前に token 予算が見える。** scope 間でドラッグ移動、古いメモリを削除、重複を発見。

> **初回実行で `/cco` skill が自動インストール** — 以降、どのセッションでも `/cco` と入力するだけでダッシュボードが開きます。

### 例：token を食っているものを見つける

ダッシュボードを開き、**Context Budget** → **By Tokens** に切り替え。一番消費しているものが上に来ます。忘れていた 2.4K token の CLAUDE.md？3つの scope で重複しているスキル？クリーンアップすれば context window の 10-20% を節約できます。

### 例：scope 汚染を修正する

プロジェクト内で Claude に「TypeScript + ESM がいい」と言ったけど、全プロジェクトで適用したい。そのメモリを Project から Global にドラッグ。**完了。1回のドラッグ。** global にあるデプロイスキルが実は1つのリポ専用？該当する Project scope にドラッグすれば、他のプロジェクトからは見えなくなります。

### 例：古いメモリを削除する

Claude は何気ない発言から自動でメモリを作ります。1週間後にはもう関係ないのに、毎セッションでロードされ続ける。閲覧、確認、削除。**Claude が自分について何を知っていると思うかは、あなたが決めてください。**

---

## 機能

- **スコープ階層ビュー** — Global > Workspace > Project で整理、継承関係もひと目でわかる
- **ドラッグ＆ドロップ** — メモリ・スキル・MCPサーバーをスコープ間で移動
- **移動前に確認** — ファイルを触る前に必ず確認ダイアログが出る
- **型の安全性** — メモリはメモリフォルダにだけ、スキルはスキルフォルダにだけ移動可能
- **検索＆フィルター** — 全アイテムをリアルタイム検索、カテゴリ別フィルター（メモリ、スキル、MCP、設定、フック、プラグイン、プラン）
- **Context Budget** — 何も入力する前に、config が何 tokens 消費しているかを確認 — アイテムごとの内訳、継承された scope コスト、システムオーバーヘッド推定、200K context の使用率
- **詳細パネル** — アイテムをクリックするとメタデータ・説明・ファイルパスを表示、VS Code で直接開ける
- **依存ゼロ** — 純粋な Node.js ビルトインモジュールのみ、SortableJS は CDN 経由
- **ガチのファイル移動** — `~/.claude/` 内のファイルを実際に移動する。閲覧専用ツールじゃない
- **100+ E2E テスト** — Playwright テストスイート、filesystem 検証・セキュリティ（パストラバーサル、不正入力）・context budget・全 11 カテゴリをカバー

## クイックスタート

### 方法1：npx（インストール不要）

```bash
npx @mcpware/claude-code-organizer
```

### 方法2：グローバルインストール

```bash
npm install -g @mcpware/claude-code-organizer
claude-code-organizer
```

### 方法3：Claude に頼む

Claude Code にこう伝えるだけ：

> `npx @mcpware/claude-code-organizer` を実行して。Claude Code の設定を管理するダッシュボードだよ。URLを教えて。

`http://localhost:3847` でダッシュボードが開きます。実際の `~/.claude/` ディレクトリを操作します。

## 管理できるもの

| タイプ | 閲覧 | スコープ間移動 |
|--------|:----:|:------------:|
| メモリ（feedback、user、project、reference） | ✅ | ✅ |
| スキル | ✅ | ✅ |
| MCPサーバー | ✅ | ✅ |
| 設定（CLAUDE.md、settings.json） | ✅ | 🔒 |
| フック | ✅ | 🔒 |
| プラグイン | ✅ | 🔒 |
| プラン | ✅ | 🔒 |

## スコープ階層

```
Global                       <- 全プロジェクトに適用
  会社 (Workspace)            <- 配下の全サブプロジェクトに適用
    会社リポ1                  <- このプロジェクト専用
    会社リポ2                  <- このプロジェクト専用
  個人開発 (Project)           <- 独立したプロジェクト
  ドキュメント (Project)        <- 独立したプロジェクト
```

子スコープは親スコープのメモリ・スキル・MCPサーバーを自動的に継承します。

## 仕組み

1. **スキャン** `~/.claude/` — プロジェクト・メモリ・スキル・MCPサーバー・フック・プラグイン・プランを検出
2. **階層を解決** — ファイルシステムのパスから親子関係を特定
3. **ダッシュボード描画** — スコープヘッダー > カテゴリバー > アイテム行、適切にインデント
4. **移動処理** — ドラッグまたは「移動先…」クリックで、安全チェック付きでファイルを実際に移動

## プラットフォーム

| プラットフォーム | 状態 |
|----------------|:----:|
| Ubuntu / Linux | ✅ サポート済み |
| macOS | たぶん動く（未テスト） |
| Windows | 未対応 |
| WSL | たぶん動く（未テスト） |

## ライセンス

MIT

## 作者

[ithiria894](https://github.com/ithiria894) — Claude Code エコシステム向けのツールを開発中。
