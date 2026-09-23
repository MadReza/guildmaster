/*
 * Renders the shared header and navigation into every page from window.FM_NAV (nav-data.js),
 * marks the current page, adds previous/next links, and links evidence citations to source.
 * Plain script, no modules, no fetch: it must work when a page is opened from disk over file://.
 * Load order on every page, at the end of <body>: nav-data.js, then site.js.
 */
(function () {
  "use strict";

  // Firstmate commit the research was read at. A page may override it with <body data-fm-commit="...">.
  var SOURCE_REPO = "https://github.com/kunchenguid/firstmate";
  var SOURCE_COMMIT = "ada21f5b813f8a19e00f44c50555104cb481d3ac";

  var script = document.currentScript;
  var siteRoot = new URL("../", script ? script.src : document.baseURI);
  var sections = window.FM_NAV_SECTIONS || [];
  var pages = window.FM_NAV || [];

  function stripIndex(path) {
    return path.replace(/index\.html$/, "");
  }

  function sameUrl(a, b) {
    return stripIndex(decodeURIComponent(a.pathname)) === stripIndex(decodeURIComponent(b.pathname));
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    }
    if (text) { node.textContent = text; }
    return node;
  }

  var here = new URL(window.location.href);
  var current = -1;
  pages.forEach(function (page, i) {
    page.url = new URL(page.href, siteRoot);
    if (current < 0 && sameUrl(page.url, here)) { current = i; }
  });

  // Header.
  var header = el("header", { "class": "site-header" });
  var brand = el("a", { "class": "brand", href: new URL("index.html", siteRoot).href });
  brand.appendChild(document.createTextNode("Firstmate "));
  brand.appendChild(el("small", null, "C4 research"));
  var toggle = el("button", { "class": "nav-toggle", type: "button", "aria-expanded": "false", "aria-controls": "site-nav" }, "Menu");
  var theme = el("button", { type: "button", title: "Switch colour scheme" }, "Theme");
  header.appendChild(brand);
  header.appendChild(el("span", { "class": "spacer" }));
  header.appendChild(toggle);
  header.appendChild(theme);
  document.body.insertBefore(header, document.body.firstChild);

  // Navigation.
  var nav = document.getElementById("site-nav");
  if (nav) {
    sections.forEach(function (section) {
      var inSection = pages.filter(function (p) { return p.section === section.id; });
      if (!inSection.length) { return; }
      nav.appendChild(el("h2", null, section.title));
      var list = el("ul");
      inSection.forEach(function (page) {
        var link = el("a", { href: page.url.href }, page.title);
        if (page.stub) { link.className = "stub"; }
        if (pages[current] === page) { link.setAttribute("aria-current", "page"); }
        var item = el("li");
        item.appendChild(link);
        list.appendChild(item);
      });
      nav.appendChild(list);
    });
  }

  toggle.addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // Theme: follows prefers-color-scheme unless the reader picks one; the pick is a per-browser convenience.
  var KEY = "fm-c4-theme";
  function applyTheme(value) {
    if (value === "light" || value === "dark") {
      document.documentElement.setAttribute("data-theme", value);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
  try { applyTheme(window.localStorage.getItem(KEY)); } catch (e) { /* storage unavailable */ }
  theme.addEventListener("click", function () {
    var dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") &&
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var next = dark ? "light" : "dark";
    applyTheme(next);
    try { window.localStorage.setItem(KEY, next); } catch (e) { /* storage unavailable */ }
  });

  // Previous / next.
  var article = document.querySelector("main > article");
  if (article && current >= 0) {
    var pager = el("nav", { "class": "pager", "aria-label": "Previous and next page" });
    var prev = pages[current - 1];
    var next = pages[current + 1];
    pager.appendChild(prev ? el("a", { href: prev.url.href, rel: "prev" }, "← " + prev.title) : el("span"));
    pager.appendChild(next ? el("a", { href: next.url.href, rel: "next" }, next.title + " →") : el("span"));
    article.appendChild(pager);
  }

  // Evidence citations: <code class="cite">path:line</code> or <code class="cite">path:start-end</code>.
  var commit = document.body.getAttribute("data-fm-commit") || SOURCE_COMMIT;
  Array.prototype.forEach.call(document.querySelectorAll("code.cite"), function (code) {
    if (code.parentNode && code.parentNode.tagName === "A") { return; }
    var match = /^([^\s:]+)(?::(\d+)(?:-(\d+))?)?$/.exec(code.textContent.trim());
    if (!match) { return; }
    var anchor = "";
    if (match[2]) {
      // GitHub renders Markdown unless asked for plain text, and rendered Markdown has no line anchors.
      anchor = (/\.md$/.test(match[1]) ? "?plain=1" : "") + "#L" + match[2] + (match[3] ? "-L" + match[3] : "");
    }
    var kind = /\/$/.test(match[1]) ? "tree" : "blob";
    var link = el("a", { "class": "cite", href: SOURCE_REPO + "/" + kind + "/" + commit + "/" + match[1] + anchor });
    code.parentNode.insertBefore(link, code);
    link.appendChild(code);
  });
})();
