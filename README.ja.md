# Bangermeter 日本語版（非公式）

[itsryanlenk/bangermeter](https://github.com/itsryanlenk/bangermeter) を日本語で読めるようにした、個人用のフォークです。

本家の `extension/` は**一切編集しません**。翻訳は `ja/` の辞書とオーバーレイで外側から被せ、`dist/` に組み立てます。Bangermeterが描画した要素（クラス名が `bangermeter-` で始まるもの）だけを翻訳するので、Xの画面本体のDOMには触れません。辞書にない文字列は英語のまま表示されるだけで、動作は壊れません。

| パス | 役割 |
|---|---|
| `extension/` | 本家のまま（編集禁止） |
| `ja/dict.json` | 翻訳辞書（用語集、固定文、正規表現パターン） |
| `ja/ja-overlay.js` | 描画後のDOMを翻訳するスクリプト |
| `ja/build.js` | `extension/` から `dist/` を生成 |
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
- **`check-missing.js`:** 本家で追加・変更された、辞書にない表示文字列を一覧します。`NEW`（新規または文言変更）か `A-MISSING`（以前は訳せていた文字列）があると終了コード1で終わります。`--all` を付けると、未翻訳のtier B も一覧します。
- **`verify.js`:** fixtureをChromeで描画し、バッジ、パネル、下書きメーター（1文字ごとに日本語が保たれるか）、ポップアップ、初回ガイドを確認します。`dist/` に対して本家の `run-tests.js` も実行します。システムにインストール済みのGoogle Chromeを使います。

### 辞書に追加するとき

1. `check-missing.js` が出した文字列を、実際に描画されるテキスト単位で `ja/dict.json` に追加します。数値を含む文は `patterns` に正規表現で書きます（`$1` が取り込んだ部分、`tr` に番号を書くとその部分も翻訳します）。
2. 訳語は `_glossary` に合わせて統一します。
3. 辞書にない文字列を調べるには、開発者ツールのコンソールで `localStorage.bmJaDebug = "1"` を実行して再読み込みします。一致しなかった文字列が `console.debug` に出ます。
4. 文の断片（コードで文を組み立てているもの）は、完全な文のパターンで訳し、断片のほうは `contextual` に理由付きで登録します。tier B で未翻訳のものは `pending` に入れます。
5. 英語のまま残すと決めた本文（「このスコアについて」の `Weights: <日付> — …` など）は、`dict.json` の `tierC`（正規表現のリスト）に追加すると、`check-missing.js` の対象から外れます。
6. もう一度 `node ja/build.js && node ja/verify.js` を実行します。

## 方針と範囲

- 翻訳するのは tier A（バッジ、パネルの見出しと主要な文、下書きメーター、ポップアップ、初回ガイド、重みのラベル）と、tier B のうち「Xが公開した重みが実際に語ること」の箇条書きと結びの段落、認証済みアカウントの注記、下書きメーターのツールチップです。
- リプライ向けの説明、コミュニティノートの出典、計算式の注記（`Score = Σ…`、`Engagement rates = …`）は、今は英語のままです（`dict.json` の `pending`）。
- `weights.js` の `note` / `why`（tier C）は、Xの更新のたびに本家が書き換えるため、英語のまま残します。
- 数式やソースの参照（`param.rs` など）は原文のままです。
- スコア判定ロジックの修正はこのフォークでは行いません（例：全角の「？」を質問として検出できない件は、本家へPRとして別途出す想定です）。
- Tampermonkey版（`bangermeter.user.js`）は `dist/` に含めません。

ライセンスは本家（MIT）のままです。`LICENSE` は変更していません。
