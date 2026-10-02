# Authoring note for the Honeycomb research site

`honeycomb/` is a static research site about Honeycomb, the hosted observability service at honeycomb.io: what it does, how it is built as far as public evidence shows, and what Guildmaster's tracing design can learn from it.
It is not Guildmaster's design, and it never edits `TERMINOLOGY.md`.

It follows [`../firstmate/AUTHORING.md`](../firstmate/AUTHORING.md) exactly (page template, the append-only rule for shared files, navigation registration, the diagram classes and the phone and theme checks), with the differences below.
Read that file first.

## Differences from the Firstmate site

| Firstmate rule | Here |
| --- | --- |
| `assets/site.css` is shared | `honeycomb/assets/site.css` is a copy of `firstmate/assets/site.css` at commit `89f587f`, with this site's classes appended after the "Honeycomb site additions" marker. Never edit the copied part; append only. |
| `assets/site.js` must not be edited | `honeycomb/assets/site.js` is this site's own adaptation: brand "Honeycomb", `window.HC_NAV`, and chart tooltips. Firstmate's repository-citation linker is not in it. |
| `assets/nav-data.js` registers pages in `FM_NAV` | `honeycomb/assets/nav-data.js` registers them in `HC_NAV`, one line above the section's `// end <section>` marker. `href` is relative to `honeycomb/`. |
| Pages live under `components/<area>/` | Pages live at the site root, except the C4 pages under `c4/`. Root pages link assets as `assets/…`; pages under `c4/` as `../assets/…`. |
| Evidence is Firstmate's own code | Evidence is public sources only: Honeycomb's docs, its engineering blog and talks, its open-source repositories (Refinery, libhoney, the Beelines, its OpenTelemetry distributions), papers, and press. No account was created and nothing was sent anywhere to write these pages. |

## Evidence standard

- Every factual claim cites a source from [`sources.html`](sources.html) as `<a class="src" href="sources.html#s-key">key</a>` (use `../` from `c4/`).
  Each source there has its title, publisher, kind and date; add a source to that page in the same change that first cites it.
- Code in a public repository is cited pinned to a tag or commit: `<a class="cite" href="https://github.com/honeycombio/refinery/blob/<tag>/path#L10-L20"><code class="cite">path:10-20</code></a>`.
- Honeycomb's internals are proprietary. Label every architectural statement with its provenance:
  - `<span class="prov prov-doc">documented</span>`: Honeycomb's docs, or a public repository's code or README.
  - `<span class="prov prov-stated">talk/blog</span>`: stated in a Honeycomb engineering post, talk, podcast, book or employee interview.
  - `<span class="prov prov-inferred">inferred</span>`: this site's inference, saying from what.
- Never invent an internal component. A name appears on a diagram only if a cited public source uses it; a box for a role that no source names is drawn as inferred and labelled by its role, not given a name.
- A source's date is the date it was published or last updated, as it states; the date it was read is 2026-10-02 unless a page says otherwise. Where sources from different years disagree, say so and give both.

## Diagrams and charts

- C4 diagrams use the Firstmate classes unchanged. Mark provenance on every node with a corner badge (`hc-badge-doc`, `hc-badge-stated`, `hc-badge-inferred`, letters D, S and I), and add `hc-inferred` to the `<g>` of any inferred node or arrow, which draws it with a dashed amber outline. Every diagram with inferred parts carries the badge key in its legend.
- Charts are inline `<svg class="chart">` inside `<figure class="diagram">`, drawn from the `--hc-s1`..`--hc-s3` categorical tokens (blue, orange, aqua, validated for colour-blind separation in both themes) and the `--hc-h1`..`--hc-h7` sequential ramp. Every chart has an HTML legend when it shows two or more series, direct labels on the marks that matter, a `<title>` and `data-tip` on each mark for hover and keyboard focus, and a `<details class="hc-data">` table of its data.
- A chart drawn from synthetic data says so in its title or caption. Charts never show a Honeycomb screenshot, logo or other raster image.
