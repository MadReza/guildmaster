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
  { section: "supervision", title: "Supervision", href: "components/supervision/index.html" },
  { section: "supervision", title: "Watcher poll loop", href: "components/supervision/watcher.html" },
  { section: "supervision", title: "Wake kinds and triage", href: "components/supervision/wake-kinds.html" },
  { section: "supervision", title: "Durable wake queue", href: "components/supervision/wake-queue.html" },
  { section: "supervision", title: "Busy state and turn ends", href: "components/supervision/busy-state.html" },
  { section: "supervision", title: "Wedges and declared waits", href: "components/supervision/wedge-and-pauses.html" },
  { section: "supervision", title: "Watcher continuity", href: "components/supervision/continuity.html" },
  { section: "supervision", title: "Claude Stop auto-arm", href: "components/supervision/claude-autoarm.html" },
  { section: "supervision", title: "Turn-end and pull guards", href: "components/supervision/turn-end-guards.html" },
  { section: "supervision", title: "Away and quiet postures", href: "components/supervision/away-and-quiet.html" },
  { section: "supervision", title: "Pi supervision branch", href: "components/supervision/pi-branch.html" },
  { section: "supervision", title: "Durability argument", href: "components/supervision/durability.html" },
  { section: "supervision", title: "End-to-end trace", href: "components/supervision/end-to-end.html" },
  // end supervision

  // begin persistence
  { section: "persistence", title: "Persistence", href: "components/persistence/index.html" },
  { section: "persistence", title: "Operational home layout", href: "components/persistence/home-layout.html" },
  { section: "persistence", title: "Per-task records", href: "components/persistence/task-records.html" },
  { section: "persistence", title: "Wake queue and recovery marker", href: "components/persistence/wake-queue.html" },
  { section: "persistence", title: "Locks and leases", href: "components/persistence/locks-and-leases.html" },
  { section: "persistence", title: "Registered state checks", href: "components/persistence/state-checks.html" },
  { section: "persistence", title: "Cursors and folded decisions", href: "components/persistence/cursors-and-folds.html" },
  { section: "persistence", title: "Configuration and inheritance", href: "components/persistence/configuration.html" },
  { section: "persistence", title: "Durable memory", href: "components/persistence/durable-memory.html" },
  { section: "persistence", title: "Engineering patterns", href: "components/persistence/patterns.html" },
  { section: "persistence", title: "What is safe to delete", href: "components/persistence/deletion-safety.html" },
  // end persistence

  // begin crew
  { section: "crew", title: "Crew", href: "components/crew/index.html", stub: true },
  // end crew

  // begin prompts-and-skills
  { section: "prompts-and-skills", title: "Prompts and skills", href: "components/prompts-and-skills/index.html" },
  { section: "prompts-and-skills", title: "AGENTS.md contract", href: "components/prompts-and-skills/agents-md.html" },
  { section: "prompts-and-skills", title: "Knowledge placement", href: "components/prompts-and-skills/knowledge-placement.html" },
  { section: "prompts-and-skills", title: "Skills system", href: "components/prompts-and-skills/skills.html" },
  { section: "prompts-and-skills", title: "Session-start digest", href: "components/prompts-and-skills/session-start-digest.html" },
  { section: "prompts-and-skills", title: "Supervision protocol text", href: "components/prompts-and-skills/supervision-protocols.html" },
  { section: "prompts-and-skills", title: "Briefs as contracts", href: "components/prompts-and-skills/briefs.html" },
  { section: "prompts-and-skills", title: "Worker launch prompt", href: "components/prompts-and-skills/worker-launch.html" },
  { section: "prompts-and-skills", title: "Secondmate charter", href: "components/prompts-and-skills/secondmate-charter.html" },
  { section: "prompts-and-skills", title: "Prompt economy", href: "components/prompts-and-skills/prompt-economy.html" },
  { section: "prompts-and-skills", title: "End-to-end walkthrough", href: "components/prompts-and-skills/walkthrough.html" },
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
  { section: "backlog-and-decisions", title: "Backlog and decisions", href: "components/backlog-and-decisions/index.html" },
  { section: "backlog-and-decisions", title: "The work queue", href: "components/backlog-and-decisions/backlog.html" },
  { section: "backlog-and-decisions", title: "Backends and manual mode", href: "components/backlog-and-decisions/backends.html" },
  { section: "backlog-and-decisions", title: "Automatic transitions", href: "components/backlog-and-decisions/transitions.html" },
  { section: "backlog-and-decisions", title: "Captain holds", href: "components/backlog-and-decisions/captain-holds.html" },
  { section: "backlog-and-decisions", title: "Recording answers", href: "components/backlog-and-decisions/answers.html" },
  { section: "backlog-and-decisions", title: "Reconcile requests", href: "components/backlog-and-decisions/reconcile.html" },
  { section: "backlog-and-decisions", title: "Completion gate", href: "components/backlog-and-decisions/completion-gate.html" },
  { section: "backlog-and-decisions", title: "Record divergence", href: "components/backlog-and-decisions/divergence.html" },
  { section: "backlog-and-decisions", title: "Hold buckets", href: "components/backlog-and-decisions/buckets.html" },
  { section: "backlog-and-decisions", title: "Cross-home handoff", href: "components/backlog-and-decisions/handoff.html" },
  { section: "backlog-and-decisions", title: "End-to-end walkthrough", href: "components/backlog-and-decisions/walkthrough.html" },
  // end backlog-and-decisions

  // begin observability
  { section: "observability", title: "Observability", href: "components/observability/index.html" },
  { section: "observability", title: "Status events and the keyed fold", href: "components/observability/status-events.html" },
  { section: "observability", title: "Wake-drain surfaces", href: "components/observability/wake-drain.html" },
  { section: "observability", title: "Event is not state", href: "components/observability/event-vs-state.html" },
  { section: "observability", title: "Bearings snapshot and board", href: "components/observability/bearings.html" },
  { section: "observability", title: "Scout reports", href: "components/observability/scout-reports.html" },
  { section: "observability", title: "Learnings and captain preferences", href: "components/observability/knowledge-files.html" },
  { section: "observability", title: "Dispatch audit", href: "components/observability/dispatch-audit.html" },
  { section: "observability", title: "Contribution tracking", href: "components/observability/contributions.html" },
  { section: "observability", title: "Process-event sources", href: "components/observability/process-events.html" },
  { section: "observability", title: "Trace context propagation", href: "components/observability/trace-context.html" },
  // end observability

  // begin remote
  { section: "remote", title: "Remote", href: "components/remote/index.html" },
  { section: "remote", title: "SSH transport and entrypoint", href: "components/remote/transport.html" },
  { section: "remote", title: "Remote job worker", href: "components/remote/job-worker.html" },
  { section: "remote", title: "Non-interactive tool contract", href: "components/remote/tool-path.html" },
  { section: "remote", title: "Readiness doctor", href: "components/remote/readiness-doctor.html" },
  { section: "remote", title: "fm-remote session and guard", href: "components/remote/herdr-session.html" },
  { section: "remote", title: "Provisioning and launch", href: "components/remote/provisioning.html" },
  { section: "remote", title: "Link operations", href: "components/remote/link-operations.html" },
  { section: "remote", title: "Recovery rules", href: "components/remote/recovery.html" },
  { section: "remote", title: "Security posture", href: "components/remote/security.html" },
  { section: "remote", title: "End-to-end trace", href: "components/remote/end-to-end.html" },
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
