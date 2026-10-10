# Guildmaster

An agent fleet supervisor, built from the ground up.

One agent is the patron's single point of contact. It supervises every piece of work and performs none of it directly, dispatching adventurers into isolated camps instead, and answering for what they produce.

This repository is at its beginning. The vocabulary comes first, because every later design document, script, and message depends on it.

## Contents

- [TERMINOLOGY.md](TERMINOLOGY.md) is the single owner of the project's vocabulary. Read it before writing anything else here.
- `firstmate/` holds the research into the prior system this one succeeds, kept separate from Guildmaster's own design.
- `honeycomb/` is a research site on Honeycomb, the hosted observability service: its C4 model, data model, sampling, engineering decisions, and lessons for Guildmaster's tracing. Open `honeycomb/index.html` from disk.
- `vision/` holds Guildmaster's own design material: the patron's notes, the requirements drawn from them, a Firstmate-informed consultation, the [step 1 design](vision/step-1-design.md), the [herdr design](vision/herdr-design.md) (Party Leaders kept running and brought back), the [zero-touch start](vision/zero-touch-start.md) (the patron starts `claude` in the clone, and talks to the Guildmaster in herdr), the [tracing design](vision/tracing-design.md) with its [research](vision/tracing-research.md), and the [veil design](vision/veil-design.md) (the deeds drawn out of the chat, and back in).
- [vision/roadmap.md](vision/roadmap.md) is the tracked build plan: each step's goal, scope, done-when criteria, status and links.
- `.claude/settings.json` makes `claude`, started at the clone's root, start the guild and the Guildmaster in herdr: its start-up hook and tool guard act only in the patron's plain clone (or a folder marked `.gm-front-desk`) and do nothing in a linked worktree, where agents that change Guildmaster work. `CLAUDE.md` is their guidance, not the Guildmaster's charter.
- `mods/guild-chat/` is the Claude Code mod that draws the chat under heraldic banners while `guild.conf` says `chat: banners`, draws the veil over the deeds while it says `veil: on`, and draws the working sprites while it says `sprites: on`.
- `mods/guild-spyglass/` is the Claude Code mod of the spyglass, the pane `/spyglass` opens beside the chat.
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

The Guildmaster always lives in herdr, the terminal workspace manager: in the `guildmaster` tab of its `guild` workspace, with each Party Leader in a workspace of its own shown under it.
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
Guildmaster:  crm-1234 is open: its Party Leader is in herdr workspace └ crm-1234. Claude Code will ask once to trust the folder.
```

It finds the repository among the clones it knows and those under your usual source folders, or asks you one short question.
It opens the Party Leader in a herdr workspace of its own and never in its own terminal, and tells you which one.
Switch to that workspace to work on the ticket with its Party Leader.

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

### Configuration

The guild's settings are in one plain file, `guild.conf` in the Guildhall (`~/.guildmaster/guild.conf`), which documents each setting at its top.
Ask the Guildmaster in plain words ("keep the tracing collector running", "check every 10 minutes") and it runs `gm config set` for you; by hand:

```sh
gm config                          # every setting, its value, and where it came from
gm config set collector on         # keep the tracing collector running
gm config set autostart-every 10   # the launchd agent's muster every 10 minutes
gm config unset collector-port     # back to the default
```

```
Settings, from /Users/you/.guildmaster/guild.conf (gm config set <key> <value> changes one):
  collector               on        guild.conf
  collector-port          4318      default
  telemetry               on        default
  autostart               on        default
  autostart-every         10        guild.conf
  herdr-session           default   default
  ...
