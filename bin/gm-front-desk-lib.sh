# shellcheck shell=bash
# The one test of whether a checkout of this repository is the patron's front desk (vision/zero-touch-start.md).
# The clone's committed .claude/settings.json reaches every Claude Code session started at its root, the patron's
# and every contributor's alike, so its hooks act only where this says yes, and do nothing at all elsewhere.
# Sourced by bin/gm and by tests/run.sh; it has no side effects on source.

# The marker that makes any folder the front desk, for a patron whose checkout is not a plain clone. It is a regular
# file (never a link) holding one word of letters, digits, dots, dashes or underscores, and .gitignore keeps it out of
# commits, so it never travels to a worktree.
GM_FRONT_DESK_MARKER=.gm-front-desk

# gm_front_desk_home <root>: 0 when <root>, a folder with bin/gm, is the patron's front desk: it carries a genuine
# marker, or it is the top of a plain clone, whose git folder is its own and not a linked worktree's (where
# Firstmate's workers and Party Leaders' camps run). Otherwise 1, including when git cannot tell.
gm_front_desk_home() {
  local root=$1 marker word='' top git_dir common_dir LC_ALL=C
  [ -f "$root/bin/gm" ] || return 1
  marker=$root/$GM_FRONT_DESK_MARKER
  if [ -f "$marker" ] && [ ! -L "$marker" ]; then
    # A last line without its newline is still read.
    IFS= read -r word <"$marker" 2>/dev/null || true
    word=${word//[[:space:]]/}
    case $word in
      '' | *[!A-Za-z0-9._-]*) ;;
      *) return 0 ;;
    esac
  fi
  # The checkout's own top, not a folder inside some other repository.
  top=$(git -C "$root" rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ] || return 1
  [ "$(cd "$top" 2>/dev/null && pwd -P)" = "$(cd "$root" 2>/dev/null && pwd -P)" ] || return 1
  git_dir=$(git -C "$root" rev-parse --git-dir 2>/dev/null) && [ -n "$git_dir" ] || return 1
  common_dir=$(git -C "$root" rev-parse --git-common-dir 2>/dev/null) && [ -n "$common_dir" ] || return 1
  # Either may come back relative to the root; both are resolved before they are compared.
  git_dir=$(cd "$root" && cd "$git_dir" && pwd -P) 2>/dev/null || return 1
  common_dir=$(cd "$root" && cd "$common_dir" && pwd -P) 2>/dev/null || return 1
  [ "$git_dir" = "$common_dir" ]
}
