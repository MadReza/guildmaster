# Guildmaster roadmap

The single tracked record of Guildmaster's build plan and its progress.
The steps are those of the [Build order](consultation.md#build-order) in [consultation.md](consultation.md), with step 1 as built in [step-1-design.md](step-1-design.md).
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s.

**How to update this file.** Whoever finishes or starts a step updates that step's status and links in the same PR as the work.

| # | Step | Status |
| --- | --- | --- |
| 1 | One ticket that never forgets | Done |
| 2 | Adventurers and enforced rules | Next |
| 3 | Several Party Leaders and the Guildmaster lobby | Planned |
| 4 | Audit and trace view | Planned |
| 5 | The other kinds | Planned |
| 6 | Hardening | Planned |

## Step 1: One ticket that never forgets

**Status:** Done. Merged in <https://github.com/MadReza/guildmaster/pull/13>; design in [step-1-design.md](step-1-design.md).

**Goal.** Attack the patron's two sharpest pains, lost postings and "where am I", for one real ticket, before any Guildmaster or Adventurer exists.

**Scope.** The register and `gm` in bash (`open`, `post`, `resolve`, `list`, `show`, `park`, `phase`, `notice`, `statusline`, `where`); one Party Leader for one real ticket, started by `gm open` as a named interactive Claude Code session in the ticket's camp (a `git worktree` of the existing clone on the ticket's feature branch); the patron's charter, the ticket playbook and one repository's rules as files; the `UserPromptSubmit` capture and `Stop` guard; the `SessionStart` resume from records (requirement 1.8); the three-line status line.
In this step the Party Leader still does the work itself, one posting at a time: a deliberate, temporary shortfall against requirements 1.6 and 1.7 that step 2 removes.

**Done when** the patron can send ten items in a row, walk away, come back, and see all ten with their words and states, and a killed session resumes with nothing re-explained.

## Step 2: Adventurers and enforced rules

**Status:** Next. No PR yet.

**Goal.** The Party Leader stays answerable while Adventurers do the work, and the rules the playbook states are enforced, not only asked for.

**Scope.** `gm dispatch` runs a headless `claude -p` Adventurer in the camp, one contract at a time per ticket and surveys in parallel; results land in the register and wake the Party Leader; `PreToolUse` rules in every camp allow or deny from the playbook's push rules; `gm check` runs after every Adventurer and reopens a posting that broke a rule; the dispatch cap; `TRACEPARENT` is set per posting.

**Done when** the patron can keep talking to the Party Leader while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch.

## Step 3: Several Party Leaders and the Guildmaster lobby

**Status:** Planned. No PR yet.

**Goal.** More than one focus at once, with a quiet front desk that knows everything and says little.

**Scope.** `gm roster`, a Guildmaster session holding only the roster, phase-change digests, history questions answered from events, one tab per Party Leader, the guild line in every status line.

**Done when:** not yet stated in [consultation.md](consultation.md#build-order); whoever starts this step writes it, with the patron's agreement, in the PR that starts it.

## Step 4: Audit and trace view

**Status:** Planned. No PR yet.

**Goal.** Show what was triggered, when and by whom, and let the patron see a posting's whole path as one trace.

**Scope.** Prompt templates owned by the patron with hashes recorded per writ; cost per posting; `gm trace` as a text waterfall; OTLP export and Claude Code's beta tracing into a local Jaeger.

**Done when:** not yet stated in [consultation.md](consultation.md#build-order); to be written when the step starts.

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

## Open questions

The still-open questions are in [consultation.md](consultation.md#questions-for-the-patron); the ones not marked answered there are Q2, Q8, Q10 to Q19, Q21 and Q22, and Q4 (branch names), which the patron deferred.
Those that most affect the next steps: Q4 (the branch names the push rules need), Q13 and Q14 (quota and models, for the dispatch cap), Q22 (when the Guildmaster may talk to a Party Leader unasked) and Q21 (terms that may follow the rename).