```

| Setting | Values | Default | Overridden by |
| --- | --- | --- | --- |
| `collector` | `on`, `off`, `later` (not decided) | off | `GM_COLLECTOR` |
| `collector-port` | a port on 127.0.0.1 | 4318 | `GM_OTEL_PORT` |
| `telemetry` | `on`, `off` | on | `GM_TELEMETRY` |
| `chat` | `banners`, `off` (see The chat, below) | banners | `GM_CHAT` |
| `veil` | `on`, `off` (see The veil, below) | off | |
| `veil-hides` | any of `deeds`, `adventurers`, `notes`, `progress` | all four | |
| `sprites` | `on`, `off` (see The working sprites, below) | on | |
| `sprites-guildmaster`, `sprites-party-leader` | any of the sprites | `quill`; `skirmish delve boss siege forge wall` | |
| `idle-guildmaster`, `idle-party-leader` | any of the sprites, or `none` | `campfire`; `none` | |
| `autostart` | `on`, `off` | on | |
| `autostart-every` | minutes | 5 | |
| `muster-before-commands` | `on`, `off` | on | `GM_HERDR_AUTO` |
| `attach` | `on`, `off` (`gm` alone attaches herdr) | on | `GM_ATTACH` |
| `herdr-session`, `herdr-workspace` | names | `default`, `guild` | `GM_HERDR_SESSION`, `GM_HERDR_WORKSPACE` |
| `launch-grace` | seconds a fresh start may hold only a shell | 60 | `GM_LAUNCH_GRACE` |
| `start-tries` | starts in a row before something is held | 3 | `GM_START_TRIES` |
| `repo-roots` | folders where `gm repos` looks | the usual source folders | |

An environment variable overrides its setting for the command it is set on, and `gm config` says so; a value gm cannot take is ignored, and `gm config` and `gm doctor` say that too.
`gm config set` acts at once where it can: autostart is turned on or off, or reloaded at its new interval, and the collector is started or stopped.
The rest takes effect at the next muster, or the next session gm starts.
The file also keeps what gm recorded: the first run (`initialized`), and where `gm init` put the collector.
A Guildhall from before this file had `setup.conf`; the first `gm` command moves its lines into `guild.conf` (the collector's `installed` and `skipped` become `on` and `off`) and keeps the old file as `setup.conf.old`.

### The chat: heraldic banners

The Guildmaster and every Party Leader that gm starts load the mod in `mods/guild-chat/` (a Claude Code plugin of function hooks), whatever the chat setting, since it also carries the veil (below). By default (`chat: banners`) it sets each message of the chat under a coloured rule naming who speaks:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ⚜ PATRON ━━
  Read the three modules and tell me what they do.
── ⚒ DEEDS ───────────────────────────────────────────────────
  Read 3 files
── ⛨ ADVENTURER · scout-auth ─────────────────────────────────
━━ ⚔ GUILDMASTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  The three modules are small, and the server only serves /health.
```

The patron's banner is gold and hangs on the right; the Guildmaster's is crimson; a Party Leader's is royal blue and names its focus (`⚔ PARTY LEADER · guild-chat`); tool calls (deeds) are steel grey and adventurers (Claude Code's subagents) green, each under a light rule.
Only the drawing changes: what the model reads, and the stored conversation, stay as they were.
A `claude` started by hand at the clone's root gets the same chat from its first message: the clone's `.claude/skills/guild-chat` entry (a link to `mods/guild-chat`) makes Claude Code load the mod in a trusted checkout, as Firstmate does with its Calm mod, and the mod reads `chat:` from `guild.conf` itself.
Nothing is installed and no settings file is written; a session gm starts is told the chat's style by gm instead (`GM_CHAT`), and gets the mod by `--plugin-dir` only where its folder does not load it already. Someone without a Guildhall keeps Claude Code's own chat.
For Claude Code's own chat, `gm config set chat off` (or ask the Guildmaster): the mod still loads, and draws no banners. A session keeps the chat it started with, so the change takes effect at its next start.
The mod's own tests run with `claude plugin test mods/guild-chat`.

### The veil

The veil is the chat's quiet view, Guildmaster's take on Firstmate's Calm: while it is drawn, the deeds and the rest of the work done on the patron's behalf are drawn out of the chat, and the patron sees who asked and who answered.
It is off until the patron draws it, in any session at the front desk or a Party Leader's:

| Command | Does |
| --- | --- |
| `/veil` | Turns the veil the other way, saves it, and redraws this session. |
| `/veil on`, `/veil off` | Sets it outright. |
| `/veil refresh` | Reads `guild.conf` again and redraws this session at once. |

It answers with a toast under the prompt (`The veil is drawn`, `The veil is lifted`), never a row in the chat.
It is one choice for the whole guild, `veil` in `guild.conf`, saved through the guild's own `gm` (`~/.local/bin/gm config set veil on|off`); when that `gm` cannot save it, the veil stays as it was and the toast says why.
Every other session follows at its next turn (a message in or out), at the cost of one look at the file's time, or at once with `/veil refresh`; an idle one does nothing until then.

What it hides is `veil-hides` (`gm config set veil-hides deeds notes`, or ask the Guildmaster), any of:

| Kind | Rows |
| --- | --- |
| `deeds` | tool calls, their results and their folded groups |
| `adventurers` | an adventurer's call (`⛨ ADVENTURER · …`) and its return |
| `notes` | narration between deeds: one line under 240 characters from a step that went on to call tools, and every summary Claude Code draws in place of what the model wrote between two tool calls |
| `progress` | the dim hint under a running deed, `(ctrl+b to run in background)` |

