# Guildmaster requirements, first pass

This restates the patron's notes of 2026-09-29 ([patron-notes-2026-09-29.md](patron-notes-2026-09-29.md)) as a numbered list grouped by theme.
The notes, including the addition relayed later the same day, are the source record, together with the patron's first answers ([patron-answers-2026-09-29.md](patron-answers-2026-09-29.md)); where this file and those records disagree, the records win.
Every requirement quotes the sentence it comes from.
The priority on each is a recommendation, not the patron's ruling, using MoSCoW: **Must** (the first useful Guildmaster fails without it), **Should** (wanted soon after), **Could** (worth doing when cheap), **Won't** (explicitly not now).

The consultation that answers these requirements against Firstmate is [consultation.md](consultation.md).

## Words used here

The patron spoke in Firstmate's words, as placeholders.
This file uses [TERMINOLOGY.md](../TERMINOLOGY.md) instead:

| Patron said | This file says | Note |
| --- | --- | --- |
| first mate, guildmaster | Guildmaster | |
| second mate | Party Leader | The patron had no term, used "second mate" as a placeholder, and then ruled on 2026-09-29 that the role is called Party Leader (it was Chapter Master in TERMINOLOGY.md until that ruling). The relayed addition quoted below predates the ruling and still says Chapter Master. |
| crews | Adventurers | |
| task, "fix it" item | Posting | One item on a Party Leader's Quest Board. |
| project folder, "a project to keep track of information" | Chapter House | A Party Leader's own guildhall. |
| work tree | Camp | A git worktree for exactly one job. |
| run book, playbook | playbook | No term exists yet. Plain word until the patron decides (open question Q2). |
| phase | phase | Plain word; no term exists yet. |

## 0. Scope

0.1. Guildmaster is an orchestrator in Firstmate's shape, built for the patron's own needs rather than for general use.
Source: "So I want to build Firstmate but focused on my needs" and "But what I'm trying to build is Firstmate, so an orchestrator type of thing."
Priority: **Must**.

0.2. The Guildmaster does not need to handle everything itself; the long-lived Party Leaders are the point of the system.
Source: "However, unlike FirstMate, I don't need FirstMate to handle everything for me. What I need is these second mates that get populated."
Priority: **Must**.

## 1. Party Leaders: long-lived, one per focus

1.1. A Party Leader is created for one focus: a ticket, a long-lasting project, or similar.
Source: "For me, these second mates would be a ticket or would be a long-lasting project or something like that."
Priority: **Must**.

1.2. A Party Leader lives as long as its focus does (weeks, months, or indefinitely for recurring work) and is still there, with its records, after restarts.
Source: "Unlike how the creator of FirstMate does things where you start something, finish it off, mine would be something that would take months, weeks, or recurring. So I need that second mate to be there."
Priority: **Must**.

1.3. Each Party Leader takes care of its own work without the patron or the Guildmaster managing it step by step.
Source: "I honestly just want each SecondMate to take care of their own stuff."
Priority: **Must**.

1.4. Party Leaders come in kinds.
The kinds named so far: ticket, long-lasting project, recurring job (for example daily or weekly data processing), and incident (for example figuring out an outage).
Some kinds have no delivery phases at all.
Source: "It could be possible that some second mates don't even have this. They're like, they're made there for, I don't know, like figuring out an outage or an issue and whatnot, or processing some data daily, weekly, etc."
Priority: **Must** for the ticket kind; **Should** for the other three.

1.5. A recurring Party Leader is woken on its schedule (daily, weekly) without the patron starting it each time.
Source: "processing some data daily, weekly, etc." and "months, weeks, or recurring".
Priority: **Should**.

1.6. A Party Leader dispatches its own Adventurers: it is an orchestrator for the many postings given for the same focus, not a worker that does them itself.
Source (relayed addition): "The Chapter Master should start workers, since it is meant to be an orchestrator with many tasks given for the same project."
Priority: **Must**.

1.7. A Party Leader is never blocked by its own work: while Adventurers run it can answer the patron, and answering does not make it lose what it was doing or get stuck.
Source (relayed addition): "It must not be blocked: it should be able to answer the patron without losing what it was doing or getting stuck."
Priority: **Must**.

