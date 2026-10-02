/*
 * Site navigation: the ONLY file a task edits to register a page.
 *
 * Rules (full text in ../AUTHORING.md, which defers to ../../firstmate/AUTHORING.md):
 * - One entry per line. Never reflow, reorder, or restructure existing lines.
 * - Add a page by inserting ONE line directly above the "end <section>" marker of its own section.
 * - href is relative to the honeycomb/ site root. Add `stub: true` only for placeholder pages.
 * - A new section needs one line in HC_NAV_SECTIONS plus its own marker pair in HC_NAV.
 */

window.HC_NAV_SECTIONS = [
  { id: "start", title: "Start here" },
  { id: "c4", title: "C4 model" },
  { id: "model", title: "Data model" },
  { id: "engineering", title: "How it is done" },
  { id: "guildmaster", title: "For Guildmaster" },
  { id: "sources", title: "Evidence" },
];

window.HC_NAV = [
  // begin start
  { section: "start", title: "Overview", href: "index.html" },
  { section: "start", title: "Product tour", href: "product.html" },
  // end start

  // begin c4
  { section: "c4", title: "Level 1: System context", href: "c4/context.html" },
  { section: "c4", title: "Level 2: Containers", href: "c4/containers.html" },
  { section: "c4", title: "Level 3: Retriever", href: "c4/retriever.html" },
  { section: "c4", title: "Level 3: Refinery", href: "c4/refinery.html" },
  // end c4

  // begin model
  { section: "model", title: "Events, spans and traces", href: "data-model.html" },
  { section: "model", title: "Sampling and its maths", href: "sampling.html" },
  // end model

  // begin engineering
  { section: "engineering", title: "Engineering decisions", href: "engineering.html" },
  { section: "engineering", title: "Timeline, 2016 to 2026", href: "timeline.html" },
  // end engineering

  // begin guildmaster
  { section: "guildmaster", title: "Lessons for Guildmaster", href: "lessons.html" },
  // end guildmaster

  // begin sources
  { section: "sources", title: "Sources", href: "sources.html" },
  // end sources
];
