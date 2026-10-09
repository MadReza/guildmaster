# Veil design: the deeds drawn out of the chat, and back in

The patron asked, on 2026-10-09, at the clone:

<!-- patron: begin -->

"I want to stimulate the calm command of Firstmate. So that "Deeds" get hidden and re-appear when command is used to turn off."

<!-- patron: end -->

Asked what it should hide, where the choice lives, who has it and how other sessions learn of a change, they answered:

<!-- patron: begin -->

"This should be configurable. Let's set the initial calm to do all of those."
"per guild for now. Future we can scope it further maybe."
"both." (the front desk and every Party Leader)
"I like the cheaper option. I don't want to do calls as much as possible. Maybe we could also add another command to refresh ? and that would be if i want to force it or i could just wait until the next text coming in or out which would automatically deduct"

<!-- patron: end -->

And on what stays in sight:

<!-- patron: begin -->

"Routed messages keep them visible."
"I don't want to see the ToolProgress. Changeable in settings."
"For errors and interruption. Normally, the ai would take care of it. So the only one that I would see is that we hit our max tokens and we are stuck. Otherwise, it shouldn't show errors or interruption since guild master or other would tell me about it afterwards."

<!-- patron: end -->

The name, `/veil`, and the default, off, were recommended to them and taken; they are easy to change before anything is built.
This document says what the veil is, what it hides, where the choice is kept, and how a change reaches every session, for the guild-chat mod in `mods/guild-chat/`.
Vocabulary is [TERMINOLOGY.md](../TERMINOLOGY.md)'s; this change adds **Deed** and **Veil** to it.
Nothing here is built yet.

## How Firstmate does it

Firstmate's Calm, on Claude Code, is one function-hooks mod, `.claude/mods/firstmate-calm` (Firstmate at `b062eb94`, `docs/calm.md`, `hooks/register.ts`):

- `/calm` toggles a per-home preference, the file `config/calm` holding `on` or `off`, saved before the screen changes; a failed save leaves the choice as it was. The answer is a toast under the prompt, never a transcript row.
- While Calm is on, `ToolUse`, `ToolResult` and `ToolGroup` draw as `Box({ display: "none" })`, so a turn that used tools takes the space of one that did not.
- It hides short mid-turn narration too: a text block from a model step that stopped to call tools, or that ran out of tokens while carrying tool calls, with no newline and under 240 characters trimmed. Longer text, and the reply that ends a turn, stay. It learns which blocks those are by watching `turn.step`.
- It hides Firstmate's own operational user rows (watcher and launch-brief envelopes and the like).
- It replaces the working row (`Spinner`) with an animated sailboat.
- A toggle calls `$.ui.invalidate("ui.render")`, so rows already on screen hide or come back. On the main-screen layout that clears and reprints the conversation, and the terminal's scrollback keeps the earlier copy above it.
- Nothing is rewritten: hidden rows stay in the model's context, the stored session and exports.
- Every session follows another's toggle only at its own next start or redraw; the mod has no other channel. Its one timer (3 seconds) is for supervision notes, not for Calm.

## Guildmaster's design

### The words

A **deed** is a tool call as the chat shows it: the call, its result, or a group of them. The banners already call these deeds (`⚒ DEEDS`); this change records the word.
The **veil** is the chat's quiet view: deeds, adventurers and short notes drawn out of the chat while it is on, and drawn back when it is lifted. It hides from the screen only, never from the record. Firstmate calls it Calm.

### What the veil hides

`veil-hides` lists what the veil hides, from four kinds; the first version hides all four.

| Kind | Rows | How they are told apart |
| --- | --- | --- |
| `deeds` | `ToolUse` of every tool but an adventurer's, `ToolResult`, and every `ToolGroup`, one holding an adventurer's call included | the render component, and `ToolUse`'s `tool` |
| `adventurers` | `ToolUse` of `Agent` or `Task` (`⛨ ADVENTURER · …`), and a `UserMessage` whose origin is a task notification (`⛨ ADVENTURER · returns`) | `isAdventurer` and `origin.kind`, as the banners tell them today |
| `notes` | Short narration between deeds: a text block from a model step that stopped to call tools, with no newline and under 240 characters | Firstmate's rule, learned from `turn.step` the same way |
| `progress` | `ToolProgress`, the dim hint under a running deed, such as `(ctrl+b to run in background)` | the render component |

