# 引き継ぎ：Bangermeter 日本語化（オーバーレイ方式）

## 背景と目的

[itsryanlenk/bangermeter](https://github.com/itsryanlenk/bangermeter) は、Xが公開したFor Youのランキング重み（xai-org/x-algorithm）を使って投稿をスコアリングするChrome拡張機能（MV3、MITライセンス、ビルド工程なしの素のJavaScript）。表示がすべて英語なので、日本語で読める版を自分用に作りたい。

本家はi18nに対応していないため、i18n対応のPRはマージされない前提で進める。そのかわり、**本家の更新を今後も手間なく取り込み続けられること**を最優先にする。本家の更新頻度は非常に高い（2026年8月4日開始で118コミット、10月だけで34コミット。Xのアルゴリズム公開コードが更新されるたびに `weights.js` などを追従させている）。

## 基本方針：本家のファイルは編集しない

`extension/` 配下は本家のまま一切編集しない。翻訳は外側から被せる。

```
bangermeter-ja/              ← 本家のフォーク（upstream リモートに本家を登録）
├── extension/               ← 本家のまま（編集禁止）
├── ja/
│   ├── dict.json            ← 翻訳辞書（固定文 + 正規表現パターン）
│   ├── ja-overlay.js        ← Bangermeterが描画したDOMだけを翻訳するスクリプト
│   ├── build.js             ← dist/ を生成する（Node、依存は最小限に）
│   └── check-missing.js     ← 本家の新しい未翻訳文字列を検出する
├── dist/                    ← Chromeに「パッケージ化されていない拡張機能」として読み込む成果物（gitignore）
└── docs/ja/                 ← この引き継ぎ資料と文字列一覧CSV
```

本家の取り込みは `git fetch upstream && git merge upstream/main` → `node ja/build.js` だけで完結し、原理的にコンフリクトが起きないこと。翻訳が漏れた箇所は英語のまま表示されるだけで、動作は壊れないこと。

## 調査済みの事実（v0.10.5 / 2026-10-29時点のmain）

- content scripts は `weights.js` → `scoring.js` → `content.js` の順に読み込まれ、CSSは `styles.css`。ポップアップは `popup.html` + `popup.js`、初回ガイドは `welcome.html`。
- 注入されるUIのクラス名はすべて `bangermeter-` で始まる。主なルートは `.bangermeter-badge`（タイムラインの各投稿）、`.bangermeter-panel`（内訳パネル。position: fixed）、`.bangermeter-meter`（投稿作成時のメーター）。
- テキストだけでなく、`title`（ツールチップ）と `aria-label` にも英語が多い。
- 表示文字列の一部は `content.js` ではなく、`weights.js` の `label` / `note` / `why` や、`scoring.js` の `label` から来ている。
- `content.js` の文は、数値を挟んで細切れに組み立てられている（例：`"Weight " + w + " for a like (param.rs, " + date + " sync)"`）。そのため、断片ごとの訳では不十分で、組み上がったテキストに対して正規表現で置換する必要がある。
- `extension/bangermeter.user.js` は `store-assets/make-userscript.ps1` が生成するTampermonkey版で、今回は対象外。
- `extension/fixture*.html` と `serve-fixtures.js` があり、Xにログインしなくても描画を確認できる可能性がある。`run-tests.js` / `test.html` もある。検証に使えるかどうか、最初に確認すること。

## 翻訳の範囲（優先度）

`docs/ja/bangermeter-ja-strings.csv` に、抽出した文字列約390件の一覧がある（列：tier, file, line, field, english, japanese）。機械的に抽出したため、CSSセレクタなどが数件混ざっている。

| tier | 件数 | 方針 |
|---|---|---|
| **A** | 194 | **今回の対象。** バッジ、パネルの見出し、投稿の特徴ラベル、設定画面、初回ガイド、`weights.js` の `label` |
| **B** | 137 | 次の段階。「Show the math」内の説明、「What X's published weights actually say」の解説、下書きメーターのツールチップ。正規表現パターンが中心になる |
| **C** | 57 | **翻訳しない。** `weights.js` の `note` / `why`。全体の文字数の約3分の2を占め、Xの更新のたびに本家が書き換えるため、辞書方式では追いつけない。英語のまま残す |

CSVはあくまで「どの文を訳すか」の目録として使う。辞書は、実際に描画されるテキスト単位で作ること。

## 実装の要件

### ja-overlay.js
- `MutationObserver` で、`bangermeter-` 系のルート要素の配下だけを対象にする。Xの画面本体のDOMは絶対に書き換えない。
- テキストノードに加えて、`title` / `aria-label` / `placeholder` も翻訳する。
- 照合は「固定文の完全一致」→「正規表現パターン」の順に行う。前後の空白は無視する。
- 自分の書き換えで再びObserverが発火して無限ループにならないようにする（訳文が辞書に一致しない、または処理済みの印を付けるなど）。
- パフォーマンスに注意する。タイムラインのスクロール中にバッジが大量に生成されるので、重い全走査はしない。
- 一致しなかった文字列は、開発用フラグがオンのときだけ `console.debug` で記録し、辞書に追加する候補を拾えるようにする。

### build.js
- `extension/` を `dist/` にコピーする。
- `manifest.json` の `content_scripts[0].js` の末尾に `ja-overlay.js` と辞書を追加する。`name` は「Bangermeter 日本語版（非公式）」などにして、本家と区別できるようにする。`default_locale` は不要。
- `popup.html` と `welcome.html` は静的な部分をビルド時に辞書で置換し、さらに `popup.js` が動的に出す文字列用に、オーバーレイもポップアップへ読み込ませる。
- 本家の `LICENSE` はそのまま残す。

### check-missing.js
- 本家の `.js` / `.html` から表示文字列の候補を抽出し、辞書と照合して、未翻訳の一覧を出す（tier Cの対象は除外する）。本家を取り込んだあとに実行する想定。

## 進め方

1. リポジトリの準備（フォーク、upstreamの登録、`ja/` と `docs/ja/` の作成）。
2. fixturesで描画を確認できるかどうかを調べ、検証手段を決める。
3. tier Aの辞書を作り、オーバーレイとビルドを実装する。
4. fixtures（または実際のx.com）で、バッジ、パネル、メーター、ポップアップ、初回ガイドが日本語で表示されることを確認する。
5. `check-missing.js` を実装する。
6. （任意）README.ja.md に、本家の取り込み手順とChromeへの読み込み方法を書く。

着手する前に、手順2の結果と、それを踏まえた実装計画を一度示してほしい。

## 訳語のトーン

- 「なずな」という自分のXアカウントを育てるのに使う。開発者向けではなく、日常的に読みやすい日本語にする。
- 数式やソースの参照（`param.rs`、`xai-value-model/scoring.rs`、×0.75 など）は原文のまま残す。
- 用語は統一する。たとえば、Content score = 「内容スコア」、Engagement score = 「反応スコア」、For You = 「おすすめ」、out-of-network = 「フォロー外」、in-network = 「フォロー内」、dwell = 「滞在」。ほかの訳語は、辞書の冒頭に用語集として定義してから使う。

## 今回の対象外（別タスク）

- **スコア判定ロジックの修正は、このフォークでは行わない。** たとえば `scoring.js` 790行目の `hasQuestion: /\?/.test(t)` は全角の「？」を検出できないが、これはi18nではなく検出漏れのバグなので、本家へ小さなPR（`/[?？]/` への修正とテスト）として別途出す。本家は `件のいいね` などの日本語UI文字列にすでに対応しているので、受け入れられる可能性がある。
- tier Cの長文の翻訳。
- Tampermonkey版。
- Chrome Web Storeでの公開。
