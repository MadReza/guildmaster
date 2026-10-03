# Guildmaster

An agent fleet supervisor, built from the ground up.

One agent is the patron's single point of contact. It supervises every piece of work and performs none of it directly, dispatching adventurers into isolated camps instead, and answering for what they produce.

This repository is at its beginning. The vocabulary comes first, because every later design document, script, and message depends on it.

## Contents

- [TERMINOLOGY.md](TERMINOLOGY.md) is the single owner of the project's vocabulary. Read it before writing anything else here.
- `firstmate/` holds the research into the prior system this one succeeds, kept separate from Guildmaster's own design.
- `honeycomb/` is a research site on Honeycomb, the hosted observability service: its C4 model, data model, sampling, engineering decisions, and lessons for Guildmaster's tracing. Open `honeycomb/index.html` from disk.
- `vision/` holds Guildmaster's own design material: the patron's notes, the requirements drawn from them, a Firstmate-informed consultation, the [step 1 design](vision/step-1-design.md), and the [tracing design](vision/tracing-design.md) with its [research](vision/tracing-research.md).
- [vision/roadmap.md](vision/roadmap.md) is the tracked build plan: each step's goal, scope, done-when criteria, status and links.
- `bin/gm` is the `gm` command; `templates/` holds the first charter, ticket playbook and repository rules it copies into the Guildhall; `tests/` holds its test suite (with the redaction cases and a schema-1 register to migrate) and an end-to-end demonstration.

## Step 1: one ticket that never forgets

Step 1 is one Party Leader for one ticket: a Claude Code session in the ticket's camp whose every patron message, posting, state and phase lives in a register behind `gm`, so a new session picks up where the last one stopped with nothing re-explained.
The design, and the Claude Code contracts it rests on, are in [vision/step-1-design.md](vision/step-1-design.md).

### Install

`gm` needs bash, `sqlite3` 3.38 or later (for its JSON functions), git, and Claude Code.

```sh
git clone <this repository> ~/src/guildmaster
ln -s ~/src/guildmaster/bin/gm ~/.local/bin/gm   # any directory on your PATH
```

The Guildhall, where the register, the charter, playbooks, rules and camps live, defaults to `~/.guildmaster`; set `GM_HALL` to put it elsewhere.

### Open a focus

```sh
gm open appt-v2 --repo ~/work/appointments --ticket CRM-8965
```

This records the focus `appt-v2` with ticket `CRM-8965`, and adds a camp with `git worktree add` on the clone you named, at `~/.guildmaster/camps/appt-v2`, on the ticket's feature branch (`feature/CRM-8965` by default; an existing branch is reused, `--branch` names another).
Your clone is never cloned, moved or switched.
It then writes the camp's own `.claude/settings.local.json` (hooks and status line, nothing global) and starts `claude --name appt-v2` in the camp.
Claude Code asks once whether to trust the new camp folder.

The first time, `gm` copies the charter, the ticket playbook and the repository's rules into the Guildhall (`charter.md`, `playbooks/ticket.md`, `rules/appointments.md`). They are yours to edit; `gm` never overwrites them. The rules file's `feature-branch:` line sets the branch pattern for later focuses on that repository.

### Work in the tab

Talk to the Party Leader as usual. Each message is recorded word for word before Claude sees it, and becomes a posting:

```
appt-v2#1 fix-owner-empty received ("the owner field is empty after save, fix it")
appt-v2#1 fix-owner-empty queued ("the owner field is empty after save, fix it")
appt-v2#1 fix-owner-empty started ("the owner field is empty after save, fix it")
appt-v2#1 fix-owner-empty done: fixed in 3f2a1c ("the owner field is empty after save, fix it")
```

Start a message with an id (`#1 also the edit form`) to add to that posting instead of making a new one.
The status line shows the focus, phase, and posting counts.
A Stop guard keeps the turn going until every posting has a recorded state.

From any terminal:

```sh
gm list appt-v2          # open postings; --all for every one
gm show appt-v2#1        # the patron's words, additions and history
gm where appt-v2         # the resume summary a new session starts from
gm phase appt-v2 build   # the playbook's phases, in order
```

### Kill it and come back

Close the tab, kill the process, or let it compact. Then:

```sh
gm open appt-v2
```

starts a fresh session in the same camp. Its `SessionStart` hook injects the summary built from the register (active and queued postings with your words, parked ones with their reasons, the last notices and messages, the camp's git state), so typing `continue` is enough.

### Try it end to end, safely

```sh
bash tests/run.sh    # the test suite; no model calls
bash tests/demo.sh   # a real Claude Code session in a throwaway repository; uses quota
```

The demo makes a throwaway repository and Guildhall under a temporary directory, sends ten patron messages in a row and checks that all ten are recorded with their words and states, then kills a session mid-posting and shows a fresh session resuming from the register when told only `continue`.

## Tracing: slice 1

Each posting is one trace, kept as span rows in the register beside its ledger, so nothing new is installed and nothing leaves the machine.
The design is [vision/tracing-design.md](vision/tracing-design.md); this is its build slice 1.

`gm open` installs record-only hooks beside the step 1 ones (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `SubagentStart`, `SubagentStop`, `StopFailure`, `SessionEnd`); they never block and print nothing.
From them and from `gm`'s own commands the register gets a span for each patron message and its reply (an exchange), each Party Leader turn, tool call, MCP call, subagent, hook and notice, and each session.
The status line records the model, effort and running cost Claude Code reports, so each turn carries them.
A Bash command is stored in full with secrets masked (`<REDACTED:kind>`) before it reaches the register; the known cases are in `tests/redaction-cases.tsv`.
Run `gm open <focus>` once on an existing focus to install the new hooks into its camp.

```sh
gm trace appt-v2#12        # the posting as a text waterfall; a focus name shows every posting and session
gm stats appt-v2#12        # first reply, first notice, total and working time, exchanges, steps, hooks, cost
gm stats appt-v2           # one line per posting, with medians
gm notice 13 queued --follows 12           # #13 continues #12: exchanges count per topic
gm stats --by-prompt charter               # outcomes per version (hash) of the charter
gm stats --compare slow-tools --over 10s   # what sets slow tool calls apart from the rest
```

```
appt-v2#12 fix-owner-empty  done  2h14m  1 exchange  $0.21 est.
├─ exchange 1  "the owner field is empty after save, fix it"  reply in 41s
│  ├─ hook UserPromptSubmit  capture  0.2s
│  ├─ invoke_agent party-leader  opus-5-5 · high  41s  $0.21
│  │  ├─ execute_tool Bash  gm notice 12 started  0.4s
│  │  │  └─ notice started
│  │  ├─ execute_tool mcp__jira__getIssue  1.8s
│  │  └─ execute_tool Agent  Explore  haiku-4-5  14s
│  │     └─ invoke_agent Explore  haiku-4-5 · none  13s
│  └─ hook Stop  guard allow  0.2s
└─ notice done: fixed
```

`--compare` takes `slow-tools` (over 30s by default), `slow-hooks` (1s), `slow-replies` (2m) and `not-right-first-time`.
Every measure is computed from the spans when asked; none is stored.
Per-call model, token and cost figures need Claude Code's own telemetry, which is slice 2; until then cost is the status line's estimate per turn.
Postings made before this step have their ledgers (`gm show`) and no spans.

## Prior art

Guildmaster follows Firstmate, a working system of the same shape. The research folder records how that system works in depth, so the successor is designed from understanding rather than from memory.
