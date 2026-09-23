/*
 * Site navigation: the ONLY file a task edits to register a page.
 *
 * Rules (full text in ../AUTHORING.md):
 * - One entry per line. Never reflow, reorder, or restructure existing lines.
 * - Add a page by inserting ONE line directly above the "end <section>" marker of its own section.
 * - href is relative to the firstmate/ site root. Add `stub: true` only for placeholder pages.
 * - A new section needs one line in FM_NAV_SECTIONS plus its own marker pair in FM_NAV.
 */

window.FM_NAV_SECTIONS = [
  { id: "start", title: "Start here" },
  { id: "c4", title: "C4 model" },
  { id: "communication", title: "Communication" },
  { id: "supervision", title: "Supervision" },
  { id: "persistence", title: "Persistence" },
  { id: "crew", title: "Crew" },
  { id: "prompts-and-skills", title: "Prompts and skills" },
  { id: "delivery", title: "Delivery" },
  { id: "backlog-and-decisions", title: "Backlog and decisions" },
  { id: "observability", title: "Observability" },
  { id: "remote", title: "Remote" },
  { id: "issues", title: "GitHub tickets" },
];

window.FM_NAV = [
  // begin start
  { section: "start", title: "Overview", href: "index.html" },
  // end start

  // begin c4
  { section: "c4", title: "Level 1: System context", href: "c4/context.html" },
  { section: "c4", title: "Level 2: Containers", href: "c4/containers.html" },
  // end c4

  // begin communication
  { section: "communication", title: "Communication", href: "components/communication/index.html" },
  { section: "communication", title: "End to end: a question to a secondmate", href: "components/communication/end-to-end.html" },
  { section: "communication", title: "Data plane and control plane", href: "components/communication/data-and-control-planes.html" },
  { section: "communication", title: "fm-send: steering a worker", href: "components/communication/fm-send.html" },
  { section: "communication", title: "Steering inbox and doorbell", href: "components/communication/steering-inbox.html" },
  { section: "communication", title: "Operational-input markers", href: "components/communication/operational-input.html" },
  { section: "communication", title: "Status channel", href: "components/communication/status-channel.html" },
  { section: "communication", title: "Keyed decisions and --resolve-key", href: "components/communication/decisions.html" },
  { section: "communication", title: "Secondmate parent channel", href: "components/communication/parent-channel.html" },
  { section: "communication", title: "Pending replies", href: "components/communication/pending-replies.html" },
  { section: "communication", title: "Captain inbox and voice", href: "components/communication/captain-inbox.html" },
  { section: "communication", title: "Mail plane", href: "components/communication/mail-plane.html" },
  { section: "communication", title: "Relay: public mentions", href: "components/communication/relay.html" },
  // end communication

  // begin supervision
  { section: "supervision", title: "Supervision", href: "components/supervision/index.html", stub: true },
  // end supervision

  // begin persistence
  { section: "persistence", title: "Persistence", href: "components/persistence/index.html", stub: true },
  // end persistence

  // begin crew
  { section: "crew", title: "Crew", href: "components/crew/index.html", stub: true },
  // end crew

  // begin prompts-and-skills
  { section: "prompts-and-skills", title: "Prompts and skills", href: "components/prompts-and-skills/index.html", stub: true },
  // end prompts-and-skills

  // begin delivery
  { section: "delivery", title: "Delivery", href: "components/delivery/index.html", stub: true },
  // end delivery

  // begin backlog-and-decisions
  { section: "backlog-and-decisions", title: "Backlog and decisions", href: "components/backlog-and-decisions/index.html", stub: true },
  // end backlog-and-decisions

  // begin observability
  { section: "observability", title: "Observability", href: "components/observability/index.html", stub: true },
  // end observability

  // begin remote
  { section: "remote", title: "Remote", href: "components/remote/index.html", stub: true },
  // end remote

  // begin issues
  { section: "issues", title: "Open tickets", href: "issues/index.html", stub: true },
  // end issues
];
