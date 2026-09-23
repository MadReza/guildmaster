# Authoring contract for the Firstmate research site

Read this in full before adding or changing a page under `firstmate/`.
The site documents Firstmate as it is. It is not Guildmaster's design, and it never edits `TERMINOLOGY.md`.

## What may be touched

| File | Owner | How later tasks change it |
| --- | --- | --- |
| `components/<area>/**` | the task assigned that area | Freely: pages, sub-folders, per-page content |
| `issues/**` | the ticket-snapshot task | Freely |
| `assets/nav-data.js` | shared | Add one line per page (see below); a one-line edit may drop `stub: true` from your own area's line |
| `assets/site.css` | shared | Append only: add new classes at the end of the file, never change or remove an existing rule |
| `assets/site.js` | shared | Do not edit. Raise it with firstmate instead |
| `index.html`, `c4/*.html`, `AUTHORING.md` | foundation | Do not edit, except appending one line to a list or table to link your area |

Append one line; never reflow, reorder, rename, or restructure a shared file.
That keeps concurrent tasks rebasing cleanly.

## Adding a page

1. Create the file inside your own area, for example `components/communication/steering-inbox.html`.
   Deeper pages may use sub-folders, for example `components/crew/backends/herdr.html`.
2. Copy the template below and set the three relative prefixes (`../../` for a page directly in `components/<area>/`, one more `../` per extra folder level).
3. Register it in `assets/nav-data.js` by inserting one line directly above your section's `// end <area>` marker:

   ```js
   { section: "communication", title: "Steering inbox", href: "components/communication/steering-inbox.html" },
   ```

   `href` is relative to the `firstmate/` root. Array order is menu order and previous/next order.
4. Link the page from your area's `index.html`.
5. Open it from disk (`file://`) at desktop and phone width, in light and dark, before committing.