A hidden row draws as `Box({ display: "none" })` before its banner is drawn, so the banner goes with it.
A deed or adventurer that errored or was interrupted (a refusal at a permission dialog, a failed command, an adventurer stopped with Esc) stays hidden like any other: the Guildmaster or the Party Leader deals with it, and tells the patron afterwards.

### What the veil never hides

- The patron's messages.
- Routed messages: a `UserMessage` with `from`, drawn under its sender's green banner, since someone is speaking to the session.
- The reply that ends each turn (`⚔ GUILDMASTER`, `⚔ PARTY LEADER · …`), and any narration with a newline or of 240 characters or more.
- **A step that hit a limit.** A model step whose `stopReason` is `max_tokens` (the reply ran out of output tokens) or `model_context_window_exceeded` (the conversation no longer fits) is never veiled: not its text, and not the deeds and adventurers it carried. That is the one stop the patron needs to see, because the session is stuck there and nobody will report it afterwards. Firstmate's notes rule hides such a step's short text; this one does not.
- What Claude Code draws outside the transcript, which no mod can hide: the permission dialog, the `AskUserQuestion` dialog, and the working row, which still says the session is busy while the deeds are hidden.

Nothing is rewritten: the model reads what it read before, and the stored conversation, `--continue` and exports are unchanged.

### The settings

Two keys in `guild.conf`, rows in `GM_CONF_TABLE`, shown by `gm config` and changed by `gm config set`, like every other setting:

| Setting | Values | Default |
| --- | --- | --- |
| `veil` | `on`, `off` | off |
| `veil-hides` | any of `deeds`, `adventurers`, `notes`, `progress`, separated by spaces | `deeds adventurers notes progress` |

A value gm cannot take is ignored, as for every setting, and the veil then reads as off.
Neither has an environment variable: the veil changes while sessions run, and a variable fixed at a session's start would hold it there.
It is one choice for the whole guild. Scoping it to a focus or a session is left for later.

### The command: `/veil`

The mod registers `/veil` at `session.start`, in the front desk and in every Party Leader.

| Command | Does |
| --- | --- |
| `/veil` | Turns the veil the other way, saves it, and redraws this session. |
| `/veil on`, `/veil off` | Sets it outright: no guessing which way it stands when another session changed it. |
| `/veil refresh` | Reads `guild.conf` again and redraws this session, without waiting for the next turn. |

It saves with `gm config set veil on|off`, by `$.process.run`, so gm stays the only writer of `guild.conf`.
It saves before it redraws: a save that fails leaves the veil as it was, and the toast says why.
It answers with a toast under the prompt (`The veil is drawn`, `The veil is lifted`), never a transcript row.
`veil-hides` has no command of its own: the patron asks the Guildmaster, who runs `gm config set veil-hides ...`.

### The one gm it runs

The guild runs one gm: the front desk's clone's `bin/gm`, linked at `~/.local/bin/gm`. The front desk, launchd, and every Party Leader's hooks (a camp's `.claude/settings.local.json`) all call that one.
A camp of Guildmaster itself holds a copy of the code, `bin/gm` and `mods/guild-chat` among it, because that copy is what its Party Leader changes; nothing in the guild runs it.
The mod is the one thing loaded from that copy: Claude Code loads it from the camp's own `.claude/skills/guild-chat`, and gm does not pass its own over it (`gm_chat_args` in `bin/gm`). So the mod never runs "the gm beside it", which in such a camp would be the branch's draft: it runs `~/.local/bin/gm`, and only when that is a link to a gm. When it is missing, or a file of its own, `/veil` changes nothing and its toast says why.

### How a change reaches the other sessions

There is no timer and no message between sessions.

- At `session.start`, and before the first row draws on `--continue`, the mod reads `veil` and `veil-hides` once, and keeps `guild.conf`'s modification time.
- At every `turn.start` it calls `$.fs.stat` on `guild.conf` and compares `mtimeMs`. Unchanged, it does nothing more. Changed, it reads the file; if `veil` or `veil-hides` differs from what it holds, it takes the new value and redraws itself once.
  A turn starts for the patron's message and for anything else that reaches the session (a task notification, a routed message), and the reply is drawn inside it, so this one check covers text going in and coming out.
