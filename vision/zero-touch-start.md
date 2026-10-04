# Zero-touch start: the patron starts Claude, then talks

The patron asked, on 2026-10-03, whether they or the AI have to run `gm init`, `gm autostart on` and `gm open`. They answered their own question the same day; it reached the guild as the supervising agent's rendering of the patron's words, and is recorded here as relayed:

<!-- relayed: begin -->

"No. It should be done auto. User should know the least amount. So user starts Claude. First check is done. Inits. Autostart is always on. Guildmaster needs to take care of starting the new herdr tabs with the party leader."

<!-- relayed: end -->

<https://github.com/MadReza/guildmaster/pull/23> built that with `gm` as the one command, but putting `gm` on the `PATH` (a symlink into `~/.local/bin`) and installing herdr were still steps by hand in the README. Later that day the patron asked, again as relayed:

<!-- relayed: begin -->

"Can we not set that at the initialization of claude ? gm could be aliased to something. I would like the commands to only be used by advanced users."

<!-- relayed: end -->

This document says how the patron now starts the guild by starting Claude Code in the clone, and does everything else by talking, as built in `bin/gm` and the clone's `.claude/settings.json`.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s. The step this pulls forward is step 4 of [roadmap.md](roadmap.md), the Guildmaster at the front desk.

## The one thing the patron does: `claude` in the clone

```sh
git clone <the repository> guildmaster
cd guildmaster
claude
```

That Claude Code session is the Guildmaster. Claude Code asks once whether to trust the folder; from then on the patron talks, and comes back the same way.

The repository's own Claude Code configuration does the rest, at the clone's root:

| Path | What |
| --- | --- |
| `.claude/settings.json` | The `SessionStart` hook (`gm hook front-desk --clone`) and a `PreToolUse` guard (`gm hook front-desk-guard`) on Edit, Write, NotebookEdit, MultiEdit and Bash. Both do nothing at all unless this checkout is the patron's front desk (below). No permissions: in committed settings they would bind every contributor. |
| `bin/gm-front-desk-lib.sh` | `gm_front_desk_home`, the one check of whether a checkout is the front desk |
| `CLAUDE.md` | Contributor guidance, as before, opening with one line: it is not the Guildmaster's charter, and the front desk takes its role from the start-up hook |
| `.gitignore` | Keeps what Claude Code writes when the patron answers "always allow" (`.claude/settings.local.json`), and the front desk's marker (`.gm-front-desk`), out of the clone's changes |

### Which checkout is the front desk

