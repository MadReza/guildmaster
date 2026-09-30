# Guildmaster consultation

A Firstmate-informed answer to the patron's first requirements: what Firstmate already does for each one, what is missing or works against it, and what Guildmaster should do instead.

This answers [requirements.md](requirements.md), which restates [the patron's notes of 2026-09-29](patron-notes-2026-09-29.md).
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s, including the patron's ruling that the role once called Chapter Master is now the **Party Leader**.
The same content is laid out as a page with diagrams in [consultation.html](consultation.html); open it from disk.

**Evidence.** Firstmate citations such as `bin/fm-brief.sh:400-402` are paths in the Firstmate repository read at commit `29213a09` (2026-09-28), read-only.
The [Firstmate research pages](../firstmate/index.html) in this repository were read against the older commit `ada21f5b`; they are linked for depth, but 124 commits separate the two, so their line numbers have drifted and a few facts have changed (listed in [Where the research pages have drifted](#where-the-research-pages-have-drifted)).
Outside sources are cited by URL.
Everything under "Recommendation" is advice, not fact, and nothing here is built yet.

## The answer in brief

The vision is sound, and it is not a smaller Firstmate: it turns Firstmate inside out.

- **Firstmate is task-centred with a thick supervisor.** The first mate plans, briefs, watches and lands every task; secondmates exist, but they are "idle by default and act only on work routed by the main firstmate" (`AGENTS.md:141`), their chat is never read ("Nobody reads this chat", `bin/fm-brief.sh:405-406`), and each task follows what the patron called "start something, finish it off".
- **Guildmaster, as the patron describes it, is focus-centred with a thin supervisor.** A Party Leader per ticket, project, recurring job or incident lives for weeks or months, the patron works *inside* it, it dispatches its own Adventurers, and the Guildmaster is a lobby that knows everything and says little.

Firstmate already contains most of the parts: isolated per-supervisor homes, charters, a backlog, captain holds, status events, a fleet ledger, a W3C trace carrier, Claude hooks and a status-line mod.
But almost every default points the other way: secondmates have no kinds and no schedule, worktrees come from a recycled pool reset to the default branch, every task gets a new branch that teardown deletes, the worker rule forbids pushing any branch but its own, delivery is worded for GitHub, relaunch throws away the conversation, and Firstmate emits no trace spans at all.

**Recommendation.** Do not fork Firstmate.
Build Guildmaster fresh, small and Claude-only, around one idea: **a posting is never held only in a conversation**.
Every posting, phase and notice lives in one small SQLite register behind a `gm` command; people-facing text (charters, playbooks, prompts, field reports, screenshots) lives in plain files; Claude Code hooks enforce the rules the prompts state.
Start with one Party Leader for one real ticket, before the Guildmaster itself exists ([Build order](#build-order)).

## The proposed shape

<!-- diagram: shape -->

| # | From → to | What passes |
| --- | --- | --- |
| 1 | Patron → Guildmaster | Opens or retires a focus; asks history ("what did Nightly export do last week?"). |
| 2 | Patron ↔ Party Leader | The patron works inside one focus at a time; the Party Leader answers and prints one-line notices. |
| 3 | Party Leader → Guildmaster | Asynchronous: a short digest on each phase change or ruling, written to the register, never a chat relay. |
| 4 | Party Leader → Adventurer | One writ per posting, rendered from the patron's own prompt template. |
| 5 | Adventurer → your repositories | `git worktree add` on the clone that already exists; removed when the job ends. |
| 6 | Adventurer → GitLab | Pushes the feature branch; merges into the shared development branch; opens the merge request to integration. |
| 7 | Party Leader → register | Postings, phases, leases, summons, audit events, via `gm` only. |
| 8 | Party Leader → Chapter House | Charter, playbook, notes, each posting's original words and screenshots, field reports. |
| 9 | Everyone → trace store | Spans derived from the register's events, exported as OpenTelemetry. |

## How each section reads

Each theme below has a table with one row per requirement: what Firstmate does today, and what is missing or works against the requirement.
Then comes the recommendation for the theme and its trade-offs.
Requirement numbers are [requirements.md](requirements.md)'s.

## 0 and 1. Party Leaders: long-lived, one per focus

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 0.1 orchestrator for the patron's needs | A general agent distro with thirteen harness adapters (`.agents/skills/harness-adapters/references/harness/`) and six terminal backends (`bin/backends/`, `docs/codex-app-backend.md`); see [crew/harnesses](../firstmate/components/crew/harnesses.html) and [crew/backends](../firstmate/components/crew/backends.html). | Most of its size serves generality the patron does not need. |
| 0.2 Party Leaders are the point | Secondmates exist: "a crewmate with an isolated firstmate home and a charter, not a second architecture" (`AGENTS.md:24`). | The first mate remains the centre; secondmates are an optional delegation layer. |
| 1.1 one per focus | A secondmate owns a *scope*, routed "by the nature of the work against each registered secondmate scope" (`AGENTS.md:170`); the only example of scope variation is "issue triage versus feature development" (`docs/architecture.md:335`). | A scope is a standing domain, not a ticket. Nothing creates one per ticket. |
| 1.2 lives weeks or months, survives restarts | Persistent by default: "Do not exit just because your queue is empty" (`bin/fm-brief.sh:446`). "A restart must be a non-event because durable state ... not conversation memory, are authoritative" (`AGENTS.md:128`). Dead mates are respawned at session start (`bin/fm-bootstrap.sh:691-720`) and on a watcher tick (`docs/configuration.md:2349`). | Recovery only runs while a primary session and watcher are alive; nothing restarts the primary after a reboot. `resume` is not a verb; a relaunch starts a fresh conversation (`docs/agent-control.md:58-61`), and "the cost of that guarantee is the conversation" (`bin/fm-secondmate-restart.sh:19`). |
| 1.3 takes care of its own work | The mate supervises its own crew in its own home; the parent does not "reconstruct or supervise a secondmate's child tree" (`AGENTS.md:143`). | Fits. |
| 1.4 kinds | Crew kinds are `ship`, `scout`, `secondmate` (`bin/fm-spawn.sh:223-225`). Secondmates vary only by local or remote route, with or without projects, and greenfield or inherited records (`.agents/skills/secondmate-provisioning/SKILL.md:20-31`, `.agents/skills/secondmate-provisioning/SKILL.md:55-58`, `.agents/skills/secondmate-provisioning/SKILL.md:164-182`). | No ticket, project, recurring or incident kind. |
| 1.5 recurring schedule | None. No cron, launchd job or recurring-work concept exists for work; the mail poll "itself has no scheduler" (`bin/fm-mail.sh:28-29`); watcher checks run every 300 s only while a supervision cycle is live (`bin/fm-mail-check.sh:12-18`); a process-event watch fires "at most once" (`bin/fm-procevent-when.sh:1-35`); harness cron and schedule tools are blocked on primaries (`bin/fm-subagent-pretool-check.sh:58`). The nearest thing is a backlog time gate or `hold --until` (`AGENTS.md:364`, `AGENTS.md:368`). | Absent. |
| 1.6 dispatches its own Adventurers | Yes: a secondmate runs the full firstmate machinery for its own crew in its own home (`AGENTS.md:57`). | Fits, but it brings the whole first-mate contract (a 426-line `AGENTS.md`) into every mate. |
| 1.7 never blocked, answers while work runs | Work runs in separate crew processes and returns through status files and a watcher that wakes the supervisor ([supervision/watcher](../firstmate/components/supervision/watcher.html)). The mate is told "Nobody reads this chat" (`bin/fm-brief.sh:405-406`). | The mate is built to be talked to by the parent, not by the patron. Long-turn stall alarms and missed wakes are open tickets (#2912, #2791 in [issues/status-inbox-and-wake](../firstmate/issues/status-inbox-and-wake.html)). |

**Recommendation.**

1. **A Party Leader is its records, not its process.**
   Its identity is a row in the register plus a Chapter House directory; a Claude Code session is only its current body.
   A session that ends, compacts, crashes or is rotated loses nothing, because a new session reads the charter, the playbook and `gm brief <party>` (its postings, phase, open rulings, last notices) at start.
   This keeps Firstmate's best rule ("a restart must be a non-event", `AGENTS.md:128`) and is the only safe way to live for months, because a months-long Claude conversation will compact many times (Firstmate tickets #95, on malformed tool calls as long sessions grow, and #4796, asking for automatic persistence before compaction, [issues/context-and-session-stability](../firstmate/issues/context-and-session-stability.html)).
2. **Kinds are a column plus a playbook file.**
   `ticket`, `project`, `recurring`, `incident` to start; each kind names its playbook (see section 4) and its default prompt template (section 5).
   No kind-specific code until a kind proves it needs some.
3. **The patron talks to the Party Leader directly.**
   Each Party Leader gets its own terminal tab or tmux window named after it; the patron switches tabs to switch focus.
   This departs from TERMINOLOGY.md's "the patron's single point of contact" for the Guildmaster, so it is question Q1.
4. **Adventurers run outside the Party Leader's turn.**
   The Party Leader never does the work itself; `gm dispatch <posting>` starts a headless `claude -p` run in the posting's camp as a background process and returns at once.
   Claude Code already supports this shape: a background command "immediately returns a background task ID" and "Claude Code can respond to new prompts while the command continues executing in the background" (<https://code.claude.com/docs/en/interactive-mode#background-bash-commands>).
   The Party Leader's turns stay short, so the patron can always get an answer; the Adventurer's finish lands in the register, and a Stop hook with `asyncRewake` (a background hook that "wakes Claude on exit code 2", <https://code.claude.com/docs/en/hooks>) wakes the idle Party Leader to review it. Firstmate's Claude auto-arm uses the same hook mechanism (`bin/fm-claude-stop-autoarm.sh:1-80`).
5. **Recurring kinds are woken by the operating system, not by an agent.**
   A launchd agent (macOS) or cron entry runs `gm wake <party>` on schedule; `gm` starts the Party Leader session if none is alive and hands it the due posting.
   Firstmate deliberately has no scheduler; Guildmaster needs one, but it should be the smallest possible one.

**Trade-offs.**
Talking directly to Party Leaders gives the patron focus and keeps the Guildmaster clean, but it means several live Claude sessions at once, which costs quota (section 9).
A Party Leader that is "its records" must write everything down as it goes; that is a discipline the prompts ask for and the hooks enforce, not something Claude does by default.
An OS scheduler cannot run while the laptop sleeps; a missed run must be caught up at wake, and "runs while I am away" needs an always-on machine, which conflicts with local-only (question Q11).

## 2. The Guildmaster knows, but does not tell

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 2.1 Guildmaster context not polluted | Strong filtering already: "Routine internal supervision, heartbeats, retries, and crewmate churn stay inside your own home and must not touch that status file" (`bin/fm-brief.sh:443`); "the scripts report facts, the mate reports judgement" (`docs/secondmate-parent-channel.md:20`); the parent "do[es] not read the secondmate's chat" (`AGENTS.md:172`). | Fits. Every non-routine status line still wakes the first mate (`docs/architecture.md:92`), so a busy mate is still a noisy one. |
| 2.2 knows, but does not relay | Each home publishes `state/home-summary.json` (`bin/fm-home-summary-refresh.sh:1-10`), refreshed on status change and every 300 s (`docs/architecture.md:142`); the parent reads bounded fields through `bin/fm-fleet-snapshot.sh:79-99`, capped at 20 children, queued items and decisions and 256 KB per home (`bin/fm-fleet-snapshot.sh:160-163`). `/bearings` gives a four-part digest and forbids scraping chat (`.agents/skills/bearings/SKILL.md:58`). | Firstmate's first mate is designed to *tell*: its job is to relay decisions and outcomes to the captain. Nothing marks information as "know, don't say". |
| 2.3 answers history on request | History sources are the append-only parent status log, the last 10 Done rows (`done_keep = 10`, `docs/configuration.md:336`), pointers into the mate's `data/`, and an opt-in fleet ledger that mates do not inherit (`docs/fleet-ledger.md:8-10`). | No durable per-mate history; "what did X do last month?" means asking X. |

**Recommendation.**

- The Guildmaster's session holds only the **roster**: one line per Party Leader (id, kind, phase, open postings, needs-you count, last notice time), printed by `gm roster` at session start and after each phase-change digest.
- Everything else is **pull, not push**: the Guildmaster answers "what happened with CRM-1234 in August?" by querying the register's event history (`gm history CRM-1234 --since 2026-08-01`), which is permanent, not by holding it in context or asking the Party Leader.
- The Guildmaster's charter says what it may volunteer: nothing, except a Party Leader that is gone quiet or a ruling nobody has seen for a set time (question Q8). Needs-you counts are shown by the status line instead (section 7), so nothing depends on the Guildmaster speaking.

**Trade-offs.** A quiet Guildmaster can let something rot unseen; the status line's guild-wide needs-you count is the guard against that. Keeping permanent event history means the register grows without bound; at one patron's scale that is megabytes a year, not a problem, but it needs a backup (see [Decisions the patron has not mentioned](#decisions-the-patron-has-not-mentioned)).

## 3. Repositories and camps

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 3.1 a place per focus that tracks information | A secondmate home is a full Firstmate home with its own `data/`, `state/`, `config/`, `projects/` and backlog (`docs/configuration.md:69-99`); the seed copies the charter to `data/charter.md` (`bin/fm-home-seed.sh:5-20`). | Fits in spirit; heavy in practice (a whole Firstmate checkout per home). |
| 3.2 repositories where they live, or clones | Projects are cloned: "Clone into `projects/<name>`" (`.agents/skills/project-management/SKILL.md:34`). The spawn accepts any directory on disk (`bin/fm-spawn.sh:2799-2805`), but the session-start refresh fast-forwards the default branch and force-deletes gone-upstream branches in every clone under `projects/` (`bin/fm-bootstrap.sh:336-344`, `bin/fm-fleet-sync.sh:225-254`). | Pointing Firstmate's clone management at the patron's everyday clone would prune the patron's own branches. |
| 3.3 a git worktree per job, removed when done | A treehouse pool slot is taken (`bin/fm-spawn.sh:4219`), forced to a clean `origin/<default>` with `reset --hard` (`bin/fm-spawn.sh:3311-3358`), and returned with `treehouse return --force` at teardown after `branch -D` of the local task branch (`bin/fm-teardown.sh:3587-3607`). | A recycled pool, always based on the default branch (non-default base is open ticket #3411), and the branch is deleted at the end. |
| 3.4 about twenty at once | "No concurrency cap" while the captain is present (`AGENTS.md:196-197`); a default cap of 4 concurrent workers in away mode (`bin/fm-afk-contract.sh:124`, `bin/fm-spawn.sh:1527-1535`). A per-project lock refuses a contending spawn rather than queueing it: "contention refuses rather than waits" (`bin/fm-spawn.sh:150-165`). | Twenty is possible in principle; each spawn costs a fetch, a hard reset and up to 60 s of waiting (`bin/fm-spawn.sh:4253-4276`). |

**Recommendation.**

- **Use the repositories where they already live.** A Guildhall config file maps a repository name to its path on disk. Guildmaster never clones, fast-forwards, prunes or switches branches in that clone; its only writes there are `git fetch`, `git worktree add` and `git worktree remove`.
- **Camps are plain git worktrees** under the Guildhall (`camps/<party>/<name>`), made with `git worktree add` and removed with `git worktree remove` when the job ends. No pool, no reset of someone else's slot.
- **A ticket's camp lives as long as the ticket.** Git will not check the same branch out in two worktrees at once ("`git worktree add` refuses to create a new worktree when `<commit-ish>` is a branch name and is already checked out by another worktree", <https://git-scm.com/docs/git-worktree>). Since requirement 4.2 says every posting on a ticket goes on *one* feature branch, a ticket has exactly one camp on that branch, and its contract postings take turns in it, one Adventurer at a time. That is also what "keep going through them one by one" (8.3) asks for. Surveys (read-only postings) can run in parallel in throwaway detached worktrees.
- **Twenty streams means twenty camps across many Party Leaders, not twenty on one branch.** The concurrency limit is set by quota, not by git (section 9).

**Trade-offs.** One camp per ticket serialises contract work on that ticket; two independent fixes on the same ticket cannot run in parallel without a second branch, which the patron has ruled out. Working beside the patron's own clone means the patron's uncommitted work and Guildmaster's camps share one `.git`; `git worktree` is designed for exactly that, but a patron who runs `git worktree prune` or deletes a camp by hand can confuse the register (so `gm` must re-check with `git worktree list` at start, the way Firstmate's session start reconciles records with reality).

## 4. Rules of engagement, phases and playbooks

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 4.1 patron-written procedures | Per-project registry tokens are only delivery mode, `+yolo`, `branch=` and `forge=` (`bin/fm-project-mode.sh:27-35`); the registry "is explicitly not project documentation" (`.agents/skills/project-management/SKILL.md:24-25`). Standing rules can live in the project's own committed `AGENTS.md` (`AGENTS.md:151`), one home-wide `config/brief-include.md` (`docs/configuration.md:890-899`), or a secondmate charter's "genuinely domain-specific hard rules" (`.agents/skills/secondmate-provisioning/SKILL.md:33`). | No per-kind or per-project procedure, and no phase model. |
| 4.2 never a new branch within a ticket | The branch is always `<prefix><task-id>` (`bin/fm-spawn.sh:1495-1501`), prefix `fm/` by default and configurable (`bin/fm-project-mode.sh:5-8`). Requirements arriving during validation go to follow-up work (`.agents/skills/validation-supervision/SKILL.md:15`), which is a new task and a new branch; a task "cannot be rebound" to another PR (`bin/fm-pr-merge.sh:117-120`). | This is exactly the patron's complaint: follow-up work gets a new branch by design. |
| 4.3 the patron's GitLab flow | Three delivery modes: no-mistakes, direct-PR, local-only (`bin/fm-dod-lib.sh:393-441`). Worker rule 1: "Never push to the default branch (push only your `$branch` branch)" (`bin/fm-dod-lib.sh:153`). "Firstmate has no forge property for GitLab"; it derives the provider from the merge-request URL "*after the fact*" (`docs/gerrit-forge-integration.md:129-130`, forge values at `bin/fm-project-mode.sh:55-60`); worker instructions say `gh-axi` (`bin/fm-dod-lib.sh:400-401`); merging needs a successful head pipeline (`docs/gitlab-merge-watch.md:239-240`); teardown's merged check calls `gh` only (`bin/fm-teardown.sh:1525-1538`). | No shared development branch, no promotion step, and pushing to a branch other than the task's own is forbidden. |
| 4.4 knows and shows its phase | Task states are backlog buckets (Queued, In flight, Done) and status verbs ([backlog-and-decisions/buckets](../firstmate/components/backlog-and-decisions/buckets.html)). | No per-task phase. |
| 4.5 a playbook per kind | Skills are supervisor procedures loaded by trigger (`AGENTS.md:403-406`); workers never load them. Named playbooks exist for diagnosis, validation and stuck-worker recovery (`.agents/skills/diagnostic-reasoning/`, `.agents/skills/validation-supervision/`, `.agents/skills/stuck-crewmate-recovery/`). Dispatch profiles pick harness, model and effort only (`docs/configuration.md:984-1019`). | No per-task-type procedure. |

The patron's own Firstmate home already knows this domain is different: a local, untracked skill in that home records that the workplace repositories are not Firstmate fleet projects, already use per-ticket worktrees, and send merge requests to integration.
Guildmaster is, in effect, the tool for the work that Firstmate was told to stay out of.

<!-- diagram: playbook -->

**Recommendation.**

- **A playbook is a Markdown file per kind** in the Guildhall (`playbooks/ticket.md`, `playbooks/incident.md`, ...), written by the patron. It lists the phases in order, what must be true to leave each phase, which phases need the patron's word, and the git operations allowed in each.
- **Rules of engagement are a Markdown file per repository or project** (`rules/<repo>.md`): branch names (`development`, `integration`, feature-branch pattern), merge style, what never happens (force-push to a shared branch, a push to integration). The Party Leader's session loads its kind's playbook and its repositories' rules at start.
- **The register holds the phase.** `gm phase CRM-1234 dev-test` records a phase change as an event; the status line and the Guildmaster read it from there.
- **The branch is written down once.** In phase 2 the Party Leader records `branch=feature/CRM-1234` on the ticket's row; `gm` refuses to create another branch for that ticket, and every writ names the recorded branch.
- **Rules that matter are enforced by hooks, not only asked for.** A Claude Code `PreToolUse` hook can refuse a tool call before it runs. Guildmaster's hook reads the camp's recorded branch and rules and blocks, for example, `git checkout -b` or `git switch -c` inside a ticket camp, `git push --force` to `development`, and any push to `integration`. Firstmate already enforces its own safety rules this way (`bin/fm-arm-pretool-check.sh`, `bin/fm-cd-pretool-check.sh`, `bin/fm-subagent-pretool-check.sh`).
- The ticket playbook in the figure is the recommended first playbook; the patron confirms the phases, names and gates (questions Q4 to Q6).

**Trade-offs.** Hook enforcement needs a small command parser; a determined agent can reach the same effect by an unusual command the hook does not recognise, so the hook is a guard rail, not a sandbox. Playbooks as free Markdown are easy to write but only as strict as the prompts reading them; putting phase names in a short machine-readable header (a few `phase:` lines) lets `gm` validate `gm phase` calls without parsing prose.

## 5. Patron-authored prompts

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 5.1 the patron writes the prompts | Crew briefs are hard-coded heredocs in `bin/fm-brief.sh` (ship `bin/fm-brief.sh:615-664`, scout `bin/fm-brief.sh:544-588`, secondmate charter `bin/fm-brief.sh:383-451`); only two slots, `{TASK}` and `{FIRSTMATE_SPEC}`, are filled, and by the first mate, not the operator (`AGENTS.md:381-385`); "The scaffold is a safety contract, not a suggestion" (`AGENTS.md:394`). A fixed worker-role block (`bin/fm-dod-lib.sh:108-122`) and a fixed Claude `--append-system-prompt` (`bin/fm-spawn.sh:1988-1990`) are added at launch. The operator's only injection point is `config/brief-include.md`, appended last and ranked lowest, per home, never in charters (`docs/configuration.md:890-899`). The secondmate charter text (`FM_SECONDMATE_CHARTER`, `bin/fm-brief.sh:374-375`) and its copy in `data/charter.md`, which the spawn prefers (`bin/fm-spawn.sh:2977-2981`), are operator-editable. The supervision branch prompt is deliberately not configurable (`bin/fm-branch-prompt.sh:6-23`). | The patron's guess ("I think first mate does this, but I'm not 100% sure") is half right: charters yes, crew prompts no. |
| 5.2 audit of which prompt was given | Each brief survives teardown in `data/<id>/brief.md` and `launch-brief.md` ([prompts-and-skills/briefs](../firstmate/components/prompts-and-skills/briefs.html)). | No versioning, no record of which template produced a brief. |

**Recommendation.**

- **Every prompt is a patron-owned file** in the Guildhall's `prompts/` directory: `guildmaster.md`, `party-leader/<kind>.md`, `adventurer/contract.md`, `adventurer/survey.md`. `gm` ships sensible first versions; after that they are the patron's.
- **Templates have a few named slots and nothing hidden.** `gm writ <posting>` fills `{{posting}}`, `{{original_words}}`, `{{branch}}`, `{{phase}}`, `{{rules}}`, `{{playbook}}` and writes the result to the posting's folder. Nothing is appended behind the patron's back; what the Adventurer reads is exactly the file.
- **`gm` checks a template instead of overriding it.** `gm prompts check` fails a template that lacks the notice instruction or the branch slot, the few things the machinery depends on. This keeps the patron in charge while catching a template that would break the loop.
- **Every rendered writ is recorded** with the template's path and content hash as an audit event, so "which prompt did Task-Fix-login get, and from which version of the template?" has an answer (5.2).
- **Claude's own layers stay in play.** A project's `CLAUDE.md` still loads in the camp (Firstmate relies on the same, `bin/fm-brief.sh:659-661`); `--append-system-prompt` is used only for text that is itself a patron template.

**Trade-offs.** Firstmate hard-codes its safety text so that no one can accidentally delete it; handing all text to the patron trades that safety for control, and `gm prompts check` plus the hooks in section 4 are what buy some of it back. Long, patron-written templates also cost tokens on every dispatch; the templates should stay short and point at the playbook and rules files rather than repeat them.

## 6. Audit and tracing

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 6.1 durable record of what was triggered, when, by whom | Per-task status log `state/<id>.status`, append-only `state [key=..] [at=<epoch>]: text` (`bin/fm-brief.sh:342-346`), deleted at teardown (`bin/fm-classify-lib.sh:1725`). Opt-in fleet ledger `state/fleet-ledger.jsonl` with five events: `task.dispatched`, `task.status`, `task.pr_ready`, `task.merged`, `task.cleaned_up` (`docs/fleet-ledger.md:17-45`), at-least-once, never rotated, per home and not inherited (`docs/fleet-ledger.md:8-10`). Routed requests to a secondmate keep created, delivered and resolved times (`bin/fm-pending-reply-lib.sh:22-67`). | Spread across many files; the richest ones are deleted at teardown; ledger off by default. |
| 6.2 Jaeger-style trace view | A W3C `traceparent` carrier, "default-off, source-owned, vendor-neutral, and deliberately narrow" (`docs/trace-context.md:5`), minted per task (`bin/fm-trace-context-lib.sh:205-212`), exported into the pane as `TRACEPARENT` and recorded in the task meta (`bin/fm-spawn.sh:4829-4838`). "Firstmate emits no spans of its own" (`docs/trace-context.md:84`); "Firstmate learns nothing about OpenTelemetry, any exporter, collector, storage, or UI" (`docs/trace-context.md:111`). | No spans, no exporter, and nothing reads the carrier. |
| 6.3 count rotations and loops | Scattered counters: a secondmate relaunch record "the captain can count to see frequency" (`bin/fm-secondmate-liveness-lib.sh:88-95`), a global wake sequence (`bin/fm-wake-lib.sh:2010-2021`), watcher poll counts (`bin/fm-watch.sh:2990-3004`), busy/idle sequence per incarnation (`bin/fm-busy-lib.sh:14-25`). Per-turn token cost is logged for the supervision host only (`bin/fm-supervision-engine-lib.sh:383-391`). | No per-task loop count; crew tokens recorded nowhere. |
| 6.4 trace follows every hop | Captain to first mate: no carrier. First mate to secondmate: the mate's own task carrier. Secondmate to crew: each crew task "roots its own per-task trace", deliberately (`docs/trace-context.md:44-47`, `docs/trace-context.md:66`). | By design, the hops are separate traces with no parent link. |

**Recommendation.**

- **One events table is the audit.** Every `gm` call and every hook writes one row: time, actor (guildmaster, party, adventurer, hook, patron), event kind, posting id, and trace fields (`trace_id`, `span_id`, `parent_span_id`). Nothing is deleted at teardown.
- **A posting is a trace.** The trace starts when the patron's message becomes a posting; the Party Leader's classify turn, the dispatch, the Adventurer run and its tool calls, the push, each notice and the patron's acceptance are spans under it. This is the opposite of Firstmate's "each routed task roots its own trace" rule, and it is what the patron asked to see: the whole conversation from Guildmaster to Party Leader to Adventurer as one picture.
- **Adventurer spans come from Claude Code itself.** Claude Code has beta OpenTelemetry tracing (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`, `OTEL_TRACES_EXPORTER=otlp`) with a `claude_code.interaction` span per prompt and `claude_code.llm_request` and `claude_code.tool` spans under it. Crucially, "in Agent SDK and non-interactive sessions started with `-p`, Claude Code also reads `TRACEPARENT` ... from its own environment" (<https://code.claude.com/docs/en/monitoring-usage>). So `gm dispatch` sets `TRACEPARENT` to the posting's dispatch span, and every model call and tool call the Adventurer makes nests under the posting with no Guildmaster code at all.
- **Party Leader and Guildmaster spans come from `gm` and hooks.** "Interactive sessions ignore inbound `TRACEPARENT`" (same page), so their turns cannot be parented natively. `gm` writes a span for each of its own calls, and `UserPromptSubmit` and `Stop` hooks bracket each turn, carrying Claude Code's `prompt_id` so the two sources can be matched.
- **Counting answers "how many times did it go round".** Tool spans, test runs, wakes, relaunches and retries are all rows or spans with a kind; a count per posting is one query.
- **The viewer is optional and last.** `gm trace <posting>` prints a text waterfall from SQLite with no extra software. For the Jaeger view, run Jaeger locally; it is "built on top of the OpenTelemetry Collector framework" and accepts OTLP on ports 4317 and 4318 (<https://www.jaegertracing.io/docs/latest/architecture/>), so both Claude Code's spans and `gm trace export`'s spans go straight to it.

<!-- diagram: trace -->

**Trade-offs.** Claude Code's tracing is beta, and its span names are not the OpenTelemetry GenAI names (`invoke_agent`, `execute_tool`), which are themselves still "Development" status (<https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md>); expect renames. Two span sources (Claude Code's exporter and `gm`'s register) mean the register alone holds the Guildmaster-level story but not every tool call; if the patron wants one local store of everything, a small OpenTelemetry Collector can write to Jaeger and to a file at once. Jaeger's quick-start image keeps "transient in-memory storage" (<https://www.jaegertracing.io/docs/latest/getting-started/>), so the register, not Jaeger, is the permanent record. Claude Code's spans "redact user prompt text, tool input details, and tool content by default" (<https://code.claude.com/docs/en/monitoring-usage>); seeing *which* command ran needs `OTEL_LOG_TOOL_DETAILS=1`, which puts work content into the trace store, so it must stay on the patron's machine (see [Decisions the patron has not mentioned](#decisions-the-patron-has-not-mentioned)).

## 7. Console: where am I

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 7.1 always see where I am | No Claude Code status line: the tracked `.claude/settings.json` configures hooks only and has no `statusLine`. "Where am I" is on demand: `/bearings` prints Captain's Call, Recently Landed, Underway, Charted Next (`.agents/skills/bearings/SKILL.md:145-179`); `bin/fm-fleet-view.sh:1-96` renders tables; `fm-inbox.sh status` is a read-only view "safe to run in a loop" (`bin/fm-inbox.sh:14-16`). | Nothing on screen all the time, and no phase to show. |
| 7.2 multitask without losing my place | One first-mate conversation carries every task; secondmates are not meant to be talked to. | The patron's stated biggest problem with Firstmate. |
| 7.3 control what the console shows | Calm (`docs/calm.md`) hides tool rows, operational rows and short mid-turn notes and turns the spinner into a sailboat, but only through Claude Code's early-access function hooks, which Firstmate never enables (`docs/calm.md:182-195`). The Pi Calm extension only clears its status slot (`.pi/extensions/fm-calm.ts:429`). | Calm *removes* noise; nothing *adds* orientation. |

**What AI-DLC v2 actually does.** The patron remembered AWS AI-DLC "manipulating" the top and bottom bars.
AI-DLC v2 (current release v2.10.0, <https://github.com/awslabs/aidlc-workflows>) uses exactly the Claude Code surfaces available to Guildmaster:
its `harness/claude/settings.json` sets a `statusLine` command that prints `[AIDLC] PHASE [▓▓▓▓▓░░░░░] n/m > Display Name -- Agent` from a per-intent `aidlc-state.md` file, and uses `companyAnnouncements` to show the phase list at start (<https://github.com/awslabs/aidlc-workflows/blob/main/harness/claude/settings.json>, <https://github.com/awslabs/aidlc-workflows/blob/main/docs/reference/06-hooks-and-tools.md>).
Its gates are Claude Code hooks: a `PreToolUse` plan-approval guard and state-transition guard, a `UserPromptSubmit` hook (`record-human-turn`) that records a `HUMAN_TURN` event the approval gate requires, and a `Stop` hook whose purpose is to "keep it running until the engine reports a terminal `done`, `parked`, or informational `notice`" (same page).
AI-DLC's own docs call its audit write guard "a guardrail, not a security boundary" (<https://github.com/awslabs/aidlc-workflows/blob/main/docs/guide/10-state-and-audit.md>).
That is strong evidence the recommended design below is buildable today.

<!-- diagram: console -->

**Recommendation.**

- **One tab per Party Leader, titled by Claude Code.** `gm open CRM-1234` starts the session with `--name CRM-1234`, a display name "shown in `/resume` and the terminal title" (<https://code.claude.com/docs/en/cli-reference>); a `SessionStart` hook can also set it (`sessionTitle`, "the same effect as `/rename`") or emit an OSC title sequence through the hooks' `terminalSequence` field (<https://code.claude.com/docs/en/hooks>). Switching tabs is switching focus.
- **A three-line status line** from one command, `gm statusline`, which reads the session's JSON on stdin (`session_name`, `workspace.git_worktree`, `context_window.used_percentage`, `model`) and the register (<https://code.claude.com/docs/en/statusline>): line 1 the focus, kind, phase and branch; line 2 this focus's postings; line 3 the rest of the guild. "Each `echo` ... displays as a separate row", so three lines are supported. Set `refreshInterval` (a few seconds), because event-driven refreshes "can go quiet when the main session is idle ... while a coordinator waits on background subagents", which is exactly a Party Leader waiting on Adventurers.
- **A "you were here" recap on return.** A `SessionStart` hook injects `gm where` (phase, last three notices, next posting, anything that needs the patron) as `additionalContext`, and the Party Leader's first line back is that recap. This is what makes switching between twenty things survivable.
- **Optional bars outside Claude Code.** A tmux status bar or an iTerm2 badge can run `gm roster --short` for a guild-wide line; this is the "top bar" if the patron wants one (question Q19).
- **Calm is not needed first.** Hiding tool rows helps, but the patron asked for orientation, not silence; add a custom output style later if the transcript is too noisy.

**Trade-offs.** Several Claude sessions each running a status-line script every few seconds is cheap (the script reads SQLite), but a slow script is cancelled ("If a new update triggers while your script is still running, Claude Code cancels the in-flight script"), so `gm statusline` must return in milliseconds. The status line's `rate_limits` field "appears only for claude.ai Pro and Max subscribers", so on a Team or Enterprise seat quota cannot be shown from that field (section 9).

## 8. Intake: never lose a posting

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 8.1 every item becomes a posting at once, with what came with it | The first mate files a backlog item in `data/backlog.md` through tasks-axi before dispatch (`AGENTS.md:205`, `AGENTS.md:359-377`). The captain's words are kept only in each brief's `## Captain's intent` (`AGENTS.md:216`, `AGENTS.md:382`). The only code-owned record of raw captain prompts is the opt-in supervision-host mirror (`bin/fm-host-mirror.sh:11-16`). Screenshots are handled only for relay mentions (`.agents/skills/fmx-respond/SKILL.md:115-171`). | Filing is the model's job, not the code's; nothing guarantees that ten rapid messages become ten items, and screenshots have nowhere to live. |
| 8.2 postings belong to their focus | Routed work lives in the mate's own backlog (`AGENTS.md:362-363`). | Fits. |
| 8.3 one by one, never dropped | Backlog buckets and a completion gate (`bin/fm-captain-hold.sh`, [backlog-and-decisions/completion-gate](../firstmate/components/backlog-and-decisions/completion-gate.html)). | Nothing enforces that every patron message produced a row. |
| 8.4 setting aside is explicit | Captain holds carry a one-line reason and optional `--until` (`bin/fm-captain-hold.sh:52-54`, `bin/fm-captain-hold.sh:831`); bearings shows holds as live, blocked, dated or aged after 14 days (`bin/fm-fleet-snapshot.sh:36-37`). | A deferral date is only noticed at the next bearings or snapshot; no watcher fires when it arrives. |
| 8.5 see every posting and where it stands | `bin/fm-fleet-view.sh` and `/bearings`; the Done list keeps 10 (`docs/configuration.md:336`). | Workable for tasks the first mate filed; misses anything it never filed. |
| 8.6 one-line notices | Status lines are one line each, but they go to the supervisor, not the patron (`bin/fm-brief.sh:342-346`). | No patron-facing notice grammar. |
| 8.7 stable readable ids | Task ids allow `[A-Za-z0-9._-]` up to 64 characters (`bin/fm-pr-lib.sh:99-116`). | The id is the first mate's choice and dies with the task's state at teardown. |
| 8.8 context comes back with the item | Startup prints the backlog without bodies (`bin/fm-session-start.sh:419-420`); open decisions are cut to 220 bytes each and 4000 in total (`bin/fm-wake-drain.sh:466-505`); bearings must not use hold or body prose (`.agents/skills/bearings/SKILL.md:51`). | Context is deliberately trimmed when an item resurfaces, which is the opposite of 8.8. |

<!-- diagram: lifecycle -->

**Recommendation.**

- **Capture is code, classification is the model.** A `UserPromptSubmit` hook, which receives the full `prompt` text (<https://code.claude.com/docs/en/hooks>), writes every patron message in a Party Leader's session into the register as an *unsorted* inbox row, verbatim, before Claude sees it. The Party Leader's job is to sort each row into new postings, a steer of an existing posting, or a question, through `gm post`, `gm steer` or `gm answered`.
- **The turn cannot end with anything unsorted.** A `Stop` hook refuses to let the Party Leader stop while its session has unsorted rows (exit code 2 on `Stop` "Prevents Claude from stopping, continues the conversation", same page). This is the mechanical answer to "it forgot about some tasks", and it is the same approach AI-DLC v2 takes with its human-turn and continue-workflow hooks. Firstmate's turn-end guard is the precedent in this lineage (`docs/turnend-guard.md`).
- **Posting ids are made by `gm`, in the patron's format.** `gm post` takes a verb and a short slug and returns a guild-wide unique id such as `Task-Fix-login` (a numeric suffix only on collision). The id never changes and never dies; the patron can type it anywhere (`gm show Task-Fix-login`, or just "Task-Fix-login: keep the old URL" in the Party Leader's chat, which the sorter treats as a steer).
- **Every notice carries its context.** The notice grammar is `<id> <verb>[: detail] (<one-line summary>)`, with verbs from a closed list: `received`, `queued`, `started`, `parked`, `needs you`, `resumed`, `done`, `failed`, `closed`. The summary in parentheses is what makes a resurfaced item recognisable; `gm show <id>` gives the rest: the patron's original words with their time, attachments, phase, every notice so far, and the last Adventurer result.
- **Parked means parked with a reason and a wake condition.** `gm park <id> --why "waits for dev deploy" --until <time or event>`; the status line counts parked postings, and `gm` resurfaces a posting whose condition is met instead of waiting for someone to look.
- **Screenshots go into the posting's folder.** How they get there is open: see the callout.

> [!unclear]
> **Screenshots are not settled by the documentation.** The `UserPromptSubmit` hook is documented to receive the prompt *text*, with pasted text expanded in place; the hooks reference says nothing about pasted images. Until that is tested, the dependable path is a drop folder (`gm attach <id> <file>`, or the Party Leader copying a dragged-in file path into the posting's folder). Question Q18 asks how the patron sends screenshots today.

**Alternatives considered.** Claude Code's own task list (`TaskCreate`, `TaskList`, shareable across sessions with `CLAUDE_CODE_TASK_LIST_ID`, <https://code.claude.com/docs/en/interactive-mode#task-list>) is tempting, but it lives in Claude's private directory, is on by default only for older models (<https://code.claude.com/docs/en/tools-reference#task-tool-availability>), and cannot hold the patron's original words, phases or notices; the register can import from it later if useful.

**Trade-offs.** Capturing every message verbatim also captures chit-chat; sorting it costs a little of each turn, and "question" is a valid sort, so nothing is forced into a posting. A Stop hook that blocks can loop if `gm` is broken; like Firstmate's guard, it needs a block budget and a loud failure (`docs/turnend-guard.md` describes Firstmate's block budget of 3).

## 9. Claude-only reliability

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 9.1 Claude Code only | Harness-agnostic by design: adapters for Claude and many others ([crew/harnesses](../firstmate/components/crew/harnesses.html)); "`resume` is not a verb" because resume differs across adapters (`docs/agent-control.md:58-61`). | Much of Firstmate's complexity exists to support harnesses the patron does not use. |
| 9.2 tight control, no avoidable errors, work keeps moving | Claude-specific machinery exists and is battle-tested: `SessionStart`, `PreToolUse`, `UserPromptSubmit` and `Stop` hooks in `.claude/settings.json`; workspace trust pre-registered (`bin/fm-claude-trust.sh:1-60`); a Stop auto-arm (`bin/fm-claude-stop-autoarm.sh:1-80`); a turn-end guard (`docs/turnend-guard.md`); a subagent guard created after the 2026-07-22 loss of untracked subagent work (`docs/subagent-guard.md:9-26`); a wedge escalation after 240 s of a quiet working pane (`bin/fm-watch.sh:327`). Quota is ranked across providers (`.agents/skills/quota-array-dispatch/SKILL.md:39-118`) with an optional low-quota wake (`bin/fm-procevent-quota.sh:1-20`). No `PreCompact` hook (open ticket #4796). | Good parts to copy; no compaction hook; quota logic is built for many providers. |
| 9.3 others later, without building for them | Everything is behind harness adapters. | The seam is right; its breadth is not needed now. |

**Recommendation.**

- **Use Claude Code's own surfaces fully**, since no other familiar needs supporting: `SessionStart` (charter, playbook, `gm where`), `UserPromptSubmit` (capture), `PreToolUse` (rules), `PostToolUse` (audit rows), `PreCompact` (write a "where I am" note to the register before context is squeezed, the gap Firstmate's #4796 describes), `Stop` (never end unsorted; `asyncRewake` for Adventurer events), `StopFailure` (a `rate_limit` matcher records a quota event and pauses dispatch). All are in the hooks reference (<https://code.claude.com/docs/en/hooks>).
- **Adventurers are `claude -p` runs with explicit permissions.** Each gets a pre-trusted camp, an explicit permission mode and allowed-tool list, the patron's writ as its prompt, and `TRACEPARENT`. Headless runs are what read inbound trace context, and they exit cleanly, which is easy to supervise.
- **Background sessions are a later option.** Claude Code's agent view (`claude --bg`, `claude agents --json`) supervises background sessions, restarts crashed ones, and survives sleep (<https://code.claude.com/docs/en/agent-view>). It is a research preview and cannot be combined with `-p`, so it is not the first foundation; it is a good fit later for Party Leaders themselves.
- **Quota is the real limit.** "Running ten agents in parallel uses quota roughly ten times as fast as running one" (<https://code.claude.com/docs/en/agent-view>); Team and Enterprise seats have a five-hour and a weekly allowance "shared with Claude chat and Cowork" (<https://code.claude.com/docs/en/costs>); for 429s the docs advise "Reduce concurrency ... avoid running many parallel subagents" (<https://code.claude.com/docs/en/errors>). `gm` should hold a guild-wide cap on live Adventurers (start at 3), queue beyond it, and show the queue in the status line.
- **"Push things" needs credentials that work headless.** GitLab SSH keys or a `glab` token must be usable from a `claude -p` run without a prompt; the `PreToolUse` rules then decide *which* pushes are allowed (section 4).
- **Keep one seam.** Only one `gm` function knows how to start a familiar; everything else talks to the register. That is enough to add another provider later.

**Trade-offs.** Leaning on Claude Code features couples Guildmaster to a fast-moving product (the hooks reference lists dozens of events, and tracing and agent view are beta or preview); `gm doctor` should check the installed Claude Code version and the hook schema at start. A dispatch cap slows bursts; that is the point.

## 10. Storage and reach

| Req | Firstmate today | Missing or against |
| --- | --- | --- |
| 10.1 files at the edges, SQLite at the core | No Firstmate document states why it uses files. The nearest statements: "all state lives on disk and in the active session backend" (`README.md:53`); "durable state and live backend inventory, not conversation memory, are authoritative" (`AGENTS.md:128`); "the existing backlog remains the only durable work database" (`docs/captain-hold-lifecycle.md:29`). The cost is hand-built machinery: symlink locks with owner directories, pid files and dead-owner reaping (`bin/fm-wake-lib.sh:572-584`), lease files (`bin/fm-lease-lib.sh:1-40`), and read cursors keyed on file identity, where "an in-place edit of the same size is not detected" (`bin/fm-classify-lib.sh:1102`). | Every coordination feature re-solves concurrency by hand. |
| 10.2 no remote homes | Remote secondmates over SSH are a whole area ([remote](../firstmate/components/remote/index.html)). | Not needed now. |

> [!unclear]
> **The update-restart race is not documented.** The earlier conversation named "the update restart colliding with the watcher's automatic relaunch" as an example. Firstmate's docs and ticket snapshot do not describe it. Reading the code, the update restart goes through `fm-control.sh relaunch` under `state/.control-<id>.lock` (`bin/fm-secondmate-restart.sh:175`, `bin/fm-control.sh:311-315`), while the watcher's liveness tick holds a different lock, `state/.secondmate-liveness-<id>.lock` (`bin/fm-secondmate-liveness-lib.sh:74-77`), may kill the endpoint and respawn it (`bin/fm-secondmate-liveness-lib.sh:282-296`), and is documented as serialising only against the session-start sweep (`bin/fm-watch.sh:1035-1037`). The two share only the per-spawn lock (`bin/fm-spawn.sh:1661-1665`). That leaves a plausible window, unconfirmed by running anything, and it is the kind of bug one transaction would close.

**Recommendation.**

- **SQLite for everything that coordinates**: parties, postings, inbox rows, phases, leases, the summons queue, rulings, events and spans. Use WAL mode, a busy timeout, and `BEGIN IMMEDIATE` for every write: in WAL mode "readers do not block writers and a writer does not block readers", but there can "only be one writer at a time" (<https://sqlite.org/wal.html>), and a deferred transaction that later writes may fail with `SQLITE_BUSY` (<https://sqlite.org/lang_transaction.html>). Claims are one statement with `RETURNING` (available "since version 3.35.0", <https://sqlite.org/lang_returning.html>).
- **Files for everything a person writes or reads**: charters, playbooks, rules, prompt templates, notes, field reports, screenshots, each posting's original words. The register stores their paths and hashes.
- **Only `gm` touches the database.** Agents call `gm`; no prompt ever contains SQL. `gm export` writes a readable Markdown snapshot of the quest board for people and for grep.
- **Local disk only.** "WAL does not work over a network filesystem" (<https://sqlite.org/wal.html>), which suits the patron's "no remote homes for now".

**Prior art.** Beads, an agent issue tracker often cited for pairing SQLite with a git-tracked JSONL file, has since moved: its README says it is "powered by Dolt", and its changelog for 0.58.0 says the SQLite backend was removed, with `.beads/issues.jsonl` now "an export for viewers and interchange, not the source of truth" (<https://github.com/gastownhall/beads>; a later changelog entry mentions SQLite again, so its current status is unclear). The lesson worth borrowing is the split itself: a database as the truth, readable files as an export. Its atomic `--claim` and "ready" query are good shapes for `gm`.

**Trade-offs.** A database is opaque to `cat` and to an agent's ordinary file tools, so debugging needs `gm` or `sqlite3`; that is the price of transactions. A single file is a single point of loss, so backups are not optional (see [Decisions the patron has not mentioned](#decisions-the-patron-has-not-mentioned)). Moving to several machines later means putting the register behind a small server; keeping `gm` the only door keeps that possible.

## Build order

The smallest useful first slice attacks the patron's two sharpest pains, lost postings and "where am I", for one real ticket, before any Guildmaster or Adventurer exists.

1. **One ticket that never forgets.**
   The register and `gm` (`open`, `post`, `list`, `show`, `park`, `phase`, `notice`, `statusline`, `where`); one Party Leader for one real ticket, started by `gm open` as a named interactive Claude Code session in the ticket's camp (a `git worktree` of the existing clone on the ticket's feature branch); the patron's charter, the ticket playbook and one repository's rules as files; the `UserPromptSubmit` capture and `Stop` guard; the three-line status line.
   In this slice the Party Leader still does the work itself, one posting at a time: a deliberate, temporary shortfall against requirements 1.6 and 1.7 that slice 2 removes.
   *Done when* the patron can send ten items in a row, walk away, come back, and see all ten with their words and states.
2. **Adventurers and enforced rules.**
   `gm dispatch` runs a headless `claude -p` Adventurer in the camp, one contract at a time per ticket and surveys in parallel; results land in the register and wake the Party Leader; `PreToolUse` rules enforce the branch and shared-branch rules; `TRACEPARENT` is set per posting.
   *Done when* the patron can keep talking to the Party Leader while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch.
3. **Several Party Leaders and the Guildmaster lobby.**
   `gm roster`, a Guildmaster session holding only the roster, phase-change digests, history questions answered from events, one tab per Party Leader, the guild line in every status line.
4. **Audit and trace view.**
   Prompt templates owned by the patron with hashes recorded per writ; `gm trace` as a text waterfall; OTLP export and Claude Code's beta tracing into a local Jaeger.
5. **The other kinds.**
   `incident` (survey-heavy, ends in a field report), `recurring` (a launchd agent calling `gm wake`), `project` (several tickets under one focus).
6. **Hardening.**
   A muster at every start that reconciles the register with `git worktree list` and live sessions; nightly backups; the quota cap and rate-limit pause; the `PreCompact` note; ending idle sessions and waking them on demand.

## Risks

1. **Rebuilding Firstmate by accident.** Firstmate's `AGENTS.md` is 426 lines and its `bin/` holds about two hundred scripts, most of them for generality the patron does not need. Keep a written "not doing" list: other familiars, remote homes, backends other than a terminal tab, automatic merging.
2. **Months-long sessions decay.** Long Claude sessions compact and degrade (Firstmate tickets #95, #2362, #4796). Treat every Party Leader session as disposable and the register as the memory, and rotate sessions deliberately.
3. **Rules that live only in prompts get skipped.** The branch rule is the patron's concrete example. Every rule that matters needs a hook; AI-DLC reached the same conclusion.
4. **The shared development branch is shared.** A wrong merge or force-push there is seen by the whole team. It needs a hook and probably a patron gate (Q5, Q6).
5. **Quota.** Several live Party Leaders plus Adventurers on one seat can exhaust a five-hour or weekly window, and the docs warn that "a single burst of heavy activity ... can exhaust the weekly allowance" (<https://code.claude.com/docs/en/errors>).
6. **Claude Code moves fast.** Hooks, tracing (beta) and agent view (research preview) will change; pin a known-good version and check it with `gm doctor`.
7. **Hooks are guard rails, not a sandbox.** A model can find a command the hook does not parse; do not give Adventurers credentials they must never use.
8. **Screenshot capture is unproven** (section 8 callout).
9. **One camp per ticket serialises contract work** on that ticket; the patron's "never a new branch" rule makes that unavoidable.
10. **A laptop sleeps.** Recurring jobs miss runs while it does, and a reboot kills live sessions; the muster must catch up missed runs and restart what should be running.

## Decisions the patron has not mentioned

- **Cost and quota.** How many Adventurers may run at once; what happens at the limit (queue, pause, cheaper model); which model each role uses (Q13, Q14).
- **Security and credentials.** Which GitLab credentials headless runs may use and with what scope; which repositories are push-enabled; which secret files stay out of every session's reach (Firstmate treats `.env` as captain-private, `AGENTS.md:48`); whether traces may contain command text; whether company policy allows prompt and code content in a local trace store.
- **Commit identity.** Whose name is on the commits, and whether AI co-author trailers are allowed on work repositories. Firstmate strips them with a commit-msg hook (`bin/fm-git-strip-ai-trailers.sh`, `docs/configuration.md:978`); the patron's employer may have a policy.
- **Approval rules.** Which steps of each playbook need the patron's word, and whether any kind gets standing authority (Q6).
- **A Party Leader idle for weeks.** Recommended: its session ends after a set idle time, its records stay, and the next posting or scheduled run starts a fresh session that reads them. The status line shows it as dormant, not gone (Q17).
- **Ending.** What closes a ticket (merged to integration, released, verified in production), what happens to its camp and branch, and how long its history is kept.
- **Multi-machine later.** SQLite on local disk is a single-machine decision; say so now, and keep `gm` the only door so it can change.
- **Backups.** The register and the Chapter Houses are the guild's memory. Recommended: a nightly `sqlite3 ... ".backup"` copy beside the patron's normal machine backup, plus `gm export` into a private git repository.
- **Ticket system.** Whether a ticket Party Leader reads the ticket from the tracker, and whether the guild ever writes back (Q15).
- **Coexistence with Firstmate.** Whether Firstmate keeps running alongside, and which repositories belong to which, so two supervisors never share a clone (Q16).
- **Notifications away from the terminal.** Hooks can raise desktop notifications through OSC 9 or 777 (`terminalSequence`, <https://code.claude.com/docs/en/hooks>); decide which events deserve one.

## Questions for the patron

Questions marked **(slice 1)** block the first build slice.

1. **(slice 1)** Where do you talk day to day: inside each Party Leader's own tab, with the Guildmaster as a quiet lobby (recommended), or always through the Guildmaster? TERMINOLOGY.md calls the Guildmaster "the patron's single point of contact", so the first answer means revising that definition.
2. What is a playbook called? TERMINOLOGY.md has **Grimoire** ("a loadable procedure for one kind of work, read only when its trigger fires"); reuse it for per-kind playbooks, or add a new term?
3. **(slice 1)** What does "be able to push things" mean: `git push` to GitLab without being asked, work that keeps moving without stalls, or both?
4. **(slice 1)** For each repository: the exact names of the shared development branch and the integration branch, the feature-branch pattern (for example `feature/CRM-1234`), who creates the feature branch, and whether "push to development" means merging the feature branch into development or something else.
5. May the guild merge into the shared development branch without asking each time, given teammates share it?
6. **(slice 1)** Which steps need your word: merging into development, opening the merge request, marking it ready, merging it, anything after?
7. **(slice 1)** Is `Task-<Verb>-<Slug>` (for example `Task-Fix-login`) the id format you want? Unique across the whole guild or within one Party Leader? Should the ticket key appear in it?
8. Where should notices appear: only in the Party Leader's chat, also in one guild-wide feed, as desktop notifications? And may the Guildmaster volunteer anything at all (for example a Party Leader gone quiet)?
9. **(slice 1)** Do you approve the storage split: files for what people write and read, SQLite behind `gm` for coordination?
10. Tracing: start with a built-in text waterfall and add a local Jaeger (Docker) in slice 4, or Jaeger from the start?
11. Recurring jobs: which ones, how often, what each produces, what happens when one fails, and must they run while the laptop sleeps (which needs an always-on machine)?
12. Incidents: what does an incident Party Leader produce (a field report, a fix, a timeline), what may it read (logs, dashboards, production data), and when is it over?
13. Which Claude plan or seat do you have, and how many Party Leaders and Adventurers do you expect to have running at once?
14. Which model should each role use (Guildmaster, Party Leader, Adventurer)?
15. Should a ticket Party Leader read the ticket from your tracker, and should the guild ever write back to it?
16. During the transition, does Firstmate keep running, and which repositories belong to which system?
17. After how long without work should a Party Leader's session end (its records kept), and what retires a Party Leader for good?
18. How do you send screenshots today: pasted into Claude Code, dragged in as a file, or as a path?
19. Which terminal and multiplexer do you use (iTerm2 tabs, tmux, an IDE terminal), and what exactly should the top and bottom bars show?
20. **(slice 1)** What should `gm` be written in: Python with its standard library, shell with the `sqlite3` tool, or TypeScript?
21. Terms that may need to follow the rename to Party Leader (not renamed in this change): **Chapter House** is now defined as "a party leader's own guildhall", which mixes the guild-chapter image with the adventuring-party one; keep it or rename it? The Party Leader definition also still says "Idle by default, acts only on routed work", which a recurring Party Leader woken by a schedule, and a patron talking to it directly, both stretch; revise it?

## Outside sources

- Claude Code hooks reference (events, blocking, `additionalContext`, `sessionTitle`, `terminalSequence`, `asyncRewake`): <https://code.claude.com/docs/en/hooks>
- Claude Code status line (fields on stdin, multiple lines, `refreshInterval`, `rate_limits` availability): <https://code.claude.com/docs/en/statusline>
- Claude Code background Bash commands and task list: <https://code.claude.com/docs/en/interactive-mode>
- Claude Code CLI reference (`--name` sets the session's display name and terminal title): <https://code.claude.com/docs/en/cli-reference>
- Claude Code monitoring and OpenTelemetry (metrics, events, beta traces, `TRACEPARENT` in and out, redaction): <https://code.claude.com/docs/en/monitoring-usage>
- Claude Code agent view and background sessions (`claude --bg`, `claude agents --json`, quota note): <https://code.claude.com/docs/en/agent-view>
- Claude Code scheduled tasks (`/loop` and cron tasks are session-scoped and "expire 7 days after creation", with "no catch-up for missed fires"), which is why recurring Party Leaders need an OS scheduler: <https://code.claude.com/docs/en/scheduled-tasks>
- Claude Code costs and plan allowances: <https://code.claude.com/docs/en/costs>; errors and rate limits: <https://code.claude.com/docs/en/errors>
- AWS AI-DLC workflows (v2 status line, state file, hook-enforced gates): <https://github.com/awslabs/aidlc-workflows>, <https://github.com/awslabs/aidlc-workflows/blob/main/docs/reference/06-hooks-and-tools.md>, <https://github.com/awslabs/aidlc-workflows/blob/main/docs/guide/10-state-and-audit.md>
- W3C Trace Context (the `traceparent` format): <https://www.w3.org/TR/trace-context/>
- OpenTelemetry OTLP (ports 4317 and 4318, JSON encoding): <https://opentelemetry.io/docs/specs/otlp/>
- OpenTelemetry GenAI agent spans (Development status): <https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md>
- Jaeger architecture and getting started: <https://www.jaegertracing.io/docs/latest/architecture/>, <https://www.jaegertracing.io/docs/latest/getting-started/>
- otel-cli, for emitting spans from shell scripts: <https://github.com/tobert/otel-cli>
- SQLite WAL, transactions and `RETURNING`: <https://sqlite.org/wal.html>, <https://sqlite.org/lang_transaction.html>, <https://sqlite.org/lang_returning.html>
- git worktree (a branch checked out in only one worktree): <https://git-scm.com/docs/git-worktree>
- Beads: <https://github.com/gastownhall/beads>

## Where the research pages have drifted

The pages under `../firstmate/` were read against Firstmate commit `ada21f5b`; this consultation read `29213a09`, 124 commits later. Differences that matter here:

- Line numbers have moved almost everywhere, most in `AGENTS.md` (now 426 lines), `bin/fm-spawn.sh` (about +400 lines) and `bin/fm-brief.sh`. Some rules the pages quote from `AGENTS.md` now live in skills, for example the teardown rules in `.agents/skills/ship-landing/SKILL.md:23-29`.
- Branch names are no longer always `fm/<id>`: the prefix is configurable per project or task (`bin/fm-project-mode.sh:5-8`).
- Gerrit forge support and `bin/fm-forge-detect.sh` were added; neither is on the delivery pages.
- The worker's draft check now uses `gh-axi pr view` and looks for `draft: no`.
- Operational input to Claude now goes through a record-backed doorbell (`bin/fm-operational-input.sh:8-36`), which the operational-input page predates.
- A `UserPromptSubmit` and `Stop` host-mirror hook was added (`bin/fm-host-mirror.sh`), which the Claude auto-arm page does not show.
- The brief's project-memory rule was reversed: workers must no longer add knowledge to a project's `AGENTS.md` or run `fm-ensure-agents-md.sh` (`bin/fm-brief.sh:659-661`), unlike the text the briefs page quotes.
- The secondmate parent-channel page's marked-reply row is outdated; the live doc adds a pending-reply guard (`docs/secondmate-parent-channel.md:32`).
