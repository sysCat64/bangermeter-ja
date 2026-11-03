// Finds display strings in the upstream extension that the dictionary does not
// cover. Run after `git merge upstream/main`:
//   node ja/check-missing.js            list NEW / changed strings, exit 1 if any
//   node ja/check-missing.js --all      also list tier B strings still pending
//
// Classification (tier C = weights.js note/why: never extracted, never reported):
//   OK        translated by dict.json (exact or pattern), or listed in "contextual"
//   A-MISSING known tier A string (docs/ja CSV) the dictionary no longer covers
//   NEW       not in the CSV snapshot and not translated — new or reworded upstream
//   B-pending known tier B string, not translated yet (only with --all)
//   C-skip    known tier C string (English by design)
const fs = require("fs");
const path = require("path");
const { createTranslator } = require("./ja-overlay.js");

const ROOT = path.resolve(__dirname, "..");
const EXT = process.env.BMJA_EXT || path.join(ROOT, "extension");   // override only for self-tests
const norm = s => s.replace(/\s+/g, " ").trim();

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

// Where a string literal is clearly shown to the user even without a space in it:
// x.textContent = "…", x.title = "…", setAttribute("aria-label", "…"), el(tag, cls, "…").
const UI_BEFORE = /(?:\.(?:textContent|innerText|title|placeholder|alt|ariaLabel)\s*=\s*|setAttribute\(\s*["'](?:title|aria-label|placeholder)["']\s*,\s*|\bel\(\s*[^,()]+,\s*[^,()]+,\s*|\.createTextNode\(\s*)$/;
// Minimal JS scanner: yields {text, line, key} for every string literal,
// skipping comments and regex literals. `key` is the property name before it.
function jsStrings(src) {
  const out = []; let i = 0, line = 1, prev = "", lastIdent = "", afterStr = false, plus = false;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; } i += 2; continue; }
    if (c === "/" && /[(,=:\[!&|?{};+]|^$/.test(prev)) {          // regex literal
      i++; let cls = false;
      while (i < n && (src[i] !== "/" || cls)) { if (src[i] === "\\") i++; else if (src[i] === "[") cls = true; else if (src[i] === "]") cls = false; i++; }
      i++; while (/[a-z]/i.test(src[i] || "")) i++; prev = ")"; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c, start = line, sidx = i; let s = ""; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { const e = src[i + 1]; s += e === "n" ? "\n" : e === "t" ? "\t" : e === "u" ? (i += 5, String.fromCharCode(parseInt(src.slice(i - 3, i + 1), 16))) : e; i += 2; continue; }
        if (src[i] === "\n") line++;
        s += src[i++];
      }
      i++;
      if (afterStr && plus && out.length) out[out.length - 1].text += s;      // "a" + "b" is one sentence
      else out.push({ text: s, line: start, key: lastIdent, ui: UI_BEFORE.test(src.slice(Math.max(0, sidx - 120), sidx)) });
      prev = '"'; afterStr = true; plus = false; continue;
    }
    if (c === "+" && afterStr) { plus = true; i++; prev = c; continue; }
    afterStr = false; plus = false;
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (/[\w$]/.test(src[j] || "")) j++; lastIdent = src.slice(i, j); prev = "a"; i = j; continue; }
    prev = c; i++;
  }
  return out;
}

const ENT = { "&ndash;": "–", "&mdash;": "—", "&rarr;": "→", "&ldquo;": "“", "&rdquo;": "”", "&times;": "×", "&amp;": "&", "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&hellip;": "…" };
function htmlStrings(src) {
  const out = [];
  const clean = src.replace(/<(script|style)[\s\S]*?<\/\1>/gi, m => m.replace(/[^\n]/g, " "));
  const dec = s => s.replace(/&[a-z]+;/gi, e => ENT[e] || e);
  let line = 1;
  const re = /<[^>]*>|[^<]+/g; let m;
  while ((m = re.exec(clean))) {
    const t = m[0];
    if (t[0] === "<") {
      const at = /\b(title|aria-label|placeholder)="([^"]*)"/g; let a;
      while ((a = at.exec(t))) out.push({ text: dec(a[2]), line });
    } else out.push({ text: dec(t), line });
    line += (t.match(/\n/g) || []).length;
  }
  return out;
}

