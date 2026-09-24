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
  { section: "communication", title: "Communication", href: "components/communication/index.html", stub: true },
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
  { section: "delivery", title: "Delivery", href: "components/delivery/index.html" },
  { section: "delivery", title: "Delivery modes and posture", href: "components/delivery/modes-and-posture.html" },
  { section: "delivery", title: "Validation pipeline", href: "components/delivery/validation-pipeline.html" },
  { section: "delivery", title: "Ask-user findings", href: "components/delivery/ask-user.html" },
  { section: "delivery", title: "Pull request flow", href: "components/delivery/pull-requests.html" },
  { section: "delivery", title: "Merge authority", href: "components/delivery/merge-authority.html" },
  { section: "delivery", title: "Local landing", href: "components/delivery/local-landing.html" },
  { section: "delivery", title: "After the merge", href: "components/delivery/after-merge.html" },
  { section: "delivery", title: "Delivery end to end", href: "components/delivery/end-to-end.html" },
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
  { section: "issues", title: "Open tickets", href: "issues/index.html" },
  { section: "issues", title: "Worktree and task lifecycle", href: "issues/worktree-and-task-lifecycle.html" },
  { section: "issues", title: "Backends and terminals", href: "issues/backends-and-terminals.html" },
  { section: "issues", title: "Status, inbox and wake", href: "issues/status-inbox-and-wake.html" },
  { section: "issues", title: "Quota and dispatch", href: "issues/quota-and-dispatch.html" },
  { section: "issues", title: "Crew coordination", href: "issues/crew-coordination.html" },
  { section: "issues", title: "The no-mistakes pipeline", href: "issues/no-mistakes-pipeline.html" },
  { section: "issues", title: "Bootstrap and tooling floors", href: "issues/bootstrap-and-tooling-floors.html" },
  { section: "issues", title: "Composer / idle-state detection", href: "issues/composer-state-detection.html" },
  { section: "issues", title: "Prompts and briefs", href: "issues/prompts-and-briefs.html" },
  { section: "issues", title: "Delivery modes and definition of done", href: "issues/delivery-modes-and-dod.html" },
  { section: "issues", title: "Third-party integrations and usage questions", href: "issues/third-party-integrations-and-forges.html" },
  { section: "issues", title: "Remote and cloud agents", href: "issues/remote-and-cloud-agents.html" },
  { section: "issues", title: "Test suite and CI reliability", href: "issues/test-suite-and-ci-reliability.html" },
  { section: "issues", title: "Observability and token accounting", href: "issues/observability-and-token-accounting.html" },
  { section: "issues", title: "Backlog and decisions (tickets)", href: "issues/backlog-and-decisions.html" },
  { section: "issues", title: "Skills and AGENTS.md (tickets)", href: "issues/skills-and-agents-md.html" },
  { section: "issues", title: "Context and session stability", href: "issues/context-and-session-stability.html" },
  { section: "issues", title: "Terminology and naming (tickets)", href: "issues/terminology-and-naming.html" },
  { section: "issues", title: "Themes for a successor", href: "issues/themes.html" },
  // end issues
];
