# Step 3 design: Adventurers and enforced rules

This is the design of roadmap step 3 ([roadmap.md](roadmap.md#step-3-adventurers-and-enforced-rules)), whose scope is build-order step 2 of [consultation.md](consultation.md#build-order), turned into build slices.
It is a proposal: nothing here is built until the patron agrees, and the [questions](#questions-for-the-patron) at the end decide parts of it.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s.

The patron asked for it on 2026-10-11, in the Party Leader of `adventurers`:

<!-- patron: begin -->

"Start roadmap step 3, Adventurers and enforced rules (vision/roadmap.md, scope from vision/consultation.md). First posting: write vision/step-3-design.md the way step-1-design.md was written: the scope turned into build slices, in this proposed order: (1) gm dispatch runs one headless claude -p Adventurer in the camp, its result lands in the register and wakes the Party Leader; (2) PreToolUse push rules in every camp, from the playbook; (3) gm check after every run, reopening a posting that broke a rule; (4) parallel surveys and the dispatch cap; (5) Adventurer spans, TRACEPARENT and writ hashes (tracing slice 3). Keep the roadmap's done-when: I can keep talking to you while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch. Put the questions it depends on in the design and ask me them: Q4 branch names, Q13 and Q14 quota and models, commit identity and AI trailers, and which GitLab credentials headless runs may use. Also take GitHub issue #41 (a posting added to a focus does not reach its idle Party Leader), since it is close to slice 1's wake."

<!-- patron: end -->

**Done when** the patron can keep talking to the Party Leader while an Adventurer works, and a follow-up bug on the ticket lands on the same feature branch.
Slice 1 meets the first half; slices 2 and 3 make the second half enforced rather than only asked for.

This step removes step 1's deliberate shortfall: the Party Leader stops doing the work itself (requirements 1.6 and 1.7).

## What the patron settled

Answered on 2026-10-11; question 7 is still open below.

<!-- patron: begin -->

"1. Ok. 2. That is fine until there is a list of tasks that can be picked up. So Patron still asks for tasks, tasks might be queued after those 3 or merged into one depending on judgement call. [...] 4. Claude Code's commit attribution is completly turned off. User can overwrite it if they want or think it's necessary. This would be the way it currently works. GM doesn't need to check for this. I don't see why it would ? 5. Sounds good. [...] 8. yes."
"3. Okay with the new recommendation."
"6. Herald maybe ? Watch could be good. Whatever you pick, add it to the terminology list. The terms could also be in different context mean different things. Until the ai doesn't get confused or the user."

<!-- patron: end -->

| Question | Settled as |
| --- | --- |
| Q4 branch names | `development-branch:`, `integration-branch:` and `protected-branch:` lines in each `rules/<repository>.md`, read by slices 2 and 3; a repository without them has every push denied. |
| Q13 quota | A guild-wide cap of 3 live Adventurers, and dispatch paused at a rate limit, for as long as the patron hands out the work. Postings beyond the cap wait, or the Party Leader merges several into one run when its judgement says they belong together (`gm dispatch 12 13`). A list of work that Adventurers pick up by themselves is a later change. |
| Commit identity and AI trailers | The patron's own git identity, as the camp has it. Claude Code's commit attribution is off for every Adventurer, from a `guild.conf` setting (`commit-attribution: off`) that the patron can turn on. `gm` does not check commits for it. |
| GitLab credentials | Only the patron's SSH key, through the running ssh-agent, for `git fetch` and the pushes slice 2 allows. No `glab` token: an Adventurer never opens, approves or merges a merge request. |
| Q14 models | Contracts on the Party Leader's own model at medium effort; surveys on Sonnet 5.5 at medium. Each kind's model and effort are `guild.conf` settings (`contract-model`, `contract-effort`, `survey-model`, `survey-effort`), and the Party Leader can override them per dispatch with `--model` and `--effort`. A kind moves to a cheaper model when its recorded outcomes ([below](#a-runs-outcome-for-judging-models-and-prompts)) show it holds. A **contract** changes the project, in the ticket's camp, one at a time per focus; a **survey** only finds things out, read-only, in a throwaway worktree, ending in a field report. |
| The words | **Summons** for the event and **the watch** for the process, both already in TERMINOLOGY.md and widened there to any supervisor; **run** and **keeper** added. Herald was not needed: a new term is added only for a concept with no name yet, and both concepts had one. |
| Correction runs | A failed check dispatches one correction run at once; a second failure on the same posting goes to the patron as `needs-you`. |

## The slices

| Slice | What | Needs from the patron |
| --- | --- | --- |
| 1 | `gm dispatch` runs one headless `claude -p` Adventurer in the camp; its result lands in the register and wakes the Party Leader. With it, the wake for a posting added from outside (issue #41) | question 7 (a nudge) |
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
So an Adventurer runs with `--setting-sources user,project`, which leaves the camp's local settings out, and `--settings runs/<run>/settings.json`, which `gm` writes per run with only what an Adventurer needs: `GM_HALL`, `GM_FOCUS` and `GM_RUN` in `env`; the tool-recording hooks, so its tool calls are in the register; from slice 2, the rules hook; and Claude Code's commit attribution switched off unless `guild.conf` says `commit-attribution: on`. No charter, no capture, no Stop guard, no status line.
The repository's own committed `.claude/settings.json` and `CLAUDE.md` still load, as they would for the patron.

*To check before building:* that `--setting-sources` without `local` leaves out a linked worktree's `settings.local.json` (step 1 found Claude Code reads it from the starting directory as well as the main checkout), and that `-p` in a camp never stops on the folder-trust question.

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
- **Never typed into the pane.**

On a summons it records the events, prints the summons and exits 2. For example:

```
gm: while you were idle:
- run 7 for appt-v2#12 fix-owner-empty finished: exit 0, 22 turns, $1.41. Its result: runs/7/result.md
- appt-v2#13 add-export was posted from the front desk (received): "Add a CSV export to …"
Review the run and sort the posting as your charter says; show the patron each notice line.
```

Claude Code enforces `timeout` on an `asyncRewake` hook, so the watch gets a long one (`GM_WATCH_TIMEOUT`, 86400 seconds) and exits 0 just before it.

**The check that does not depend on the hook chain.** The muster (`gm up`, at every terminal command and every 5 minutes from launchd) already reads every Party Leader's state. For an alive, idle Party Leader with a summons older than 2 minutes and no live watch, it records `unheard` once, and `gm roster` shows it on that Party Leader's row (`idle · unheard: run 7, #13 since 01:09`), so the front desk can tell the patron. It does not type into the pane (question 7).

**A first job for a new focus.** `gm open <focus> --repo <path> --brief "<words>"` (or `--brief -` from standard input, with `--slug`) records the words as posting #1 before the Party Leader starts; its `SessionStart` watch summons it within seconds. `gm post` gains `--focus <name>`, so the front desk no longer needs `GM_FOCUS=` before it.
The front desk's charter gains: when the patron gives a new focus its job in the same breath, pass their words verbatim with `--brief`; when the patron asks to hand an existing focus a job, `gm post --focus`. Both happen at the patron's request, so "never talk to a Party Leader on your own initiative" still holds.

The Party Leader's charter template gains one line: "A summons from gm names a run that finished or a posting added while you were idle; review or sort it like a patron message." The patron's own `charter.md` in the Guildhall is never overwritten; the pull request names the lines to add there by hand.
A running Party Leader gets the watch hooks at its next start, since `gm open` writes the camp's settings.

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

Questions 1 to 6 and 8 are settled ([above](#what-the-patron-settled)); this one is open, numbered as first asked.

7. **Who summons, and who nudges.** No model does either; both are `gm`'s code.
   *The summons* is the normal way: a run's keeper records the run's end, or `gm post` records a posting from outside. The Party Leader's watch, a background hook started by Claude Code at its session start and every turn end, sees the new row within 2 seconds and exits with code 2. Claude Code then shows the summons to the Party Leader and starts a turn. Nothing is typed.
   *A nudge* is only for when that has failed: the watch is not running (Claude Code did not re-arm it, its timeout ran out, it crashed), so a summons sits unheard while the Party Leader is idle. The muster, which already runs every 5 minutes from launchd and checks every Party Leader, is the only thing that could notice. It could then type a short line into the Party Leader's herdr pane, as `gm close` types `/exit` today. That always reaches it, but anything you had half-typed in that pane is lost (Firstmate's #4664), and the line arrives in the chat as if you had typed it.
   *Recommended:* the muster records it as unheard and `gm roster` shows it, so the front desk can tell you; it types nothing. Or: it types the nudge, but only when it can see the pane's input line is empty (`herdr pane read` shows the screen; whether that is reliable is untested).

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
- By hand, once: Claude Code accepts a `timeout` of 86400 on an `asyncRewake` hook.

## Not in this step

- Adventurers for the other kinds, and recurring wakes (step 5).
- The front desk passing a note to a Party Leader unasked (`gm tell`, question Q22).
- Ending idle Party Leader sessions and starting them on demand (step 6), and the quota cap beyond the dispatch cap.
- Reading or writing the ticket tracker (Q15).
- A Jaeger view of Adventurer runs (tracing slice 4).
