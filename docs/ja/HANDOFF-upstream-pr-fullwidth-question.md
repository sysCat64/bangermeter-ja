# 引き継ぎ：本家 Bangermeter へ全角「？」検出のPRを出す

## 背景

bangermeter-ja（sysCat64/bangermeter-ja）では、ビルド時パッチで `scoring.js` の
`hasQuestion: /\?/.test(t)` を `/[?？❓❔⁉⁈]/` に置き換え、全角や絵文字の疑問符を質問として検出している。
実際のx.comで、全角「？」で「質問している」が付き、「。」に変えると消えることを確認済み。

これをXに投稿したところ、本家の作者（@itsryanlenk）から「PRを出すならREADMEに名前を載せる。出さないならこちらで直す」と返信があり、PRを出すことにした。

## 本家の現状（2026-11-04時点のmain、6ac07a6）

- 本家は 2026-11-03 に **日本語のi18nを正式に取り込んだ**（`extension/i18n.js`、`_locales/ja`）。日本語訳は bangermeter-ja のものがベースで、README の Credits に sysCat の名前がすでに載っている。
- その Credits には「全角？が質問として数えられていなかった点も sysCat が見つけた」と書かれているが、**修正自体はまだ入っていない**（`extension/scoring.js` 820行付近は `hasQuestion: /\?/.test(t)` のまま）。
- 文字数の判定は、本家が X と同じ数え方（CJK・絵文字は2）に直した（80e903f）。今回のPRでは触らない。
- テストは `extension/test.html` の最後のインライン `<script>` にあり、`node extension/run-tests.js` で実行する（現在 381 件）。
- **README に書かれたテスト件数**（`381 assertions`、`381/381 self-tests pass` の2箇所）は `store-assets/check-versions.js` が実際の件数と照合する。テストを追加したら README の数字も更新すること。

## やること

1. bangermeter-ja のリポジトリで `git fetch upstream` を実行し、**`upstream/main` から新しいブランチ**（例：`fix/fullwidth-question-mark`）を切る。bangermeter-ja の `main`（`ja/` などを含む）から切らないこと。
2. `extension/scoring.js` の `hasQuestion` を `/[?？]/` に変更する。**全角の「？」（U+FF1F）だけ**を追加し、絵文字（❓❔⁉⁈）は含めない。
   - 近くのコメントの書き方に合わせて、短い説明コメントを1〜2行付ける（全角？は日本語・中国語の標準の疑問符である、など）。
3. `extension/test.html` の「Content score」セクション（"question > plain" の近く）に、テストを追加する。
   - 全角「？」で終わる日本語の投稿が、`hasQuestion` 相当の加点を受けること（例：`"フォロワーを増やして、どうするの？"` のスコアが、同じ文を「。」で終えたものより高い）。
   - 既存の書き方（`E.contentScore({...})` と `check(...)`）に合わせる。文字数の加点の影響を受けないよう、比較する2つの文は疑問符以外を同じにする。
4. README のテスト件数2箇所を、新しい件数に更新する。
5. 確認：`node extension/run-tests.js` が全件成功し、`node store-assets/check-versions.js` でテスト件数のエラーが出ないこと。
6. `bangermeter.user.js` は生成物（`store-assets/make-userscript.ps1`）なので手で編集しない。PR本文で「userscript の再生成はメンテナーに任せる」と書く。manifest のバージョンも上げない。
7. コミットし、sysCat64/bangermeter-ja にブランチを push する。**PRの作成は sysCat が内容を確認してから行う**ので、push までで止めて、差分と下のPR本文案を見せること。

## PR本文案（英語）

```
Title: Count the full-width question mark (？) as a question

hasQuestion only matched the ASCII "?", so posts ending in the full-width "？"
(U+FF1F) never got the question modifier. That's the standard question mark in
Japanese and Chinese text, so most CJK questions were scored as statements.

- scoring.js: hasQuestion now matches /[?？]/
- test.html: a Japanese post ending in "？" scores above the same post ending in "。"
- README: test count updated

I've been running this change in sysCat64/bangermeter-ja for a few days on real
Japanese posts. A post ending in "？" now picks up "Asks a question", and the
same post ending in "。" does not; English posts are unchanged.

Not included: emoji question marks (❓ ❔ ⁉). They're common in Japanese posts
and my fork counts them, but that widens the detection rule, so I'd rather
discuss it separately if you're interested.

The userscript is generated, so I left bangermeter.user.js for the next
make-userscript run.
```

## このPRの後で bangermeter-ja をどうするか（参考、今回は作業しない）

本家に日本語が入ったので、次に本家がストア版を出せば、公式版で日本語が使えるようになる。
そうなった時点で、bangermeter-ja のオーバーレイは役目を終える見込み。
本家を取り込むと `extension/` に日本語化済みの文字列が入るため、オーバーレイと二重になるが、
いまの方針（本家を取り込む → build → verify）で問題が出ないかは、取り込むときに別途確認する。