A hidden row goes with its banner. A deed that failed or was interrupted hides like any other: the Guildmaster or the Party Leader tells the patron afterwards.
The veil never hides the patron's messages, a message routed from another session, the reply that ends a turn, longer narration Claude Code draws as written, or anything from a step that ran out of tokens or out of room (`max_tokens`, `model_context_window_exceeded`): that one the patron must see, since the session is stuck there.
Nor can it hide what Claude Code draws outside the chat: permission and question dialogs, and the working row, which still says a session is busy.
It hides from the screen only: the model, the stored conversation, `--continue` and exports are unchanged.

### The working sprites

While a turn runs, the mod draws a two-row sprite in place of Claude Code's working row, in Claude orange, moving on its own clock, with the turn's time and tokens on two lines to its right; while Claude Code says the session is waiting on something (compacting, say), its own row stays beneath.
Like Claude Code's word, the sprite is drawn at random each turn, and never the same one twice in a row, from the ones `guild.conf` names for the session's role:

| Setting | Default | Drawn |
| --- | --- | --- |
| `sprites-guildmaster` | `quill` | while the Guildmaster works |
| `sprites-party-leader` | `skirmish delve boss siege forge wall` | while a Party Leader works |
| `idle-guildmaster` | `campfire` | above the Guildmaster's prompt while it waits |
| `idle-party-leader` | `none` | above a Party Leader's prompt while it waits |

