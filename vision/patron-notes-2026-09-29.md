# Patron notes, 2026-09-29

This is the source record for Guildmaster's first requirements: the patron's own words, spoken and lightly transcribed, as relayed to the guild on 2026-09-29.
Nothing between the two markers below has been corrected, reordered, or reworded.
In the transcription, "clothes" and "cloud" mean Claude.
The patron uses "first mate" and "second mate" as placeholder names; in this project's vocabulary ([TERMINOLOGY.md](../TERMINOLOGY.md)) the first mate is the Guildmaster and the second mate is the Party Leader.
The relayed addition below says "Chapter Master", the name the role had until the patron renamed it Party Leader later the same day (see the ruling at the end).

The cleaned-up restatement is [requirements.md](requirements.md); nothing there overrides this record.

<!-- verbatim: begin -->

So guildmaster is the equivalent of first mate. I don't have a term for second mate yet for my guildmaster but we're gonna specify second mate for now until there's a better term.
So I want to build Firstmate but focused on my needs and the first needs are like at my work I only utilize clothes at least that's the only one we pay for I might utilize other ones at a later state or maybe local models until then. So I need to kind of control cloud as best as possible and not get any errors and be able to push things. But what I'm trying to build is Firstmate, so an orchestrator type of thing. However, unlike FirstMate, I don't need FirstMate to handle everything for me. What I need is these second mates that get populated. For me, these second mates would be a ticket or would be a long-lasting project or something like that. Unlike how the creator of FirstMate does things where you start something, finish it off, mine would be something that would take months, weeks, or recurring. So I need that second mate to be there. But I also don't want the FirstMate, in this case the Guildmaster, to be always polluted with all the information of the SecondMates. I honestly just want each SecondMate to take care of their own stuff. I want the Guildmaster to know about those things, but never tell me about it. some information and he could tell me some historical facts, let's say.

Some other things is: in this case it builds a project folder. While mine... I like to have a project to kind of keep track of information, but I do have my repositories and a location already. Doesn't matter if it brings the repositories inside the project folders just the same way as the first mate did, but this work tree recycled, I was working on 20 different things. So I just needed to create a work tree inside git, does its thing, and when it's done, it closes those work trees.

I also needed to kind of follow some steps, procedures put in place. Right now sometimes I'm working on a ticket and then it creates me a new branch to do something that I just asked to do on the ticket. So I needed to know about the process of how we deploy things or what's the procedure from A to Z, as in we bring in the repository, we create a work tree on it, we work on it, we push it to development branch where we're testing it, which is a shared branch, and then eventually we bring our feature branch and do a merge request to integration and then we might still find some bugs so we still need to push on that feature branch, not create new branches. So I kind of need to specify rules of engagement or how I want it to do. Or the phases where it's at for each of those second mates. It could be possible that some second mates don't even have this. They're like, they're made there for, I don't know, like figuring out an outage or an issue and whatnot, or processing some data daily, weekly, etc. So maybe there's like a run book or playbook, whatever it's called, for each of these types.

I would also like to control the prompts that are given. I think first mate does this, but I'm not 100% sure. But I would like to create the prompts that's given to the second mates, the crews, etc. I would like to have some audit on those, such as what was triggered when, so I could kind of look at it at an observability table. You know, with some Jager or some graph, some flame graph or whatever they're called, types of graphs. To kind of see what was being called, how many times did it go in rotation, validating what's going on, basically auditing what's going on, how the communication from second mates to crews, first mate to second mates, etc. to know about all of those so I need some tracing as well.

I would like to also control the visual on my console. I noticed with a project I worked with AWS AIDLC, version 2 I believe, where they added or manipulated what was on my screen, at my bottom bar, my top bar, what's shown every time. I would like to know where currently I'm at in phases. So what's currently going on, where am I at in this project? Since one of the biggest issue I have with First Mate is I can't really multitask without losing my context or where I'm at.

and i would actually like to be able to see all the tasks i give so something i thought i could do but it wasn't doing great or it would lose track of in second mates or first mate is i spam things i found so inside of this feature i found this bug here's a screenshot here's the issue fix it here's another one here's an issue fix it and when it became too many multi-task it kind of forgot about some tasks and then i had to come to it and i'm like well what about this and well you know i put it on a side and something something something and it forgot and i kind of need to keep track of every task at it and where it's at and again since the second mate in this case would be focus on these things on a specific project on a specific feature on a specific focus those tasks should all be specific to that one and it should be able to keep going through them one by one never letting go and keeping me up to date and whenever he brings up one of those tasks i would like to know the context because i do 10 20 of these messages and then i'm like i don't remember what this is about when he brings out a random one

So that's my initial thought on this. Let's keep track of these thoughts. So store it inside the guildmaster, what I wrote to you right now. And you could probably write it in a better format or better list. You do as you feel is good. What I'm asking for and what I'm looking for. So here tell me what do you think about this and how I should proceed with this guildmaster. Is there anything I'm missing? Any more questions I should ask? Any more questions you have for me? deep research

<!-- verbatim: end -->

## Context from the same conversation

The following is a summary written by the supervising agent, not the patron's words.

- Earlier in the same conversation the patron asked why Firstmate keeps its state and communications in text files rather than a database such as SQLite.
  The answer given was that Firstmate's documentation never states the reason.
  The likely reasons: every agent tool can already write files, files survive crashes without a server, many separate processes and SSH-connected hosts share the records, people can read and edit them, and there is nothing to install.
  The cost is hand-built locks, cursors and markers, and race conditions a transaction would prevent, for example the update restart colliding with the watcher's automatic relaunch.
  The suggested direction was a hybrid: plain files at the edges where agents write and people read, SQLite for the coordination core (task state, locks, wake queue, decisions, leases), behind a small command-line tool so no agent writes SQL.
- The patron then said remote homes (supervisors running on other machines over SSH) are not needed for now.

## Addition later the same day

The patron added the following, relayed to the guild at 2026-09-30T02:07Z (the evening of 2026-09-29 in the patron's time).
It reached the guild as the supervising agent's rendering of the patron's words, so it is recorded here exactly as relayed rather than as a transcript.

<!-- relayed: begin -->

Addition from the patron: The Chapter Master should tell the patron about its work, as a single line. Maybe "Task-Fix-XYZ started" (or another verb). Simple messages, where the patron can take the task id, such as Task-Fix-XYZ, and get more information or steer it. The Chapter Master should start workers, since it is meant to be an orchestrator with many tasks given for the same project. It must not be blocked: it should be able to answer the patron without losing what it was doing or getting stuck. The patron also asked for name options other than Chapter Master.

<!-- relayed: end -->

## Ruling later the same day

Relayed to the guild at 2026-09-30T02:11Z, recorded exactly as relayed:

<!-- relayed: begin -->

Decision from the patron: the Chapter Master role is renamed Party Leader.

<!-- relayed: end -->

TERMINOLOGY.md was updated in the same change that added these notes.