1.8. Nothing depends on the model remembering to save. Every Party Leader resumes after a restart, compaction or pause with no re-explaining, and the patron never has to repeat an answer already given.
Source (patron answers): "(a) persistence must not depend on the model remembering to save: the patron has seen Firstmate's stow miss or save the wrong information, forcing them to repeat answers; resumption must need no re-explaining."
Priority: **Must**.

## 2. The Guildmaster knows, but does not tell

2.1. The Guildmaster's own context is not filled with the detail of each Party Leader's work.
Source: "But I also don't want the FirstMate, in this case the Guildmaster, to be always polluted with all the information of the SecondMates."
Priority: **Must**.

2.2. The Guildmaster knows what every Party Leader is and roughly where it stands, but does not relay that detail to the patron unprompted.
Source: "I want the Guildmaster to know about those things, but never tell me about it."
Priority: **Must**.

2.3. When asked, the Guildmaster can answer from history: what a Party Leader did, when, and what came of it.
Source: "some information and he could tell me some historical facts, let's say."
Priority: **Should**.

2.4. The patron works inside each Party Leader's own tab. The Guildmaster is a quiet front desk that can sometimes talk to a Party Leader itself.
Source (patron answers): "Q1: The patron works inside each Party Leader's own tab; the Guildmaster is a quiet front desk that can sometimes talk to a Party Leader."
Priority: **Must**.

## 3. Repositories and camps

3.1. Each Party Leader has a place that keeps track of its information (its Chapter House), separate from the repositories it works on.
Source: "I like to have a project to kind of keep track of information, but I do have my repositories and a location already."
Priority: **Must**.

3.2. The patron's repositories already have a location on disk.
The patron does not mind whether the guild works from those locations or brings the repositories into its own folders the way Firstmate does.
Source: "Doesn't matter if it brings the repositories inside the project folders just the same way as the first mate did".
Priority: **Could** (either answer satisfies the patron; the consultation recommends one).

3.3. Every job gets its own git worktree, created when the job starts and removed when the job is done, rather than a recycled pool of worktrees.
Source: "but this work tree recycled, I was working on 20 different things. So I just needed to create a work tree inside git, does its thing, and when it's done, it closes those work trees."
Priority: **Must**.

3.4. The guild copes with about twenty streams of work at once.
Source: "I was working on 20 different things."
Priority: **Should**.

## 4. Rules of engagement, phases and playbooks

4.1. The patron can write down the procedures the guild must follow ("rules of engagement"), and the guild follows them.
Source: "I also needed to kind of follow some steps, procedures put in place." and "So I kind of need to specify rules of engagement or how I want it to do."
Priority: **Must**.

4.2. Work asked for inside a ticket continues on that ticket's existing feature branch.
The guild never opens a new branch for something the patron asked for on the ticket, including bug fixes found after the merge request is open.
Source: "Right now sometimes I'm working on a ticket and then it creates me a new branch to do something that I just asked to do on the ticket." and "we might still find some bugs so we still need to push on that feature branch, not create new branches."
Priority: **Must**.

4.3. The ticket kind follows the patron's delivery flow from A to Z:
bring in the repository, create a worktree, do the work, push to the shared development branch for testing, then open a merge request from the feature branch to the integration branch, then keep pushing fixes to the same feature branch.
The exact branch names per repository are deferred to a later stage (answer to Q4).
Source: "So I needed to know about the process of how we deploy things or what's the procedure from A to Z, as in we bring in the repository, we create a work tree on it, we work on it, we push it to development branch where we're testing it, which is a shared branch, and then eventually we bring our feature branch and do a merge request to integration and then we might still find some bugs so we still need to push on that feature branch, not create new branches."
Priority: **Must**.

4.4. Each Party Leader knows, and shows, which phase of its playbook it is in.
Source: "Or the phases where it's at for each of those second mates."
Priority: **Must**.

4.5. Each kind of Party Leader has its own playbook; a kind without delivery phases (incident, recurring job) still has one.
Source: "So maybe there's like a run book or playbook, whatever it's called, for each of these types."
Priority: **Should** (the ticket playbook in 4.3 is **Must**).