The sprites: `skirmish` (an adventurer holds the corridor against slimes and counts the kills), `delve` (the party walks a torchlit corridor), `boss` (a knight brings down a dragon), `siege` (a crew rams a castle gate until the guild's flag goes up), `forge` (a smith draws out a sword on the anvil), `wall` (a mason lays a wall in running bond), `quill` (the Guildmaster writes an entry in the ledger) and `campfire` (a fire at the camp).
Both rows are ones Claude Code redraws in place, so a sprite never enters the chat: it is gone when the turn, or the wait, ends.
`gm config set sprites off` (or ask the Guildmaster) turns them all off; `gm config set sprites-party-leader forge wall` and the like choose them. Every session follows a change at its next turn.
They are drawn in a terminal only, and only for a patron with a Guildhall.
### The spyglass

The spyglass is a pane beside the chat whose tabs show the party's work. It never opens by itself:

| Command | Does |
| --- | --- |
| `/spyglass` | Opens the pane, or closes it when it is open. |
| `/spyglass open`, `/spyglass close` | Sets it outright. |

The pane also closes from its own close mark or ctrl+x x, and ctrl+x tab gives it the keyboard.
In Claude Code's fullscreen layout it docks beside the chat; on the main screen (under tmux, for one) it opens above the prompt.
Every session gm starts loads the mod in `mods/guild-spyglass/`, as it does guild-chat, and a `claude` started by hand in the clone loads it from `.claude/skills/guild-spyglass`.
The tabs follow where the pane is opened: the Guildmaster's front desk, a Party Leader's camp, or any other session; the last tab chosen is kept for the session.
Its tabs:

| Tab | Shown at | Shows |
| --- | --- | --- |
| Postings | the front desk, a Party Leader | the quest board, from `gm list --json`: a Party Leader's own focus, or every focus at the front desk under its name. A press on a posting opens it to its summary, its last notice line and, when parked, why; *Show finished* adds the done and closed ones. |

While the pane is up it reads what its tabs show again every 5 seconds, and at once after a `gm` command of its own session's, so a change made in any session shows soon; it stops when the pane closes.
It runs the guild's own `gm` (`~/.local/bin/gm`, only when that is a link to a gm), never a camp's draft of it, so a tab says why when that `gm` cannot answer.
The mod's own tests run with `claude plugin test mods/guild-spyglass`.

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

This records the focus `appt-v2` with ticket `CRM-8965`, makes its camp, and starts its Party Leader, `claude --name appt-v2` in the camp, in a workspace of its own in herdr, whichever terminal you ran `gm open` from; it never takes over that terminal and needs none, so the Guildmaster runs it the same way.
With `--ticket`, the name may be left out: `gm open --repo ~/work/appointments --ticket CRM-8965` names the focus `crm-8965`.
`--branch` names another branch; `gm open` on an existing focus leaves a running Party Leader as it is, and reopens a closed one.
It ends with one line saying which workspace the Party Leader is in.
`gm repos appointments` lists the clones the Guildmaster would consider; the `repo-roots` setting (folders separated by spaces, see Configuration) replaces the usual source folders it searches.

#### The workspaces, and keeping them running

Everything lives in herdr's default session.
The `guild` workspace holds the `guildmaster` tab (the front desk) and, with the `collector` setting on, the `collector` tab.
Each focus has a workspace of its own on its camp, labelled `└ <focus>` and placed right under `guild` in herdr's sidebar, so the sidebar shows the guild and its Party Leaders together, each with its branch:

```
guild
main
└ appt-v2
feature/CRM-8965
└ saved-views
feature/saved-views
```

herdr's sidebar is one flat list, so the nesting is the label and the place, as Firstmate does for its crew.
A Party Leader started before this layout stays in its tab of `guild` while it runs, and moves to a workspace of its own the next time it is started.

```sh
gm roster           # the front desk's Guildmaster and each Party Leader: pane and state
gm up               # the muster: start again whatever is dead or missing; leave the running ones alone
gm close appt-v2    # retire a focus: not started again (end its Party Leader first); camp and postings kept
                    # (its Party Leader may run it itself once every posting is finished: gm ends it after its turn)
```

```
guildmaster              front desk    alive    w1:p1    idle · last started 2026-10-03 19:20
appt-v2                  party leader  alive    w2:p2    idle · last started 2026-10-03 19:28
saved-views              party leader  dead     w3:p3    the pane holds only a shell · last started 2026-10-03 09:02
```

States are `alive`, `starting` (just launched), `dead` (its pane holds only a shell), `missing` (no pane), `held` and `unknown`.
With the `collector` setting on, the roster also lists the tracing collector, in its own `collector` tab.
The muster also runs before any other `gm` command you type in a terminal, quietly.
A held Party Leader starts again with `gm open <focus>`, a held Guildmaster with `gm`.
The design, and how it follows and differs from Firstmate, is [vision/herdr-design.md](vision/herdr-design.md).
The `herdr-session` and `herdr-workspace` settings (or `GM_HERDR_SESSION` and `GM_HERDR_WORKSPACE`) choose another herdr session and workspace; `muster-before-commands: off` (`GM_HERDR_AUTO=off`) stops the muster before other commands; `attach: off` (`GM_ATTACH=off`) keeps `gm` from attaching herdr.

#### Autostart

The Guildmaster turns autostart on by itself: on macOS, a launchd agent runs `gm up --quiet` at login and every 5 minutes, and writes to `autostart.log` in the Guildhall. Its `PATH` always includes `~/.local/bin`.

```sh
gm autostart        # is it on?
gm autostart off    # stop it; it stays off until you turn it back on
gm autostart on     # turn it back on (--every MINUTES changes the interval)
```

`gm autostart off` is recorded in `guild.conf` (`autostart: off`), so the Guildmaster leaves it off, and `--every` as `autostart-every`; `gm config set autostart off` and `gm config set autostart-every 10` do the same. On Linux there is no launchd; Party Leaders come back whenever `gm` runs.

#### First run by hand

The Guildmaster runs the first-run check at every start, without questions, and records it in `guild.conf` in the Guildhall.
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
- Your answer is recorded in `guild.conf` in the Guildhall (see Configuration) as the `collector` setting: *install* sets `collector: on`, so gm keeps it running from then on; *skip* sets `off`; *later* sets `later`. Beside it are where `gm` put the collector and when the Guildmaster last offered it. Later commands respect it and never nag; `gm doctor` keeps reporting the state, and `gm init` (with `--again` to revisit a skip) or `gm config set collector` changes it.
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

With the `collector` setting on (your yes to the install sets it, or `gm config set collector on`), the guild keeps it running: the muster (`gm up`, run by the launchd agent at login and every few minutes, before your terminal commands, and at every start of the Guildmaster) starts it in a herdr tab of its own, `collector`, in the `guild` workspace, and starts it again if it stops.
It never starts a second copy: not while a collector already answers on the port, and only in the pane the register records for it.
It is quiet: checks say nothing, and a start or restart is one row in the ledger (`collector.launched`). A collector that fails to start 3 times in a row is held, and you hear it once, in one line (from the Guildmaster, or the next command you type); gm tries again a day later, or at once with `gm config set collector on`.
With the setting off, nothing runs and nothing is said; turning it off stops the one gm started.

By hand instead:

```sh
gm collector     # in a terminal tab of its own; Ctrl-C stops it (it refuses while one already answers)
gm doctor        # checks the endpoint is loopback, the configuration sends nothing out, and the collector answers
gm open appt-v2  # the Party Leader now exports telemetry to it
```

`gm collector`, and the collector's tab, run `templates/otelcol.yaml` in the foreground: it listens on `127.0.0.1:4318` only (the `collector-port` setting or `GM_OTEL_PORT` moves it), deletes `user.email`, `user.id`, `user.account_uuid`, `user.account_id` and `organization.id` from everything, masks the same secret patterns as `gm`'s own redaction in prompts, responses and commands, and writes `traces.jsonl`, `logs.jsonl` and `metrics.jsonl` under `~/.guildmaster/telemetry/`, rotated at 20 MB and kept 14 days.
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
