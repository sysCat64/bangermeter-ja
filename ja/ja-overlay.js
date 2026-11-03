// Japanese overlay for Bangermeter.
//
// Translates only what Bangermeter itself rendered: elements whose class starts
// with "bangermeter-" (badge, panel, draft meter). X's own DOM is never touched.
// On the extension's own pages (popup / welcome, loaded with data-bm-ja-full)
// the whole document is in scope.
//
// Loop safety: there is NO permanent "already translated" flag. For every text
// node / attribute we remember the last translation WE wrote. If the current
// value still equals it, we skip; if content.js has since rewritten the node
// (draft meter updates on every keystroke), the value differs and we translate
// again. That is why characterData and attribute changes are observed.
//
// Dev: set localStorage.bmJaDebug = "1" to log strings that matched nothing.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.BMJA = api; api.autostart(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MARK_RE = /^([▲▼·])\s+([\s\S]+)$/;
  var WS_RE = /^(\s*)([\s\S]*?)(\s*)$/;

  function norm(s) { return s.replace(/\s+/g, " ").trim(); }

  function createTranslator(dict) {
    var exact = Object.create(null);
    Object.keys(dict.exact || {}).forEach(function (k) { exact[norm(k)] = dict.exact[k]; });
    var patterns = (dict.patterns || []).map(function (p) {
      return { re: new RegExp(p.re), ja: p.ja, tr: p.tr || [] };
    });
    var cache = new Map();

    function core(text) {
      if (Object.prototype.hasOwnProperty.call(exact, text)) return exact[text];
      var m = MARK_RE.exec(text);
      if (m) {
        var rest = core(m[2]);
        if (rest != null) return m[1] + " " + rest;
      }
      for (var i = 0; i < patterns.length; i++) {
        var p = patterns[i];
        var mm = p.re.exec(text);
        if (!mm) continue;
        return p.ja.replace(/\$(\d)/g, function (_, n) {
          var g = mm[+n];
          if (g == null) return "";
          if (p.tr.indexOf(+n) !== -1) { var t = core(g); return t == null ? g : t; }
          return g;
        });
      }
      return null;
    }

    // Returns the translated string (original surrounding whitespace kept),
    // or null when nothing matched.
    function translate(str) {
      if (typeof str !== "string" || !str) return null;
      if (cache.has(str)) return cache.get(str);
      var ws = WS_RE.exec(str);
      var c = norm(ws[2]);
      var res = null;
      if (c && /[A-Za-z]/.test(c)) {
        var t = core(c);
        if (t != null) res = ws[1] + t + ws[3];
      }
      if (cache.size > 4000) cache.clear();
      cache.set(str, res);
      return res;
    }
    return { translate: translate };
  }

  function autostart(root) {
    var dict = root.BM_JA_DICT;
    var doc = root.document;
    if (!dict || !doc || !root.MutationObserver) return;
    var tr = createTranslator(dict);

    var script = doc.currentScript;
    var FULL = !!(script && script.hasAttribute("data-bm-ja-full"));
    var SCOPE = '[class^="bangermeter-"],[class*=" bangermeter-"]';
    var ATTRS = ["title", "aria-label", "placeholder"];
    var debug = false;
    try { debug = root.localStorage.getItem("bmJaDebug") === "1"; } catch (e) { /* storage blocked */ }
    var missed = new Set();

    // What we last wrote, per text node / per element attribute.
    var wroteText = new WeakMap();
    var wroteAttr = new WeakMap();

    function miss(s) {
      if (!debug) return;
      var c = norm(s);
      if (c.length < 3 || !/[A-Za-z]{2}/.test(c) || missed.has(c)) return;
      missed.add(c);
      console.debug("[bm-ja] untranslated:", c);
    }

    function inScope(node) {
      if (FULL) return true;
      var el = node.nodeType === 1 ? node : node.parentElement;
      return !!(el && el.closest && el.closest(SCOPE));
    }

    function doText(node) {
      var cur = node.nodeValue;
      if (wroteText.get(node) === cur) return;          // our own write
      var out = tr.translate(cur);
      if (out == null) { miss(cur); return; }
      if (out !== cur) { node.nodeValue = out; }
      wroteText.set(node, out);
    }

    function doAttrs(el) {
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i];
        var cur = el.getAttribute(a);
        if (!cur) continue;
        var rec = wroteAttr.get(el);
        if (rec && rec[a] === cur) continue;
        var out = tr.translate(cur);
        if (out == null) { miss(cur); continue; }
        if (out !== cur) el.setAttribute(a, out);
        if (!rec) { rec = {}; wroteAttr.set(el, rec); }
        rec[a] = out;
      }
    }

    function walk(rootEl) {
      if (rootEl.nodeType === 3) { doText(rootEl); return; }
      if (rootEl.nodeType !== 1) return;
      var tag = rootEl.nodeName;
      if (tag === "SCRIPT" || tag === "STYLE") return;
      doAttrs(rootEl);
      var w = doc.createTreeWalker(rootEl, 1 | 4, {
        acceptNode: function (n) {
          return (n.nodeType === 1 && (n.nodeName === "SCRIPT" || n.nodeName === "STYLE"))
            ? 2 : 1;                                     // 2 = REJECT subtree
        }
      });
      var n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) doText(n); else doAttrs(n);
      }
    }

    function handleAdded(node) {
      if (node.nodeType === 3) { if (inScope(node)) doText(node); return; }
      if (node.nodeType !== 1) return;
      if (inScope(node)) { walk(node); return; }
      // An out-of-scope subtree (e.g. a whole X cell) may still CONTAIN our UI.
      if (node.querySelector && node.querySelector(SCOPE)) {
        var roots = node.querySelectorAll(SCOPE);
        for (var i = 0; i < roots.length; i++) walk(roots[i]);
      }
    }

    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === "childList") {
          for (var j = 0; j < r.addedNodes.length; j++) handleAdded(r.addedNodes[j]);
        } else if (r.type === "characterData") {
          if (inScope(r.target)) doText(r.target);
        } else if (r.type === "attributes") {
          if (inScope(r.target)) doAttrs(r.target);
        }
      }
    });

    function start() {
      var body = FULL ? doc.documentElement : doc.body;
      if (!body) return;
      mo.observe(doc.documentElement, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ATTRS
      });
      if (FULL) walk(doc.documentElement);
      else {
        var roots = doc.querySelectorAll(SCOPE);
        for (var i = 0; i < roots.length; i++) walk(roots[i]);
      }
    }
    start();
  }

  return { createTranslator: createTranslator, autostart: autostart };
});
