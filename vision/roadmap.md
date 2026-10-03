# Guildmaster roadmap

The single tracked record of Guildmaster's build plan and its progress.
The steps are those of the [Build order](consultation.md#build-order) in [consultation.md](consultation.md), with step 1 as built in [step-1-design.md](step-1-design.md).
On 2026-09-30 the patron made tracing the next step, so it moved from fourth to second: the consultation's step 4 is step 2 here, and its steps 2 and 3 are steps 3 and 4.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s.

**How to update this file.** Whoever finishes or starts a step updates that step's status and links in the same PR as the work.

| # | Step | Status |
| --- | --- | --- |
| 1 | One ticket that never forgets | Done |
| 2 | Tracing and audit | In progress |
| 3 | Adventurers and enforced rules | Planned |
| 4 | Several Party Leaders and the Guildmaster lobby | Planned |
| 5 | The other kinds | Planned |
| 6 | Hardening | Planned |

## Step 1: One ticket that never forgets

**Status:** Done. Merged in <https://github.com/MadReza/guildmaster/pull/13>; design in [step-1-design.md](step-1-design.md).

**Goal.** Attack the patron's two sharpest pains, lost postings and "where am I", for one real ticket, before any Guildmaster or Adventurer exists.

**Scope.** The register and `gm` in bash (`open`, `post`, `resolve`, `list`, `show`, `park`, `phase`, `notice`, `statusline`, `where`); one Party Leader for one real ticket, started by `gm open` as a named interactive Claude Code session in the ticket's camp (a `git worktree` of the existing clone on the ticket's feature branch); the patron's charter, the ticket playbook and one repository's rules as files; the `UserPromptSubmit` capture and `Stop` guard; the `SessionStart` resume from records (requirement 1.8); the three-line status line.
In this step the Party Leader still does the work itself, one posting at a time: a deliberate, temporary shortfall against requirements 1.6 and 1.7 that step 3 (Adventurers) removes.

**Done when** the patron can send ten items in a row, walk away, come back, and see all ten with their words and states, and a killed session resumes with nothing re-explained.

## Step 2: Tracing and audit

**Status:** In progress. Design in [tracing-design.md](tracing-design.md), on the landscape in [tracing-research.md](tracing-research.md); the patron answered its five questions on 2026-10-02.

| Slice | What | Status |
| --- | --- | --- |
| 1 | Spans in the register, `gm trace`, `gm stats` with `--follows`, `--by-prompt` and `--compare` | Done. Merged in <https://github.com/MadReza/guildmaster/pull/18> |
| 2 | Claude Code's telemetry through a local collector | Next |
| 3 | Adventurer spans (with step 3) | Planned |
| 4 | A local Jaeger beside `gm trace` | Planned |
| 5 | Follow-up suggestions from a local model | Planned |

Moved forward from fourth place at the patron's request of 2026-09-30: "let's determine what's the best way of tracing. I think that should be our next step."

**Goal.** Show what was triggered, when and by whom, and let the patron see a posting's whole path as one trace: each message and reply, each tool, MCP and subagent call, each hook, each Party Leader session and Adventurer run, with the model, effort, time and cost of each.