Claude Code reads `.claude/settings.json` from the folder it starts in (<https://code.claude.com/docs/en/settings>), so the clone's settings reach every session at its root: the patron's, and every agent's that changes Guildmaster.
`gm` decides which one it is first, before anything else runs, with the check Firstmate uses for its own home (`bin/fm-primary-scope-lib.sh`, `fm_primary_scope_matches`, called by `bin/fm-sessionstart-run.sh`, which stands down otherwise):

- **A plain clone is the front desk.** Its git folder is its own: `git rev-parse --git-dir` and `--git-common-dir` are the same folder, and the clone's top is the folder holding `bin/gm`. That is the patron's checkout, made with `git clone`.
- **A linked worktree is not.** Firstmate's workers change Guildmaster in linked worktrees of it, and a Party Leader's camp is one too. There, the start-up hook and the guard exit at once, silently, with no side effects: no link, no Guildhall, no launchd agent, no herdr, not even a register migrated.
- **A marked folder is, wherever it is.** A file `.gm-front-desk` at the checkout's top, a regular file (never a link) holding one plain word, makes it the front desk, for a patron whose checkout is not a plain clone. `.gitignore` keeps it out of commits, so it never reaches a worktree.

Anything else (no repository, a folder inside another repository, git unable to tell) is not the front desk.

A developer who wants to change Guildmaster in the patron's own plain clone gets the front desk there, by design: as in Firstmate, contributors work in linked worktrees.

### Restrictions that only the front desk has

The front desk's former settings denied the Edit, Write and NotebookEdit tools and allowed `gm` without a prompt. Committed permissions cannot depend on who the session is, so both moved into the guard, `gm hook front-desk-guard`, which runs before those tools and Bash, and acts only at the front desk:

- Edit, Write, NotebookEdit and MultiEdit are denied, with the reason: changing files is a Party Leader's work, in its camp.
- A plain call of this `gm` runs without a prompt: `bin/gm` or `./bin/gm` in the clone's folder, this `gm`'s full path (with or without `bash`), or `gm` when it resolves to this one. Anything a shell treats specially (a second command, a pipe, a redirection, a substitution, a variable) leaves the call to Claude Code's own permissions, as does every other command.
- Elsewhere it prints nothing, and Claude Code's own permissions apply as if it were not there.

The front desk in herdr (below) keeps both as settings: its folder is gm's own, in the Guildhall, and no contributor starts a session there.

It reads the tool call from stdin and never touches the register. If it fails, the command's `|| true` lets the call through to Claude Code's own permissions: a guard that could block every contributor's edits is worse than one that fails open at the front desk, where the charter forbids the same thing.

### Why the clone's root, after all

[PR 24](https://github.com/MadReza/guildmaster/pull/24) put the front desk in a folder of its own, `front-desk/`, and weighed the root first. Its reasons against the root, and what answers each now:

| PR 24's reason against the root | Now |
| --- | --- |
| Root settings reach every agent that changes Guildmaster, so the hook would have to guess who is the patron, and a wrong guess installs a launchd agent and a symlink and starts herdr's server. | It does not guess: the plain-clone-or-marker check is Firstmate's, proven where Firstmate's own workers run in linked worktrees of its repository every day, and a wrong "no" costs nothing. |
| Permissions cannot depend on the role, so the denied edits would become a hook on every tool call, in every contributor's session. | The guard runs on five tools, and in a contributor's worktree it exits before reading anything. |
| The root `CLAUDE.md`, contributor guidance, would be the Guildmaster's too. | Its first line says it is not the charter; the charter comes from the hook, as Firstmate's `AGENTS.md` opens by telling a worker that it follows its launch brief instead. |

And the root is where the patron lands after `git clone`: one `cd` fewer, `cd guildmaster`, as the patron asked ("switch it").

The other entries weighed in PR 24 stand: `gm` alone stays the advanced entry (below), and a global `SessionStart` hook in `~/.claude/settings.json` would touch every Claude Code session the patron runs.

## What the front desk's start does

At the front desk, the hook runs `bash "$CLAUDE_PROJECT_DIR/bin/gm" hook front-desk --clone 2>/dev/null || true` at every session start (startup, resume, clear, compaction), with a 120-second timeout:

1. **`gm` on the `PATH`.** A symlink `~/.local/bin/gm` to this clone's `bin/gm`, the folder made when it is missing, never with `sudo`. Anything already called `gm` there, a file or a link to anything else, even a broken one, is left as it is, and the Guildmaster runs `bin/gm` instead. `~/.local/bin` is where Claude Code's own and herdr's installers put them, so it is usually on the `PATH` already; when it is not, the Guildmaster knows, and mentions it only if asked. No shell startup file is edited.
2. **herdr.** If herdr is missing (on the `PATH` or in `~/.local/bin`) and everything else is there, the Guildmaster is asked to offer it once, in one line: "I need herdr to keep Party Leaders running. Shall I install it now with Homebrew (brew install herdr)?", or with herdr's official installer (`curl -fsSL https://herdr.dev/install.sh | sh`) when there is no Homebrew. Only on the patron's yes does it run `gm install herdr`, which installs it the same way, never with `sudo`, and then finishes the setup below. Nothing else runs until then. Any other required piece missing is told plainly, as before.
3. **The first-run check**, without questions, recorded in `setup.conf`.
4. **The front desk is this session.** `setup.conf` records `front-desk: clone`, and the hook gives the Guildmaster its charter: the patron's own copy, `~/.guildmaster/front-desk/CLAUDE.md`, copied once from `templates/guildmaster.md` and never overwritten, as for the front desk in herdr.
5. **Autostart, always on**, unless the patron turned it off. The launchd agent's `PATH` always has `~/.local/bin`, so it finds herdr and Claude Code there even when launchd's own does not.
6. **The muster**, `gm up`, when there is an open focus: every Party Leader that is dead or missing is started again in its tab.
7. **A short summary for the Guildmaster**, never shown on the patron's screen: the setup, what was done (the link, any restart, marked routine), anything to tell the patron once, the collector offer when due, and the roster.

A second, third or tenth start links, starts and loads nothing again, and prints nothing but its JSON.
If `gm` itself fails, the hook still prints JSON, telling the Guildmaster in one line that the start-up did not finish and why; if `gm` cannot be found, the command prints nothing and exits 0. The session always starts.

## The front desk need not be in herdr

The patron may start `claude` in any terminal, inside herdr or not. That session stays the front desk; nothing moves it into herdr, because moving a running Claude Code session is not possible and starting a second Guildmaster in herdr would leave two.

The muster never needed the front desk: it is plain code, run by the launchd agent at login and every 5 minutes, by `gm` commands and by the front desk's start. So with `front-desk: clone`:

- the muster keeps no Guildmaster in herdr, and brings every Party Leader back whether the front desk is open or not;
- the `guild` workspace's first tab, the `guildmaster` tab, is a shell;
- a Guildmaster still running in that tab from before is left as it is (gm never ends a live session) and not started again once it ends; `gm roster` shows it;
- `gm roster` shows the front desk as `clone`.

`gm` alone, below, sets `front-desk: herdr` again, and the next `claude` in the clone sets `clone`. The last one the patron used is the front desk.

## `gm`, for advanced users

The patron's README now has three lines to type: clone, `cd guildmaster`, `claude`. Every `gm` command is in its "Advanced" section.
`gm` stays the short command for advanced users, and is the Guildmaster's tool. No alias is added, and no shell startup file is edited: the front desk's link is enough wherever `~/.local/bin` is on the `PATH`, and the README says how to add it for those who want to.

## The front desk in herdr: `gm`

`gm`, with nothing after it, opens the front desk in herdr instead, as [PR 23](https://github.com/MadReza/guildmaster/pull/23) built it, and records `front-desk: herdr`:

1. **Required pieces.** If bash, sqlite3 3.38+, git, Claude Code, herdr or the standard tools are missing, it says plainly what to install (with the official install for herdr) and stops.
2. **The front desk's folder.** It writes `~/.guildmaster/front-desk/` (below).
3. **The muster.** Under the Guildhall's `herdr.lock`, it starts herdr's server if none runs and finds or makes the `guild` workspace. It starts the Guildmaster in the workspace's first tab when that tab holds only a shell, and brings every Party Leader up ([herdr-design.md](herdr-design.md)). A Guildmaster already running is left as it is; a held one's hold is cleared first, as `gm open` clears a Party Leader's.
4. **Autostart.** It turns the launchd agent on if it is not loaded, unless the patron turned it off (below).
5. **herdr.** At a terminal it focuses the guild workspace and the `guildmaster` tab and replaces itself with `herdr` (`herdr --session <s>` for another session). Inside herdr (`HERDR_ENV` set) it only switches tabs. Without a terminal, or with `GM_ATTACH=off`, it prints one line saying where the Guildmaster is and returns.

The first time, Claude Code asks whether to trust the front desk's folder; the patron answers once, in the tab.

## The front desk's folder in the Guildhall

| Path | Whose | What |
| --- | --- | --- |
| `front-desk/CLAUDE.md` | the patron's | The Guildmaster's charter, copied once from `templates/guildmaster.md` and never overwritten. |
| `front-desk/.claude/settings.local.json` | gm's | Kept current by `gm` and by `gm start guildmaster`: the `SessionStart` hook, `gm` allowed without a prompt, the Edit, Write and NotebookEdit tools denied, and the environment that points the Guildmaster's `gm` at the same Guildhall, herdr session and launchd folder. |

The folder is a sibling of `camps/`, never above it. Claude Code reads `CLAUDE.md` from a session's folder and from every folder above it (<https://code.claude.com/docs/en/memory>), so a charter at the Guildhall's root would load into every Party Leader under `camps/`.

## The Guildmaster in herdr is kept running like a Party Leader

With `front-desk: herdr`, the `guildmaster` tab, the front desk since [herdr-design.md](herdr-design.md), now runs the Guildmaster instead of a shell.
Its pane runs `gm start guildmaster --pane <pane>`, which refreshes the folder's files, clears the Claude Code variables a herdr server may have inherited, and `exec`s `claude --name guildmaster` in the folder. Like `gm start <focus>`, it runs only in the pane the register records for it.

Every muster (`gm`, `gm up`, `gm open`, the launchd agent, the muster before terminal commands, and the Guildmaster's own start) checks the front desk first, unless it is `clone`, with the same classifier and states as a Party Leader (alive, starting, dead, missing, unknown, held).
A dead one is started again in its own pane. After 3 starts in a row never seen alive it is held, told once, until the patron runs `gm`.
Schema 4 adds `start_attempts`, `held_at` and `held_told` to the `endpoint` table for this; an older register is migrated in place, adding only.
The ledger gets `front-desk.launched` and `front-desk.held`, and `gm roster` shows the front desk's state and when it last started.

## The Guildmaster's start, with no patron action

In herdr, the Guildhall folder's `SessionStart` hook runs `gm hook front-desk` at every session start (startup, resume, clear, compaction); it is the clone's hook above without steps 1, 2 and 4:

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

`tests/run.sh`, against the herdr stub and a launchctl stub, with the launchd folder inside the test's own directory, so no real agent is ever installed; the clone's tests also give gm a `HOME` of their own, so the real `~/.local/bin` is never touched, and point Homebrew and herdr's installer at stand-ins:

- The front desk's check, `gm_front_desk_home`, on its own: a plain clone is the front desk; a linked worktree, a folder inside the clone or inside another repository, and a folder that is no repository are not; a marked folder or worktree is (with or without a final newline), but not with an empty marker, one that is not one plain word, a link, a folder, or no `gm`.
- In a linked worktree, the hook run exactly as the committed settings give it prints nothing and exits 0, and `gm` alone says nothing on stderr either; the guard leaves edits and commands, `gm` too, to Claude Code; and nothing happened: nothing in the test's `HOME`, no Guildhall, no launchd, no herdr call, and an existing schema-1 register not even migrated. A marked worktree is the front desk, `gm` linked from it.
- The guard at the front desk: Edit, Write, NotebookEdit and MultiEdit denied with the reason; `bin/gm`, `./bin/gm`, this `gm`'s path with or without `bash`, and `gm` linked to this one allowed; a second command, `&&`, a pipe, a redirection, `$(…)`, backticks, a newline, `bash gm`, plain `gm` that is not this one, another path, `bin/gm` from another folder, and other commands and tools left alone.
- The clone's front desk, in a plain clone of the suite's own (a copy of the working tree committed in a new repository, since the suite itself usually runs in a worktree), its hook run exactly as the committed settings give it, at its root with `CLAUDE_PROJECT_DIR` set: the link made once, pointing at the clone's `gm`, with `~/.local/bin` made; valid JSON with nothing for the patron's screen; the charter, the first run, `front-desk: clone`, autostart loaded once with `~/.local/bin` on the agent's `PATH`, the Party Leader brought up and no Guildmaster started in herdr. Four more starts, three of them at once, link, start and load nothing, and `gm` says nothing on stderr. With `~/.local/bin` on the `PATH` the Guildmaster runs plain `gm`.
- A `gm` already in `~/.local/bin`, a file, a link elsewhere or a broken link, is never replaced.
- The hook never fails the session: a `~/.local/bin` that cannot be made, a Guildhall `gm` cannot write (still JSON, saying the start-up did not finish), and no `gm` at all.
- A missing herdr is offered, with Homebrew or herdr's official installer, after `gm` is linked and before anything is recorded; `gm install herdr` runs `brew install herdr`, or the official installer, says so in one line and finishes the setup, and a failed download says so.
- The launchd agent's muster with `front-desk: clone` brings a dead Party Leader back and starts no Guildmaster; `gm` alone moves the front desk to herdr and starts it; `claude` in the clone takes it back and leaves that Guildmaster running, and does not start it again once it ends.
- The committed settings run the hook and the guard with `|| true` and hold no permissions; the root `CLAUDE.md` says it is not the charter; `front-desk/` is gone; `.gitignore` keeps the marker and the patron's local settings out.

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

And for the clone's front desk as [PR 24](https://github.com/MadReza/guildmaster/pull/24) built it, in `front-desk/`, by hand on 2026-10-03, against real herdr 0.9.1 in another isolated lab session (every herdr call through the helper), with a temporary `HOME`, so the real `~/.local/bin` and launchd were never touched, the launchctl stub, a throwaway repository and Guildhall, and the same stand-in for `claude`:

1. A focus recorded with `--no-launch`, then the hook run exactly as `front-desk/.claude/settings.json` gives it, in `front-desk/` with `CLAUDE_PROJECT_DIR` set: exit 0 in 5 seconds, nothing on stderr; `~/.local/bin` made and `gm` linked to the clone's `bin/gm`; `front-desk: clone` and the first run recorded; the stub launchd agent loaded once; the Party Leader started in a new tab (`w1:p2`), listed as routine with the link; the roster with the front desk as `clone`.
2. The hook again: the same summary without the link or the offer, the link untouched (same inode), nothing started or loaded.
3. With the Party Leader's process killed, the launchd agent's `gm up --quiet` started it again in the same pane; the ledger held two `party-leader.launched` rows and no `front-desk.launched`: no Guildmaster was ever started in herdr, and the `guildmaster` tab held a shell.
4. The lab was torn down, and the helper confirmed the default session was unchanged.

## Not in this change

- Telemetry for the Guildmaster's own session; it runs without the collector's environment.
- Trusting folders ahead of time: Claude Code asks once for the front desk's folder and once for each new camp, and `gm` does not edit Claude Code's own configuration to skip that.
- Editing a shell startup file to put `~/.local/bin` on the `PATH`, or adding an alias: the README says how, for those who want it.
- `gm tell` and any talking to a Party Leader (Q22), phase-change digests, and `gm history`: the rest of step 4.
- A systemd timer on Linux, where autostart is reported as not available.
