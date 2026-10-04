# Guildmaster

An agent fleet supervisor, built from the ground up.

One agent is the patron's single point of contact. It supervises every piece of work and performs none of it directly, dispatching adventurers into isolated camps instead, and answering for what they produce.

This repository is at its beginning. The vocabulary comes first, because every later design document, script, and message depends on it.

## Contents

- [TERMINOLOGY.md](TERMINOLOGY.md) is the single owner of the project's vocabulary. Read it before writing anything else here.
- `firstmate/` holds the research into the prior system this one succeeds, kept separate from Guildmaster's own design.
- `honeycomb/` is a research site on Honeycomb, the hosted observability service: its C4 model, data model, sampling, engineering decisions, and lessons for Guildmaster's tracing. Open `honeycomb/index.html` from disk.
- `vision/` holds Guildmaster's own design material: the patron's notes, the requirements drawn from them, a Firstmate-informed consultation, the [step 1 design](vision/step-1-design.md), the [herdr design](vision/herdr-design.md) (Party Leaders kept running and brought back), the [zero-touch start](vision/zero-touch-start.md) (the patron starts `claude` in the clone, and talks to the Guildmaster in herdr), and the [tracing design](vision/tracing-design.md) with its [research](vision/tracing-research.md).
- [vision/roadmap.md](vision/roadmap.md) is the tracked build plan: each step's goal, scope, done-when criteria, status and links.
- `.claude/settings.json` makes `claude`, started at the clone's root, start the guild and the Guildmaster in herdr: its start-up hook and tool guard act only in the patron's plain clone (or a folder marked `.gm-front-desk`) and do nothing in a linked worktree, where agents that change Guildmaster work. `CLAUDE.md` is their guidance, not the Guildmaster's charter.
- `bin/gm` is the `gm` command; `templates/` holds the Guildmaster's charter (`guildmaster.md`), the Party Leader's charter, the ticket playbook and the repository rules it copies into the Guildhall, and the local OpenTelemetry Collector's configuration (`otelcol.yaml`); `tests/` holds its test suite (with the redaction cases, a schema-1 register to migrate, and recorded Claude Code telemetry under `tests/fixtures/telemetry/`, and stand-ins for herdr and launchctl so no test touches the real ones, nor your `~/.local/bin`) and an end-to-end demonstration.

## Getting started

### Install, once

You need git, Claude Code, bash and `sqlite3` 3.38 or later (for its JSON functions); macOS comes with all but Claude Code.

```sh
git clone <this repository> guildmaster
cd guildmaster
claude
```

The first time, Claude Code asks once whether to trust the folder; say yes. That session sets the guild up and starts the Guildmaster in herdr, then tells you where it is:

```sh
herdr
```

That is all there is to type.

To change Guildmaster itself, work in a linked worktree of the clone (`git worktree add`): there, `claude` is an ordinary session, and nothing of the guild runs.

### Start: `claude` in the clone, then the Guildmaster in herdr

The Guildmaster always lives in herdr, the terminal workspace manager: in the `guildmaster` tab of its `guild` workspace, with each Party Leader in a tab of its own beside it.
`claude` started in the clone outside herdr is not the Guildmaster. As it starts, with nothing for you to type:

- `gm`, the command behind the guild, is linked into `~/.local/bin` (never with `sudo`, and never over another `gm`).
- If herdr is missing, that session offers to install it, in one line; answer in plain words.
- The first-run check, autostart (always on, so the Guildmaster and every Party Leader come back at login and every 5 minutes), and starting the Guildmaster in herdr, with every Party Leader.

Then it answers anything you say with one line: the Guildmaster is in herdr tab `guildmaster`; open it with `herdr`.
There is only ever one Guildmaster: a `claude` started anywhere else while it runs points to it the same way, and one started in a tab of the `guild` workspace while none runs becomes the Guildmaster there.

The Guildmaster offers one optional piece, the tracing collector, once, in one line; answer it in plain words.
If something required is missing, it says so plainly.