## Page template

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steering inbox · Firstmate C4</title>
<link rel="stylesheet" href="../../assets/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="layout">
<nav id="site-nav" aria-label="Site"></nav>
<main id="main">
<article>
<p class="breadcrumb">Components › Communication</p>
<h1>Steering inbox</h1>
<p class="lede">One sentence on what this part is and why it exists.</p>
<!-- content -->
</article>
</main>
</div>
<script src="../../assets/nav-data.js"></script>
<script src="../../assets/site.js"></script>
</body>
</html>
```

Rules: no inline `style`, no other scripts, no `fetch`, no ES modules, no CDN, no web fonts, no images for diagrams.
Use `<article class="wide">` only for pages dominated by a large diagram.
Wrap every table in `<div class="table-wrap">` so a wide table scrolls inside itself, never the page.
Useful blocks: `.callout` (a note), `.callout.unclear` (behaviour the source does not settle), `ul.cards` (link grid), `dl.defs`.

## What a component page covers

For each part: its responsibility, the files that own it, what it reads and writes, who calls it and what it calls, how it is actually used (the command or trigger, with a real invocation from the source), its failure behaviour, and its configuration knobs.
Go to C4 Level 3 (components) inside an area; use Level 4 (code) only where a data format or protocol needs it.

## Evidence standard

- Every factual claim comes from reading Firstmate's code, script headers, or docs. Never from assumption or from how similar systems usually work.
- The script header is the contract; the implementation is confirmation. Where they disagree, say so.
- Cite as `<code class="cite">bin/fm-watch.sh:120</code>` or a range `bin/fm-watch.sh:120-134`, repo-relative. `site.js` links it to the pinned commit. Cite a directory with a trailing slash.
- Pages are read against commit `ada21f5b` unless the page says otherwise. If you read a newer commit, put `data-fm-commit="<full sha>"` on that page's `<body>` and state it in the page.
- Where behaviour is genuinely unclear, write it in a `.callout.unclear` block rather than guessing.
- The primary checkout at `/Users/rmadabadi/IdeaProjects/open-source/firstmate` is read-only. Its `data/`, `state/`, and `projects/` are a live operator's private records: describe their structure, never copy their contents.

## Diagrams

Inline `<svg>` only, written into the HTML. No raster images, no runtime diagram library.
Every diagram: `<figure class="diagram">`, an `<svg class="c4" viewBox="0 0 W H" role="img" aria-labelledby="...">` with a `<title>`, a visible `.c4-diagram-title`, a `<figcaption>`, and a legend (`<g class="c4-legend">`) whenever it shows more than three node kinds.
Never set a fixed width or height on the `<svg>`; the `viewBox` scales it.
A dense diagram adds class `c4-dense` to the `<svg>` and sits inside `<div class="diagram-scroll">`, so on a phone it keeps a readable width and scrolls inside its own frame.
Give marker ids a page-unique prefix, because ids are shared across the whole page.

| Class (on a `<g>`) | Use for | Shape |
| --- | --- | --- |
| `c4-person` | a human: the captain, an operator, a contributor | head `circle` above a rounded `rect` |
| `c4-system` | the system in scope at Level 1 (Firstmate) | rounded `rect` |
| `c4-container` | a separately running or separately stored part (Level 2) | rounded `rect` |
| `c4-component` | a part inside one container (Level 3) | rounded `rect` |
| `c4-datastore` | a file tree, log, queue, or database | cylinder `path` |
| `c4-external` | anything outside Firstmate: vendor CLIs, forges, services | rounded `rect` |
| `c4-boundary` | a dashed scope box around a group, with a `text` name | `rect` + `text` |
| `c4-rel` | a relationship arrow; add `c4-rel-async` for event-driven or polled | `path` + `c4-rel-label` |
| `c4-rel-num` | a numbered badge on an arrow, keyed to an interactions table, when labels would crowd | `circle` + `text` |

Text classes: `c4-label` (bold name), `c4-tech` (`[technology]`), `c4-desc` (one-line purpose), `c4-rel-label` (verb phrase on an arrow), `c4-diagram-title`.
Node text is centred on the `x` you give it. Keep a node to a name, a technology line, and at most two short description lines.

```html
<svg class="c4" viewBox="0 0 640 260" role="img" aria-labelledby="ex-t">
  <title id="ex-t">Example: captain talks to Firstmate</title>
  <defs>
    <marker id="ex-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path class="c4-arrowhead" d="M0,0 L10,5 L0,10 z"/>
    </marker>
  </defs>
  <text class="c4-diagram-title" x="20" y="28">Example</text>
  <g class="c4-person">
    <circle cx="110" cy="70" r="18"/>
    <rect x="40" y="90" width="140" height="70" rx="14"/>
    <text class="c4-label" x="110" y="118">Captain</text>
    <text class="c4-desc" x="110" y="138">Asks, decides, merges</text>
  </g>
  <g class="c4-rel">
    <path d="M180,125 L400,125" marker-end="url(#ex-arrow)"/>
    <text class="c4-rel-label" x="290" y="118">chats with</text>
  </g>
  <g class="c4-system">
    <rect x="400" y="85" width="200" height="80" rx="8"/>
    <text class="c4-label" x="500" y="115">Firstmate</text>
    <text class="c4-tech" x="500" y="132">[agent distro]</text>
    <text class="c4-desc" x="500" y="150">Runs the crew</text>
  </g>
  <g class="c4-datastore">
    <path d="M40,200 a60,10 0 0,0 120,0 a60,10 0 0,0 -120,0 v40 a60,10 0 0,0 120,0 v-40"/>
    <text class="c4-label" x="100" y="232">state/</text>
  </g>
</svg>
```

A legend reuses the node classes on small swatches: `<g class="c4-legend"><rect class="c4-legend-frame" .../><g class="c4-container"><rect .../></g><text ...>Container</text>...</g>`.
The Level 1 and Level 2 pages are working references for layout, legend, and boundaries.
