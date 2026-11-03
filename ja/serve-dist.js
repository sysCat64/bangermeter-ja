// Static server for dist/ so the original fixtures can be exercised WITH the
// overlay (the fixtures themselves are never edited):
//   node ja/serve-dist.js   → http://localhost:8792/fixture.html etc.
// Fixture pages get the dict + overlay appended, exactly as the manifest does
// for x.com. popup/welcome already carry them (build.js) and get a chrome.* stub.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { DIST } = require("./build.js");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png" };
const STUB = '<script>window.chrome=window.chrome||{storage:{sync:{get:function(d,cb){cb(d)},set:function(){}},' +
  'local:{get:function(d,cb){cb(d)},set:function(){},remove:function(){}},onChanged:{addListener:function(){}}},' +
  'runtime:{getURL:function(p){return p}},tabs:{create:function(){}}};</script>\n';
const OVERLAY = '<script src="/ja-dict.js"></script><script src="/ja-overlay.js"></script>\n';

function start(port) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (/^\/[^\/]+\/status\/\d+/.test(p) || /^\/[^\/]+\/with_replies$/.test(p) || p === "/home") p = "/fixture-thread.html";
    if (p === "/") p = "/fixture.html";
    const file = path.join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      let body = buf;
      if (path.extname(file) === ".html") {
        let html = buf.toString("utf8");
        const base = path.basename(file);
        const ext = base === "popup.html" || base === "welcome.html";
        html = html.replace(/<head[^>]*>/i, t => t + "\n" + STUB);
        if (!ext) html = html.replace(/<\/body>/i, OVERLAY + "</body>");
        body = Buffer.from(html);
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(body);
    });
  });
  return new Promise(r => srv.listen(port, () => r(srv)));
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8792;
  start(port).then(() => console.log("dist fixtures on http://localhost:" + port));
}
module.exports = { start };