4.6. Each playbook says when to push, as written rules that must be followed. The patron's example for the ticket kind: pushing to the shared development branch is allowed, so the change can be validated on the development domains and APIs; integration is reached only through a merge request; master never.
Source (patron answers): "Q3 ("push things"): ... Each playbook/workflow says when to push. Example rule: pushing to the shared development branch is allowed so the change can be validated on the development domains and APIs; integration only via a merge request; master never. Rules like these are written down per playbook and must be followed."
Priority: **Must**.

4.7. Opening the merge request needs the patron's word.
Source (patron answers): "Q6 (approvals): most likely opening the merge request needs the patron's word."
Priority: **Must** (the patron said "most likely"; other gates stay open).

4.8. A supervisor catches a worker that breaks the rules and corrects it.
Source (patron answers): "(b) Supervisors must catch and correct a worker that breaks the rules, as Firstmate sometimes does."
Priority: **Must**.

## 5. Patron-authored prompts

5.1. The patron writes, and can change, the prompts given to Party Leaders and to Adventurers.
Source: "I would also like to control the prompts that are given. I think first mate does this, but I'm not 100% sure. But I would like to create the prompts that's given to the second mates, the crews, etc."
Priority: **Must**.

5.2. The audit shows which prompt was given to whom, and when.
Source: "I would like to have some audit on those, such as what was triggered when".
Priority: **Must**.

## 6. Audit and tracing

6.1. There is a durable record of what was triggered, when, and by whom, across the Guildmaster, every Party Leader, and every Adventurer.
Source: "I would like to have some audit on those, such as what was triggered when, so I could kind of look at it at an observability table."
Priority: **Must**.

6.2. The same record can be viewed as a trace: a Jaeger-style timeline or flame graph of what called what.
Source: "You know, with some Jager or some graph, some flame graph or whatever they're called, types of graphs. To kind of see what was being called".
Priority: **Should**.

6.3. The record counts repetition: how many times a worker went round a loop, retried, or was woken.
Source: "how many times did it go in rotation, validating what's going on, basically auditing what's going on".
Priority: **Should**.

6.4. The trace follows communication across every hop: Guildmaster to Party Leader, Party Leader to Adventurer, and back.
Source: "how the communication from second mates to crews, first mate to second mates, etc. to know about all of those so I need some tracing as well."
Priority: **Must** for the record; **Should** for the visual view.

## 7. Console: where am I

7.1. The patron can always see where they are: which Party Leader they are talking to, what phase it is in, and what is going on right now.
Source: "I would like to know where currently I'm at in phases. So what's currently going on, where am I at in this project?"
Priority: **Must**.

7.2. The patron can move between several pieces of work without losing their place.
Source: "Since one of the biggest issue I have with First Mate is I can't really multitask without losing my context or where I'm at."
Priority: **Must**.

7.3. The patron controls what the console shows, for example its top and bottom bars, the way AWS AI-DLC version 2 did.
Source: "I would like to also control the visual on my console. I noticed with a project I worked with AWS AIDLC, version 2 I believe, where they added or manipulated what was on my screen, at my bottom bar, my top bar, what's shown every time."
Priority: **Should**.

## 8. Intake: never lose a posting

8.1. Every item the patron sends becomes a posting the moment it arrives, with everything that came with it (text, screenshot, where it was found).
Source: "i spam things i found so inside of this feature i found this bug here's a screenshot here's the issue fix it here's another one here's an issue fix it".
Priority: **Must**.

8.2. A posting belongs to the Party Leader whose focus it concerns.
Source: "since the second mate in this case would be focus on these things on a specific project on a specific feature on a specific focus those tasks should all be specific to that one".
Priority: **Must**.

8.3. The Party Leader works through its postings one by one and never drops one, however many arrive at once.
Source: "when it became too many multi-task it kind of forgot about some tasks" and "it should be able to keep going through them one by one never letting go".
Priority: **Must**.

8.4. Setting a posting aside is an explicit, visible state, never a silent one.
Source: "and well you know i put it on a side and something something something and it forgot".
Priority: **Must**.

