/*
 * Renders the shared header and navigation into every page from window.HC_NAV (nav-data.js),
 * marks the current page, adds previous/next links, and gives chart marks a hover and focus tooltip.
 * Adapted from ../../firstmate/assets/site.js (guildmaster commit 89f587f): same header, menu, theme
 * toggle and pager. Firstmate's repository-citation linker is dropped, because this site cites public
 * web sources through sources.html instead of lines in one repository.
 * Plain script, no modules, no fetch: it must work when a page is opened from disk over file://.
 * Load order on every page, at the end of <body>: nav-data.js, then site.js.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var siteRoot = new URL("../", script ? script.src : document.baseURI);
  var sections = window.HC_NAV_SECTIONS || [];
  var pages = window.HC_NAV || [];

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
  brand.appendChild(document.createTextNode("Honeycomb "));
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
  var KEY = "hc-c4-theme";
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

  // Chart tooltips: any SVG element with data-tip="..." inside svg.chart shows that text on hover or
  // keyboard focus. Each mark also carries a <title>, so the text survives without this script.
  var marks = document.querySelectorAll("svg.chart [data-tip]");
  if (marks.length) {
    var tip = el("div", { "class": "hc-tip", role: "status", "aria-live": "polite" });
    tip.hidden = true;
    document.body.appendChild(tip);
    var place = function (x, y) {
      var pad = 14;
      var w = tip.offsetWidth;
      var h = tip.offsetHeight;
      var left = Math.min(x + pad, window.innerWidth - w - 8);
      var top = y - h - pad < 8 ? y + pad : y - h - pad;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = top + "px";
    };
    var show = function (mark, x, y) {
      tip.textContent = mark.getAttribute("data-tip");
      tip.hidden = false;
      mark.classList.add("is-hot");
      place(x, y);
    };
    var hide = function (mark) {
      tip.hidden = true;
      mark.classList.remove("is-hot");
    };
    Array.prototype.forEach.call(marks, function (mark) {
      if (!mark.hasAttribute("tabindex")) { mark.setAttribute("tabindex", "0"); }
      mark.addEventListener("pointerenter", function (e) { show(mark, e.clientX, e.clientY); });
      mark.addEventListener("pointermove", function (e) { place(e.clientX, e.clientY); });
      mark.addEventListener("pointerleave", function () { hide(mark); });
      mark.addEventListener("focus", function () {
        var box = mark.getBoundingClientRect();
        show(mark, box.left + box.width / 2, box.top);
      });
      mark.addEventListener("blur", function () { hide(mark); });
    });
  }
})();
