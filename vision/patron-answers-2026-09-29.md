# Patron answers, 2026-09-29

The patron's first answers to the questions in [consultation.md](consultation.md#questions-for-the-patron), plus three new requirements they raised with them.
They reached the guild at 2026-09-30T03:12Z (the evening of 2026-09-29 in the patron's time) as the supervising agent's rendering of the patron's words, so they are recorded here as relayed; only paragraph breaks and code marks were added.
Question numbers are the consultation's.

Where an answer settles something, [requirements.md](requirements.md) and the consultation now say so; unanswered questions stay open there.

<!-- relayed: begin -->

Q1: The patron works inside each Party Leader's own tab; the Guildmaster is a quiet front desk that can sometimes talk to a Party Leader.

Q3 ("push things"): work that keeps moving without stalls. Each playbook/workflow says when to push. Example rule: pushing to the shared development branch is allowed so the change can be validated on the development domains and APIs; integration only via a merge request; master never. Rules like these are written down per playbook and must be followed.

Q4 (exact branch names per repo): defer to a later stage; overview first.

Q6 (approvals): most likely opening the merge request needs the patron's word.

Q7 (ids): `Task-<Verb>-<Slug>` was only an example. The patron has both tickets and big projects, wants something more meaningful than a ticket number, but also wants to see which ticket belongs to which project or feature. For tasks inside a focus, `Task-Verb-Slug` is acceptable unless something better exists; the key need is a reference the AI resolves unambiguously.

Q9 (storage): the patron questions why SQLite is needed if agents can read and write files freely, noting that the patron will not read those coordination files, the agents will. Leave this open; firstmate will explain the trade-off to the patron in chat.

Q20 (language): wants it fast and portable between machines; bash would be preferred, the same technology as Firstmate unless there is a reason not to.

New requirements from the patron:

(a) persistence must not depend on the model remembering to save: the patron has seen Firstmate's stow miss or save the wrong information, forcing them to repeat answers; resumption must need no re-explaining.

(b) Supervisors must catch and correct a worker that breaks the rules, as Firstmate sometimes does.

(c) Claude quota already runs out with many Firstmate sessions; the design must reduce quota use.

<!-- relayed: end -->
