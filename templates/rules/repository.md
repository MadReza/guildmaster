# Repository rules

This file is the patron's. `gm` copied it into the Guildhall the first time a focus opened on this repository, and never overwrites it.
Rename nothing above the line; `gm` reads these settings when it opens a new focus.

feature-branch: feature/{ticket}
base-branch:
adventurer-allow:
development-branch:
integration-branch:
protected-branch:

- `feature-branch` is the pattern for a new focus's branch. `{ticket}` is the first ticket key given to `gm open` (the focus name when there is none), and `{focus}` is the focus name. `gm open --branch` overrides it.
- `base-branch` is where a new feature branch starts when it does not exist yet. Empty means the remote's default branch (`origin/HEAD`), or the clone's current commit when there is no remote. `gm open --base` overrides it.
- `adventurer-allow` is a command an Adventurer may run, as a Claude Code permission rule, one a line: this repository's build and test commands, such as `adventurer-allow: Bash(npm test*)`. Headless, a command nobody allowed is refused.
- `development-branch`, `integration-branch`, `protected-branch`: the branches of the playbook's `push:` lines. While one is empty, no push goes.

---

## Branches

- Shared development branch: `development`
- Integration branch: `integration`
- Protected branch: `master`

These are the patron's words for now; write this repository's real names here.

## What never happens here

- A force-push or rebase on the shared development branch.
- A direct push to integration or master.
- A new branch for work that belongs to an open ticket.

## How to build and test

Write this repository's build and test commands here.