8.5. The patron can see every posting they have given and where each one stands.
Source: "i would actually like to be able to see all the tasks i give" and "i kind of need to keep track of every task at it and where it's at".
Priority: **Must**.

8.6. The Party Leader keeps the patron up to date on its postings with simple one-line notices, one per event, for example "Task-Fix-XYZ started" (the verb changes with the event).
Source: "and keeping me up to date" and (relayed addition) "The Chapter Master should tell the patron about its work, as a single line. Maybe "Task-Fix-XYZ started" (or another verb)."
Priority: **Must**.

8.7. Every posting has a stable, readable id, such as Task-Fix-XYZ, that the patron can use to ask for more about that posting or to steer it.
The id is a reference the agents resolve unambiguously. Inside a focus, `Task-<Verb>-<Slug>` is acceptable unless something better exists.
Focuses themselves get names more meaningful than a ticket number, while still showing which ticket belongs to which project or feature.
Source (relayed addition): "Simple messages, where the patron can take the task id, such as Task-Fix-XYZ, and get more information or steer it."
Source (patron answers): "Q7 (ids): `Task-<Verb>-<Slug>` was only an example. The patron has both tickets and big projects, wants something more meaningful than a ticket number, but also wants to see which ticket belongs to which project or feature. For tasks inside a focus, Task-Verb-Slug is acceptable unless something better exists; the key need is a reference the AI resolves unambiguously."
Priority: **Must**.

8.8. Whenever a posting is brought back to the patron, its context comes with it: the original words, the screenshot, and what it was about.
Source: "and whenever he brings up one of those tasks i would like to know the context because i do 10 20 of these messages and then i'm like i don't remember what this is about when he brings out a random one".
Priority: **Must**.

## 9. Claude-only reliability

9.1. Claude Code is the only familiar Guildmaster must support.
Source: "at my work I only utilize clothes at least that's the only one we pay for".
Priority: **Must**.

9.2. Guildmaster drives Claude as tightly as it can: no avoidable errors, and work keeps moving, including pushing changes.
Source: "So I need to kind of control cloud as best as possible and not get any errors and be able to push things."
Answer to Q3: "push things" means work that keeps moving without stalls; when to push is each playbook's rule (4.6).
Source (patron answers): "Q3 ("push things"): work that keeps moving without stalls."
Priority: **Must**.

9.3. Other providers or local models may come later; nothing built now should make them impossible, but nothing is built for them now.
Source: "I might utilize other ones at a later state or maybe local models until then."
Priority: **Won't** (for now), with **Could** for keeping the familiar behind one seam.

9.4. Guildmaster uses markedly less Claude quota than Firstmate does for the same work.
Source (patron answers): "(c) Claude quota already runs out with many Firstmate sessions; the design must reduce quota use."
Priority: **Must**.

## 10. Storage and reach

10.1 and 10.2 come from the same conversation, summarised in the patron notes, not from the quoted words; 10.3 comes from the patron's answers.

10.1. Plain files where agents write and people read; SQLite for the coordination core (posting state, locks, the summons queue, rulings, leases), reached only through a small command-line tool so no agent writes SQL.
Source: the supervising agent's suggestion recorded in the patron notes; the patron has not ruled on it.
Priority: **Must** (agreed by the patron with build-order step 1; it was a recommendation awaiting the patron's word, question Q9).
The patron has questioned it: "Q9 (storage): the patron questions why SQLite is needed if agents can read and write files freely, noting that the patron will not read those coordination files, the agents will." The patron then agreed to SQLite with build-order step 1: SQLite through the `sqlite3` command-line tool for postings and state, plain files for prompts, playbooks and reports, neither touched except through `gm` ([step-1-design.md](step-1-design.md)).

10.2. Remote homes (Party Leaders on other machines over SSH) are not needed.
Source: "The patron then said remote homes are not needed for now."
Priority: **Won't** (for now).

10.3. Guildmaster is written in bash, the same technology as Firstmate, unless there is a reason not to; it must be fast and portable between machines.
Source (patron answers): "Q20 (language): wants it fast and portable between machines; bash would be preferred, the same technology as Firstmate unless there is a reason not to."
Priority: **Should**.
