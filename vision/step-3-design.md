# Step 3 design: Adventurers and enforced rules

This is the design of roadmap step 3 ([roadmap.md](roadmap.md#step-3-adventurers-and-enforced-rules)), whose scope is build-order step 2 of [consultation.md](consultation.md#build-order), turned into build slices.
The patron agreed to it on 2026-10-11 ("Go for it."), with every [question](#questions-for-the-patron) settled. Slices 1 to 4 are built; [What building slice 1 changed](#what-building-slice-1-changed), [What the visible Adventurer changed](#what-the-visible-adventurer-changed) (and [its own workspace](#its-own-workspace-and-a-party-leader-that-answers-it) after it), [What building slice 2 changed](#what-building-slice-2-changed), [What building slice 3 changed](#what-building-slice-3-changed) and [What building slice 4 changed](#what-building-slice-4-changed) record where they differ from the text below.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s.

The patron asked for it on 2026-10-11, in the Party Leader of `adventurers`:

<!-- patron: begin -->

"Start roadmap step 3, Adventurers and enforced rules (vision/roadmap.md, scope from vision/consultation.md). First posting: write vision/step-3-design.md the way step-1-design.md was written: the scope turned into build slices, in this proposed order: (1) gm dispatch runs one headless claude -p Adventurer in the camp, its result lands in the register and wakes the Party Leader; (2) PreToolUse push rules in every camp, from the playbook; (3) gm check after every run, reopening a posting that broke a rule; (4) parallel surveys and the dispatch cap; (5) Adventurer spans, TRACEPARENT and writ hashes (tracing slice 3). Keep the roadmap's done-when: I can keep talking to you while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch. Put the questions it depends on in the design and ask me them: Q4 branch names, Q13 and Q14 quota and models, commit identity and AI trailers, and which GitLab credentials headless runs may use. Also take GitHub issue #41 (a posting added to a focus does not reach its idle Party Leader), since it is close to slice 1's wake."

<!-- patron: end -->

**Done when** the patron can keep talking to the Party Leader while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch.
Slice 1 meets the first half; slices 2 and 3 make the second half enforced rather than only asked for.

This step removes step 1's deliberate shortfall: the Party Leader stops doing the work itself (requirements 1.6 and 1.7).

## What the patron settled

Answered on 2026-10-11; every question is settled.

<!-- patron: begin -->

"1. Ok. 2. That is fine until there is a list of tasks that can be picked up. So Patron still asks for tasks, tasks might be queued after those 3 or merged into one depending on judgement call. [...] 4. Claude Code's commit attribution is completly turned off. User can overwrite it if they want or think it's necessary. This would be the way it currently works. GM doesn't need to check for this. I don't see why it would ? 5. Sounds good. [...] 8. yes."
"3. Okay with the new recommendation."
"6. Herald maybe ? Watch could be good. Whatever you pick, add it to the terminology list. The terms could also be in different context mean different things. Until the ai doesn't get confused or the user."
"For number seven, let's go with your recommendation."

<!-- patron: end -->

| Question | Settled as |
| --- | --- |
| Q4 branch names | `development-branch:`, `integration-branch:` and `protected-branch:` lines in each `rules/<repository>.md`, read by slices 2 and 3; a repository without them has every push denied. |
| Q13 quota | A guild-wide cap of 3 live Adventurers, and dispatch paused at a rate limit, for as long as the patron hands out the work. Postings beyond the cap wait, or the Party Leader merges several into one run when its judgement says they belong together (`gm dispatch 12 13`). A list of work that Adventurers pick up by themselves is a later change. |
| Commit identity and AI trailers | The patron's own git identity, as the camp has it. Claude Code's commit attribution is off for every Adventurer, from a `guild.conf` setting (`commit-attribution: off`) that the patron can turn on. `gm` does not check commits for it. |
| GitLab credentials | Only the patron's SSH key, through the running ssh-agent, for `git fetch` and the pushes slice 2 allows. No `glab` token: an Adventurer never opens, approves or merges a merge request. |
| Q14 models | Contracts on the Party Leader's own model at medium effort; surveys on Sonnet 5.5 at medium. Each kind's model and effort are `guild.conf` settings (`contract-model`, `contract-effort`, `survey-model`, `survey-effort`), and the Party Leader can override them per dispatch with `--model` and `--effort`. A kind moves to a cheaper model when its recorded outcomes ([below](#a-runs-outcome-for-judging-models-and-prompts)) show it holds. A **contract** changes the project, in the ticket's camp, one at a time per focus; a **survey** only finds things out, read-only, in a throwaway worktree, ending in a field report. |
| The words | **Summons** for the event and **the watch** for the process, both already in TERMINOLOGY.md and widened there to any supervisor; **run** and **keeper** added. Herald was not needed: a new term is added only for a concept with no name yet, and both concepts had one. |
| The nudge | When a Party Leader's watch has died and a summons has waited 2 minutes, the muster types `/summons` (`/guild-chat:summons`, as built), only when the Party Leader is idle, its input has not changed for 1.5 seconds, and the input is empty or holds a draft with no stash (stashed first, and restored by Claude Code). Otherwise it types nothing and the roster shows the summons as unheard. Chosen after [the lab tests](#what-the-lab-showed). |
| Correction runs | A failed check dispatches one correction run at once; a second failure on the same posting goes to the patron as `needs-you`. |

## The slices

| Slice | What | Needs from the patron |
| --- | --- | --- |
| 1 | `gm dispatch` runs one headless `claude -p` Adventurer in the camp; its result lands in the register and wakes the Party Leader. With it, the wake for a posting added from outside (issue #41) | settled |
| 2 | `PreToolUse` push rules in every camp, from the playbook | settled |
| 3 | `gm check` after every run, reopening a posting that broke a rule | settled |
| 4 | Parallel surveys and contracts, each in its own worktree, and the dispatch cap | settled ([the patron's answers](#the-patrons-answers)) |
| 5 | Adventurer spans, `TRACEPARENT` and writ hashes (tracing slice 3) | none |

Each slice is one pull request with its own tests, and the roadmap's step 3 table tracks them, as step 2's does.

## Slice 1: one Adventurer, its result, and the wake

### `gm dispatch`

The Party Leader runs `gm dispatch <posting>` (a contract, the default) on a posting it has started.
`gm` then, in plain code:

1. Refuses if a contract run is already live for this focus: one camp, one branch, one Adventurer changing it at a time ([consultation section 3](consultation.md#3-repositories-and-camps)). The Party Leader keeps the posting queued and dispatches it when the run ends. (Slice 4 adds a waiting line instead of a refusal.)
2. Renders one **writ** for the postings it names: usually one, or several the Party Leader judged belong in one run (`gm dispatch 12 13`). It renders it from the patron's template, `prompts/adventurer/contract.md` in the Guildhall (copied from `templates/` the first time and the patron's from then on, like the charter). Its slots are those of [consultation section 5](consultation.md#5-patron-authored-prompts): `{{posting}}`, `{{original_words}}` (the posting's words and every addition, verbatim), `{{branch}}`, `{{phase}}`, `{{rules}}` and `{{playbook}}` (paths, not copies, to keep the writ short), plus `{{brief}}`, the Party Leader's own instructions given with `--brief`. Nothing is added behind the template. The writ is saved as `runs/<run>/writ.md`.
3. Records a **run** in the register (new table `run`: its postings, kind, model, effort, writ path, the session id `gm` assigns, pid, start, end, exit code, result, cost, turns, check result, reviewed time, and its outcome, below) and a notice: `appt-v2#12 fix-owner-empty dispatched: contract, run 7 ("owner is empty after save…")`.
4. Starts the run's keeper, `gm run <run>`, detached in its own process group with none of `gm dispatch`'s output open (the way `gm close` starts its finisher), and returns at once. The Party Leader's tool call is over in well under a second; its turn ends, and the patron can talk to it.

The keeper runs, in the camp:

```
claude -p --session-id <uuid> --output-format stream-json --verbose \
  --model <model> --effort <effort> --permission-mode <mode> \
  --setting-sources user,project --settings runs/<run>/settings.json \
  < runs/<run>/writ.md > runs/<run>/stream.jsonl
```

When it exits, the keeper reads the final `result` event (its text, cost, turns and per-model usage), stores the text as `runs/<run>/result.md` and the rest on the run row, records a notice (`appt-v2#12 fix-owner-empty run 7 finished: exit 0, 22 turns, $1.41`) and summons the Party Leader.

### An Adventurer is not a Party Leader

A camp's `.claude/settings.local.json` is the Party Leader's: its charter, its capture hook, its Stop guard. A `claude -p` started in the camp would load it too, and its writ would be recorded as a patron message and made a posting.
So an Adventurer runs with `--setting-sources user,project`, which leaves the camp's local settings out, and `--settings runs/<run>/settings.json`, which `gm` writes per run with only what an Adventurer needs: `GM_HALL`, `GM_FOCUS` and `GM_RUN` in `env`; its permissions; from slice 2, the rules hook; from slice 5, the tool-recording hooks; and Claude Code's commit attribution switched off unless `guild.conf` says `commit-attribution: on`. No charter, no capture, no Stop guard, no status line.
The repository's own committed `.claude/settings.json` and `CLAUDE.md` still load, as they would for the patron.

Checked before building: `--setting-sources` without `local` leaves out a linked worktree's `settings.local.json` and the main checkout's, and `-p` in a camp never stops on the folder-trust question ([below](#what-building-slice-1-changed)).

### Permissions in slice 1

Nobody is there to answer a permission prompt, and in `-p` an unanswered one is a denial, so each run gets an explicit mode and allow-list: `--permission-mode acceptEdits`, and `Bash` allowed for the read-only and local git commands (`status`, `diff`, `log`, `add`, `commit`) and for the build and test commands in the repository's rules file ("How to build and test").
In slice 1 an Adventurer never pushes, never merges and never creates a branch: those are denied outright, and the Party Leader pushes as it does today. Slice 2 opens exactly the pushes the playbook allows.

The Party Leader shares the camp with a live contract run, so its charter gains one rule: while a contract run is live, do not change files in the camp. From slice 2 its rules hook enforces it.

### A run's outcome, for judging models and prompts

Each run's postings end one of a few ways, and `gm` records which on the run, from the notices that follow, without asking a model: `accepted` (the Party Leader recorded `done` on the posting with no further run), `redispatched` (another run on the same posting followed), `corrected` (a failed check sent a correction run), `failed`, or `escalated` (`needs-you`).
With the model, effort, cost, turns and writ template on the same row, `gm stats --compare` can then answer "do contracts on Sonnet get accepted first time as often as on Opus, and at what cost" (slice 5 adds the spans; the run row has the facts from slice 1).

### The posting while it runs

The posting stays `active`. The Stop guard already lets a turn end with an active posting when work is still running; today it reads that from Claude Code's `background_tasks`, and now also from a live run on that posting.
A finished run whose result no notice has acknowledged blocks the turn end, the way an unacknowledged addition does, so the Party Leader cannot finish a turn without having looked at a result. The Party Leader then records what it decided: `done` with the commit, `failed`, `needs-you`, or another dispatch with a correction.

### The wake (and issue #41)

The finish lands while the Party Leader is idle, so code has to wake it.
Issue [#41](https://github.com/MadReza/guildmaster/issues/41) is the same problem from another side: the front desk ran `gm open working-sprites`, then `gm post` with its first job; the posting was recorded `received`, and the Party Leader stayed idle with an empty chat until the patron went to its tab.
And `gm open` cannot give a new focus its first job. One mechanism covers both.

A **summons** is one event that needs a Party Leader's attention now. There are two kinds in this step:

- a posting of its focus that is `received`, was not made from one of the patron's own messages in its chat, and has not been summoned before (issue #41);
- a run of its focus that finished and has not been summoned before.

[TERMINOLOGY.md](../TERMINOLOGY.md) now defines both words for any supervisor, the Guildmaster or a Party Leader, along with **run** and **keeper**.

**The watch** is the one background process per Party Leader that waits for a summons and wakes it: `gm hook watch`, a command hook with `asyncRewake: true` in the camp's settings.
Claude Code runs such a hook in the background, and when it "exits with code 2 [it] wakes Claude immediately even when the session is idle", showing its stderr to Claude as a system reminder (<https://code.claude.com/docs/en/hooks>, Run hooks in the background; checked on Claude Code 2.1.296).
It is the mechanism [consultation section 1](consultation.md#0-and-1-party-leaders-long-lived-one-per-focus) chose for this step.

Firstmate wakes its Claude supervisors the same way, and its tickets show where that breaks ([issues/status-inbox-and-wake](../firstmate/issues/status-inbox-and-wake.html)): nothing re-arms the watcher after it delivers (#4236), the auto-arm stops re-arming after a rewake turn or a host restart (#4439, #4332), a turn ending in `StopFailure` never runs Stop and leaves the home unwatched (#2940), routine wakes cost "~20 no-op model turns/hour" (#3285), and a wake typed into the pane "wipes the captain's unsent prompt" (#4664). So:

- **Armed from three events**: `SessionStart` (a Party Leader that starts, or comes back after a crash or compaction, with a summons waiting is woken at once), `Stop` (every turn end) and `StopFailure` (a turn cut off by a rate limit or an error).
- **Only in the Party Leader's own session**: `GM_FOCUS` names the focus and herdr's variables put it in the recorded pane, the check `gm close` already uses. Anywhere else it exits 0 at once.
- **Exactly one per focus**: the watch writes its pid to `watch.<focus>.pid` in the Guildhall and exits 0 when the file no longer holds its own pid, so a new arm replaces the old one without killing it. The capture hook removes the file, so a turn started by the patron retires the armed watch and that turn's Stop arms a new one.
- **Plain code while it waits**: one indexed register query every 2 seconds, no model, no herdr call.
- **Each thing summoned once**: a `summoned` event per posting or run. A Party Leader that wakes and leaves it unsorted is not woken again in a loop; the Stop guard and the muster's check below deal with it.
- **Nothing typed into the pane**, except the muster's last-resort nudge below, and only when that is safe.

On a summons it records the events, prints the summons and exits 2. For example:

```
gm: while you were idle:
- run 7 for appt-v2#12 fix-owner-empty finished: exit 0, 22 turns, $1.41. Its result: runs/7/result.md
- appt-v2#13 add-export was posted from the front desk (received): "Add a CSV export to …"
Review the run and sort the posting as your charter says; show the patron each notice line.
```

Claude Code enforces `timeout` on an `asyncRewake` hook, so the watch gets a long one (`GM_WATCH_TIMEOUT`, 86400 seconds) and exits 0 just before it.

Claude Code delivers the summons as a `<task-notification>` prompt through `UserPromptSubmit`, which the capture hook already records without making it a posting, and the chat shows it as "Stop hook feedback". The capture hook also retires the armed watch when such a notification arrives, as it does for the patron's messages.

**When the watch has died: the muster's nudge.** The watch can die without anyone seeing it: Claude Code kills it silently when its timeout runs out, and the session then stays unwatched (seen in the lab, below), as it would after a crash of the hook. The muster (`gm up`, at every terminal command and every 5 minutes from launchd) already reads every Party Leader's state. For an alive Party Leader with a summons older than 2 minutes and no live watch (its pid file empty or its pid gone), it nudges, in plain code:

1. herdr says the Party Leader is `idle` or `done`, twice, a second apart.
2. Its input line, read twice from the screen 1.5 seconds apart (`herdr pane read --source visible --ansi`), has not changed, so nobody is typing in it.
3. Then, by what that line holds:
   - **empty** (nothing, or only Claude Code's faint suggestion or placeholder text): it types `/summons` and Enter;
   - **a draft, and no stash** (no "› stashed" mark): it presses Ctrl+S, which stashes the draft, checks the line is now empty, and types `/summons` and Enter; Claude Code puts the draft back when that turn is submitted;
   - **a draft and a stash**: it types nothing, since a second Ctrl+S would replace the patron's stash.
4. Whenever it types nothing, it records `unheard` once, and `gm roster` shows it on that Party Leader's row (`idle · unheard: run 7, #13 since 01:09`), so the front desk can tell the patron; it tries again at the next muster.

`/summons` is a command of the guild-chat mod, loaded with every session. Its text says gm typed it, not the patron, and runs `gm summons`, which lists what is waiting and records it as summoned. The capture hook records `/summons` as a command, never a posting. The nudged turn's own Stop arms a new watch, so one nudge repairs the chain.

### What the lab showed

Tested on 2026-10-11 with Claude Code 2.1.296 and herdr, in a throwaway herdr session (`wakelab`) with Haiku sessions and stand-in hooks, at the patron's request ("Do a thorough test before giving a recommendation. Try variations to get the best result."):

| Test | Result |
| --- | --- |
| The watch fires while the session is idle, never prompted | Woken in under a second; the summons arrives as a `<task-notification>` prompt and shows as "Stop hook feedback". |
| A second summons after that wake turn | The wake turn's Stop armed a new watch, which woke it again. Firstmate's #4439 did not reproduce. |
| A summons while the patron has a half-typed draft | The draft stays in the input, untouched. |
| A summons while a turn is running (a 15-second tool call) | Delivered inside that same turn after the tool call; no extra turn. |
| The session starts with a summons already waiting | The `SessionStart` watch woke it at once. |
| `timeout: 86400` | The watch was alive after 687 seconds (past the 600-second default) and still woke the session. |
| A short timeout (20 seconds) running out | The watch was killed silently: no wake, no message, and the session stayed unwatched; a later summons was never delivered. |
| A turn ending in an API error | `StopFailure` ran instead of `Stop`; the watch it armed woke the session, and the failed wake turn armed another. |
| A newer watch | The older one saw the pid file change and exited. |
| Nudge with `herdr agent prompt` over a draft | The nudge was appended to the draft and both were submitted: the patron's half-written message sent early. Rejected. |
| Ctrl+S, then the nudge, over a one-line or a multi-line draft | The draft was stashed, the nudge delivered, and the draft restored ("Draft restored"). |
| Ctrl+S on an empty input while the patron has a stash | It brings the stash back into the input, so a nudge would merge with it: never Ctrl+S on an empty input. |
| Ctrl+S over a draft while a stash exists | The stash is replaced and the older one lost: no nudge then. |
| A stash and an empty input | Typed directly; the stash came back after the nudge. |
| Telling a draft from a suggestion | With ANSI, Claude Code's suggestion and placeholder are faint (`ESC[2m`) and a draft is plain; "› stashed" shows for as long as a stash exists. A real Party Leader with the guild-chat mod draws the same input line. |
| `/summons` as the nudge | Recorded as a slash command; the model got its expanded text. A command file added after the session started was not loaded ("Unknown command"), so it ships in the mod. |
| The patron typing while the nudge runs | With one read, Ctrl+S caught the first keystrokes and the typing ended up split between the stash and the input. With two reads 1.5 seconds apart, the nudge saw the change and typed nothing. |

What is left: someone starting to type in the few milliseconds between the last read and the nudge, and the nudge's reliance on Claude Code drawing its input line as it does today, which gm's suite cannot see; `gm doctor` can check the Claude Code version it was tested on.

**A first job for a new focus.** `gm open <focus> --repo <path> --brief "<words>"` (or `--brief -` from standard input, with `--slug`) records the words as posting #1 before the Party Leader starts; its `SessionStart` watch summons it within seconds. `gm post` gains `--focus <name>`, so the front desk no longer needs `GM_FOCUS=` before it.
The front desk's charter gains: when the patron gives a new focus its job in the same breath, pass their words verbatim with `--brief`; when the patron asks to hand an existing focus a job, `gm post --focus`. Both happen at the patron's request, so "never talk to a Party Leader on your own initiative" still holds.

The Party Leader's charter template gains one line: "A summons from gm names a run that finished or a posting added while you were idle; review or sort it like a patron message." The patron's own `charter.md` in the Guildhall is never overwritten; the pull request names the lines to add there by hand.
A running Party Leader gets the watch hooks at its next start, since `gm open` writes the camp's settings.

### What building slice 1 changed

- **The command is `/guild-chat:summons`.** Claude Code names a plugin's command after its plugin: with the mod loaded by `--plugin-dir`, `/summons` is "not installed" and `/guild-chat:summons` runs (checked on 2.1.296, headless). The nudge types the full name.
- **The Adventurer's tool hooks wait for slice 5.** The tool-recording hooks write a span only under an open session span, which an Adventurer does not have until slice 5 opens one; in slice 1 they would record nothing, so its settings carry none.
- **Build and test commands are `adventurer-allow:` lines** in the rules file, above the line, each a Claude Code permission rule (`adventurer-allow: Bash(npm test*)`); the prose under "How to build and test" is for people. Without them an Adventurer can edit, read and commit, but a build or test command is refused, since nobody is there to allow it.
- **Checked before building**, on 2.1.296 in a throwaway repository with a linked worktree: `claude -p --setting-sources user,project --settings <file>` ran only that file's hooks, neither the worktree's nor the main checkout's `settings.local.json`; it never stopped on the folder-trust question; its `result` event carries `subtype`, `is_error`, `num_turns`, `result`, `total_cost_usd`, `duration_ms` and `modelUsage`, though not as the line's first key; and `--model` takes the status line's model name with its `[1m]`.
- **A run whose keeper is gone** (a restart, a kill) is ended as `lost` by the next `gm dispatch`, `gm runs`, watch or muster, so it neither blocks the next contract nor waits for ever.
- **A posting records where it came from** (`origin`: `patron` from the capture hook, `party-leader` from `gm post` in its own session, `outside` from anywhere else), so only one added from outside is summoned.
- **Commands added:** `gm runs` lists a focus's runs; `gm summons` is what `/guild-chat:summons` runs; `gm run <run>` is the keeper. The resume summary (`gm where`) names a live run and any finished run not yet reviewed.

### What the visible Adventurer changed

The patron, on 2026-10-11, in the Party Leader of `adventurers` (posting #28):

<!-- patron: begin -->

"I don't like the fact that it's invisible. The same way that you've arrived inside herdr I want this one to be right under the party leader and specify the work so I could always click on it, view if there's anything I need to view inside its chats. This invisible pane is not good. So fix that"

<!-- patron: end -->

So an Adventurer is no longer a headless `claude -p`, when its Party Leader has a herdr pane:

- **Its own pane, under its Party Leader's.** The keeper, under the herdr lock, splits the Party Leader's recorded pane downwards (`herdr pane split <pane> --direction down --cwd <camp> --no-focus`), titles the new pane with the run (`run 3 · #28 visible-adventurer-pane`, by `herdr pane rename` and claude's own `--name`), records it on the run (schema 7: `pane_session`, `pane_id`, `pane_closed_at`), and types `gm adventurer <run> --pane <id>` into it, as `gm start` is typed into a Party Leader's. `gm adventurer` runs only in that run's pane, while the run is live.
- **An interactive Claude Code session.** `gm adventurer` starts claude in the camp with everything slice 1 and 2 gave it: `--session-id`, `--setting-sources user,project`, `--settings runs/<run>/settings.json` (its environment, permissions, the rules hook, commit attribution off), `--model`, `--effort` and `--permission-mode`, and the writ as its first prompt. The patron can click into the pane, read its chat and type to it.
- **The turn's end is the finish.** No `result` event comes from an interactive session, so the run's settings carry a `Stop` and a `StopFailure` hook, `gm hook run-stop`. At the first turn end it records the run's end: its last message (`last_assistant_message` in the hook's input, else the transcript's last assistant text) as `result.md`; from the transcript, the number of assistant messages as its turns, and their `costUSD` summed as its cost only when the transcript carries one; nothing else. It has no exit code, so its notice reads `run 3 finished: 12 turns`. A `StopFailure` ends it with the error (`finished: rate_limit`). The watch then summons the Party Leader as before. Later turns, the patron's own talk with the Adventurer, record nothing.
- **Lost, as before.** The keeper waits, looking every 2 seconds (`GM_RUN_POLL`): a pane that closes before the turn ended, or holds only a shell, ends the run as lost; so does claude ending before its turn did (`gm adventurer` records it, with the exit code in `result.md`). A keeper that is gone is reaped as slice 1 does.
- **The pane stays open** after the run ends, for the patron to read, until the Party Leader's review: a notice on one of its postings (`done`, `failed`, `needs-you`, or any other), or another dispatch on them, closes it (`herdr pane close`).
- **A permission prompt now waits for the patron** in the pane instead of being refused, since someone can answer it there. Nothing summons the patron to it yet; `gm runs` and `gm where` show the run still working.
- **The fallback is the headless run.** When the Party Leader has no pane herdr still has (the suite's tests opened with `--no-launch`, a Party Leader started outside herdr, herdr not installed or its server down) or herdr will not split the pane, the keeper runs `claude -p` exactly as slice 1 built it, unseen, and records the `result` event. The folder-trust question does not stop the pane's session: the Party Leader already runs in the same camp, and since #49 `gm dispatch` makes sure Claude Code trusts the camp before any run starts ([below](#starting-as-firstmates-crew-starts)).
- **Not yet checked against real herdr:** `pane split` and `pane rename` were written from the CLI's naming and are exercised only through the stub; a herdr that answers them differently makes the keeper fall back to `claude -p` (a split with no pane id) or leaves the pane untitled (claude's `--name` still names the session). The lab check by hand is in [How it will be checked](#how-it-will-be-checked).

### Its own workspace, and a Party Leader that answers it

The patron, on 2026-10-12, in the Party Leader of `adventurers` (posting #40):

<!-- patron: begin -->

"Don't forget, I want these to be opened right under you on the machine part, not on the bottom half the screen. Patron needs to be able to interact with you. [Image #3] [Image #4]"

<!-- patron: end -->

The split pane took the bottom half of the Party Leader's own pane, where the patron talks to it. So, as [herdr-design.md](herdr-design.md) had already said for every worker:

- **A workspace of its own.** The keeper, under the herdr lock, makes a workspace on the camp (`herdr workspace create --cwd <camp> --label '  └ #28 visible-adventurer-pane' --no-focus`), one step deeper than its Party Leader's `└ <focus>`, and places it right after the Party Leader's workspace in the sidebar with the same `workspace.move` as a Party Leader's under the guild's (after any other open run of that Party Leader). It is never focused. Its first pane is titled and runs `gm adventurer` as before; the run records the workspace beside the pane (schema 8: `pane_workspace`). A Party Leader placed later goes after the open runs' workspaces, so a run stays under its own Party Leader.
- **The review closes the workspace** (`herdr workspace close`), not only the pane. A run recorded before schema 8 has only its split pane closed.
- Everything else is as the visible Adventurer built it: the fallback to `claude -p`, the Stop hook, a lost pane.

The patron, the same day (posting #39), on an Adventurer that had waited a long while at a permission prompt:

<!-- patron: begin -->

"Why did you open it in a pane, right under you ? It needs to be a Pane in Herdr so you can see if the agent is blocked or not.

For example, your agent has been blocked for a while waiting on input. [Image #2]
As party leader, you are supposed to answer these. Think of firstmate and 2ndmate, you would need to manage your adventurers (crew)"

<!-- patron: end -->

So a blocked Adventurer waits for its Party Leader, not the patron. This changes "A permission prompt now waits for the patron" above:

- **Blocked is a summons.** While a run lives in a pane, the Party Leader's watch asks herdr at each poll what the pane is doing (`agent get`). The first time it says `blocked`, the run records it (schema 9: `blocked_at`, `blocked_summoned_at`) with the pane's last lines (`pane read --source recent`, trailing blank lines dropped, 15 kept, in `runs/<run>/blocked.txt`), and the watch summons the Party Leader with those lines and how to answer. Once per block: herdr saying anything else clears it, and so does an answer, so the next block summons again. The muster asks the same of each alive Party Leader's runs, so with the watch dead the nudge types `/guild-chat:summons` for it. `gm runs`, `gm where` and the Adventurer's status line say it is blocked.
- **`gm runner <run>`** is how the Party Leader answers: alone it shows the pane's last 40 lines; `--keys "down enter"` sends key presses, `--text` types words and Enter. A runner is recorded in the ledger before it is sent, and only to a live run of the focus with a pane open. The name is the glossary's: a message carried to a worker, recorded before it is delivered.
- **The charter** says it in its summons line: a blocked run is the Party Leader's to answer when it is safe and in scope; the summons itself adds that only the patron's decisions go to `needs-you`. The charter, playbook and rules still load whole: 9,290 characters for `~/.guildmaster` with the template files (the hook's first line is shorter to make room).
- **Fewer prompts to answer.** The run's settings allow what an Adventurer predictably reads: the rules file and the playbooks in the Guildhall, the issue and pull request views of `gh` and `gh-axi`, `ps`, `shellcheck` (git status, diff, log and show were already allowed), and its own scratchpad. `gh` is no longer denied whole: only a pull request's create, merge and review, as `glab` still is.
- **Its own name.** The run's settings set `GM_RUN_TITLE` and a status line of its own (`⛨ adventurer · run 7 · #39 … · for <focus> on <branch>`); the guild chat mod draws its replies under `⛨ ADVENTURER · run 7 · …` and gives it no welcome card, where it drew its Party Leader's `PARTY LEADER · <focus>` from the `GM_FOCUS` its settings carry.
- **The writ asks.** The contract template no longer says nobody answers: when something is unclear the Adventurer asks in its session with a question that waits for the answer, not by ending its turn (the first turn's end is the run's end), and only when no answer can come chooses the safer reading. The Guildhall's copy is the patron's and is not changed.
- **Not yet checked against real herdr:** that Claude Code's permission prompt and its question tool both read as `blocked`, and the `--lines` count `pane read` takes. `send-keys` takes several keys in one call, by its help.

### The permission mode, as Firstmate starts its crew

The patron, on 2026-10-12, in the Party Leader of `adventurers` (posting #41):

<!-- patron: begin -->

"I think adventurers should start the same way as crews from Firstmate ? Auto-mode or something similar ?"

<!-- patron: end -->

Firstmate starts every Claude crewmate with the flag `config/claude-permission-mode` names, `bypass` by default or `auto`, re-read on every launch, and refuses an unknown value ([its launch](../firstmate/components/crew/launch.html)). An Adventurer started in `acceptEdits` stops at every command its allow-list does not name, and each stop now summons its Party Leader. So this changes the fixed `--permission-mode acceptEdits` of [slice 1](#permissions-in-slice-1):

- **`adventurer-permission-mode` in `guild.conf`**: `auto` (the default until [#49](#starting-as-firstmates-crew-starts), now `bypass`) starts claude with `--permission-mode auto`, Claude Code's own classifier answering its prompts; `bypass` with `--dangerously-skip-permissions`; `acceptEdits` as before. It applies to every Adventurer gm starts, in its herdr workspace and in the `claude -p` fallback alike.
- **Read at every dispatch, recorded on the run.** `gm dispatch` reads the setting and writes Claude Code's mode name on the run (`permission_mode`: `auto`, `bypassPermissions`, `acceptEdits`), and the keeper starts claude from the run, so a run keeps the mode it was dispatched with. A value the setting cannot take refuses the dispatch, naming the setting, rather than starting an Adventurer in a mode the patron did not choose; elsewhere gm ignores such a value and keeps the default.
- **The guard rails stay in every mode.** The rules hook (`gm hook rules`) is in the run's settings whatever the mode, and so are the denied merges, rebases, new branches and merge requests: a `PreToolUse` hook's deny and a deny rule hold in `bypass` too. The suite checks the settings carry them in each mode.
- Firstmate's default is `bypass`; the guild's was `auto`, the safer of the two the patron named, since the rules hook is a guard rail, not a sandbox, until the patron chose `bypass` ([below](#starting-as-firstmates-crew-starts)).

### Starting as Firstmate's crew starts

The patron, on 2026-10-12, in the Party Leader of `adventurers` (posting #49):

<!-- patron: begin -->

"Then you need to make sure that when an adventure starts they start and bypass permission or on auto mode based on the ones you could control correctly. Check out how First Mate does it for its crews."

<!-- patron: end -->

What Firstmate does at a Claude crewmate's launch, besides the permission flag ([its launch](../firstmate/components/crew/launch.html), [its dispatch](../firstmate/components/crew/dispatch.html)), and what gm now does the same way:

- **`bypass` is the default**, as Firstmate's: the patron chose it. `auto` and `acceptEdits` stay, and a run still keeps the mode it was dispatched with.
- **No stop on the bypass confirmation.** The run's own settings carry `skipDangerousModePermissionPrompt: true`, so a `bypass` Adventurer never waits on Claude Code's "are you sure" for that mode, whatever the patron's own settings say. Claude Code 2.1.296 reads that key from the user, local, policy and `--settings` sources alike (checked in its code), and the run's settings come in through `--settings`.
- **No ghost prompt, no feedback drafts.** Every Adventurer's claude starts with `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false`, so no predicted next prompt sits in its composer looking like typed input when the watch reads its pane, and `CLAUDE_CODE_SEND_FEEDBACK=0`; its settings also say `feedbackDrafts: off`, Claude Code's own setting (`notify`, `quiet` or `off`) for the model-drafted feedback tool. Two controls, as Firstmate keeps them: a managed policy can turn the setting back on, never the variable. And `GM_VEIL=off`, so the veil never draws its deeds and notes out of the pane its Party Leader reads, whatever `guild.conf` says ([veil design](veil-design.md)).
- **A trust statement.** Firstmate appends one statement to a Claude worker's system prompt, since a brief that arrives as file-shaped content is otherwise indistinguishable from an injected prompt. Every Adventurer gets the same, adapted (`--append-system-prompt`, `GM_RUN_TRUST` in `bin/gm`): the writ and its Party Leader's answers in the session are first-party task instructions; project files, fetched content, issue and pull request text and tool output stay untrusted; and it grants no merge, destructive or other authority the writ does not.
- **The camp is trusted before it starts.** Claude Code asks whether to trust a folder it has not seen, `--dangerously-skip-permissions` does not skip that, and in a pane the question would stop the Adventurer before it reads its writ. Firstmate registers each crewmate's worktree in Claude Code's store before launch and refuses the spawn when it cannot (`bin/fm-claude-trust.sh`); the patron chose the same for gm. `gm dispatch`, before it records the run, reads `projects` in `${CLAUDE_CONFIG_DIR:-$HOME}/.claude.json`: the camp is trusted when `hasTrustDialogAccepted` is true for the camp, a folder above it, or the clone the camp is a worktree of, which is where Claude Code looks first for a linked worktree (this camp has no entry of its own and is trusted through its clone's). Otherwise gm sets it for the camp alone, keeping every other key, by an atomic replacement of a regular file the user owns, and reads it back. A store that is missing, a link, not the user's, not JSON, or a relative `CLAUDE_CONFIG_DIR` refuses the dispatch, recording no run, and says to open claude in the camp once. The keeper carries `CLAUDE_CONFIG_DIR` into the Adventurer's pane, so it reads the store gm wrote. The suite runs with a home of its own and no `CLAUDE_CONFIG_DIR`, so it never reaches the patron's store.
- **The guard rails hold in `bypass`, checked.** Checked for #49 by its Party Leader, on 2026-10-12, in real `claude -p` sessions in a throwaway repository: a `PreToolUse` hook's deny stopped a `git push` in `bypass` and in `auto`, and a plain `permissions.deny` rule stopped it in `bypass`; nothing reached the remote. So gm keeps its rules hook and its deny rules in the run's settings in every mode.
- **Firstmate does not rely on them.** Its crew has no `PreToolUse` deny hook and no `permissions.deny` rules: its Claude hooks only signal busy and turn end (`UserPromptSubmit`, `Stop`, `StopFailure`, `SessionEnd`). Its control is an isolated worktree per task, checked before launch; guarded scripts (`fm-pr-merge.sh`, run only on the captain's word); `FM_TASK_ID`, which makes its test runner refuse the primary checkout; the trust statement; and the brief. Its workers push their own `fm/` branch and open the pull request themselves. The guild keeps its rules hook and deny rules on top of the same launch, and grows its own as it goes.

## Slice 2: push rules in every camp

`gm hook rules`, a `PreToolUse` hook on `Bash`, in the Party Leader's settings and in every Adventurer's.
It answers for the playbook so that nothing stalls on a permission prompt (the patron's answer to Q3): `allow` for what the playbook permits, `deny` with the rule quoted for what it forbids, and nothing (Claude Code's normal permissions) for everything else. `permissionDecision` accepts allow, deny, ask or defer (<https://code.claude.com/docs/en/hooks>).

**Rules a hook can read.** The playbook's push rules are prose today, and the rules file's branch names are placeholders ("These are the patron's words for now"). Like the playbook's `phase:` lines, each gets a few machine-readable lines above the prose:

- in `rules/<repository>.md`: `development-branch:`, `integration-branch:`, `protected-branch:`;
- in `playbooks/ticket.md`: `push:` lines, for example `push: feature allow`, `push: development merge` (a merge of the feature branch, never a force-push or rebase), `push: integration deny`, `push: protected deny`.

The patron's files are never overwritten, so the pull request gives the lines to add; until they are there, the hook denies every push and says which line is missing.

**What it recognises** in a Bash command, after splitting on `;`, `&&`, `||` and pipes: `git push` (its remote, refspecs, `--force`, `-f`, `--force-with-lease`, `+` refspecs, `--delete`, `--mirror`, `--all`); a new branch (`git checkout -b`, `git switch -c`, `git branch <name>`, `git worktree add -b`); `git rebase` and `git reset --hard` while on the development branch; and the merge request (`glab mr create`, which the Party Leader may only ask for and an Adventurer is denied; the patron's word stays the gate).
It is a guard rail, not a sandbox ([consultation risk 7](consultation.md#risks)); slice 3 checks facts afterwards.

While a contract run is live, the same hook denies the Party Leader `Edit`, `Write` and a commit in the camp.

### The lines the patron adds

`gm` never overwrites the patron's files, so until these lines are in the Guildhall the hook denies every push, naming what is missing. A new Guildhall gets them from `templates/`, with the branch names left empty.

In each `rules/<repository>.md`, above the line, with that repository's real branch names (`protected-branch:` takes several, separated by spaces or commas, or on more than one line):

```
development-branch: development
integration-branch: integration
protected-branch: master
```

In `playbooks/ticket.md`, above the prose (the first line that applies wins; one ending in `in` and phases applies only in those phases; prose after the words is ignored, as on `phase:` lines):

```
push: feature merge in merge-request fix-loop sealed closed
push: feature allow
push: development merge
push: integration deny
push: protected deny
```

`allow` allows any push to that branch, `merge` only one that moves it forward (never forced, with `--force`, `-f`, `--force-with-lease` or a `+` refspec, and never deleted), and `deny` none.

### What building slice 2 changed

- **`push:` lines may name phases.** The playbook's own words, "push freely. Never force-push it once a merge request is open", need two lines for the feature branch, so a line may end in `in <phase>...`, and the first line that applies in the focus's phase wins.
- **A push to a branch no line names is denied**, and so are `--all`, `--mirror`, `--branches`, `--prune`, a pattern refspec, and a branch gm cannot read without running anything (`$(...)`, a variable, a detached `HEAD`). A tag, or `git push --tags` alone, is not a branch and is left to Claude Code's permissions, once the lines exist.
- **A command is allowed only whole.** It is split on `;`, `&&`, `||`, `|`, `&`, newlines and parentheses, with quotes, here-documents and comments read as the shell would (a commit message saying `git push` is not a push), and `bash -c` and `eval` read inside. Any part denied denies it; it is allowed only when every part is an allowed push or a plain `cd`. Anything else in it (`git add . && git push`) leaves it to Claude Code's permissions: an Adventurer, whose permissions do not list `git push`, then pushes in a command of its own.
- **The Adventurer's `Bash(git push*)` deny rule is gone.** Claude Code evaluates deny rules "regardless of what the hook returns" (<https://code.claude.com/docs/en/hooks>, PreToolUse decision control), so it would have outweighed the hook's allow; the hook answers every push instead. Its other deny rules (merge, rebase, new branches, `glab`, `gh`) stay.
- **The merge request**: `glab mr create`, `merge` and `approve`, and `gh pr create` and `merge`, are answered `ask` for the Party Leader, so the patron's word is the gate, and `deny` for an Adventurer.
- **New branches are denied to the Party Leader too**: `gm open` makes the only branch a focus has.
- **Rebase and `git reset --hard`** are denied on the development branch: when the camp (or a `cd`, or `git -C`) is on it, or `git rebase <upstream> <development>` would check it out. An abort is left alone.
- **While a contract run is live** the Party Leader's hook also covers `MultiEdit` and `NotebookEdit`, and only files and commits inside the camp; a run whose keeper is gone is reaped first, so a lost run never holds the camp.
- **A running Party Leader gets the hook at its next start**, since `gm open` writes the camp's settings.

## Slice 3: `gm check` after every run

The keeper runs `gm check <run>` after the Adventurer exits and before it summons the Party Leader, so the Party Leader sees the result and the check together.
`gm dispatch` snapshots the camp's refs (local branches, remote-tracking refs, `HEAD`) on the run row; `gm check` compares facts with the rules, never the Adventurer's account:

- the camp is still on the recorded branch;
- no local branch was created;
- after a `git fetch`, no remote branch moved except the feature branch and, if the playbook allows, the development branch, which only moved forward (its old tip is an ancestor of the new one);
- no commit exists outside the feature branch's line.

A failed check records the broken rule and the evidence on the run and in the summons.
Then, as [consultation section 4](consultation.md#4-rules-of-engagement-phases-and-playbooks) says, a first failure **reopens the posting**: `gm` dispatches a correction run at once, its writ rendered from `prompts/adventurer/correction.md` with the rule and the evidence quoted. A second failure on the same posting becomes `needs-you` with the evidence, for the patron. No model decides either step.

### What building slice 3 changed

- **The keeper runs the check, in both forms.** Headless, it runs `gm check` once it has recorded the `result` event. In a herdr workspace the run-stop hook records the end, and the keeper, which waits on that pane, runs the check within a poll (`GM_RUN_POLL`), not the hook: the check may dispatch a correction, which closes the failed run's workspace and the session the hook runs in. A run whose keeper is gone is checked in the background by whatever reaps it (`gm_check_spawn`), so no hook waits on a fetch.
- **The summons waits for the check.** A finished run is summoned once it is checked (`checked_at`), or after 5 minutes (`GM_CHECK_WAIT`), so a check cut off never holds it for ever. The summons says the check passed, or quotes the broken rules and their evidence and what gm did. A failed run is summoned though gm's correction or `needs-you` already reviewed it, so the Stop guard does not hold the Party Leader's turn for it.
- **Only a move this clone made counts.** `gm dispatch` keeps the refs without a fetch, since it returns in under a second, so its remote-tracking refs may be days old, and a fetch afterwards would show every teammate's push as moved. So `gm check` first reads the remote with `git ls-remote`, and counts a remote branch as moved by the run only when its remote-tracking ref's reflog records a push since the run started, or its new tip was already a commit here while nothing had fetched it. Then it fetches, and checks the development branch's old tip is an ancestor of its new one. A remote it cannot reach (SSH in batch mode, 15 seconds to connect) is noted on the check, and there only the pushes this clone recorded are checked.
- **Another focus's branch is that focus's.** Camps of the same clone share its branches, so a branch recorded for another focus is never counted as new, moved or off the line.
- **The feature branch's line** is checked from the commits made since the dispatch: each new entry of the camp's own `HEAD` reflog, each local branch's tip and `HEAD`, less what the feature branch or any ref at the dispatch already contained (and the development branch's new tip, when the playbook lets it move and it moved forward). A feature branch pushed with a commit the local one does not contain is off the line too. A rewritten feature branch is not a broken rule: the playbook allows a forced push to it before the merge request.
- **A correction is judged on its own run.** Its refs are kept at its own dispatch, so a branch the first run made, which an Adventurer cannot delete (`git branch` is denied it), is not counted again; its writ asks it to report what it cannot undo. It runs with the failed run's model, effort and brief, and the notice says `dispatched: correction, run 8 of run 7`; the failed run's outcome is `corrected`. A correction that cannot start (the camp not trusted, say) makes the posting `needs-you`, with why.
- **The correction's writ** is `prompts/adventurer/correction.md`, copied from `templates/` like the contract's, with the contract's slots and three more: `{{run}}`, `{{rule}}` and `{{evidence}}`.
- **Added:** schema 10 (`refs_before`, `check_started_at`, `checked_at`, `check_rules`, `check_evidence`, `corrects_run` on the run; runs from before it count as checked, with nothing to check against); `gm check <run>`, which checks a run that has ended and was not checked, and prints the recorded result; `runs/<run>/check.txt`; a `checked` notice on each posting; and `gm runs` shows each run's check.
- **Not yet checked against a real remote:** `git ls-remote` and `git fetch` over SSH to GitLab, with the patron's ssh-agent in the keeper's environment. The suite uses a bare repository on disk.

## Slice 4: parallel surveys and the dispatch cap

`gm dispatch <posting> --survey` runs a survey: a posting that produces knowledge, never a change.
It runs in a throwaway detached worktree of the feature branch's tip (`camps/<focus>.survey-<run>`), so any number can run beside the contract run; `Edit` and `Write` are disallowed, the rules hook denies commits and pushes, and the worktree is removed when the run ends.
Its **field report** is the run's result, kept as `reports/<focus>/<n>-<run>.md` in the Guildhall, so it survives its camp.

**The dispatch cap** is guild-wide: `adventurers: 3` in `guild.conf`, counting live runs across every focus. The Party Leader still decides what goes out: over the cap it may let a posting wait, or merge it into another's run. A dispatch over the cap is recorded as waiting and the notice says so; a keeper that finishes starts the oldest waiting run, and the muster does too, in case a keeper died. A second contract on a focus whose contract run is live waits the same way instead of being refused. The status line's guild row shows `adventurers 2 running · 1 waiting`.
A run that ends on a rate limit (the `result` event, and `StopFailure` with the `rate_limit` matcher) pauses all dispatch until the reset time, recorded and shown in the status line.

### Parallel contracts

The patron, on 2026-10-12, in the Party Leader of `adventurers` (posting #53, split into #55), asked whether contracts on one focus should run side by side:

<!-- patron: begin -->

"2. Yes, unless they have have requirements from one or the other, it should do parallel work when possible. So a git worktree. And when done make sure it cleans up."

<!-- patron: end -->

So "one contract at a time per focus" ([Q14](#what-the-patron-settled), [slice 1](#gm-dispatch)) ends. Each contract run works in a git worktree of its own, on a branch of its own, and `gm` lands what the Party Leader accepts on the feature branch, one run at a time. The ticket still has one branch anyone sees, and every worktree a run made is removed when its work has landed or been given up. This is what Firstmate does for its crew ([its worktrees](../firstmate/components/crew/worktrees.html), [its teardown](../firstmate/components/crew/teardown.html)), except that Firstmate's workers push their own branch and open a pull request each, where the guild's land on the ticket's one feature branch in the camp.

**A worktree and a branch per run.** When a contract run starts (not when it is dispatched, since it may wait), the keeper, under a per-clone lock in the Guildhall (Firstmate's project lock: two `git worktree add` on one clone must not interleave), runs in the camp:

```
git worktree add -b gm/run-<n> <hall>/camps/<focus>.run-<n> <feature branch's tip>
```

- **Its base is the feature branch's local tip** at that moment, so it holds every run already landed and every commit the Party Leader made in the camp, pushed or not. It does not hold the camp's uncommitted changes. The run records it (`base_commit`).
- **The run-local branch `gm/run-<n>`** is `gm`'s, not the ticket's: it is never pushed, and it is deleted when the run's work has landed or been dropped. The rules file's "a new branch for work that belongs to an open ticket" means a branch the ticket's work is shared on; a run-local branch is how `gm` holds one run's commits until they land, as a commit in the camp did before.
- **An Adventurer pushes nothing.** Its commits are not on the feature branch until they land, so the rules hook now denies every push from a run's worktree (a push to a branch no `push:` line names was already denied, and so is `HEAD:<feature branch>`); slice 2's allowed pushes become the Party Leader's alone, after landing.
- **The worktree is the run's**, isolated as Firstmate checks its crew's: a worktree root of the camp's clone, distinct from the camp and the clone's main checkout. Git itself keeps the run off the feature branch: a branch checked out in the camp cannot be checked out in another worktree.
- **Everything else is as slice 1 and its changes built it**, with the run's worktree where the camp was: the herdr workspace is created with `--cwd` on the worktree, `gm adventurer` starts claude there with the run's own settings, and the `claude -p` fallback runs there. The camp's `.claude/settings.local.json` stays the Party Leader's and a worktree has none. Claude Code trusts the worktree through its clone's entry when the clone is trusted; otherwise the keeper records `hasTrustDialogAccepted` for the run's worktree before it starts claude, as `gm dispatch` does for a camp ([#49](#starting-as-firstmates-crew-starts)), ending the run as `failed`, with why, when it cannot; the cleanup removes that entry, so the patron's store does not grow by one key per run.
- **What a fresh checkout lacks.** A worktree has the repository's tracked files only: no installed dependencies, no build output, no untracked local configuration. `gm` copies nothing into it. A repository that needs a setup step per checkout is a [question for the patron](#questions-only-the-patron-can-answer).

**The camp stays the Party Leader's.** No run changes a file in the camp any more, so the rule of slices 1 and 2 ("while a contract run is live, do not change files in the camp", enforced by the rules hook for `Edit`, `Write`, `MultiEdit`, `NotebookEdit` and commits) is lifted. In its place:

- **The camp is clean when `gm` lands.** A landing refuses while the camp has uncommitted changes to tracked files, naming them, and the rules hook denies the Party Leader's edits and commits in the camp only while a landing holds it (seconds).
- **The feature branch is never rewritten under a run.** While any contract run of the focus is live or holds commits not yet landed, the rules hook denies the Party Leader `git rebase`, `git reset` (other than `--soft` to `HEAD`) and a forced push of the feature branch, naming the runs: a run made from the old tip would otherwise bring back the commits a rewrite removed. The charter's rebase onto `origin/main` after a merged pull request waits until every run has landed or been dropped.
- **The Party Leader still does not do contract work.** The charter's "Adventurers do the work" stands; what changes is only that the camp is no longer locked.

**What needs what.** The patron's "unless they have requirements from one or the other" is the Party Leader's judgement, never `gm`'s:

- **Parallel is the default.** `gm dispatch 12` and then `gm dispatch 13` run side by side when the cap allows.
- **`--after` holds one for another.** `gm dispatch 13 --after 12` (several: `--after 12 --after 14`) names the postings this one needs. `gm` records the run as waiting, with the reason, and does not start it, or make its worktree, until every posting named has a run that has landed. Its worktree is then made from the tip that holds that work. The notice says so: `adventurers#13 add-export dispatched: contract, run 9, waits for #12`.
- **A need that cannot be met is summoned.** When a posting it waits for is recorded `failed`, `closed` or `needs-you` with nothing landed, the watch summons the Party Leader once, naming the waiting run. The Party Leader dispatches the posting again without `--after` (which replaces the waiting run), or records its state, which drops it.
- **Postings that belong together still go in one run** (`gm dispatch 12 13`), as the patron settled for Q13. The Party Leader's brief should hold what a writ cannot learn alone: which files a parallel run is also changing, when that is known.

**Landing: `gm land <run>`.** Accepting a run and landing it are one step, taken by the Party Leader after its review (the result in `gm runs`, the commits with `git log -p <feature branch>..gm/run-<n>`). `gm land <run>`, in plain code, under a per-focus landing lock so landings go one at a time in the order they were asked for:

1. Refuses, naming why, if the run has not ended, its check failed, the camp is not on the feature branch or is dirty, the run's worktree has uncommitted changes to tracked files ("uncommitted changes are never landed", Firstmate's words), or the run's `base_commit` is no longer an ancestor of the feature branch.
2. When the run made no commits, records it as accepted with nothing to land.
3. When the feature branch is still at the run's base, fast-forwards it (`git merge --ff-only gm/run-<n>` in the camp).
4. Otherwise merges with a merge commit: `git merge --no-ff --no-edit gm/run-<n> -m "Land run 9 (#13 add-export) on feature/<ticket>"`, in the patron's git identity as the camp has it.
5. Records `landed_at` and `landed_commit` on the run, the run's outcome `accepted`, and a `landed` notice on each of its postings: `adventurers#13 add-export landed: run 9 at 4f2a91c (merge with run 8's work)`.

**Fast-forward when it can, a merge commit when it must, never a rebase or a squash.** A run alone on the focus, as every run is today, then puts its commits straight on the feature branch with the history slice 1 gives. A merge commit appears only where two runs really ran side by side, and records that they did. A rebase or cherry-pick would rewrite the commits `gm check` judged and the Party Leader reviewed, so what landed would not be what was checked; a squash would lose the Adventurer's own commit messages, and the patron's charter already says never squash. Keeping every run's commits whole also makes cleanup simple: a run has landed exactly when its branch's tip is an ancestor of the feature branch, with no need for Firstmate's patch-id and merge-tree tests for squashed work.

A merge commit joins two changes no Adventurer tested together. The playbook's "tests pass locally" before `dev-test` covers it; whether `gm` should run the tests after a merge landing is a [question for the patron](#questions-only-the-patron-can-answer).

**A conflict is never resolved by `gm`.** When the merge in step 4 conflicts, `gm` runs `git merge --abort` (the camp is as it was), records the conflicting paths on the run, and treats it as the posting's failure, the way a failed check is ([slice 3](#slice-3-gm-check-after-every-run)):

- **A first failure dispatches a landing correction at once.** A fresh worktree and run-local branch are made from the feature branch's new tip, and in it `gm` starts the merge of the conflicting run's branch with `git merge --no-ff --no-commit gm/run-<n>`, leaving the conflict markers. The Adventurer's writ, from `prompts/adventurer/correction.md` with `{{rule}}` "landing" and `{{evidence}}` the conflicting paths and both runs' postings, asks it to resolve them, run the tests and commit; `git commit` concludes the merge, so an Adventurer is still never given `git merge`. Its branch then descends from both the new tip and the conflicting run's work, and lands by fast-forward. The notice says `dispatched: correction, run 11 of run 9 (landing conflict with run 8)`; run 9's outcome is `corrected`.
- **A second failure on the same posting**, of either kind (a failed check or a conflict), makes it `needs-you` with the evidence, as slice 3 settled.
- **A failed check's correction continues the failed run's work.** Slice 3's correction ran in the same camp, on top of what the failed run left. Now its worktree and run-local branch are made from the failed run's branch, not the feature branch, so its good commits are kept; the failed run's worktree is removed once the correction starts, since its branch's commits are then in the correction's.

**`gm check` judges the run's worktree.** Slice 3's facts still decide, with the run's own worktree and branch in place of the camp:

- the run's worktree is still on `gm/run-<n>`, and that branch still descends from the run's `base_commit` (nothing rewrote it);
- no local branch was created except the run-local branches `gm` recorded on runs (any focus's), as other focuses' branches are already excluded;
- no remote branch moved by a push from this clone that the run could have made: an Adventurer is now denied every push, and the Party Leader's own allowed pushes are recorded by its rules hook (branch and time), so a move the hook recorded as the Party Leader's is not the run's;
- no commit the run made (the new entries of its worktree's own `HEAD` reflog, which git keeps per worktree) is off `gm/run-<n>`'s line, and none reached the feature branch except through `gm land`.

The refs are kept when the worktree is made, not at dispatch, so a run that waited is judged from its own start.

**Cleanup.** A run's worktree and its run-local branch are removed (`git worktree remove`, then `git branch -d gm/run-<n>`, under the per-clone lock) when the run:

- **has landed**: at the end of `gm land`;
- **made no commits** and its postings have been reviewed (`done`, `failed`, `needs-you` or another dispatch), whatever the outcome, `lost` included;
- **holds commits, and the Party Leader says to drop them**: `gm drop <run>`, recorded in the ledger before anything is removed, the one way unlanded work is discarded. `git branch -D` is used only here.

A run whose worktree holds commits not landed, or uncommitted changes, is never removed by anything else: `gm runs` and `gm where` show it (`run 9 · holds 3 commits not landed`), and `gm close` refuses while one exists, naming it, as Firstmate's teardown "REFUSES if the worktree holds work that has not LANDED". Before removing a worktree, `gm` closes the run's herdr workspace if still open, ends any process whose current directory is inside the worktree (TERM, then KILL, as Firstmate reaps), and retries a removal held by git's `index.lock`, removing the lock only when no process holds it and it is older than 30 seconds (Firstmate's "the fix is patience, not rm").

**The muster sweeps what was left.** At every muster, in plain code, for each focus:

- an ended, reviewed run whose worktree is clean and whose branch's tip is an ancestor of the feature branch is cleaned up as above (a keeper that died after landing, or a `gm land` cut off);
- a `gm/run-<n>` branch with no worktree, contained in the feature branch, is deleted; one not contained is kept and shown as not landed;
- a worktree under `camps/<focus>.run-<n>` that no run record names, or a run record whose worktree is gone, is reported once in the roster, and `git worktree prune` clears git's record of a worktree whose folder is gone;
- a live run's worktree, and another focus's, are never touched.

**Beside the cap, the workspaces and the surveys.**

- **The cap counts every live run.** A focus's second and third contract no longer wait for its first: only the guild-wide cap of 3 and `--after` hold a run. A run waiting on `--after` is not in the cap's line until what it needs has landed; then it joins the line in order. The cap also bounds the checkouts on disk to 3 at a time, plus any left holding unlanded work.
- **One herdr workspace per run, as now**, each under its Party Leader's in the order the runs started, since several of one Party Leader's can now be open at once; its label and status line name the run-local branch and the feature branch it lands on (`run 9 · #13 add-export · gm/run-9 → feature/<ticket>`). The review closes it, as now; cleanup does not wait for the patron to have read it, but a workspace still open when its worktree is removed is closed first.
- **Surveys use the same place.** A survey's throwaway worktree is `camps/<focus>.run-<n>` too, detached at the feature branch's tip with no run-local branch, and removed when its field report is stored, so the muster sweeps one pattern. Surveys and contracts share the cap.

**What changes in the patron's files and the writ.** `gm` never overwrites the patron's files, so the pull request names these; `templates/` takes them for a new Guildhall. Proposed text:

- In `charter.md`, "Adventurers do the work", the first line:
  > A posting that changes the project is a contract: an Adventurer works it, not you, in a worktree of its own on a branch gm lands on the feature branch.
- In `charter.md`, replacing "One contract at a time: while a run is live, change no file here and keep other contracts `queued`.":
  > Contracts run in parallel when they do not need each other. When one needs another's work, say so: `gm dispatch 13 --after 12`. Keep the camp clean, and never rebase or reset the feature branch while a run holds work not landed.
- In `charter.md`, replacing "Review a finished run: its result (`gm runs`) and its commit (`git show`). Then record `done` with the commit, `failed`, `needs-you`, or dispatch again with a brief saying what to correct.":
  > Review a finished run: its result (`gm runs`) and its commits (`git log -p <feature branch>..gm/run-<n>`). To accept it, `gm land <run>`, then record `done` with the commit gm printed. Otherwise record `failed` or `needs-you`, or dispatch again with a brief saying what to correct; `gm drop <run>` discards a run's commits, and only when you mean to.
- In `charter.md`, "Commands": add `gm land` and `gm drop`.
- In `playbooks/ticket.md`, the build phase line:
  > phase: build — postings are worked by Adventurers, in parallel when they do not need each other, and each accepted run is landed on the feature branch.
- In `playbooks/ticket.md`, "build → dev-test":
  > **build → dev-test:** the postings meant for this round are done and landed on the feature branch, no run holds work not landed, and tests pass locally.
- In `rules/<repository>.md`, "What never happens here", after "A new branch for work that belongs to an open ticket.":
  > (gm's own run branches, `gm/run-<n>`, are not such a branch: they are never pushed, and gm removes each when its work lands on the feature branch.)
- In `prompts/adventurer/contract.md` and `correction.md`, a new slot `{{run_branch}}`, and the rules lines:
  > Work only here, in this worktree, on `{{run_branch}}`. Your Party Leader reviews your commits and gm lands them on the ticket's feature branch, `{{branch}}`; you never touch it. Never create, switch or delete a branch, and never push, merge or rebase.

  The commit line becomes "Commit your change on `{{run_branch}}`".

**Added:** schema 11 (`worktree`, `run_branch`, `base_commit`, `after_postings`, `landed_at`, `landed_commit`, `cleaned_at` on the run); `gm land <run>`, `gm drop <run>`, and `--after` on `gm dispatch`; the `landed` notice; the rules hook's record of the Party Leader's allowed pushes. Earlier text this changes: slice 1's step 1 refusal and the charter rule beside it, slice 2's lock on the camp while a run is live, slice 3's snapshot at dispatch and its checks on the camp, and slice 4's `camps/<focus>.survey-<run>` and "a second contract on a focus whose contract run is live waits".

#### Questions only the patron can answer

1. **Merge commits.** A run lands by fast-forward when the feature branch has not moved since it started, and with a merge commit only when another run landed first. Is that the history you want, or a merge commit for every run, so each run is one visible step on the branch?
2. **Setup per worktree.** A fresh worktree has no installed dependencies or build output. Should a rules file be able to name a setup command `gm` runs in each new worktree before the Adventurer starts (`worktree-setup: npm ci`), or is that the Adventurer's own first step, from the writ?
3. **Tests after a merge.** A merge commit joins two runs no Adventurer tested together. Should `gm` run the repository's test command in the camp after each merge landing and summon the Party Leader on a failure, or is the playbook's "tests pass locally" before `dev-test` enough?
4. **A landing conflict.** As designed, a first conflict sends one correction run to resolve it and a second makes the posting `needs-you`, as a failed check does. Or should every conflict come to you?

#### The patron's answers

Relayed by the Party Leader of `adventurers` on 2026-10-12, in its brief for #55; the patron's words were not quoted, so they are recorded as relayed:

| Question | Settled as |
| --- | --- |
| 1. Merge commits | Fast-forward when possible, a merge commit otherwise, as designed. |
| 2. Setup per worktree | Yes: an optional `worktree-setup:` line in the rules file (for example `worktree-setup: npm ci`), which `gm` runs in each new run worktree before the Adventurer starts. This repository has none. |
| 3. Tests after a merge | Yes: after a landing that made a merge commit, `gm` runs the test command the rules file names, on a machine-readable line of its own (`test-command:`; Guildmaster's is `bash tests/run.sh`). A failure becomes a correction run, and the feature branch is not pushed until the tests pass. |
| 4. A landing conflict | One correction run first, as designed; a second failure makes the posting `needs-you`. |

### What building slice 4 changed

Built as [Parallel contracts](#parallel-contracts) and the patron's [answers](#the-patrons-answers) say, with the cap, the waiting line, the rate-limit pause and surveys of the text above it. Where it differs, or says more:

- **Tests after a landing run in the background**, so `gm land` returns at once: in the landed run's own worktree, detached at what landed (its `worktree-setup:` already ran there), by `gm land-tests <run>`, which gm starts like a keeper; the run's branch is deleted at the landing, its worktree when the tests end, with what they printed in `runs/<run>/tests.txt`. They run after a landing that made a merge commit, and also after any landing while the focus's last tests failed or still run, so a correction that lands by fast-forward is tested too. While the last tests run or failed, the rules hook denies a push of the feature branch, saying which. A failure is the posting's failure: a posting already recorded `done` is reopened (`started`, by gm) for its correction run, which starts from the feature branch's tip; the Party Leader is summoned with it (a summons kind of its own).
- **A first failure counts every kind.** A failed check, a landing conflict and failing tests after a landing all count toward "a second failure on the same posting makes it `needs-you`".
- **The new lines** in `rules/<repository>.md` are `worktree-setup:` and `test-command:`, both empty in the template; a setup that fails ends the run before its Adventurer starts.
- **A run that could not start** (the clone's lock, a worktree folder already there, `git worktree add` refusing, Claude Code's trust, the setup) ends at once as `could not start`, its result saying why, and is summoned like any other run.
- **The waiting line.** A run is recorded at dispatch with `waiting` saying for what: `after` (the postings `--after` names have no landed run yet), `cap` (`adventurers:` in `guild.conf`, 3 by default), or `paused`; when it starts, its `started_at` is that moment and a notice says so (`run 9 started, now that what it needs has landed`). A keeper that ends, a landing, `gm drop`, the muster, and whatever reaps a lost run start the oldest waiting runs, under a dispatch lock, so the cap is counted by one gm at a time. A dispatch on a posting whose run still waits replaces that run (`dropped before it started`, outcome `redispatched`), and a state recorded on its posting (`queued`, `needs-you`, `done`, `failed`, `closed`, `parked`) drops it.
- **The rate limit** is a run whose `StopFailure` says `rate_limit`, or whose result is an error saying a limit was reached; dispatch pauses until the time its result names (Claude Code's `limit reached|<epoch seconds>`), else for `GM_RATE_PAUSE` (30 minutes), recorded on that run (`rate_limited_until`) with a notice.
- **Surveys.** `survey-model` (`sonnet`) and `survey-effort` (`medium`) are `guild.conf` settings, as Q14 settled, and the writ comes from `prompts/adventurer/survey.md`. A survey's settings deny `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `git add` and `git commit`, and its rules hook denies a commit. Its check asks that its checkout stay detached at its base with no commit; a survey whose check fails gets no correction run (there is nothing of it to correct), and the summons says so for the Party Leader to judge.
- **`gm check` of a run with a worktree** needs no fetch: an Adventurer is denied every push, so any remote branch moved by a push from this clone since the run started counts, unless the Party Leader's rules hook recorded a push to that branch since (`push.allowed` in the ledger, even inside a command it otherwise leaves to Claude Code's permissions). Runs from before slice 4, with no worktree, keep slice 3's check.
- **Landing a check's correction** measures from where the corrected run started, since the correction's own base is that run's branch; `gm land` says `nothing to land` when the feature branch already holds a run's commits.
- **A landing conflict** prints the evidence, dispatches the correction (`{{rule}}` begins `landing:` and says what conflicted) and exits non-zero, the camp as it was.
- **The rules hook on the feature branch** denies the Party Leader a rebase of it, a `git reset` that names a commit other than `HEAD` (`--soft` included), and a forced push or a deletion of it, while a run of the focus is live or holds commits not landed; unstaging, a path reset and `git reset --soft HEAD` are left alone.
- **Cleanup** removes a worktree only when nothing would be lost: no uncommitted change (untracked files included) and its branch and `HEAD` on the feature branch, or held by the check's correction that continues it. A process still working inside is found with `lsof`'s list of current directories. `gm runs` lists each run holding work (`run 9 · holds 3 commits not landed: gm land 9, or gm drop 9 to discard it`), and the roster names a stray folder or a run whose worktree is gone each time it is shown (`strays:`), rather than once.
- **The charter hook is two handlers.** The template charter, playbook and rules with slice 4's wording come to about 9,900 characters, over what one `additionalContext` holds (Claude Code's cap is 10,000), so `gm hook charter` now loads the charter alone and `gm hook charter --rules`, a second `SessionStart` handler in the camp's settings, the playbook with the rules; a running Party Leader gets it at its next start. Asked of the Party Leader for #55, which chose this over trimming the wording.
- **Added:** schema 11 has, beside the columns the text names, `waiting`, `after_summoned_at`, `correction` (`check`, `landing` or `tests`), `land_result`, `land_evidence`, `tests_result`, `tests_at`, `tests_summoned_at`, `trust_added`, `rate_limited_until` and `report` on the run; `gm land-tests <run>`; the notices `landed`, `land-conflict`, `tested`, `dropped`, `run-started` and `paused`; the summons kinds for failing tests and a waiting run whose need cannot be met.
- **Not changed:** the spyglass's Satchel still lists the camp and Claude Code's own `isolation: worktree` worktrees, not the run worktrees.
- **Not yet checked by hand:** a real Claude Code rate limit's `StopFailure` and result text; `lsof` on a busy machine; landing against a real GitLab remote. A `gm land-tests` that dies leaves its run's tests `running`, which holds the feature branch's push until another landing runs them again.

## Slice 5: Adventurer spans, `TRACEPARENT` and writ hashes

This is tracing slice 3, exactly as [tracing-design.md](tracing-design.md#how-the-trace-context-travels) defines it; nothing new is designed here.
The `guild.dispatch` span from `gm dispatch` to the keeper's end, with the run's kind, model, effort, exit code, cost and turns; `TRACEPARENT` set on the `claude -p` process so its `invoke_agent adventurer` span hangs under the dispatch; the session id `gm` assigns with `--session-id`, so its imported telemetry joins by id; the resource attributes `gm` sets for every session; a `guild.check` span under the dispatch; and `guild.writ.sha256` with `guild.prompt.writ-contract.sha256` and `guild.prompt.writ-survey.sha256` on the dispatch and on every span of the run. `gm stats --by-prompt` then compares outcomes per writ template version.
A summons is a span event on the posting's trace, so `gm trace` shows how long a posting or a result waited before its Party Leader heard of it.

The run's own record (slice 1) does not wait for this slice: the run row already holds cost and turns from the `result` event.

## Questions for the patron

All eight are settled; see [What the patron settled](#what-the-patron-settled). [Parallel contracts](#questions-only-the-patron-can-answer) asked four more, for slice 4, and [those are settled too](#the-patrons-answers).

## How it will be checked

- gm's suite, with a fake `claude` that writes a stream-json transcript and exits: `gm dispatch` returns at once, writes the writ from the template with every slot filled and nothing added, records the run and the notice, and refuses a second live contract on the focus; the keeper records the result, cost and turns, and the finish notice.
- The Adventurer's command line carries `--setting-sources user,project` and its own settings file with no capture, charter, Stop guard or status line; the writ is never recorded as a patron message.
- The Stop guard lets a turn end with a live run, and blocks it while a finished run is unacknowledged.
- The watch: in the Party Leader's pane, a `gm post --focus` from outside or a finished run makes it exit 2 within a poll, naming each, with a `summoned` event; never twice for the same thing; outside the pane, at once 0; a second arm and the capture hook each retire the armed watch; a patron's own message and a posting made and sorted in one turn never summon. `gm open --brief` records posting #1 before the launch. The muster records `unheard` once, and the roster shows it.
- Slice 2: a table of commands against the rules (allowed pushes allowed, forbidden ones denied with the rule, unrelated commands left alone, compound commands split), and every push denied while the rules lines are missing.
- Slice 3: in a throwaway repository with a bare remote, each broken rule caught from git facts alone; a first failure dispatches a correction run, a second becomes `needs-you`.
- Slice 4: surveys beside a contract run, in worktrees removed afterwards, with their field reports kept; the cap holds runs waiting and starts them as others finish; a rate limit pauses dispatch.
- Parallel contracts, in a throwaway repository with a bare remote: two contract runs of one focus in their own worktrees at once, neither touching the camp; `--after` holds a run, unmade, until its posting has landed, and makes it from the new tip; `gm land` fast-forwards the first and merges the second, one at a time, and refuses a dirty camp, a failed check or uncommitted work; a conflict leaves the camp as it was and sends one correction whose worktree holds the started merge; a second failure makes `needs-you`; `gm check` catches a push, a rewritten run branch and a commit off its line; each worktree and run branch is gone after landing, a lost run with no commits is cleaned up, one holding commits is kept until `gm drop`, and the muster sweeps what a dead keeper left.
- Slice 5: `gm trace` shows the dispatch, the Adventurer's run under it and the check, with the writ hash on each.
- By hand, in a lab herdr session, the done-when: dispatch a contract, keep talking to the Party Leader while it runs, and see the result wake it; then send a follow-up bug on the same ticket and see its commit land on the same feature branch, with a `git checkout -b` tried by the Adventurer denied. And issue #41's own steps: `gm open demo --repo <repo>`, then `gm post --focus demo "say hello"`, and the idle Party Leader takes it up with nobody in its tab; again after that turn ends, to see the Stop re-arm after a rewake turn; and once with `gm open demo2 --brief "say hello"`.
- By hand, once per Claude Code upgrade: the lab tests above.
- The visible Adventurer, with the herdr stub: dispatch makes the run a workspace of its own, labelled one step under its Party Leader's and placed right after it, never focused, leaving the Party Leader's pane whole, and titles its pane with the run; the pane runs claude with the writ as its first prompt and the run's settings; the Stop hook records the result and the watch summons; a later turn changes nothing; the review closes the workspace; a closed pane, or claude ending early, ends the run as lost. By hand, against real herdr: `herdr workspace create`, `workspace close` and `pane rename` answer as the stub does, and the sidebar shows the run's workspace under the Party Leader's.
- gm's suite: the muster's nudge against recorded screens (empty, suggestion, draft, multi-line draft, stash, draft and stash, a changing input), checking what it would type, with the herdr stub.

## Not in this step

- Adventurers for the other kinds, and recurring wakes (step 5).
- The front desk passing a note to a Party Leader unasked (`gm tell`, question Q22).
- Ending idle Party Leader sessions and starting them on demand (step 6), and the quota cap beyond the dispatch cap.
- Reading or writing the ticket tracker (Q15).
- A Jaeger view of Adventurer runs (tracing slice 4).
