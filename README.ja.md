# Bangermeter 日本語版（非公式）

[itsryanlenk/bangermeter](https://github.com/itsryanlenk/bangermeter) を日本語で読めるようにした、個人用のフォークです。

本家の `extension/` は**一切編集しません**。翻訳は `ja/` の辞書とオーバーレイで外側から被せ、`dist/` に組み立てます。Bangermeterが描画した要素（クラス名が `bangermeter-` で始まるもの）だけを翻訳するので、Xの画面本体のDOMには触れません。辞書にない文字列は英語のまま表示されるだけで、動作は壊れません。

| パス | 役割 |
|---|---|
| `extension/` | 本家のまま（編集禁止） |
| `ja/dict.json` | 翻訳辞書（用語集、固定文、正規表現パターン） |
| `ja/ja-overlay.js` | 描画後のDOMを翻訳するスクリプト |
| `ja/build.js` | `extension/` から `dist/` を生成 |
| `ja/welcome-ja.css` | 初回ガイドの見出しと「x.comを開く」ボタンの強制大文字（`x.com` → `X.COM`）を打ち消す小さなCSS。`build.js` が `dist/welcome.html` にだけ読み込ませる |
| `ja/serve-dist.js` | `dist/` を配信する（`verify.js` が使う。手動でfixtureを見たいときは `node ja/serve-dist.js`） |
| `ja/check-missing.js` | 本家の新しい未翻訳文字列を検出 |
| `ja/verify.js` | fixtureをChromeで描画して翻訳を自動検証 |
| `docs/ja/` | 引き継ぎ資料と文字列一覧CSV |

## Chromeに読み込む

1. 初回だけ、依存を入れます。
   ```sh
   cd ja && npm install && cd ..
   ```
   （`npm install` が必要なのは `verify.js` を使うときだけです。`build.js` は依存なしで動きます。）
2. ビルドします。
   ```sh
   node ja/build.js
   ```
3. Chromeで `chrome://extensions` を開き、右上の「デベロッパー モード」をオンにします。
4. 「パッケージ化されていない拡張機能を読み込む」を押し、このリポジトリの `dist/` フォルダを選びます。
5. x.com を開いて（すでに開いていれば再読み込みして）ください。再ビルドしたあとは、拡張機能の一覧で更新ボタンを押し、x.com のタブも再読み込みします。

本家のBangermeterを入れている場合は、二重にバッジが付かないよう、どちらか一方を無効にしてください。

## 本家の更新を取り込む

```sh
git fetch upstream
git merge upstream/main
node ja/build.js
node ja/check-missing.js
node ja/verify.js
```

- **`merge`:** `extension/` を編集していないので、原理的にコンフリクトは起きません。
- **`check-missing.js`:** 本家で追加・変更された、辞書にない表示文字列を一覧します。`NEW`（新規または文言変更）か `A-MISSING`（以前は訳せていた文字列）があると終了コード1で終わります。`tierC` は常に除外され、`pending` と未翻訳のtier B は `--all` を付けたときだけ一覧されます。
- **`verify.js`:** fixtureをChromeで描画し、バッジ、パネル、下書きメーター（1文字ごとに日本語が保たれるか）、ポップアップ、初回ガイドを確認します。`dist/` に対して本家の `run-tests.js` も実行します。システムにインストール済みのGoogle Chromeを使います。

### 辞書に追加するとき

1. `check-missing.js` が出した文字列を、実際に描画されるテキスト単位で `ja/dict.json` に追加します。数値を含む文は `patterns` に正規表現で書きます（`$1` が取り込んだ部分、`tr` に番号を書くとその部分も翻訳します）。
2. 訳語は `_glossary` に合わせて統一します。
3. 辞書にない文字列を調べるには、開発者ツールのコンソールで `localStorage.bmJaDebug = "1"` を実行して再読み込みします。一致しなかった文字列が `console.debug` に出ます。
4. 文の断片（コードで文を組み立てているもの）は、完全な文のパターンで訳し、断片のほうは `contextual` に理由付きで登録します。tier B で未翻訳のものは `pending` に入れます。
5. 英語のまま残すと決めた本文（「このスコアについて」の `Weights: <日付> — …` など）は、`dict.json` の `tierC`（正規表現のリスト）に追加すると、`check-missing.js` の対象から外れます。
6. もう一度 `node ja/build.js && node ja/verify.js` を実行します。

## 方針と範囲

- **翻訳するもの:** tier A（バッジ、パネルの見出しと主要な文、下書きメーター、ポップアップ、初回ガイド、重みのラベル）と、tier B のうち次のものです。
  - 「Xが公開した重みが実際に語ること」の箇条書きと結びの段落
  - リプライ向けの説明（「リプライの評価」）
  - 認証済みアカウントの注記
  - 下書きメーターのツールチップ
- **英語のまま残すもの（`tierC`）:** 「このスコアについて」の本文（`Weights: <日付> — …` の変更履歴など）と、コミュニティノートの出典（論文名と数値）です。Xの同期のたびに書き換わる、あるいは原文のまま引用すべき文なので、`dict.json` の `tierC` に正規表現で登録し、`check-missing.js` の対象から外しています。`weights.js` の `note` / `why` も英語のままです。
- **まだ訳していないもの（`pending`）:** 計算式の注記（`Score = Σ…`、`Engagement rates = …`、`Scored from the three heads…`）と、一部のツールチップです。`dict.json` の `pending` に入れてあり、`node ja/check-missing.js --all` で一覧できます。
- 数式やソースの参照（`param.rs` など）は原文のままです。
- **ビルド時パッチ（暫定）:** 本家の `scoring.js` は `hasQuestion: /\?/.test(t)` で質問を判定するため、全角の「？」を検出できません。`extension/` は編集せず、`ja/build.js` が `dist/scoring.js` を生成するときだけ `/[?？❓❔⁉⁈]/` に置き換えます（全角と絵文字の疑問符も質問として扱う）。
  - 置換対象の行が見つからないとビルド時に警告を出します（本家の書き方が変わった合図です。`ja/build.js` の `patchScoring` を見直してください）。
  - 本家がすでに全角に対応していれば、置換は自動でスキップされます。
  - **本家が修正したらこのパッチは不要になります。** そのときは `ja/build.js` の `patchScoring` と、`ja/verify.js` の全角「？」・絵文字「❓」のチェックを削除してください。本家へのPRは別途出す想定です。
  - これ以外のスコア判定ロジックは変更しません。
- Tampermonkey版（`bangermeter.user.js`）は `dist/` に含めません。

ライセンスは本家（MIT）のままです。`LICENSE` は変更していません。
