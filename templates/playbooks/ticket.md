# Ticket playbook

This file is the patron's. `gm` copied it into the Guildhall once and never overwrites it.
`gm phase` accepts only the phases named on the `phase:` lines below, in this order.

phase: intake — the ticket is understood and its first postings are on the board.
phase: camp — the camp exists on the ticket's feature branch, and that branch is recorded.
phase: build — postings are worked one at a time and committed on the feature branch.
phase: dev-test — the feature branch is pushed and merged into the shared development branch for testing.
phase: merge-request — a merge request from the feature branch to integration is open.
phase: fix-loop — bugs found in testing or review are fixed on the same feature branch and re-tested on development.
phase: sealed — the merge request is merged.
phase: closed — the ticket is finished and its camp can be removed.

## Leaving each phase

- **intake → camp:** `gm open` made the camp and recorded the branch.
- **camp → build:** the patron has given at least one posting to work on.
- **build → dev-test:** the postings meant for this round are done and committed; tests pass locally.
- **dev-test → merge-request:** the change works on the development environment, and the patron has said yes to opening the merge request.
- **merge-request → fix-loop:** a bug or review comment arrives. It becomes a posting on this same focus.
- **fix-loop → merge-request:** the fix is committed on the feature branch, pushed, and re-tested on development.
- **merge-request → sealed:** the merge request is merged.
- **sealed → closed:** the patron confirms the ticket is finished. A fix after sealing reopens the ticket at fix-loop, on the same branch.

## Gates: the patron's word

- Opening the merge request to integration.
- Anything irreversible, or anything this playbook does not allow.

## Push rules

`gm` answers pushes from these: `allow`, `merge` (forward only) or `deny`; the first that applies wins.

push: feature merge in merge-request fix-loop sealed closed
push: feature allow
push: development merge
push: integration deny
push: protected deny

- The feature branch: push freely. Never force-push it once a merge request is open.
- The shared development branch: allowed, by merging the feature branch into it, so the change can be validated on the development domains and APIs. Never rebase it and never force-push it.
- Integration: only through a merge request, never a direct push.
- Master: never.

The exact branch names for each repository are in its rules file.
