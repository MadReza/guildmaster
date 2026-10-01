# Step 1 design: one ticket that never forgets

This is the design of build-order step 1 from [consultation.md](consultation.md#build-order), as built in `bin/gm`.
The patron agreed to it on 2026-09-30 ("Sounds good, let's go with it !"), together with the storage, language, id and notice choices recorded below.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s.

**Done when** the patron can send ten items in a row, walk away, come back, and see all ten with their words and states, and a killed session resumes with nothing re-explained.
`tests/demo.sh` shows both with a real Claude Code session in a throwaway repository; `tests/run.sh` covers the parts without a model.

In this step the Party Leader still does the work itself, one posting at a time (the shortfall against requirements 1.6 and 1.7 that the Adventurers step, step 3 in [roadmap.md](roadmap.md), removes).

## What the patron agreed with this step

| Question | Settled as |
| --- | --- |
| Q9 storage | SQLite, one file, through the `sqlite3` command-line tool, for postings and state; plain files for the charter, playbooks and rules. No agent touches either directly: everything goes through `gm`. |
| Q20 language | Bash plus `sqlite3` and standard Unix tools, kept small. `gm` also runs on macOS's bash 3.2. |
| Q7 and Q23 ids | A focus gets a short name when it is opened (`appt-v2`) with its ticket keys attached (`CRM-8965`). Postings are numbered within the focus and carry a slug: `appt-v2#12 fix-owner-empty`. The verb is not part of the id. |
| Notices | One line per event, carrying the id. |
| Persistence | Never depends on the model remembering to save: a hook records every patron message word for word before the model acts on it, every state change is a `gm` command, and a new session resumes from a summary built from those records. |

## The Guildhall

`GM_HALL` (default `~/.guildmaster`) holds everything:

| Path | What |
| --- | --- |
| `register.db` | The register: SQLite in WAL mode. |
| `charter.md` | The Party Leader's charter. |
| `playbooks/ticket.md` | The ticket playbook. |
| `rules/<repository>.md` | Rules of engagement for one repository, named after the clone's directory. |
| `camps/<focus>/` | The focus's camp: a `git worktree` of the patron's existing clone. |
| `spill/` | Raw hook input kept when the register could not be written. |

The charter, playbook and rules are copied from `templates/` the first time they are needed and are the patron's from then on; `gm` never overwrites them.

## The register

One SQLite file. Every write is one `BEGIN IMMEDIATE` transaction with a 15-second busy timeout, so concurrent callers queue instead of failing: in WAL mode "readers do not block writers and a writer does not block readers", with "only one writer at a time" (<https://sqlite.org/wal.html>), and an immediate transaction takes the write lock up front instead of failing later with `SQLITE_BUSY` (<https://sqlite.org/lang_transaction.html>).
The schema is created on first use by building it in a temporary file and hard-linking it into place, so two first callers cannot both half-create it.

| Table | Holds |
| --- | --- |
| `focus` | Name, kind, the clone's path, the camp's path, the feature branch (fixed at open), the phase. |
| `ticket` | Ticket keys, each attached to exactly one focus. |
| `message` | Every patron message, word for word, with its session and prompt ids, and what it became: a `posting`, an `addition` to one, a slash `command`, or `unplaced` (no focus). |
| `posting` | Number and slug within the focus, the patron's words, state, park reason and wake condition. |
| `event` | Append-only history: each notice, phase change, session start, compaction and guard event, with its one-line text. These are the ledgers. |
| `guard` | The Stop guard's consecutive block count per session. |

## Ids and references

- A focus name is lowercase letters, digits and dashes, up to 32 characters, given at `gm open`.
- A posting's number is its identity and never changes. Its slug is a label: `gm` derives one from the patron's first meaningful words, and the Party Leader may replace it once, while the posting is still `received` (`gm notice 12 queued --slug fix-owner-empty`).
- `gm resolve` turns a reference into exactly one record or refuses and lists the candidates. Inside a focus (its camp directory, or `GM_FOCUS`) `12`, `#12` and a slug resolve within it; anywhere, `appt-v2#12`, `appt-v2#fix-owner-empty`, a focus name or a ticket key resolve. A bare `#12` at the front desk resolves only when one focus has a posting 12.
- In shell commands the Party Leader writes the bare number, because an unquoted `#12` starts a shell comment.

## Postings and notices

| Verb (`gm notice`) | State | |
| --- | --- | --- |
| `received` | received | Written by the capture hook or `gm post`, never by hand. |
| `queued` | queued | Kept, to do later. |
| `started`, `resumed` | active | Claimed. |
| `parked` (`gm park --why … [--until …]`) | parked | A reason is required; the wake condition is free text, and an ISO time that has passed is flagged in the summary. |
| `needs-you` | needs-you | A detail saying what the patron must decide is required. |
| `done` | done | |
| `failed` | failed | A detail is required. |
| `closed` | closed | Finished, or not work (a question answered, a message split into others). |
| `update` | unchanged | A progress line, also the acknowledgement of an addition. |

Every notice prints one line in the form `<focus>#<n> <slug> <verb>[: detail] ("<the patron's first words>")`, for example `appt-v2#12 fix-owner-empty needs you: keep the old URL? ("owner is empty after save…")`.
The quoted words are what make a resurfaced posting recognisable (requirement 8.8); `gm show` gives the rest.

## Capture: every message, before the model

The `UserPromptSubmit` hook (`gm hook prompt`) receives the submitted `prompt` text and runs before Claude sees it.
It records the message verbatim, straight from the hook's JSON into SQLite, so no shell quoting touches the words, and then:

- a message whose first line starts with a posting reference (`#12 …`, `appt-v2#12: …`) that resolves becomes an **addition** to that posting;
- a message starting with `/` is recorded as a **command** and is not a posting;
- anything else becomes a new posting in state **received**.

The hook tells Claude what it recorded through `additionalContext` (factual phrasing, as the hooks reference advises).
If the register cannot be written, the raw hook input is kept under `spill/` and the patron is told through `systemMessage`; the hook never blocks a prompt.

One message holding several items stays one posting until the Party Leader splits it with `gm post --from <n>` and closes the original.
Conversation is captured too: a question, "continue" or "start on the typo fix" becomes a posting that the Party Leader answers and closes, so the board shows everything the patron said.

## The Stop guard

`gm hook stop` refuses to let a turn end (`{"decision":"block","reason":…}`) while the focus has:

- a posting in state `received`;
- a posting in state `active` (claimed) with no outcome recorded, unless the Stop input's `background_tasks` shows work still running;
- an addition no notice has acknowledged.

It gives up after three consecutive blocks in a session, records a `guard.gave-up` event and tells the patron with `systemMessage`, so a broken `gm` cannot trap a session; Claude Code's own cap is eight consecutive continuations.
A new patron message resets the count.

## Resume from records

- `SessionStart` runs two handlers. `gm hook session-start` injects `gm where`: who this session is, the camp, branch and phase, the active and needs-you postings with the patron's words and every addition to them, the unsorted ones and unacknowledged additions, the queue in order, parked postings with their reasons, the last notices, the last five patron messages verbatim, the next step, and the camp's live git state. It also sets the session title to the focus name. `gm hook charter` injects the charter, playbook and rules files. Each stays under the 10,000-character cap Claude Code applies to each `additionalContext` string.
- `PreCompact` (`gm hook precompact`) writes a code-built snapshot (camp git state, open postings) into the event history; after compaction `SessionStart` fires again with source `compact` and re-injects the summary.
- A restarted Party Leader is a new session (`gm open <focus>` runs `claude --name <focus>` in the camp), not a resumed conversation: the summary is built from the register, never from a model's own account.

## The status line

`gm statusline` reads the session JSON on stdin and the register, in one query, and prints three lines:

```
▸ appt-v2 · ticket · CRM-8965 · phase 3/8 build · feature/CRM-8965
postings 1 active · 2 queued · 1 parked · 3 done · next #14 add-export
guild 2 focuses · need you elsewhere: saved-views 1 · ctx 41% · Opus
```

It refreshes every 5 seconds (`refreshInterval`) as well as on Claude Code's own events, because those "can go quiet when the main session is idle".

## Claude Code integration, and what it rests on

`gm open` writes the camp's own `.claude/settings.local.json` and nothing else: never `~/.claude/settings.json`, never the patron's clone.
The file carries `env` (`GM_HALL`, `GM_FOCUS`), an allow rule for `gm` so the Party Leader never stalls on a permission prompt for its own records, the four hooks, and `statusLine`.
If the camp's git does not already ignore the file, `gm` adds `/.claude/settings.local.json` to the repository's `info/exclude`, so it never shows in `git status` or a commit.

Checked against Claude Code 2.1.286 (`claude --version`; `claude --help` documents `--name` as the display name "shown in the prompt box, /resume picker, and terminal title", and `-p` for the demo's headless turns) and the documentation fetched on 2026-09-30:

| Contract | Source |
| --- | --- |
| Hook locations, including `.claude/settings.local.json` for a single project; hooks from several settings files merge and identical handlers run once. | <https://code.claude.com/docs/en/hooks> (Hook locations; Hook handler fields) |
| Common input fields `session_id`, `prompt_id`, `transcript_path`, `cwd`, `hook_event_name`. | hooks, Common input fields |
| `UserPromptSubmit` receives `prompt` "containing the text the user submitted", runs "before Claude processes it", 30-second default timeout; plain stdout or `additionalContext` reaches Claude. | hooks, UserPromptSubmit |
| `SessionStart` matchers and `source` values `startup`, `resume`, `clear`, `compact`, `fork`; `additionalContext` and `sessionTitle` outputs. | hooks, SessionStart |
| `Stop` input `stop_hook_active` and `background_tasks`; `decision: "block"` with a required `reason`; the 8-consecutive-continuation cap. | hooks, Stop |
| `PreCompact` input `trigger` and `custom_instructions`. | hooks, PreCompact |
| Exit code 2 and other non-zero codes; JSON on stdout; the 10,000-character cap on `additionalContext`, `systemMessage` and plain stdout. | hooks, Exit code output; JSON output |
| `statusLine` with `type: "command"`, `command`, `refreshInterval`; JSON on stdin with `workspace.current_dir`, `context_window.used_percentage`, `model.display_name`; each printed line is a row; an in-flight script is cancelled by a new update. | <https://code.claude.com/docs/en/statusline> |
| `.claude/settings.local.json` is project-local; in a git repository Claude Code keeps it at the repository root, and "in a worktree, it uses the file at the main checkout's root"; it still reads a file left in the starting directory. | <https://code.claude.com/docs/en/settings> (Where Claude Code keeps the local file in a git repository) |

The last row needed a test, because a camp is a linked worktree.
On 2.1.286, in a throwaway repository, a `claude -p` run started in a linked worktree ran the `SessionStart` and `UserPromptSubmit` hooks from the worktree's own `.claude/settings.local.json`, and a hook in the main checkout's `settings.local.json` ran as well, alongside it.
So the camp's file works, and a patron's own local hooks in the clone are not displaced. Where both files set the same single-valued key, the documentation says the root's value wins; a `statusLine` in the clone's own `.claude/settings.local.json` would therefore replace the camp's.

Claude Code asks once whether to trust each new camp folder; `gm` does not pre-answer that, since doing so means editing the patron's global `~/.claude.json`.

## What changed from the consultation

- **Ids.** `Task-<Verb>-<Slug>` gives way to `<focus>#<n> <slug>`, as the patron set out; the verb is the notice's, not the id's.
- **Capture.** The consultation had the hook write unsorted inbox rows for the Party Leader to sort into postings. Here the hook writes the posting itself (or the addition), so a message is on the board before the model runs; sorting is giving it a state, enforced by the Stop guard.
- **States.** The consultation's notice verbs are kept, with `update` added for progress and for acknowledging an addition, and `failed` given a state.
- **PreCompact** moved forward from step 6 into step 1, since it costs one small hook.

## Not in this step

Adventurer dispatch, `PreToolUse` push enforcement, the Guildmaster lobby and roster, tracing, and the recurring and incident kinds are later steps.
Also not yet: retiring a focus and removing its camp, waking a parked posting when its time comes (it is only flagged in the summary), attachments and screenshots, and reconciling the register with `git worktree list` at start.
