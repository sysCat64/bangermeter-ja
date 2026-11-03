// Builds dist/ — the unpacked Chrome extension to load in chrome://extensions.
//   node ja/build.js
// extension/ is copied verbatim; the only things added or changed are:
//   - ja-dict.js / ja-overlay.js (appended to the content script list)
//   - manifest.json: name / description / action title
//   - popup.html / welcome.html: <html lang="ja"> and the overlay <script>s
//   - welcome.html also gets ja-welcome.css (no forced uppercase on Japanese headings)
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "dist");
const SKIP = new Set(["bangermeter.user.js"]);        // Tampermonkey build: out of scope

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(SRC, DIST, { recursive: true, filter: s => !SKIP.has(path.basename(s)) });

  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, "dict.json"), "utf8"));
  const payload = { exact: dict.exact, patterns: dict.patterns };
  fs.writeFileSync(path.join(DIST, "ja-dict.js"),
    "self.BM_JA_DICT = " + JSON.stringify(payload) + ";\n");
  fs.copyFileSync(path.join(__dirname, "ja-overlay.js"), path.join(DIST, "ja-overlay.js"));
  fs.copyFileSync(path.join(__dirname, "welcome-ja.css"), path.join(DIST, "ja-welcome.css"));

  const mpath = path.join(DIST, "manifest.json");
  const m = JSON.parse(fs.readFileSync(mpath, "utf8"));
  m.name = "Bangermeter 日本語版（非公式）";
  m.description = "Xが公開したおすすめ（For You）のランキング重みで投稿を採点します。Bangermeter本家の非公式日本語版です。";
  if (m.action) m.action.default_title = "Bangermeter 日本語版";
  const cs = m.content_scripts[0];
  cs.js = cs.js.concat(["ja-dict.js", "ja-overlay.js"]);
  fs.writeFileSync(mpath, JSON.stringify(m, null, 2) + "\n");

  for (const page of ["popup.html", "welcome.html"]) {
    const p = path.join(DIST, page);
    let html = fs.readFileSync(p, "utf8");
    html = html.replace(/<html(\s[^>]*)?>/i, (t, attrs) =>
      /\blang=/.test(attrs || "") ? t.replace(/lang="[^"]*"/, 'lang="ja"') : "<html lang=\"ja\"" + (attrs || "") + ">");
    const tags = '<script src="ja-dict.js"></script>\n<script src="ja-overlay.js" data-bm-ja-full></script>\n';
    if (!/<\/body>/i.test(html)) throw new Error(page + ": no </body>");
    html = html.replace(/<\/body>/i, tags + "</body>");
    if (page === "welcome.html") {
      if (!/<\/head>/i.test(html)) throw new Error(page + ": no </head>");
      html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="ja-welcome.css">\n</head>');
    }
    fs.writeFileSync(p, html);
  }
  console.log("built dist/ (" + Object.keys(dict.exact).length + " exact, " + dict.patterns.length + " patterns)");
}

if (require.main === module) build();
module.exports = { build, DIST };
