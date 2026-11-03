// End-to-end check of the Japanese build (needs system Chrome; Playwright's
// bundled Chromium does not run on older macOS).
//   node ja/verify.js            build, serve dist/, assert, exit 1 on failure
//   node ja/verify.js --leftovers  also print every untranslated string seen
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { build, DIST } = require("./build.js");
const { start } = require("./serve-dist.js");
const { createTranslator } = require("./ja-overlay.js");

const ROOT = path.resolve(__dirname, "..");
const SHOW_LEFT = process.argv.includes("--leftovers");
const PORT = 8793;
const URL = p => "http://localhost:" + PORT + "/" + p;
const JA = /[぀-ヿ一-鿿]/;

let fails = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? "  [" + detail + "]" : ""));
  if (!ok) fails++;
}

// ── tier A English from the CSV (complete strings only) ───────────────────
function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const norm = s => s.replace(/\s+/g, " ").trim();

function tierAStatic(dict) {
  const tr = createTranslator(dict);
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, "docs/ja/bangermeter-ja-strings.csv"), "utf8")).slice(1);
  const ctx = new Set(Object.keys(dict.contextual || {}).map(norm));
  const miss = [];
  let n = 0;
  rows.filter(r => r[0] === "A").forEach(r => {
    const en = norm(r[4] || "");
    if (!en || !/[A-Za-z]/.test(en)) return;
    n++;
    if (tr.translate(en) == null && !ctx.has(en)) miss.push(en);
  });
  return { n, miss };
}

// Collect every string Bangermeter rendered (text nodes + title/aria-label/placeholder).
const COLLECT = (full) => {
  const out = [];
  const roots = full ? [document.documentElement]
    : [...document.querySelectorAll('[class^="bangermeter-"],[class*=" bangermeter-"]')];
  roots.forEach(r => {
    const w = document.createTreeWalker(r, 1 | 4);
    let n = r;
    do {
      if (n.nodeType === 3) { if (n.nodeValue.trim() && !/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) out.push(n.nodeValue); }
      else if (n.nodeType === 1 && !/^(SCRIPT|STYLE)$/.test(n.nodeName)) {
        for (const a of ["title", "aria-label", "placeholder"]) if (n.getAttribute(a)) out.push(n.getAttribute(a));
      }
    } while ((n = w.nextNode()));
  });
  return out;
};

