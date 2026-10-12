# Step 3 design: Adventurers and enforced rules

This is the design of roadmap step 3 ([roadmap.md](roadmap.md#step-3-adventurers-and-enforced-rules)), whose scope is build-order step 2 of [consultation.md](consultation.md#build-order), turned into build slices.
The patron agreed to it on 2026-10-11 ("Go for it."), with every [question](#questions-for-the-patron) settled. Slices 1 and 2 are built; [What building slice 1 changed](#what-building-slice-1-changed), [What the visible Adventurer changed](#what-the-visible-adventurer-changed) and [What building slice 2 changed](#what-building-slice-2-changed) record where they differ from the text below.
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
| 4 | Parallel surveys and the dispatch cap | settled |
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
- **The fallback is the headless run.** When the Party Leader has no pane herdr still has (the suite's tests opened with `--no-launch`, a Party Leader started outside herdr, herdr not installed or its server down) or herdr will not split the pane, the keeper runs `claude -p` exactly as slice 1 built it, unseen, and records the `result` event. The folder-trust question does not stop the pane's session: the Party Leader already runs in the same camp.
- **Not yet checked against real herdr:** `pane split` and `pane rename` were written from the CLI's naming and are exercised only through the stub; a herdr that answers them differently makes the keeper fall back to `claude -p` (a split with no pane id) or leaves the pane untitled (claude's `--name` still names the session). The lab check by hand is in [How it will be checked](#how-it-will-be-checked).

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

## Slice 4: parallel surveys and the dispatch cap

`gm dispatch <posting> --survey` runs a survey: a posting that produces knowledge, never a change.
It runs in a throwaway detached worktree of the feature branch's tip (`camps/<focus>.survey-<run>`), so any number can run beside the contract run; `Edit` and `Write` are disallowed, the rules hook denies commits and pushes, and the worktree is removed when the run ends.
Its **field report** is the run's result, kept as `reports/<focus>/<n>-<run>.md` in the Guildhall, so it survives its camp.

**The dispatch cap** is guild-wide: `adventurers: 3` in `guild.conf`, counting live runs across every focus. The Party Leader still decides what goes out: over the cap it may let a posting wait, or merge it into another's run. A dispatch over the cap is recorded as waiting and the notice says so; a keeper that finishes starts the oldest waiting run, and the muster does too, in case a keeper died. A second contract on a focus whose contract run is live waits the same way instead of being refused. The status line's guild row shows `adventurers 2 running · 1 waiting`.
A run that ends on a rate limit (the `result` event, and `StopFailure` with the `rate_limit` matcher) pauses all dispatch until the reset time, recorded and shown in the status line.

## Slice 5: Adventurer spans, `TRACEPARENT` and writ hashes

This is tracing slice 3, exactly as [tracing-design.md](tracing-design.md#how-the-trace-context-travels) defines it; nothing new is designed here.
The `guild.dispatch` span from `gm dispatch` to the keeper's end, with the run's kind, model, effort, exit code, cost and turns; `TRACEPARENT` set on the `claude -p` process so its `invoke_agent adventurer` span hangs under the dispatch; the session id `gm` assigns with `--session-id`, so its imported telemetry joins by id; the resource attributes `gm` sets for every session; a `guild.check` span under the dispatch; and `guild.writ.sha256` with `guild.prompt.writ-contract.sha256` and `guild.prompt.writ-survey.sha256` on the dispatch and on every span of the run. `gm stats --by-prompt` then compares outcomes per writ template version.
A summons is a span event on the posting's trace, so `gm trace` shows how long a posting or a result waited before its Party Leader heard of it.

The run's own record (slice 1) does not wait for this slice: the run row already holds cost and turns from the `result` event.

## Questions for the patron

All eight are settled; see [What the patron settled](#what-the-patron-settled).

## How it will be checked

- gm's suite, with a fake `claude` that writes a stream-json transcript and exits: `gm dispatch` returns at once, writes the writ from the template with every slot filled and nothing added, records the run and the notice, and refuses a second live contract on the focus; the keeper records the result, cost and turns, and the finish notice.
- The Adventurer's command line carries `--setting-sources user,project` and its own settings file with no capture, charter, Stop guard or status line; the writ is never recorded as a patron message.
- The Stop guard lets a turn end with a live run, and blocks it while a finished run is unacknowledged.
- The watch: in the Party Leader's pane, a `gm post --focus` from outside or a finished run makes it exit 2 within a poll, naming each, with a `summoned` event; never twice for the same thing; outside the pane, at once 0; a second arm and the capture hook each retire the armed watch; a patron's own message and a posting made and sorted in one turn never summon. `gm open --brief` records posting #1 before the launch. The muster records `unheard` once, and the roster shows it.
- Slice 2: a table of commands against the rules (allowed pushes allowed, forbidden ones denied with the rule, unrelated commands left alone, compound commands split), and every push denied while the rules lines are missing.
- Slice 3: in a throwaway repository with a bare remote, each broken rule caught from git facts alone; a first failure dispatches a correction run, a second becomes `needs-you`.
- Slice 4: surveys beside a contract run, in worktrees removed afterwards, with their field reports kept; the cap holds runs waiting and starts them as others finish; a rate limit pauses dispatch.
- Slice 5: `gm trace` shows the dispatch, the Adventurer's run under it and the check, with the writ hash on each.
- By hand, in a lab herdr session, the done-when: dispatch a contract, keep talking to the Party Leader while it runs, and see the result wake it; then send a follow-up bug on the same ticket and see its commit land on the same feature branch, with a `git checkout -b` tried by the Adventurer denied. And issue #41's own steps: `gm open demo --repo <repo>`, then `gm post --focus demo "say hello"`, and the idle Party Leader takes it up with nobody in its tab; again after that turn ends, to see the Stop re-arm after a rewake turn; and once with `gm open demo2 --brief "say hello"`.
- By hand, once per Claude Code upgrade: the lab tests above.
- The visible Adventurer, with the herdr stub: dispatch splits the Party Leader's pane downwards and titles it with the run; the pane runs claude with the writ as its first prompt and the run's settings; the Stop hook records the result and the watch summons; a later turn changes nothing; the review closes the pane; a closed pane, or claude ending early, ends the run as lost. By hand, against real herdr: `herdr pane split` and `herdr pane rename` answer as the stub does, and the pane shows the session under the Party Leader's.
- gm's suite: the muster's nudge against recorded screens (empty, suggestion, draft, multi-line draft, stash, draft and stash, a changing input), checking what it would type, with the herdr stub.

## Not in this step

- Adventurers for the other kinds, and recurring wakes (step 5).
- The front desk passing a note to a Party Leader unasked (`gm tell`, question Q22).
- Ending idle Party Leader sessions and starting them on demand (step 6), and the quota cap beyond the dispatch cap.
- Reading or writing the ticket tracker (Q15).
- A Jaeger view of Adventurer runs (tracing slice 4).