const CODEY = /^[#.\[:]|[{};]|=>|\bfunction\b|^https?:|^[\w-]+(\.[\w-]+)+$|^[\w./-]+\.(js|json|html|css|png)$|bangermeter-|^\W*$|^[a-z]+([A-Z]\w*)+$|^[\w-]+$/;
function candidates(file, isHtml) {
  const src = fs.readFileSync(path.join(EXT, file), "utf8");
  const raw = isHtml ? htmlStrings(src) : jsStrings(src);
  return raw.map(r => ({ file, line: r.line, key: r.key, ui: r.ui, text: norm(r.text) }))
    .filter(r => /[A-Za-z]{3}/.test(r.text) && r.text.length >= 3)
    .filter(r => isHtml || r.key === "label" || r.ui || (/\s/.test(r.text) && !CODEY.test(r.text) &&
      !/[<>\[\]]|^(use strict|noopener noreferrer)$/.test(r.text) &&
      (file !== "scoring.js" || r.text.split(" ").length >= 5)))      // scoring.js also holds multilingual keyword lists
    .filter(r => !isHtml || !CODEY.test(r.text) || /^[A-Z][a-z]+( [A-Za-z]+)*$/.test(r.text));
}

function main() {
  const showAll = process.argv.includes("--all");
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, "dict.json"), "utf8"));
  const tr = createTranslator(dict);
  const ctx = new Set(Object.keys(dict.contextual || {}).map(norm));
  const pendingB = new Set(Object.keys(dict.pending || {}).map(norm));
  const tierC = (dict.tierC || []).map(r => new RegExp(r));
  // Literal fragments of sentences that a pattern translates as a whole count as covered.
  // Group captures become "N"; numbers in a source fragment become "N" too.
  const patternText = (dict.patterns || []).map(p => p.re
    .replace(/\((?!\?:)(?:[^()\\]|\\.)*\)\??/g, "N").replace(/\\(.)/g, "$1")).join("\n");
  const NUM = /[−-]?\d[\d.,]*/g;
  const inPattern = t => t.length >= 6 && patternText.includes(t.replace(/^[▲▼·]\s+/, "").replace(NUM, "N"));
  const tier = new Map();
  parseCsv(fs.readFileSync(path.join(ROOT, "docs/ja/bangermeter-ja-strings.csv"), "utf8")).slice(1)
    .forEach(r => { if (r[4]) { const k = norm(r[4]); if (!tier.has(k) || r[0] < tier.get(k)) tier.set(k, r[0]); } });

  const files = [["content.js", false], ["popup.js", false], ["scoring.js", false], ["weights.js", false], ["popup.html", true], ["welcome.html", true]];
  const res = { OK: 0, "C-skip": 0, "B-pending": [], NEW: [], "A-MISSING": [] };
  const seen = new Set();
  for (const [f, isHtml] of files) {
    for (const c of candidates(f, isHtml)) {
      if (f === "weights.js" && c.key !== "label") continue;       // note / why / panel*: tier C
      if (c.text.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).length < 2 && c.key !== "label" && !c.ui && !isHtml) continue;   // lone fragments such as ", not"
      const k = f + "\0" + c.text; if (seen.has(k)) continue; seen.add(k);
      if (tierC.some(r => r.test(c.text))) { res["C-skip"]++; continue; }
      if (tr.translate(c.text) != null || ctx.has(c.text) || inPattern(c.text) || /^\W+$/.test(c.text)) { res.OK++; continue; }
      const t = pendingB.has(c.text) ? "B" : tier.get(c.text);
      if (t === "C") res["C-skip"]++;
      else if (t === "B") res["B-pending"].push(c);
      else if (t === "A") res["A-MISSING"].push(c);
      else res.NEW.push(c);
    }
  }
  const show = (name, list) => { if (!list.length) return; console.log("\n" + name + " (" + list.length + ")"); list.forEach(c => console.log("  " + c.file + ":" + c.line + "  " + c.text.slice(0, 150))); };
  if (process.argv.includes("--dump-new")) { console.log(JSON.stringify(res.NEW.map(c => [c.line, c.text]))); return; }
  show("A-MISSING — tier A string no longer covered", res["A-MISSING"]);
  show("NEW — not in the CSV snapshot and not translated", res.NEW);
  if (showAll) show("B-pending — tier B, not translated yet", res["B-pending"]);
  console.log("\nOK " + res.OK + " · C-skip " + res["C-skip"] + " · B-pending " + res["B-pending"].length +
    " · NEW " + res.NEW.length + " · A-MISSING " + res["A-MISSING"].length);
  process.exit(res.NEW.length || res["A-MISSING"].length ? 1 : 0);
}
main();
