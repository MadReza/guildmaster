# Terminology

This file is the single owner of Guildmaster's vocabulary.
Every other document, script, and message in this project uses these words and only these words.
Where a term replaces one from Firstmate, the Firstmate column records the original so research notes written against that system stay readable.

## The name

**Guildmaster** is the whole system and the role at its centre: the one who runs an adventurers' guild, takes contracts, dispatches parties, and answers to the patron who commissioned the work.

| Form | Value | Used for |
| --- | --- | --- |
| Project name | `guildmaster` | repository, directories, documentation |
| Command | `gm` | the single user-facing entry point |
| Script prefix | `gm-` | every executable under `bin/`, e.g. `gm-dispatch.sh` |
| Environment prefix | `GM_` | every environment variable, e.g. `GM_HALL` |
| Function prefix | `gm_` | every shell function in shared libraries |

`gm` also reads as Game Master, which is deliberate: the same person who runs the table, keeps the world consistent, and never plays the characters themselves.

## Roles

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Patron** | The person the guild serves. The only source of authority, and the only one who can approve anything irreversible. | captain |
| **Guildmaster** | The patron's single point of contact. Supervises all work, and performs none of it directly. | first mate |
| **Party Leader** | A persistent supervisor owning one domain, with its own chapter house and its own queue. Idle by default, acts only on routed work. | second mate |
| **Adventurer** | An ephemeral worker dispatched for exactly one job, in its own camp, torn down when the job lands. | crewmate |
| **Scout** | An adventurer sent to learn rather than to build. Produces a field report and never changes a project. | scout |

## Work

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Posting** | One item of work on the quest board. The durable unit the guild tracks. | backlog item / task |
| **Contract** | A posting that produces a change to a project. The default kind. | ship task |
| **Survey** | A posting that produces knowledge, never a change. Investigation, diagnosis, planning, reproduction, audit. | scout task |
| **Writ** | The written instructions handed to one adventurer. An executable contract, not a suggestion. | brief |
| **Field Report** | A survey's deliverable. Self-contained, and survives the camp that produced it. | report |
| **Ruling** | A posting held for the patron because only they can decide it. | captain hold / decision |
| **Commission** | Turning a finished survey into a contract with the same adventurer, keeping its context. | promotion |

## Places

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Guildhall** | One instance's private home: its archive, ledgers, standing orders, and project clones. | operational home (`FM_HOME`) |
| **Chapter House** | A party leader's own guildhall, isolated from every other. | secondmate home |
| **Camp** | An isolated, disposable workspace for exactly one job. Never the main checkout. | worktree |
| **Roster** | Every worker the guildhall currently commands. | fleet |

## Records

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Charter** | The guildmaster's entire job description. Loaded at every start, and binding. | `AGENTS.md` |
| **Quest Board** | The durable queue of postings, their dependencies, and their history. | backlog |
| **Ledger** | An append-only record of events for one posting. A wake event, never current truth. | status log |
| **Register** | The one store behind `gm` that holds the quest board, the ledgers and every patron message word for word. Nothing but `gm` reads or writes it. | (none: state spread across files) |
| **Lorebook** | Durable operational knowledge local to one guildhall: facts learned the hard way. | learnings |
| **Standing Orders** | The patron's recorded preferences and working style. | captain preferences |
| **Archive** | Everything durable and private to one guildhall. | `data/` |

## Supervision

| Term | Definition | Firstmate |
| --- | --- | --- |
| **The Watch** | The single live supervision cycle. Exactly one runs while any work is under way. | watcher |
| **Summons** | One event that requires the guildmaster's attention now. Durable until handled and acknowledged. | wake |
| **Muster** | The once-per-session roll call that reconciles durable records with reality before any work starts. | session start |
| **Round** | A periodic whole-roster review with no specific trigger. | heartbeat |
| **Gone Quiet** | A worker that has stopped producing signs of life and must be inspected. | stale |
| **Runner** | A message carried to a worker, recorded durably before it is delivered. | steer |
| **Seal** | The exclusive claim one session holds over a guildhall. Without it, nothing may change. | session lock |

## Delivery

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Proving** | The automated gauntlet a change passes before it may be offered. | validation pipeline |
| **Sealing** | Landing an approved change. Requires the patron's word unless they granted standing authority. | merge |
| **Standing Authority** | A per-project grant letting the guildmaster seal green, in-scope work without asking each time. | yolo |

## Tools

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Grimoire** | A loadable procedure for one kind of work, read only when its trigger fires. | skill |
| **Familiar** | The bound agent runtime an adventurer works through. | harness |
| **Quarters** | Where workers are housed and reached. | runtime backend |

## Away

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Riding Out** | The posture while the patron is away and unreachable. | away mode |
| **Mandate** | The patron's own words, recorded verbatim, governing what the guild may do while they ride out. | away contract |

## Words kept as they are

Git, branch, commit, pull request, repository, remote, and clone keep their ordinary meanings.
Renaming them would obscure the one thing every reader already understands.

## Rules for adding a term

Add a term only when a concept genuinely exists and has no name yet.
A new term must be a noun a person would recognize from fantasy without a glossary, must map to exactly one concept, and must be recorded in this file in the same change that introduces it.
Never give one concept two names, and never reuse one name for two concepts.