(async () => {
  build();
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, "dict.json"), "utf8"));
  const srv = await start(PORT);
  const browser = await chromium.launch({ channel: "chrome" });
  const left = new Map();       // untranslated English seen → where
  const tierA = new Set(parseCsv(fs.readFileSync(path.join(ROOT, "docs/ja/bangermeter-ja-strings.csv"), "utf8"))
    .slice(1).filter(r => r[0] === "A").map(r => norm(r[4] || "")).filter(Boolean));

  const record = (strs, where) => strs.forEach(s => {
    const c = norm(s);
    if (!/[A-Za-z]{2}/.test(c) || JA.test(c)) return;
    if (!left.has(c)) left.set(c, where);
  });

  try {
    // 0. dictionary vs. tier A list
    const st = tierAStatic(dict);
    check("tier A: all " + st.n + " complete strings are translated or listed as contextual", st.miss.length === 0, st.miss.slice(0, 5).join(" | "));
    if (st.miss.length) st.miss.forEach(m => console.log("   missing: " + m));

    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));

    // 1. timeline fixture: badges + panel
    await page.goto(URL("fixture.html")); await page.waitForTimeout(1200);
    const badgeTitle = await page.$eval(".bangermeter-badge", b => b.title);
    check("badge tooltip is Japanese", /クリックで内訳/.test(badgeTitle), badgeTitle);
    const segTitles = await page.$$eval(".bangermeter-badge .bangermeter-seg", s => s.map(x => x.title));
    check("badge C/E tooltips are Japanese", segTitles.length > 0 && segTitles.every(t => JA.test(t)), segTitles.join(" | "));
    let sawVerified = false;
    const n = await page.$$eval(".bangermeter-badge", b => b.length);
    for (let i = 0; i < n; i++) {
      const bd = (await page.$$(".bangermeter-badge"))[i];
      await bd.click(); await page.waitForTimeout(120);
      await page.evaluate(() => document.querySelectorAll(".bangermeter-panel details").forEach(d => d.open = true));
      await page.waitForTimeout(60);
      record(await page.evaluate(COLLECT, false), "fixture.html panel #" + i);
      if (i === 0) {
        const t = await page.$eval(".bangermeter-panel", p => p.innerText);
        check("panel headings are Japanese", /内容の魅力度/.test(t) && /獲得した反応/.test(t), t.slice(0, 120));
        check("panel aria-label/close are Japanese", await page.$eval(".bangermeter-panel", p => /内訳/.test(p.getAttribute("aria-label")) && /閉じる/.test(p.querySelector(".bangermeter-panel-close").getAttribute("aria-label"))));
        check("tier B: 'published weights actually say' bullets + closing paragraph are Japanese",
          /投稿のリンクをコピーすると 20/.test(t) && /DMでシェアすると 5/.test(t) && /重みが掛かるのは「予測された確率」/.test(t) && /バンガー判定/.test(t), "");
        check("tier B: no unfilled $N placeholders", !/\$\d/.test(t));
        check("source refs kept verbatim (param.rs)", /param\.rs/.test(await page.$eval(".bangermeter-panel", p => p.innerHTML + [...p.querySelectorAll("[title]")].map(e => e.title).join(""))));
      }
      if (/認証済みアカウント: 2023年当時/.test(await page.$eval(".bangermeter-panel", p => p.innerText))) sawVerified = true;
      await page.keyboard.press("Escape"); await page.waitForTimeout(60);
    }
    check("tier B: verified-author note is Japanese", sawVerified);
    // X's own DOM must be untouched: fixture tweet text has no Japanese added
    const tweetJa = await page.$$eval("article", a => a.map(x => [...x.querySelectorAll('[data-testid="tweetText"]')].map(t => t.innerText).join("")).join(""));
    check("X's own tweet text untouched", !/内容|スコア|リプライ件/.test(tweetJa));

    // 2. reply-surface fixture
    await page.goto(URL("a/status/123")); await page.waitForTimeout(1200);
    let replyText = "";
    const bd = await page.$$(".bangermeter-badge");
    for (const b of bd) {
      await b.click().catch(() => {}); await page.waitForTimeout(100);
      await page.evaluate(() => document.querySelectorAll(".bangermeter-panel details").forEach(d => d.open = true));
      record(await page.evaluate(COLLECT, false), "thread panel");
      const pt = await page.$eval(".bangermeter-panel", p => p.innerText).catch(() => "");
      if (/リプライの評価/.test(pt)) replyText += pt;
      await page.keyboard.press("Escape");
    }
    check("reply scoring section: all 5 explanations are Japanese",
      /フォロー外の場合、このリプライはおすすめにそもそも届きません/.test(replyText) &&
      /相互フォロー加点がありません。\+15\.0/.test(replyText) &&
      /Grokのモデルがリプライを 0〜3 で採点します/.test(replyText) &&
      /並べ替えのしくみは公開されていない/.test(replyText) &&
      /バンガー判定が動く前に除外されます/.test(replyText) && !/\$\d/.test(replyText), replyText.slice(0, 200));

    // 3. compose fixture: Japanese must persist on EVERY keystroke
    await page.goto(URL("fixture-compose.html")); await page.waitForTimeout(1800);
    const ownFails = await page.$$eval("#results .fail", e => e.length);
    check("fixture-compose.html self-checks still pass with overlay", ownFails === 0, ownFails + " failing");
    const editor = page.locator('[data-testid="tweetTextarea_1"]');
    await editor.click();
    const draft = "What is the single most useful thing you learned this year? Genuinely curious!! #a #b #c";
    let kept = 0, total = 0, bad = [];
    for (const ch of draft) {
      await page.keyboard.type(ch);
      await page.waitForTimeout(8);
      const s = await page.evaluate(() => {
        const m = [...document.querySelectorAll(".bangermeter-meter")].find(x => !x.classList.contains("bangermeter-hidden"));
        return m ? { aria: m.getAttribute("aria-label"), hints: [...m.querySelectorAll(".bangermeter-meter-hints > span")].map(x => x.textContent), save: m.querySelector(".bangermeter-meter-save").textContent } : null;
      });
      if (!s) continue;
      total++;
      const ok = /^Bangermeter 下書きスコア \d+ \/ 100$/.test(s.aria) && s.save === "+ 比較" && s.hints.every(h => JA.test(h));
      if (ok) kept++; else if (bad.length < 3) bad.push(JSON.stringify(s));
    }
    check("draft meter stays Japanese across all " + total + " keystrokes", total > 20 && kept === total, bad.join(" "));
    const hintsNow = await page.$$eval(".bangermeter-meter-hints > span", s => s.map(x => x.textContent));
    check("draft hint chips translated (question / hashtags)", hintsNow.some(h => /質問/.test(h)) && hintsNow.some(h => /ハッシュタグ/.test(h)), hintsNow.join(" | "));
    // compare chip + its tooltip
    await page.click(".bangermeter-meter-save"); await page.waitForTimeout(80);
    const chipTitle = await page.$eval(".bangermeter-variant", c => c.title);
    check("compare chip tooltip translated, snippet kept", /削除/.test(chipTitle) && /What is the single/.test(chipTitle), chipTitle);
    record(await page.evaluate(COLLECT, false), "compose meter");

    // 4. extension pages
    for (const f of ["popup.html", "welcome.html"]) {
      await page.goto(URL(f)); await page.waitForTimeout(600);
      const strs = await page.evaluate(COLLECT, true);
      record(strs.filter(s => !/^\s*$/.test(s)), f);
      const t = await page.evaluate(() => document.body.innerText);
      check(f + " is Japanese", JA.test(t));
      if (f === "welcome.html") {
        const h = await page.$eval(".step h2", e => e.innerText);
        check("welcome: first step heading shows lowercase x.com (no forced uppercase)", h === "x.comをスクロール", h);
      }
      if (f === "welcome.html") check("welcome: bold-split sentence reads naturally",
        t.replace(/\s+/g, "").includes("29のランキング項目それぞれに「実測」「推定」「Xがゼロにした」のどれかを表示するので"), "");
      const aLeft = [...left.entries()].filter(([c, w]) => w === f && tierA.has(c)).map(e => e[0]);
      check(f + ": no tier A string left in English", aLeft.length === 0, aLeft.join(" | "));
    }
    check("no page errors", errors.length === 0, errors.join(" | "));

    // 5. tier A strings must never remain as-is anywhere we looked
    const aLeftAll = [...left.keys()].filter(c => tierA.has(c));
    check("no tier A string rendered in English (fixtures)", aLeftAll.length === 0, aLeftAll.join(" | "));

    // 6. upstream test-suite against dist/
    let out = "";
    try { out = execFileSync("node", [path.join(DIST, "run-tests.js")], { encoding: "utf8" }); } catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
    const m = /(\d+) passed, (\d+) failed/.exec(out);
    check("dist/run-tests.js all pass", !!m && m[2] === "0", m ? m[0] : out.slice(-200));
    if (m) console.log("      (" + m[0] + ")");

    if (SHOW_LEFT) {
      console.log("\n── untranslated strings seen (" + left.size + ") ──");
      for (const [c, w] of left) console.log("[" + w + "] " + (tierA.has(c) ? "[A] " : "") + c.slice(0, 160));
    }
  } finally {
    await browser.close(); srv.close();
  }
  console.log(fails ? "\n" + fails + " check(s) FAILED" : "\nall checks passed");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