**Scope.** The build plan in [tracing-design.md](tracing-design.md#build-plan): spans in the register, one row per span with a JSON attribute column, with `gm trace` as a text waterfall, `gm stats` for the derived measures (time to first reply, exchanges, steps to success, cost per posting), each a query and never stored, and `gm stats --compare <selection>` to see what sets a selection apart; Claude Code's own telemetry, with prompts and responses captured and secrets redacted, into a local OpenTelemetry Collector and imported into the register; a local Jaeger beside `gm trace`; every prompt template versioned by hash, with `gm stats --by-prompt` comparing outcomes per version; and follow-up suggestions from a local model, with a probability, beside the patron's own `--follows` tags (build slice 5).
The three habits taken from the Honeycomb study ([honeycomb/lessons.html](../honeycomb/lessons.html)) are in the design: wide span rows, identifying details on every span, and `--compare`.
The Adventurer spans the design defines are built with step 3, where Adventurers first exist; so are the writ template hashes the consultation put in this step, since writs arrive there too.

**Done when** (proposed in [tracing-design.md](tracing-design.md#build-plan), for the patron's agreement): the patron sends a message, the Party Leader answers it with a tool call, an MCP call and a subagent, and `gm trace` shows that tree with its times, tool names, model and effort; `gm stats` gives time to first reply, exchanges, steps, and tokens and cost per posting by model and effort; `gm stats --compare` ranks what sets a selection apart; `gm stats --by-prompt` compares outcomes per prompt version; Jaeger shows the same posting as a waterfall; and nothing is sent anywhere but `127.0.0.1`.

## Step 3: Adventurers and enforced rules

**Status:** Planned. No PR yet. It was the next step until the patron moved tracing ahead of it on 2026-09-30.

**Goal.** The Party Leader stays answerable while Adventurers do the work, and the rules the playbook states are enforced, not only asked for.

**Scope.** `gm dispatch` runs a headless `claude -p` Adventurer in the camp, one contract at a time per ticket and surveys in parallel; results land in the register and wake the Party Leader; `PreToolUse` rules in every camp allow or deny from the playbook's push rules; `gm check` runs after every Adventurer and reopens a posting that broke a rule; the dispatch cap; `TRACEPARENT` is set per posting.
With it come the Adventurer spans of [tracing-design.md](tracing-design.md#how-the-trace-context-travels) (the dispatch span, `TRACEPARENT`, a preassigned `--session-id`, the resource attributes, the run's result) and the hash of each writ and its template.

**Done when** the patron can keep talking to the Party Leader while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch.

## Step 4: Several Party Leaders and the Guildmaster lobby

**Status:** Planned. No PR yet.

**Goal.** More than one focus at once, with a quiet front desk that knows everything and says little.

**Scope.** `gm roster`, a Guildmaster session holding only the roster, phase-change digests, history questions answered from events, one tab per Party Leader, the guild line in every status line.

**Done when:** not yet stated in [consultation.md](consultation.md#build-order); whoever starts this step writes it, with the patron's agreement, in the PR that starts it.

## Step 5: The other kinds

**Status:** Planned. No PR yet.

**Goal.** Party Leaders beyond the ticket.

**Scope.** `incident` (survey-heavy, ends in a field report), `recurring` (a launchd agent calling `gm wake`), `project` (several tickets under one focus).

**Done when:** not yet stated in [consultation.md](consultation.md#build-order); to be written when the step starts.

## Step 6: Hardening

**Status:** Planned. No PR yet.

**Goal.** Make the guild survive reboots, sleep, quota limits and months of use.

**Scope.** A muster at every start that reconciles the register with `git worktree list` and live sessions; nightly backups; the quota cap and rate-limit pause; the `PreCompact` note (already built in step 1, see [step-1-design.md](step-1-design.md#what-changed-from-the-consultation)); ending idle sessions and waking them on demand.

**Done when:** not yet stated in [consultation.md](consultation.md#build-order); to be written when the step starts.

## Decisions so far

From [patron-answers-2026-09-29.md](patron-answers-2026-09-29.md) and [step-1-design.md](step-1-design.md):

- The role once called Chapter Master is the **Party Leader**.
- `gm` is written in bash, with the `sqlite3` command-line tool (Q20, Q9).
- Postings and state live in one register behind `gm`; people-facing text (charter, playbooks, rules) stays in plain files; neither is touched except through `gm` (Q9).
- A focus gets a short name when it is opened (`appt-v2`) with its ticket keys attached (`CRM-8965`); a posting is `<focus>#<n> <slug>`, for example `appt-v2#12 fix-owner-empty` (Q7, Q23).
- The patron works inside each Party Leader's own tab; the Guildmaster is a quiet front desk (Q1).
- Each playbook says when to push: pushing to the shared development branch is allowed, `integration` only through a merge request, `master` never (Q3, Q5).
- Opening a merge request needs the patron's word (Q6).
- Persistence never depends on the model remembering to save, supervisors catch and correct a worker that breaks the rules, and quota use must fall (the patron's three new requirements).
- Tracing is the next step, ahead of Adventurers (the patron, 2026-09-30).
- Tracing answers of 2026-10-02: both `gm trace` and a local Jaeger; the patron tags follow-ups and a local model suggests them with a probability; full command text kept; a local OpenTelemetry Collector; prompts captured, to find which prompt works best ([tracing-design.md](tracing-design.md#questions-for-the-patron)).

## Open questions

The still-open questions are in [consultation.md](consultation.md#questions-for-the-patron); the ones not marked answered there are Q2, Q8, Q11 to Q19, Q21 and Q22 (Q10, the trace viewer, was answered on 2026-10-02: both), and Q4 (branch names), which the patron deferred.
Those that most affect the next steps: the three the tracing design still asks the patron ([questions](tracing-design.md#questions-for-the-patron)), Q4 (the branch names the push rules need), Q13 and Q14 (quota and models, for the dispatch cap), Q22 (when the Guildmaster may talk to a Party Leader unasked) and Q21 (terms that may follow the rename).
