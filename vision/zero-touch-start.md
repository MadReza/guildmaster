# Zero-touch start: the patron runs `gm`, then talks

The patron asked, on 2026-10-03, whether they or the AI have to run `gm init`, `gm autostart on` and `gm open`. They answered their own question the same day; it reached the guild as the supervising agent's rendering of the patron's words, and is recorded here as relayed:

<!-- relayed: begin -->

"No. It should be done auto. User should know the least amount. So user starts Claude. First check is done. Inits. Autostart is always on. Guildmaster needs to take care of starting the new herdr tabs with the party leader."

<!-- relayed: end -->

Until this change the patron ran those commands by hand (README.md as of <https://github.com/MadReza/guildmaster/pull/21> and <https://github.com/MadReza/guildmaster/pull/22>).
This document says how the patron now starts the guild with one command and does everything else by talking, as built in `bin/gm`.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s. The step this pulls forward is step 4 of [roadmap.md](roadmap.md), the Guildmaster at the front desk.

## The one thing the patron knows: `gm`

The patron types `gm`, with nothing after it, in any terminal.
It opens herdr at the `guildmaster` tab, where the Guildmaster sits: a Claude Code session.
From then on the patron talks.

"The user starts Claude" could also mean typing `claude` in some folder. That was weighed and set aside:

| Entry | For | Against |
| --- | --- | --- |
| **`gm`** (chosen) | Works from any terminal and any folder. Prepares the Guildmaster's folder before Claude Code starts, and lands the patron in herdr, where the Party Leaders' tabs are. Inside herdr it only switches to the tab. | One more name than `claude`, but it is the command the patron installed. |
| `cd ~/.guildmaster/front-desk && claude` | Literally "starts Claude". | Two things to remember. The folder must already exist with its settings, so something has to run first. It runs outside herdr, so the Party Leaders' tabs are in another place, and the guild's own Guildmaster tab would be a second Guildmaster. |
| A global `SessionStart` hook in `~/.claude/settings.json` | Any `claude` would do. | It would touch every Claude Code session the patron runs, at work and elsewhere. |

## What `gm` does

1. **Required pieces.** If bash, sqlite3 3.38+, git, Claude Code, herdr or the standard tools are missing, it says plainly what to install (with the official install for herdr) and stops.
2. **The front desk's folder.** It writes `~/.guildmaster/front-desk/` (below).
3. **The muster.** Under the Guildhall's `herdr.lock`, it starts herdr's server if none runs and finds or makes the `guild` workspace. It starts the Guildmaster in the workspace's first tab when that tab holds only a shell, and brings every Party Leader up ([herdr-design.md](herdr-design.md)). A Guildmaster already running is left as it is; a held one's hold is cleared first, as `gm open` clears a Party Leader's.
4. **Autostart.** It turns the launchd agent on if it is not loaded, unless the patron turned it off (below).
5. **herdr.** At a terminal it focuses the guild workspace and the `guildmaster` tab and replaces itself with `herdr` (`herdr --session <s>` for another session). Inside herdr (`HERDR_ENV` set) it only switches tabs. Without a terminal, or with `GM_ATTACH=off`, it prints one line saying where the Guildmaster is and returns.

The first time, Claude Code asks whether to trust the front desk's folder; the patron answers once, in the tab.

## The front desk's folder

| Path | Whose | What |
| --- | --- | --- |
| `front-desk/CLAUDE.md` | the patron's | The Guildmaster's charter, copied once from `templates/guildmaster.md` and never overwritten. |
| `front-desk/.claude/settings.local.json` | gm's | Kept current by `gm` and by `gm start guildmaster`: the `SessionStart` hook, `gm` allowed without a prompt, the Edit, Write and NotebookEdit tools denied, and the environment that points the Guildmaster's `gm` at the same Guildhall, herdr session and launchd folder. |

The folder is a sibling of `camps/`, never above it. Claude Code reads `CLAUDE.md` from a session's folder and from every folder above it (<https://code.claude.com/docs/en/memory>), so a charter at the Guildhall's root would load into every Party Leader under `camps/`.

## The Guildmaster is kept running like a Party Leader

The `guildmaster` tab, the front desk since [herdr-design.md](herdr-design.md), now runs the Guildmaster instead of a shell.
Its pane runs `gm start guildmaster --pane <pane>`, which refreshes the folder's files, clears the Claude Code variables a herdr server may have inherited, and `exec`s `claude --name guildmaster` in the folder. Like `gm start <focus>`, it runs only in the pane the register records for it.

Every muster (`gm`, `gm up`, `gm open`, the launchd agent, the muster before terminal commands, and the Guildmaster's own start) checks the front desk first, with the same classifier and states as a Party Leader (alive, starting, dead, missing, unknown, held).
A dead one is started again in its own pane. After 3 starts in a row never seen alive it is held, told once, until the patron runs `gm`.
Schema 4 adds `start_attempts`, `held_at` and `held_told` to the `endpoint` table for this; an older register is migrated in place, adding only.
The ledger gets `front-desk.launched` and `front-desk.held`, and `gm roster` shows the front desk's state and when it last started.

## The Guildmaster's start, with no patron action

The folder's `SessionStart` hook runs `gm hook front-desk` at every session start (startup, resume, clear, compaction):

1. **The first-run check, without questions.** If a required piece is missing, the Guildmaster is told what and asked to say it plainly; nothing else runs. Otherwise `initialized` is recorded in `setup.conf`, if it was not already.
2. **Autostart, always on.** The launchd agent is written and loaded only when it is not already loaded, so a repeat changes nothing. `gm autostart off` records `autostart: off` in `setup.conf`, and from then on nothing turns it back on until `gm autostart on`. On a system without launchd it says so and does nothing.
3. **The muster**, as above, printing only what it changed.
4. **A short summary for the Guildmaster**, injected as the hook's context and never shown on the patron's screen: the setup in one line, what the muster did (marked routine, not to be mentioned unless asked), anything to tell the patron once (a held Party Leader or Guildmaster, a start that failed, autostart that could not be turned on), the collector offer when due, and the roster.

The hook prints only its JSON. A second, third or tenth start prints the same summary, without the offer, and starts and loads nothing again.

### The optional piece: offered in chat, once

While the tracing collector is neither installed nor skipped, the summary asks the Guildmaster to offer it once, in one line, after its first answer, at most once a day (`collector-offered` in `setup.conf`).
The patron answers in plain words, and the Guildmaster records the answer through `gm`: `gm init --yes` installs it (the checksum-checked install of the first-run check), `gm init --no` skips it, and never again, and `gm init --later` defers it to another day.
Nothing is decided for the patron: an unanswered offer records nothing but its date.

## Opening a Party Leader from the front desk

The patron asks in plain words: "start a focus for CRM-1234 in the appointments repo".
The charter has the Guildmaster:

1. take the ticket key from the words;
2. run `gm repos appointments`, which lists the repositories `gm` knows from its focuses, then git clones whose folder name contains the word under the usual source folders (`~/IdeaProjects`, `~/src`, `~/work`, `~/code`, `~/projects`, `~/dev`, `~/git`, `~/repos`, `~/Developer`, `~/workspace`, four levels deep, or the folders in `setup.conf`'s `repo-roots:`); exactly one is used, and otherwise it asks one short question naming at most three;
3. run `gm open --repo <path> --ticket CRM-1234`; with a ticket and no name, the focus is named after the ticket, `crm-1234`;
4. tell the patron in one line which tab the Party Leader is in, from the line `gm open` now ends with: `crm-1234's Party Leader is in herdr tab crm-1234 (workspace guild, pane w1:p2); see it with: herdr`.

`gm open` was already non-interactive. This change makes that a tested guarantee:

- It needs no terminal: the first-run questions and the muster before commands never run without one, and nothing reads stdin.
- It creates the Party Leader's tab with `--no-focus`, or reuses the recorded one, so the Guildmaster's tab keeps the patron's attention.
- It never runs Claude Code in the caller's terminal: it types the launch line into the new pane and returns.
- A running Party Leader is left as it is, so asking again launches nothing twice.
- It refuses the name `guildmaster`, which is the front desk's.

## What the Guildmaster may and may not do

The charter (`templates/guildmaster.md`) makes it the quiet front desk of [patron-answers-2026-09-29.md](patron-answers-2026-09-29.md) (Q1) and of the consultation's section 2: it knows everything the register knows, says little, and never relays routine monitoring.
It answers from the register when asked (`gm roster`, `gm list`, `gm show`, `gm where`, `gm stats`, `gm trace`).
It never does a Party Leader's work: no code, builds, tests or investigation in a repository, no pushes or merges, and no talking to a Party Leader on its own initiative (Q22 is still open).
The denied file-editing tools enforce part of this, in keeping with the patron's requirement (b) that rules be enforced and not only asked for.

## How it was checked

`tests/run.sh`, against the herdr stub and a launchctl stub, with the launchd folder inside the test's own directory, so no real agent is ever installed:

- `gm` alone: the front desk recorded, the Guildmaster started once in its pane with `claude --name guildmaster` in its folder and without the server's Claude Code variables, the charter copied once and never overwritten, the settings (hook, denied edits, herdr session), and no `CLAUDE.md` above the camps. Run again, it starts nothing. At a terminal it attaches herdr at the front desk's tab; inside herdr it only switches to it; without a terminal it prints one line. A missing herdr stops it with the install instructions.
- The hook: valid JSON with no message for the patron and nothing on stderr; the first run recorded without a question and without inventing an answer; autostart loaded once; the roster. Four more starts, three of them at once, start nothing, load nothing and offer nothing again. A Party Leader that died is started again and reported as routine.
- A missing required piece is explained to the Guildmaster, and nothing is recorded.
- The collector's answer recorded through `gm init --later` and `--no`: later is offered again another day, a skip never.
- `gm autostart off` stays off through the Guildmaster's starts, and `on` turns it back on.
- `gm open` from an agent, with `CLAUDECODE` set and no terminal: the focus named after its ticket, a tab of its own that is not focused, Claude Code never run in the caller's terminal, herdr never attached, a quick return, the one line naming the tab, the same tab reused with nothing launched twice, and the name `guildmaster` refused.
- `gm repos`: one clone for one word, every candidate regardless of case, `node_modules` skipped, known repositories first.
- The schema-1 register migrates to schema 4.

By hand, on 2026-10-03, against real herdr 0.9.1 in an isolated lab session (Firstmate's `fm-herdr-lab.sh`, every herdr call through it, never the default session), with a throwaway repository and Guildhall, a stand-in for `claude` that stays alive under that name (so no model was called), and the launchd folder and `launchctl` replaced by a scratch folder and the stub:

1. `gm` without a terminal started the Guildmaster in the `guildmaster` tab (`w1:p1`) and said where it was; `gm roster` showed it `alive`.
2. The hook, run as Claude Code runs it in the front desk's folder, recorded the first run, loaded the stub launchd agent once, injected the setup line, the collector offer and the roster, and printed nothing on stderr.
3. `gm open --repo <repo> --ticket CRM-1234`, with `CLAUDECODE` set and no terminal, returned in 2 seconds, opened tab `crm-1234` (`w1:t2`) with the Party Leader running in its camp, and herdr still had the `guildmaster` tab focused.
4. `gm open crm-1234` again left it running and named the same tab; the ledger held one launch each.
5. The hook again printed the same summary without the offer, and launched and loaded nothing.
6. With the Party Leader's process killed, the next hook started it again in the same pane and listed that as routine.
7. With the Guildmaster's process killed, `gm` started it again in the same pane, and nothing else.
8. The lab was torn down, and the helper confirmed the default session was unchanged.

## Not in this change

- Telemetry for the Guildmaster's own session; it runs without the collector's environment.
- Trusting folders ahead of time: Claude Code asks once for the front desk's folder and once for each new camp, and `gm` does not edit Claude Code's own configuration to skip that.
- `gm tell` and any talking to a Party Leader (Q22), phase-change digests, and `gm history`: the rest of step 4.
- A systemd timer on Linux, where autostart is reported as not available.
