# Herdr design: every Party Leader kept running and brought back

The patron, on 2026-10-03: "Not optional. I want herdr used. I don't want the user to specify which one to open, I want it to be opened and left there until next time. The same way when I reconnect to firstmate / 2ndmate, they all start up on their own. How does it do it ?"
And, once this work had started: "Who checks and who restarts it ? I don't want the guildmaster to be spammed or spamming."

Until this change, `gm open <focus>` started Claude Code in whatever terminal tab the patron ran it from, and the patron opened one tab per Party Leader by hand.
This document says how Firstmate brings its second mates back, then how Guildmaster does the same for its Party Leaders, as built in `bin/gm`.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s. Herdr is the guild's **Quarters**: where workers are housed and reached.

## How Firstmate does it

Firstmate is studied read-only at its repository root. Paths below are relative to it, and its own words (second mate, captain) are kept where they name its parts.

### Herdr keeps the panes, not the terminal

Herdr is a background server plus clients. Its documentation says: "The server owns panes and process state" and "Detach the client with `ctrl+b q`. The server and agents continue running" (<https://herdr.dev/docs/concepts/>).
It also says: "Normal detach keeps the Herdr server running. Panes, shells, agents, servers, tests, and command processes keep running inside that server" (<https://herdr.dev/docs/session-state/>).
So closing a terminal window or detaching from herdr leaves every agent running.

Firstmate starts the server headless when none runs (`herdr server --session <s> &`, `bin/backends/herdr.sh` `fm_backend_herdr_server_ensure`). It first unsets its own variables, because the server hands its environment to every pane it opens.
It names the session on every call with a trailing `--session <s>`, because `HERDR_SESSION` alone is not reliable when another server runs.
Reconnecting is only attaching a client again; nothing has stopped.

Herdr does not keep processes across a server restart, such as a reboot.
It restores "the saved session shape: workspaces, tabs, panes, cwd, layout, and focus", but "Snapshot restore does not preserve running shells, servers, tests, or arbitrary processes" (session-state page).
After a restart, each agent's pane comes back as a husk: the same pane, holding only a fresh shell.

### The record of where each one lives

Each second mate has a meta file in Firstmate's state directory. It records `backend=herdr`, `herdr_session`, `herdr_workspace_id`, `herdr_tab_id`, `herdr_pane_id`, and the target `<session>:<pane>`.
Workspaces are labelled `2ndmate-<id>`, tabs `fm-<id>`.
Labels are never trusted alone for placement: they are not unique, and an id can mean something else in a different session.

### Session-start sweep: alive, dead, missing, ambiguous

When a Firstmate session starts, `bin/fm-bootstrap.sh` runs `secondmate_liveness_sweep` over every second mate's meta file.
For each one, `fm_backend_agent_state` (`bin/fm-backend.sh`, herdr arm in `bin/backends/herdr.sh`) classifies the recorded endpoint:

| State | How herdr shows it |
| --- | --- |
| missing | `pane get` answers `pane_not_found`, or the server is not running (rechecked after starting it) |
| dead | the pane exists but `agent get` answers `agent_not_found` (a husk), or `pane process-info` and `ps` show only shells under the pane even though herdr still lists an agent |
| alive | the harness process is in the pane's foreground or under its shell |
| ambiguous, unreadable, unverified | anything herdr or `ps` cannot answer for certain |

Only **dead** and **missing** are recovery-grade.
The sweep closes the husk and spawns the second mate fresh in its own home, under a per-mate lock. The new session starts from the home's charter and state, not from a conversation resume.
An ambiguous endpoint is reported and never relaunched, because a guess could leave two supervisors running in one home.

### The watcher's tick

While a Firstmate session runs, its watcher (`bin/fm-watch.sh`, `secondmate_liveness_tick`) repeats the same probe for every second mate.
It runs every 60 seconds (`FM_SECONDMATE_LIVENESS_SECS`) and auto-relaunches the dead and the missing.
After 3 attempts within an hour it pauses that mate, and wakes the first mate once to say so.
Every relaunch, successful or not, is queued as a `check:` wake to the first mate, a model session.

## Guildmaster's design

### Herdr is required

`gm init` lists herdr as a required piece and stops without it.
`gm open` refuses to launch without it (`--no-launch` still records a focus and its camp).
Any other `gm` command run in a terminal says once, on stderr, that no Party Leader is kept running, and then answers as usual.

### The layout

```
herdr session  (GM_HERDR_SESSION, default "default": the one plain `herdr` attaches to)
├─ workspace "guild"  (GM_HERDR_WORKSPACE)
│  ├─ tab "guildmaster"   the front desk: the Guildmaster, claude --name guildmaster, in the Guildhall's front-desk folder
│  └─ tab "collector"     the tracing collector, otelcol-contrib on 127.0.0.1, while guild.conf says collector: on
├─ workspace "└ appt-v2"  Party Leader appt-v2: claude --name appt-v2, in its camp
├─ workspace "  └ <job>"  (step 3) an Adventurer or Scout of appt-v2, in its own camp
└─ workspace "└ saved-views"  Party Leader saved-views
```

herdr's sidebar shows these as one list, each with the branch of its folder under it:

```
guild
main
└ appt-v2
feature/CRM-8965
  └ <job>
<the job's branch>
└ saved-views
feature/saved-views
```

- **One workspace for the guild.** Its first tab is renamed `guildmaster`. It is the front desk, where the Guildmaster session sits, kept running by the muster like a Party Leader ([zero-touch-start.md](zero-touch-start.md); until then it was a shell in the Guildhall). The Guildmaster always lives in this tab: `claude` started in the clone outside it sets the guild up, starts the Guildmaster here, and points the patron to it.
- **One workspace per Party Leader** (since 2026-10-08; until then one tab per Party Leader in `guild`), labelled `└ <focus>`, made on the camp with `workspace create --cwd <camp>`, and placed under the guild's workspace. The patron switches workspaces to talk to a Party Leader, but never opens them by hand. herdr's sidebar is one flat list, so the nesting is the label and the place, which is how Firstmate shows its crew (below).
- **Adventurers and Scouts** (the patron's rule; built for an Adventurer, [step-3-design.md](step-3-design.md#its-own-workspace-and-a-party-leader-that-answers-it)): each one runs in a workspace of its own on its camp, labelled `  └ run <n> · #<num> <slug>` and placed right under its Party Leader's workspace, so the sidebar shows every Party Leader with its Adventurers under it; the patron prefers seeing everything in the sidebar to tabs or panes inside the Party Leader's workspace (2026-10-08). The run records its workspace and pane, not the `endpoint` table: a worker is not relaunched by the muster; it is ephemeral, so a dead one ends its run as lost and its Party Leader is summoned instead.

### The record, in the register

Schema 3 adds the `endpoint` table and four columns on `focus`. A schema 1 or 2 register is migrated in place, adding only.

| Column | |
| --- | --- |
| `endpoint.key` | `front-desk`, `party-leader:<focus>`, `collector` (the tracing collector, kept running while `guild.conf` says `collector: on`; see [tracing-design.md](tracing-design.md#kept-running-since-2026-10-04)); later `adventurer:<focus>#<n>` |
| `endpoint.role`, `focus_id` | what lives there, and for which focus |
| `endpoint.session`, `workspace_id`, `tab_id`, `pane_id`, `label` | where, as herdr names it (`w1`, `w1:t2`, `w1:p2`) |
| `endpoint.launched_ms` | when gm last typed the launch line into the pane |
| `focus.closed_at` | a retired focus (`gm close`); `gm open` reopens it |
| `focus.close_requested_at` | its Party Leader asked to close the focus (`gm close` from inside it); cleared when the focus closes, or by the patron's next message to it, or by `gm open` |
| `focus.start_attempts`, `held_at`, `held_told` | starts since the Party Leader was last seen alive; the hold, and who has been told |

Events go to the ledger: `party-leader.launched` (with the state and cause), `party-leader.held`, `focus.closed` and `focus.reopened`; for a Party Leader closing its own focus, `focus.close-requested`, `party-leader.exit` and `focus.close-cancelled`; for the collector, `collector.launched`, `collector.failed`, `collector.held` and `collector.stopped`.

A recorded workspace is reused only while herdr still gives that id the guild's label.
A recorded pane belongs to its Party Leader only while herdr still puts it in the recorded workspace.
Nothing is ever adopted by its label alone, so a second Guildhall, or a herdr session started over with ids from `w1` again, cannot capture another's tabs.

### Classifying a Party Leader

`gm_endpoint_state` follows Firstmate's classifier, with one more state for the moments just after a launch:

| State | Meaning | The muster |
| --- | --- | --- |
| alive | `pane process-info` shows Claude Code in the pane's foreground or under its shell | leaves it alone; the detail is herdr's agent status (`idle`, `working`, `blocked`, `done`) |
| starting | the pane holds only a shell, or something else, within `GM_LAUNCH_GRACE` (60 s) of gm's launch | leaves it alone |
| dead | the pane holds only shells (the patron typed `/exit`, Claude Code crashed, or herdr restarted the server and restored a husk) | starts Claude Code again **in the same pane** |
| missing | no pane recorded, `pane get` answers `pane_not_found`, or the pane id now sits in another workspace | opens a new workspace for the focus, or a new tab in its own workspace while herdr still has it, and starts it there |
| unknown | herdr's session is not running for that record, herdr does not answer, or the pane runs something else (`vim`, say) | reports it and leaves it alone |
| held | dead or missing after 3 starts in a row never seen alive | leaves it alone until `gm open <focus>` |

Claude Code is recognised by its process. On herdr 0.9.1 its process name is its version (`2.1.288`), so gm matches `claude`, or the name of `GM_CLAUDE`, against both the name and `argv0`. It also looks for such a process among the shell's descendants with `ps`.
A shell that is still starting runs helpers such as `printf`, `tail` and `head` in the foreground; the lab saw them under zsh. So a pane running something else is sampled again, up to 10 times 0.2 s apart, before that answer stands.

### The muster, plain code

`gm up` is the muster (TERMINOLOGY.md: "the roll call that reconciles durable records with reality"). It is bash and SQL, never a model, and costs no tokens:

1. Take the Guildhall's `herdr.lock` (one muster at a time; a stale lock whose process is gone is broken).
2. Start the herdr server headless if none runs for the session, without `CLAUDECODE`, `CLAUDE_CODE_*`, `GM_FOCUS` or `TRACEPARENT` in its environment, since every pane inherits it.
3. Find the guild workspace, or make it with its front desk.
4. Classify every open focus's Party Leader, and act on each as the table says.

A launch types one line into the pane with `herdr pane run`:

```
cd '<camp>' && env GM_HALL='<hall>' [GM_CLAUDE, GM_TELEMETRY, GM_OTEL_ENDPOINT, GM_OTEL_PORT when set] bash '<gm>' start '<focus>' --pane '<pane>'
```

`gm start` runs only in the pane the register records for that focus, so nothing starts a second Party Leader beside a recorded one.
It refuses telemetry that could leave the machine, as `gm open` always has. It clears the variables a herdr server may have inherited, and then `exec`s `claude --name <focus>` in the camp with the telemetry environment `gm open` has set since tracing slice 2 (README.md).
The new session is not a resumed conversation: the `SessionStart` hook injects `gm where`, the summary built from the register, so typing `continue` is enough (step 1's design).
When Claude Code exits, the pane drops back to its shell. That husk is what the next muster finds dead and reuses.

### When it runs

| Trigger | What it prints |
| --- | --- |
| `gm open <focus>` | the whole muster, reporting that focus's line, and where to see it in herdr |
| `gm up` | one line per focus |
| any other `gm` command in a terminal (`gm list`, `gm roster`, and the rest) | only what it started, or could not; nothing when all are running. Never from a hook, the status line, a pipe, or inside a Party Leader (`GM_FOCUS` or `CLAUDECODE` set); `GM_HERDR_AUTO=off` turns it off |
| the end of `gm init` | as above, and on macOS it turns autostart on, unless the patron turned it off ([zero-touch-start.md](zero-touch-start.md)) |
| `gm autostart on [--every MINUTES]` | installs a launchd user agent, `~/Library/LaunchAgents/com.guildmaster.up.plist` (with a suffix for any other `GM_HALL`), that runs `gm up --quiet` at login (`RunAtLoad`) and every 5 minutes (`StartInterval`, `--every` changes it). It carries the current `PATH`, `GM_HALL` and herdr variables, because launchd's own `PATH` finds neither herdr nor claude, and writes to `autostart.log` in the Guildhall. `gm autostart off` removes it; `gm autostart` shows it. On Linux, run `gm up --quiet` from a systemd user timer (not built) |

So after a reboot or a herdr restart, the agent starts herdr's server headless, and herdr restores the guild workspace with husks. The muster then starts every Party Leader again in its own pane, before the patron types anything.
Attaching with `herdr` shows them already running.

### Who checks, who restarts, who is told

Checking and restarting are both `gm up`: code run by a command or by launchd.
Nothing is ever sent to the Guildmaster session or to a Party Leader's chat.

| Event | Where it shows |
| --- | --- |
| a routine check, all running | nowhere: no output, no ledger row |
| a restart | one ledger row (`party-leader.launched`). `gm roster` shows "last started". `gm trace <focus>` shows the new session. The command that did it prints one line; the agent's line goes to its log. The row carries no notice line, so the Party Leader's resume summary (`gm where`, "Last notices") stays clear of it |
| a Party Leader that will not stay up | after 3 starts in a row never seen alive (`GM_START_TRIES`), it is **held**: one ledger row and no more starts. One line goes in the agent's log, and one line in the next command the patron runs at a terminal. `gm roster` shows `held`, and `gm up` by hand says it each time it is asked. `gm open <focus>` clears the hold and tries again; seeing it alive resets the count |

### Never kill or replace a live Party Leader

- Alive, starting and unknown are never touched.
- A dead Party Leader's pane holds only a shell, so starting it again there kills nothing.
- A missing one gets a new workspace, or a new tab in its own; the old pane is already gone.
- A dead one still in a tab of `guild`, from before each had a workspace of its own, has its husk (only a shell) closed and starts in a new workspace.
- `gm close <focus>` retires a focus: its Party Leader is no longer started, and its husk pane is closed. Closing a workspace's last pane closes the workspace. It refuses while the Party Leader is alive, starting or unknown, and says to end it in its workspace first (`/exit`). It has no `--force`.
- The camp, the branch and the postings stay; `gm open <focus>` reopens the focus.

### A Party Leader closing its own focus (since 2026-10-09)

A Party Leader asked to close when everything is done cannot end the session it runs in, and `gm close` from inside it would find itself alive.
Firstmate never lets an agent end itself: a finished worker appends `done` and stops, and its supervisor ends it from another pane, with `fm-control.sh <id> exit` (types `/exit`) or `fm-teardown.sh` (closes the window).
gm does the same from outside the session, with plain code and no model:

- `gm close <focus>` run by that focus's Party Leader refuses while any posting is not done, failed or closed, and names them. The Party Leader is the session with `GM_FOCUS` set to the focus *and* herdr's `HERDR_PANE_ID` and session matching its recorded pane; another claude in the camp gets the usual refusal.
- Otherwise it records `focus.close_requested_at` and a `focus.close-requested` row, starts a finisher (`gm close <focus> --finish`) in its own process group, with none of the tool call's output open, and returns at once.
- The finisher waits for herdr to say the Party Leader is idle or done twice in a row, so its turn and the Stop guard are over. It then types `/exit` into its pane as the patron would, with `pane send-text` and Enter, and types it again every 30 s while the Party Leader stays idle. Once the pane holds only a shell, it closes the focus as `gm close` from a terminal would: the husk pane closed, `focus.closed` by `gm`.
- One finisher at a time: its pid is kept in `close.<focus>.pid` in the Guildhall, and its output goes to `close.log`. Just before typing, it checks again that the close is still asked for.
- It gives up after 15 minutes. The muster finishes what it left: it never starts a Party Leader that asked to close. A dead or missing one has its focus closed; a running one gets a new finisher, unless one is at work.
- Unlike `fm-control.sh exit`, gm does not check that the input box is empty first. Text the patron left half-typed in the pane would be sent with `/exit`, as a message, and that message cancels the close.
- The patron's next message to that focus, or `gm open <focus>`, cancels the request (`focus.close-cancelled`). The finisher then stops without typing anything.

### How this differs from Firstmate

| | Firstmate | Guildmaster |
| --- | --- | --- |
| Who checks | a session-start sweep, and the watcher's tick every 60 s while a session runs | `gm up`: from `gm open`, `gm init`, every terminal command, and the launchd agent every 5 minutes, even with no session open |
| Who decides | code (`fm_backend_agent_state`) | code (`gm_endpoint_state`) |
| Who is told | the first mate, a model: each relaunch is a `check:` wake | nobody, routinely: a ledger row, the roster, and one line from the command that did it |
| Restart | close the husk, spawn fresh | type the launch line into the husk; a new tab only when the pane is gone |
| Bound | 3 attempts an hour, then pause and wake once | 3 starts in a row never seen alive, then held, told once, until `gm open` |
| What it starts from | the home's charter and state | the register's resume summary, through the `SessionStart` hook |

### Herdr contracts it rests on

Checked against herdr 0.9.1 (`herdr <group> help`) in an isolated lab session. Every call carries `--session <s>`.

| Command | Read from the JSON |
| --- | --- |
| `status --json` | `.server.running` |
| `server` (headless, background) | starts the session's server |
| `workspace create --cwd <hall> --label guild --no-focus` | `.result.workspace.workspace_id`, `.result.tab.tab_id`, `.result.root_pane.pane_id` |
| `workspace get <id>` | `.result.workspace.label` |
| `workspace create --cwd <camp> --label "└ <focus>" --no-focus` | as for the guild's (since 2026-10-08) |
| `workspace list` | `.result.workspaces[].workspace_id`, in the sidebar's order |
| `workspace.move` on the socket (`.server.socket` of `status --json`), `{"workspace_id", "insert_index"}` | the sidebar's new order; the CLI has no command for it, so gm sends it with `nc -U` |
| `tab create --workspace <id> --cwd <camp> --label <focus> --no-focus` | `.result.tab.tab_id`, `.result.root_pane.pane_id` |
| `tab rename <tab> guildmaster` | |
| `pane get <pane>` | `.result.pane.workspace_id`, or `.error.code` `pane_not_found` |
| `pane process-info --pane <pane>` | `.result.process_info.shell_pid`, `.foreground_processes[].{name, argv0}` |
| `agent get <pane>` | `.result.agent.agent_status`, or `agent_not_found` |
| `pane run <pane> <line>` | types the line and submits it |
| `pane close <pane>` | only for a dead focus's husk, at `gm close` and when a dead Party Leader moves out of `guild`, and for an Adventurer's pane split under its Party Leader's before each had a workspace of its own, once its run is reviewed; closing a workspace's last pane closes the workspace |
| `workspace create --cwd <camp> --label '  └ run <n> · …' --no-focus` | an Adventurer's own workspace, placed after its Party Leader's with `workspace.move` ([step-3-design.md](step-3-design.md#its-own-workspace-and-a-party-leader-that-answers-it)); without a workspace or pane id the keeper runs `claude -p` instead |
| `workspace close <workspace>` | an Adventurer's workspace, once its run is reviewed |
| `pane rename <pane> <title>` | titles an Adventurer's pane with its run; not yet checked against real herdr, and its answer is not read |

Errors such as `pane_not_found` come back as JSON with exit status 1, so gm reads the JSON, not the status.
A pane run before its shell is ready keeps the line until the shell reads it; the lab saw the line wait in a zsh still loading its configuration.
Herdr's `resume_agents_on_restore` can restart Claude Code itself after a server restart, when Claude Code's herdr integration reports a session. Such a Party Leader is alive, so the muster leaves it as it is, but it runs without the environment `gm start` sets.

## As built, and how it was checked

`bin/gm` has `gm open`, `gm up [--quiet]`, `gm roster [--all]`, `gm close`, `gm start` and `gm autostart`, the muster before terminal commands and after `gm init`, and schema 3.

`tests/run.sh` drives them against `tests/fixtures/herdr`, a stub herdr that comes first on `PATH`, keeps its state in plain files, and refuses any session but the suite's own. A test fails if anything calls another session. `tests/fixtures/launchctl` stands in for launchd. The tests cover:

- classification: alive, starting, dead, missing, unknown, a stopped server, and a pane id in another workspace;
- the muster: only the dead are restarted (in place) and the missing (new tab); the alive and the unknown are untouched, and nothing is closed;
- no double launch: a second muster, three musters at once, and a Party Leader still starting;
- the hold, told once per channel, and cleared by `gm open`;
- restarts kept out of `gm where`;
- the roster's output;
- `gm close` refusing a live Party Leader;
- `gm start` refusing any pane but the recorded one;
- the telemetry environment and the cleared variables;
- the server and the workspace coming back, never adopted by label;
- herdr required;
- the launchd agent's property list (`plutil -lint`).

By hand, on 2026-10-03, against real herdr 0.9.1 and Claude Code 2.1.288, in an isolated lab session (Firstmate's `fm-herdr-lab.sh`, never the default session), with a throwaway repository and Guildhall:

1. `gm open` on two focuses made the guild workspace with its `guildmaster` front desk, and opened one tab per focus with Claude Code running in it (roster: `alive`, herdr status `blocked` at the trust prompt).
2. Ending one Claude Code and closing the other's pane gave `dead` and `missing`.
3. `gm up` started the first again in the same pane (`w1:p2`) and the second in a new tab (`w1:p3` gone, `w1:p4`).
4. A second `gm up` left both "already running".
5. `gm close` refused the live one.
6. The lab was torn down, and the helper confirmed the default session was unchanged.

Not in this change: the Guildmaster session at the front desk (built since, in [zero-touch-start.md](zero-touch-start.md)), Adventurer and Scout panes (step 3), a Linux timer, and a desktop notification for a held Party Leader.
