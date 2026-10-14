# A focus of several repositories

One ticket of the patron's needs three merge requests: one in the front end, one in the CRM API, and one in the Kubernetes configuration.
Until now a focus held one repository, its camp a worktree of that clone, so a ticket like that meant three focuses, three Party Leaders and three boards, and nobody holding the ticket as a whole.
This document says how one focus now works on several repositories, as built in `bin/gm` on `feature/multi-repo-focus`, rebased onto step 3's slice 4, where every run works in a git worktree of its own and `gm land` lands it ([step-3-design.md](step-3-design.md)).
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s; the roadmap links it under [step 3](roadmap.md#step-3-adventurers-and-enforced-rules).

The patron asked for Firstmate's secondmates as the sample to follow, and said of the layout, as relayed:

<!-- relayed: begin -->

"I want second mates as a good sample of how we should be doing it. [...] I'm liking the fact that it has a projects folder with every repository in there—sort of like a work tree. Well, probably doesn't need to be a work tree, since it's its own project in there, with the branch name matching a ticket number or whatever the user defines."

<!-- relayed: end -->

## What Firstmate does, and what it leaves out

A Firstmate secondmate's home holds a `projects/` folder of clones (`AGENTS.md:60`), and its registry entry lists them as a "non-exclusive clone list, not ownership" (`.agents/skills/secondmate-provisioning/SKILL.md:42`).
Each crewmate it launches works in one project: `fm-spawn.sh <task-id> <project-dir>` takes one project folder (`bin/fm-spawn.sh:4`).
Nothing links the pull requests that crewmates open in different repositories for the same piece of work: each is its own task, and the secondmate keeps the connection in its head.

Guildmaster takes the layout and the one-repository-per-worker rule, and adds what Firstmate leaves out: the focus records every repository it works on, with each one's branch, phase and merge request, and shows them together.

## The layout

`gm open <focus> --repo <path>` with one `--repo` makes the camp as before: `camps/<focus>` is a git worktree of that clone on the feature branch.
With two or more, `camps/<focus>` is a plain folder, the Party Leader's home, holding its Claude Code settings, and `projects/<name>/` in it is a worktree of each clone, `<name>` the clone's folder name (`gm_cmd_open`, `bin/gm:1047`):

```
camps/crm-5/                     the Party Leader's home, no git repository
  .claude/settings.local.json    its hooks, as in any camp
  projects/
    web/                         worktree of ~/work/web on feature/CRM-5
    crm-api/                     worktree of ~/work/crm-api on feature/CRM-5
    k8s/                         worktree of ~/work/k8s on feature/CRM-5
```

Each repository's branch is the one its own rules file names (`feature-branch:` in `rules/<name>.md`), so three repositories with three conventions each get their own; `--branch` names one for all.
`gm repo add <path>` puts one more repository into a focus of several later, made as `gm open` makes them (`gm_cmd_repo_add`, `bin/gm:9288`); a focus opened on one repository refuses it, since its camp is that repository's worktree and cannot become a folder in place.

The register holds a `focus_repo` row for each repository (schema 12, `gm_schema12_sql`, `bin/gm:529`): its name, clone, worktree, branch, phase, position and merge request.
Every focus already open got one row, backfilled from its own columns, so a focus of one repository reads the same way as a focus of several.

## The decisions

### Worktrees, not clones

The patron wondered whether `projects/<name>` needs to be a worktree at all.
It stays one: a worktree shares the patron's clone's objects, remotes and fetches, so opening a focus costs a checkout rather than a whole clone, the patron's own clone sees the feature branch at once, and `git worktree list` in the clone names every camp that holds it.
A fresh clone would need its own credentials and remote setup, and would leave the feature branch where the patron's clone cannot see it.
The branch name still matches the ticket, or whatever the repository's rules say, as the patron asked.

### Fetch first, and branch from origin's default branch

A camp never starts from what the clone last fetched.
Before any worktree, `gm` fetches `origin` and refuses when the fetch fails (`gm_worktree_make`, `bin/gm:986`).
A new branch starts from a remote-tracking ref: `--base` or `base-branch:`, on `origin` when it names a branch there, or else `origin`'s default branch as `git ls-remote --symref origin HEAD` says it is now, then `origin/main` or `origin/master`; never a local branch or the clone's `HEAD`, which may be anything the patron left checked out.
An existing local branch is someone's work and is checked out as it is; an existing `origin/<branch>` is checked out tracking it.
A clone with no `origin`, a throwaway, starts from its `HEAD` as before.
A failed open takes back every worktree, branch and folder it made (`gm_open_undo`, `bin/gm:1249`).
This holds for a focus of one repository too.

### A phase for each repository, and the focus at the least advanced

The three merge requests move at their own pace: the Kubernetes change may be in review while the API change is still being built.
So each repository has its own phase, `gm phase <phase> --repo <name>` sets one, and `gm phase <phase>` without it sets every one (`gm_set_phase`, `bin/gm:1854`).
The focus's phase is the least advanced of its repositories' (`gm_focus_phase_sql`, `bin/gm:1848`): the ticket is no further on than its slowest part.

### The rules go by the repository a command is about

The push rules read the rules file, feature branch and phase of the repository a command targets, not the focus's.
The rules hook finds the project whose worktree holds a git command's directory (its `-C`, a `cd`, else the cwd) and loads that repository's rules (`gm_rules_target`, `bin/gm:5416`), so a push in `projects/web` reads `rules/web.md` and web's phase, and its denial names web.
A git command at the focus's folder, in none of its projects, that would push, commit, merge, rebase, tag, reset or make a branch is denied, naming the projects to `cd` into (`gm_rules_at_folder`, `bin/gm:5448`); reading git there is left alone.
A run's own worktree is its repository's too, so an Adventurer's commands there read that repository's rules.
`gm check` judges a contract or a survey in its own repository's clone (`gm_check_facts_run`, `bin/gm:6875`); a run across the repositories, which has no worktree, is checked in each repository's worktree, by its own rules and phase, each finding starting with the repository's name (`gm_check_repo`, `bin/gm:6747`).

### A contract in one repository, in a worktree of its own

An Adventurer works in one repository, as a Firstmate crewmate does.
`gm dispatch --repo <name>` makes the run's worktree from that repository's clone, from its feature branch in `projects/<name>`, beside the camp as every run's is (`camps/<focus>.run-<n>`, on `gm/run-<n>`), and its trust, refs, writ (`{{branch}}`, `{{phase}}`, `{{rules}}`) and settings (scratchpad, rules file, `adventurer-allow:` lines) are all that repository's; the run records it (`gm_run_prepare`, `bin/gm:6519`; `gm_dispatch_start`, `bin/gm:6087`).
A focus of several refuses a contract or a survey without `--repo`, naming its repositories (`gm_cmd_dispatch`, `bin/gm:5990`).
Contracts run in parallel, in one repository or several, as slice 4 runs them: under the same cap, held by `--after`, and each landed by `gm land`, which lands the run on its own repository's feature branch in `projects/<name>` (`gm_cmd_land`, `bin/gm:7267`; `gm_run_place`, `bin/gm:4982`); a correction works in the repository the run it corrects worked in.
What guards the feature branch while a run holds work not landed, and the push held while the tests after a landing fail, count only that repository's runs.
The worktree sits beside the focus's folder, not in `projects/`, so the folder holds only the projects, and `camps/<focus>.run-<n>` names a run of the focus whatever its repository, which the muster's sweep and the roster's strays read as slice 4 has them.
The branch's first design, built before slice 4, ran one contract at a time in each repository in `projects/<name>` itself and held the Party Leader's edits there meanwhile; rebased onto slice 4, it takes slice 4's parallel runs instead.
The charter says it in its line on parallel contracts: in a focus of several repositories, name the one a contract changes (`templates/charter.md:40`).

### Surveys: of one repository, or across them all

Slice 4's `gm dispatch --survey` finds something out and changes nothing; in a focus of several it takes `--repo` as a contract does, and works detached at that repository's feature branch tip in a throwaway worktree of its clone, its field report kept in `reports/`.
Some questions need every repository at once: where the API contract the front end calls is defined, or which configuration a change in the API needs.
`gm dispatch --across` is a survey of them all: it starts at the focus's folder, with no worktree, its writ from `prompts/adventurer/across.md` with a `{{repositories}}` slot listing each one, every rules file and every `adventurer-allow:` line.
It reads, builds and tests, and changes nothing: a survey's deny rules take every edit and commit from it, and the rules hook denies it any commit, push, branch made or switched, and any edit of a tracked file or of the folder outside the projects (`gm_rules_across_git`, `bin/gm:5668`; `gm_rules_across_edit`, `bin/gm:5690`).
It starts only while no contract works or waits, and no contract starts beside it, so what it reads cannot change under it.
Its refs are kept for each repository when it starts, and its report is kept in `reports/` as any survey's field report.
A check that finds it changed a repository is, as any survey's, the Party Leader's to judge, with no correction run; the branch's first design sent it to the patron, and the rebase onto slice 4 took slice 4's rule for surveys.

### Showing each repository wherever the focus shows

`gm repo mr <name> <url>` records a repository's merge request on its row and as an event (`gm_cmd_repo_mr`, `bin/gm:9346`).
`gm where`, `gm show` and the `SessionStart` resume summary give one line for each repository, with its branch, phase, merge request and git state read from its own worktree now (`gm_project_git_state`, `bin/gm:2014`), and name every repository's rules file.
The status line names each repository and its phase instead of one branch; the welcome card draws a line for each; the spyglass's Satchel shows a group for each worktree, each against its own origin's default branch.

## What stays as before

A focus of one repository is opened, dispatched, checked and shown as slice 4 has it: its camp is the worktree, its runs work in worktrees of their own beside it, `gm dispatch` needs no `--repo` (it takes one only when it names that repository), the rules hook reads its one rules file, and `gm where` prints the camp's git state.
The only visible changes are the fetch before the worktree, the new branch from `origin`'s default branch, and a merge request line in `gm where` once one is recorded.

## What is open

- **Ordering the merge requests.** Nothing yet says that the CRM API's merge request must land before the front end's that calls it, or the Kubernetes change before either. Each repository's phase moves alone, and the patron orders the merges. A dependency between a focus's repositories, and a phase that waits for another repository's, is the next question for the patron.
- **A repository taken out.** `gm repo add` adds one; nothing removes one from a focus yet, nor turns a focus of one repository into a focus of several.
- **A correction beside a run across.** No contract starts while a run across the repositories works or waits, and a correction gm sends is a contract: one sent then, after a failed check, a landing conflict or failing tests, cannot start, and its posting goes to `needs-you` instead. Holding the correction until the survey ends would be kinder; it waits for the patron's word.
- **Issue #65.** An Adventurer that runs its tests in the background is recorded as finished, and reviewing it closes its workspace and kills the live run (<https://github.com/MadReza/guildmaster/issues/65>). It is not particular to several repositories, but a survey across them, building and testing every one, is the run most likely to meet it.