Come back with `herdr`, from any terminal, or `cd guildmaster` and `claude` again.
Detaching from herdr (`ctrl+b q`) or closing the terminal leaves the Guildmaster and every Party Leader running.

### Then talk

Talk to the Guildmaster in plain words:

```
you:          start a focus for CRM-1234 in the appointments repo
Guildmaster:  crm-1234 is open: its Party Leader is in herdr tab crm-1234. Claude Code will ask once to trust the folder.
```

It finds the repository among the clones it knows and those under your usual source folders, or asks you one short question.
It opens the Party Leader in a herdr tab of its own and never in its own terminal, and tells you which tab.
Switch to that tab to work on the ticket with its Party Leader.

The Guildmaster is a quiet front desk: it knows what every Party Leader is doing and answers when asked ("what is open on crm-1234?", "what did appt-v2#12 cost?"), but it never reports routine restarts or checks, and it never does a Party Leader's work itself.
Its charter is `~/.guildmaster/front-desk/CLAUDE.md`, yours to edit; `gm` copies it once, never overwrites it, and hands it to the front desk at every start.
The design is [vision/zero-touch-start.md](vision/zero-touch-start.md).

### Working with a Party Leader

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

#### Kill it and come back

Exit Claude Code (`/exit`), kill the process, close its pane, restart the machine, or let it compact.
The Party Leader comes back on its own: the launchd agent brings it back within 5 minutes, and so does the next start of the Guildmaster.
A fresh session starts in the same camp. Its `SessionStart` hook injects the summary built from the register (active and queued postings with your words, parked ones with their reasons, the last notices and messages, the camp's git state), so typing `continue` is enough.

The checking and restarting is plain code, never a model, and tells no one when all is well: each restart is one row in the ledger.
A Party Leader that fails to start 3 times in a row is held: the Guildmaster tells you once, in one line, the next time it starts, and shows it whenever you ask what is running.
A running Party Leader is never ended or replaced, and one whose state herdr cannot make out is reported, not restarted.

## Advanced: the `gm` command

You never need any of this to use the guild: the Guildmaster runs these commands for you. They are here for advanced use, and for when something needs a closer look.

The front desk links `gm` into `~/.local/bin`. If that folder is not on your `PATH`, add `export PATH="$HOME/.local/bin:$PATH"` to your shell's startup file yourself (the guild never edits it), or run `bin/gm` from the clone.
`gm help` lists every command.

### Install herdr

```sh
gm install herdr    # with Homebrew when it is there, otherwise herdr's official installer; never sudo
```

This is what runs when you say yes to the offer. It then finishes the setup and starts the Guildmaster in herdr. By hand, herdr's official install is `curl -fsSL https://herdr.dev/install.sh | sh`, or `brew install herdr` (<https://herdr.dev/docs/install/>).

### The front desk from any terminal: `gm`

Instead of `claude` in the clone, in any terminal:

```sh
gm
```

It opens herdr at the `guildmaster` tab and starts the Guildmaster there, a Claude Code session in the clone, which gm then keeps running like a Party Leader.
The first time, Claude Code asks once whether to trust the clone's folder.

Everything else happens by itself, with nothing for you to type: the first-run check, autostart (always on, so the Guildmaster and every Party Leader come back at login and every 5 minutes), and bringing every Party Leader up.
The Guildmaster offers one optional piece, the tracing collector, once, in one line; answer it in plain words.
If something required is missing, it says so plainly.

Come back with `gm` again, or attach with `herdr`. Closing the terminal or detaching (`ctrl+b q`) leaves everything running.

### Step 1: one ticket that never forgets

Step 1 is one Party Leader for one ticket: a Claude Code session in the ticket's camp whose every patron message, posting, state and phase lives in a register behind `gm`, so a new session picks up where the last one stopped with nothing re-explained.
The design, and the Claude Code contracts it rests on, are in [vision/step-1-design.md](vision/step-1-design.md).

A focus's camp is a `git worktree` of the clone the Guildmaster found, at `~/.guildmaster/camps/<focus>`, on the ticket's feature branch (`feature/CRM-1234` by default; an existing branch is reused).
Your clone is never cloned, moved or switched.
The camp gets its own `.claude/settings.local.json` (hooks and status line, nothing global).

The first time, `gm` copies the charter, the ticket playbook and the repository's rules into the Guildhall (`charter.md`, `playbooks/ticket.md`, `rules/appointments.md`). They are yours to edit; `gm` never overwrites them. The rules file's `feature-branch:` line sets the branch pattern for later focuses on that repository.

#### Try it end to end, safely

```sh
bash tests/run.sh    # the test suite; no model calls
bash tests/demo.sh   # a real Claude Code session in a throwaway repository; uses quota
```

The demo makes a throwaway repository and Guildhall under a temporary directory, sends ten patron messages in a row and checks that all ten are recorded with their words and states, then kills a session mid-posting and shows a fresh session resuming from the register when told only `continue`.

### The commands behind the front desk

#### Open a focus by hand

```sh
gm open appt-v2 --repo ~/work/appointments --ticket CRM-8965
```

This records the focus `appt-v2` with ticket `CRM-8965`, makes its camp, and starts its Party Leader, `claude --name appt-v2` in the camp, in a tab of its own in herdr, whichever terminal you ran `gm open` from; it never takes over that terminal and needs none, so the Guildmaster runs it the same way.
With `--ticket`, the name may be left out: `gm open --repo ~/work/appointments --ticket CRM-8965` names the focus `crm-8965`.
`--branch` names another branch; `gm open` on an existing focus leaves a running Party Leader as it is, and reopens a closed one.
It ends with one line saying which tab the Party Leader is in.
`gm repos appointments` lists the clones the Guildmaster would consider; a `repo-roots:` line in `setup.conf` (folders separated by spaces) replaces the usual source folders it searches.

#### The tabs, and keeping them running

The tabs live in one herdr workspace, `guild`, in herdr's default session: the `guildmaster` tab (the front desk when it is in herdr; otherwise a shell) and one tab per focus, named after it.

```sh
gm roster           # the front desk's Guildmaster and each Party Leader: pane and state
gm up               # the muster: start again whatever is dead or missing; leave the running ones alone
gm close appt-v2    # retire a focus: not started again (end its Party Leader first); camp and postings kept
```

```
guildmaster              front desk    alive    w1:p1    idle · last started 2026-10-03 19:20
appt-v2                  party leader  alive    w1:p2    idle · last started 2026-10-03 19:28
saved-views              party leader  dead     w1:p3    the pane holds only a shell · last started 2026-10-03 09:02
```

States are `alive`, `starting` (just launched), `dead` (its pane holds only a shell), `missing` (no pane), `held` and `unknown`.
The muster also runs before any other `gm` command you type in a terminal, quietly.
A held Party Leader starts again with `gm open <focus>`, a held Guildmaster with `gm`.
The design, and how it follows and differs from Firstmate, is [vision/herdr-design.md](vision/herdr-design.md).
`GM_HERDR_SESSION` and `GM_HERDR_WORKSPACE` choose another herdr session and workspace; `GM_HERDR_AUTO=off` stops the muster before other commands; `GM_ATTACH=off` keeps `gm` from attaching herdr.

#### Autostart

The Guildmaster turns autostart on by itself: on macOS, a launchd agent runs `gm up --quiet` at login and every 5 minutes, and writes to `autostart.log` in the Guildhall. Its `PATH` always includes `~/.local/bin`.

```sh
gm autostart        # is it on?
gm autostart off    # stop it; it stays off until you turn it back on
gm autostart on     # turn it back on (--every MINUTES changes the interval)
```

`gm autostart off` is recorded in `setup.conf` (`autostart: off`), so the Guildmaster leaves it off. On Linux there is no launchd; Party Leaders come back whenever `gm` runs.

#### First run by hand

The Guildmaster runs the first-run check at every start, without questions, and records it in `setup.conf` in the Guildhall.
The same check runs in a terminal the first time a `gm` command that needs the Guildhall (`open`, `post`, `list`, `trace`, and the rest) runs there before the Guildmaster ever has, and says what is there and what is not:

```
gm: first run. Checking what gm needs; this happens once. gm init runs it again, gm doctor shows the state.
  ok       bash 5.3.15(1)-release
  ok       sqlite3 3.51.0 (JSON functions work)
  ok       git version 2.50.1
  ok       Claude Code 2.1.288 at /Users/you/.local/bin/claude
  ok       herdr 0.9.1 at /Users/you/.local/bin/herdr
  ok       standard tools (sed awk tr grep mktemp and the rest)
  ok       a SHA-256 tool
  missing  otelcol-contrib (the OpenTelemetry Collector): not found

otelcol-contrib (the OpenTelemetry Collector, tracing slice 2, v0.162.0) is not installed.
  Without it, tracing will record gm's own spans but not Claude Code's per-call model, tokens and cost; ...
  i  install it now: the official GitHub release, SHA-256 checked, into a directory you own, no sudo
  s  skip it, I am fine without it
  l  ask me again later (gm init asks again)
```

- **Required** pieces (bash, sqlite3 3.38+ with its JSON functions, git, Claude Code, herdr, `sed` and the other standard tools) are never asked about: if one is missing, `gm` stops with what to install and nothing is recorded.
- **Optional** pieces (today, the collector) are asked about. *Install* downloads the pinned release for your OS and CPU from the official GitHub releases, checks its SHA-256 against the published checksum, and puts `otelcol-contrib` in `~/.local/bin` (or the directory you type, or `--bin-dir`), never with `sudo`; it reports each step, and on any failure, including a checksum that does not match, removes everything it fetched and installs nothing. *Skip* means you are fine without it. *Later* asks again at the next `gm init`, and the Guildmaster offers it again another day.
- Your answer is recorded in `setup.conf` in the Guildhall, a plain `key: value` file you can read and edit (`collector: installed | skipped | later`, where `gm` put the collector, when the Guildmaster last offered it, and `autostart: on | off` once you set it). Later commands respect it and never nag; `gm doctor` keeps reporting the state, and `gm init` (with `--again` to revisit a skip) changes it.
- It never asks without a terminal, and never in a hook or the status line, so nothing blocks. The Guildmaster records your answer with `gm init --yes` (install what is missing), `gm init --no` (go without) or `gm init --later`, and `--bin-dir DIR` chooses where; without an answer, `gm init` only reports.

### Tracing: slice 1

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
Per-call model, token and cost figures come from Claude Code's own telemetry (slice 2, below); without it, cost is the status line's estimate per turn.
Postings made before this step have their ledgers (`gm show`) and no spans.

### Tracing: slice 2, Claude Code's telemetry

Claude Code reports every model call (model, effort, tokens, cost), tool call and prompt as OpenTelemetry traces, logs and metrics.
`gm open` sends them to a local OpenTelemetry Collector on `127.0.0.1` and nowhere else; the collector deletes who you are, masks secrets and writes files under the Guildhall; `gm trace import` folds those files into the register beside the spans of slice 1.
The design is build slice 2 of [vision/tracing-design.md](vision/tracing-design.md#as-built-in-slice-2).

#### Install the collector

`gm init` does this for you (see First run above); by hand, it goes like this. The collector is the official OpenTelemetry Collector, contrib distribution (it has the file exporter and the transform processor), one binary from its GitHub releases; there is no Homebrew formula for it.
On an Apple-silicon Mac (pick the `darwin_amd64` or `linux_*` file otherwise):

```sh
v=0.162.0 f=otelcol-contrib_${v}_darwin_arm64.tar.gz
curl -fLO https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v$v/$f
curl -fL https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v$v/$f.sha256   # compare with:
shasum -a 256 $f
tar xzf $f otelcol-contrib && mv otelcol-contrib ~/.local/bin/   # any directory on your PATH
```

`gm` looks for `otelcol-contrib` on your `PATH`; `GM_OTELCOL` names another path.
It was built and tested with 0.162.0. No binary is kept in this repository.

#### Run it

```sh
gm collector     # in a terminal tab of its own; Ctrl-C stops it
gm doctor        # checks the endpoint is loopback, the configuration sends nothing out, and the collector answers
gm open appt-v2  # the Party Leader now exports telemetry to it
```

`gm collector` runs `templates/otelcol.yaml` in the foreground: it listens on `127.0.0.1:4318` only (`GM_OTEL_PORT` moves it), deletes `user.email`, `user.id`, `user.account_uuid`, `user.account_id` and `organization.id` from everything, masks the same secret patterns as `gm`'s own redaction in prompts, responses and commands, and writes `traces.jsonl`, `logs.jsonl` and `metrics.jsonl` under `~/.guildmaster/telemetry/`, rotated at 20 MB and kept 14 days.
It has no exporter except those files, and serves no telemetry of its own.

`gm open` sets, on the `claude` process it starts and nowhere else, `CLAUDE_CODE_ENABLE_TELEMETRY`, the OTLP exporter pointed at `http://127.0.0.1:4318` (every signal's own endpoint too, and any inherited headers cleared), `OTEL_RESOURCE_ATTRIBUTES=guild.focus=<focus>,guild.role=party-leader`, and `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES` and `OTEL_LOG_TOOL_DETAILS`, so prompts and responses are captured to find which prompt works best.
Tool output (`OTEL_LOG_TOOL_CONTENT`) and raw API bodies are not.
It refuses to start a session when `GM_OTEL_ENDPOINT` is anything but `127.0.0.1`, `localhost` or `::1`, or when your Claude Code settings (`~/.claude/settings.json` or managed settings) send telemetry elsewhere, and warns when no collector answers.
`GM_TELEMETRY=off gm open appt-v2` starts a session without telemetry.
Your other Claude Code sessions are untouched.

#### Read it

`gm trace` and `gm stats` import whatever the collector has written since last time before they answer; `gm trace import` does it by hand and says what it did:

```
$ gm trace import
imported 6 spans (2 merged into gm's own, 2 folded, 2 added) and 5 events: 2 model calls ($0.0401 est.), 1 prompts, 1 responses
session 2c2c6112: 2 model calls, $0.0401 est.; claude_code.cost.usage $0.0401, the same to the cent
```

Each model call becomes a `chat` span under the turn that made it (a subagent's under its `invoke_agent` span), and Claude Code's tool and turn spans merge into the ones the hooks already wrote, matched by `session.id`, `prompt.id`, `tool_use_id` and `agent_id`.
The masked prompt is kept on its turn and the masked response on its model call.

```
$ gm trace appt-v2#12
appt-v2#12 fix-owner-empty  done  2h14m  1 exchange  $0.27 est.
├─ exchange 1  "the owner field is empty after save, fix it"  reply in 41s
│  ├─ hook UserPromptSubmit  capture  0.2s
│  ├─ invoke_agent party-leader  opus-5-5 · high  41s  $0.27
│  │  ├─ chat opus-5-5 · high  in 31k (cached 29k) out 1.2k  $0.20  9.0s
│  │  ├─ execute_tool Agent  Explore  haiku-4-5  14s
│  │  │  └─ invoke_agent Explore  haiku-4-5 · none  13s  $0.02
│  │  │     └─ chat haiku-4-5 · none  in 12k (cached 11k) out 900  $0.02  11s
│  │  └─ chat opus-5-5 · high  in 33k (cached 33k) out 300  $0.05  5.0s
│  └─ hook Stop  guard allow  0.2s
└─ notice done: fixed

$ gm stats appt-v2#12
  …
  cost $0.27 est., from Claude Code's telemetry: opus-5-5/high $0.25 (party-leader, 2 calls) · haiku-4-5/none $0.02 (party-leader, 1 call)
  tokens in 76k (73k read from cache, 3.1k written to it) · out 2.4k
```

When telemetry is on, a turn's cost is the sum of its model calls and the status line's estimate is not added.
`gm stats --compare slow-calls` asks what sets slow model calls apart.
Cost is Claude Code's own estimate, not billing.

## Prior art

Guildmaster follows Firstmate, a working system of the same shape. The research folder records how that system works in depth, so the successor is designed from understanding rather than from memory.
