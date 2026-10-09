# Claude Code mods: what people have already built (collected 2026-10-08)

Research notes from the patron, relayed by the front desk on 2026-10-08.
Found by web search; none of these mods has been installed or run yet.
Vocabulary follows [TERMINOLOGY.md](../../TERMINOLOGY.md).

A mod is a Claude Code plugin made of function hooks. It can draw a live pane beside the transcript, a band above the prompt, a status line or a toast, and can guard or rewrite tool calls.
GitHub topic [claude-code-mod](https://github.com/topics/claude-code-mod) lists about 300 repos.

## Collections

- [OneWave-AI/claude-code-mods](https://github.com/OneWave-AI/claude-code-mods): ten mods. burn-meter (live session cost above the prompt, plan-limit bars); inbox-alerts (Gmail, Slack, Calendar as toasts plus a pane); swarm (live agent count, then a toast summing up the run); also launch codes, session wrapped, boss fight, code pet, agent-race.
- [tylergraydev/cc-mods](https://github.com/tylergraydev/cc-mods): agent-deck (live pane of the session's subagents); cache-clock (prompt-cache countdown in the status line); a diff viewer; DOOM in a side pane.
- [hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods): mission-control (subagents and the files they touch); where-am-i (session goal and current step above the prompt); context bar, usage meter, Codex review watch, Markdown preview, Spotify now playing.
- [arasovic/claude-code-mods](https://github.com/arasovic/claude-code-mods): turn-timeline (pane showing each model request and tool call in the turn); session-meter, change-ledger, compact-keeper.
- [MarcoCarnevali/claude-code-mods](https://github.com/MarcoCarnevali/claude-code-mods): GitHub issues side pane; terminal and desktop app.
- [shabier/claude-plugins](https://github.com/shabier/claude-plugins): widget dashboard, 8-bit wallpapers, small games in the side pane.

## Bigger single mods

- [markneonin/paneline](https://github.com/markneonin/paneline): side pane with Activity, Files, Agents, Context and MCP tabs; status line; restyled chat; Mermaid diagrams in the terminal; code and diff panels; colours follow /theme.
- glowup (on the [topic page](https://github.com/topics/claude-code-mod)): cockpit pane, shareable themes, pixel pet.

## Guides

- ruvnet's field guide: https://gist.github.com/ruvnet/a485e930b148185197fc53fd38b429ea
- DEV tutorial on bands, status lines and toasts: https://dev.to/nakadadev/how-to-show-a-line-above-the-prompt-in-claude-code-with-a-mod-band-status-line-toast-3947
- claude.dev getting-started post: https://claude.dev/blog/getting-started-with-claude-code-mods/
- Substack write-up: https://nandigamharikrishna.substack.com/p/i-built-mods-for-claude-heres-what
- Official status line docs (configured separately from mods): https://code.claude.com/docs/en/statusline

## Patterns that keep coming up

Watching subagents; cost and context meters; guards on tool calls; alerts from other tools (PR checks, inbox).

## Caveats

- Mods are recent; older Claude Code versions won't load them.
- Mods run with full Claude Code permissions, so read the source before installing.
- Found by web search; none installed or run yet.

## To explore

- [ ] Whether a mod could show the Guildmaster roster (Party Leaders and their focuses) as a pane or band
- [ ] Try one or two subagent-watching mods (agent-deck, mission-control)