- After its own save, a session keeps the new modification time, so its own change does not redraw it twice.
- A session that starts no turn does nothing until it does, or until `/veil refresh`. Until then its rows already on screen stay as they were.

### Cost

- **The session that toggles**: one `gm config set` and one redraw.
- **Every other session**: one `fs.stat` per turn, beside the model call that turn makes anyway; on a change, one read and one redraw, at its next turn.
- **An idle Party Leader**: nothing.
- No model call and no token: the redraw is the terminal's work only. On the main-screen layout it reprints the conversation, longer for a longer one, and leaves the earlier copy in the terminal's scrollback.

### Where it lives, and when it loads

The veil is part of `mods/guild-chat/`, in the same `ui.render` hooks as the banners: one mod owns how a row draws, so two mods never contest the same drawing.
The banners and the veil are independent: `chat: off` keeps Claude Code's own drawing and the veil still works on it; `chat: banners` draws the banners on what the veil leaves.
Today gm gives a Party Leader the mod only while `chat: banners`. For `/veil` to exist in every session, gm gives it the mod whenever it starts one, and `chat: off` turns the banners off inside it. The README's chat section changes to say so.
A `claude` with no Guildhall (no `guild.conf` under `GM_HALL`, else `~/.guildmaster`) registers no `/veil` and hides nothing, as it draws no banners.
The mod rests on the same early-access function-hooks surface the banners do; nothing new is switched on.

### How this differs from Firstmate

| | Firstmate's Calm | Guildmaster's veil |
| --- | --- | --- |
| Where the choice is kept | `config/calm` in the Firstmate home, written by the mod | `veil` in `guild.conf`, written by the one gm |
| What it hides | Fixed | Chosen by `veil-hides` |
| The live hint under a running tool | Shown | Hidden, as `progress` |
| A step that ran out of tokens | Its short text hidden | Never hidden, deeds and all |
| Firstmate's own operational rows | Hidden | Not applicable; adventurers' returns are a kind of their own |
| Another session's toggle | Followed at that session's next start | Followed at that session's next turn, or `/veil refresh` |
| Commands | `/calm` (toggle) | `/veil`, `/veil on`, `/veil off`, `/veil refresh` |
| Working row | A sailboat | Claude Code's own (not in this change) |

## How it will be checked

- `claude plugin test mods/guild-chat`: with the veil on, every kind in `veil-hides` draws at zero height, banner included, and every other row draws as before; with a kind left out, its rows draw; with the veil off, every row draws as before.
- A `ToolGroup` holding an `Agent` call hides with `deeds`; an errored or interrupted deed or adventurer hides like any other.
- A routed message (`from`) and the patron's message draw under the veil.
- The notes rule on its edges: one line under 240 characters hidden; a newline, or 240 characters, shown; the reply that ends the turn shown.
- A step that stopped on `max_tokens` or `model_context_window_exceeded`: its text, deeds and adventurers all drawn under the veil. And by hand, once, on a real stop: the line Claude Code draws for it still shows.
- `/veil`, `/veil on`, `/veil off`: one `~/.local/bin/gm config set` each, then a redraw and the toast; a failing gm, or a `~/.local/bin/gm` that is missing or not a link, leaves the veil and the screen as they were. In a camp of Guildmaster, the camp's own `bin/gm` is never run.
- `turn.start` with `guild.conf` unchanged: one stat, no read, no redraw. Changed: one read, and one redraw only when `veil` or `veil-hides` changed. After the session's own save: no second redraw.
- `/veil refresh`: one read and one redraw, whatever the modification time.
- gm's suite: `veil` and `veil-hides` in `gm config`, refused values ignored, and the mod passed to a Party Leader with `chat: off`.
- By hand, in a lab herdr session: the front desk and a Party Leader, `/veil` in one; the other unchanged until its next turn, then veiled; `/veil refresh` veils it at once.

## Not in this change

- A working-row animation like Firstmate's sailboat; it can follow as a change of its own.
- The veil per focus or per session.
- A live redraw of every session at a toggle.
