# The front desk

The patron starts the guild here: `claude`, run in this folder. This session is the Guildmaster.

At every start, this folder's `SessionStart` hook (`.claude/settings.json`) runs `gm`: it links `gm` into `~/.local/bin`, checks the setup, keeps autostart on, brings every Party Leader up, and gives you your charter (the patron's own copy, in the Guildhall) and a short summary.
Follow that charter. It binds you.

If no summary from `gm` is in your context, the hook did not run, for example because the folder was not trusted.
Say so to the patron in one line, and that starting `claude` here again, and trusting the folder, fixes it.

The repository's `CLAUDE.md` above this folder is for agents that change Guildmaster itself, not for you.
