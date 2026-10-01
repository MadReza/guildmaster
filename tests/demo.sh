#!/usr/bin/env bash
# End-to-end demonstration of step 1 with a real Claude Code session, in a throwaway repository.
# Ten patron messages in a row are all recorded with their words and states; then a session is
# killed mid-posting and a fresh one resumes from the register alone. Uses Claude quota.
# Run: bash tests/demo.sh   (GM_DEMO_MODEL picks the model, default sonnet)
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
GM=$ROOT/bin/gm
MODEL=${GM_DEMO_MODEL:-sonnet}
DEMO=${GM_DEMO_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/gm-demo.XXXXXX")}
DEMO=$(cd "$DEMO" && pwd -P)
export GM_HALL=$DEMO/hall
unset GM_FOCUS

gm() { bash "$GM" "$@"; }
say() { printf '\n=== %s\n' "$*"; }
uuid() { uuidgen | tr '[:upper:]' '[:lower:]'; }
db() { sqlite3 -batch -noheader "$GM_HALL/register.db" "$@"; }

say "Throwaway repository and focus, in $DEMO"
REPO=$DEMO/hello
mkdir -p "$REPO"
git -C "$REPO" init -q -b main
printf '#!/bin/sh\necho "Helo, world"\n' >"$REPO/hello.sh"
printf '# hello\n\nA tiny greeter.\n' >"$REPO/README.md"
git -C "$REPO" add .
git -C "$REPO" -c user.name=demo -c user.email=demo@example.com commit -q -m "first greeter"
gm open hello-fix --repo "$REPO" --ticket DEMO-1 --no-launch
CAMP=$GM_HALL/camps/hello-fix
TOOLS="Bash(sh hello.sh*) Bash(git status*) Bash(git diff*) Bash(git add *) Bash(git commit *) Bash(git log*)"

turn() {
  # turn <session flag> <session id> <message>
  (cd "$CAMP" && claude -p --model "$MODEL" --permission-mode acceptEdits --allowedTools "$TOOLS" "$1" "$2" "$3")
}

MESSAGES=(
  "I'm going to send you a batch of things I found in this repo, one message each. Just record and queue them for now; don't start any work until I say so."
  "hello.sh prints 'Helo' instead of 'Hello', fix it"
  "the README has no usage section, add one"
  "hello.sh should accept a name as its first argument and greet that name"
  "what shell does hello.sh use?"
  "#2 also make the greeting end with an exclamation mark"
  "add a --help flag to hello.sh"
  "the README title should be 'Hello' with a capital H"
  "hello.sh is missing a trailing newline check, look into whether that matters"
  "add a CHANGELOG.md with an entry for these fixes"
)

say "Ten patron messages in a row, one Claude Code turn each, same session"
S1=$(uuid)
i=0
for m in "${MESSAGES[@]}"; do
  i=$((i + 1))
  printf '\n--- patron message %d: %s\n' "$i" "$m"
  if [ "$i" -eq 1 ]; then turn --session-id "$S1" "$m"; else turn --resume "$S1" "$m"; fi
done

say "What the register holds: every message, verbatim, and every posting with its state"
db "SELECT '  msg '||id||' ['||disposition||COALESCE(' → #'||(SELECT num FROM posting WHERE id=m.posting_id),'')||'] '||words FROM message m ORDER BY id;"
echo
gm list --all hello-fix
recorded=$(db "SELECT count(*) FROM message;")
unsorted=$(db "SELECT count(*) FROM posting WHERE state='received';")
printf '\nmessages recorded: %s of %s; postings left without a state: %s\n' "$recorded" "${#MESSAGES[@]}" "$unsorted"
[ "$recorded" -eq "${#MESSAGES[@]}" ] || { echo "DEMO FAILED: a message was not recorded"; exit 1; }
[ "$unsorted" -eq 0 ] || { echo "DEMO FAILED: a posting was left received"; exit 1; }

say "Start work, then kill the session mid-posting"
(cd "$CAMP" && exec claude -p --model "$MODEL" --permission-mode acceptEdits --allowedTools "$TOOLS" --resume "$S1" \
  "Start on the typo fix now: claim it, then make the change.") >"$DEMO/killed-turn.txt" 2>&1 &
pid=$!
for _ in $(seq 1 180); do
  [ "$(db "SELECT count(*) FROM posting WHERE state='active';")" -gt 0 ] && break
  sleep 1
done
sleep 2
kill -9 "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
active=$(db "SELECT '#'||num||' '||slug FROM posting WHERE state='active' ORDER BY num LIMIT 1;")
printf 'killed claude (pid %s); the register shows active: %s\n' "$pid" "${active:-none}"
[ -n "$active" ] || { echo "DEMO FAILED: nothing was claimed before the kill"; exit 1; }
git -C "$CAMP" status --short

say "A fresh session (not --resume) is told only: continue"
S2=$(uuid)
turn --session-id "$S2" "continue" | tee "$DEMO/resumed-turn.txt"

say "After the resumed turn"
gm list --all hello-fix
num=${active%% *}
gm show "${num#\#}"
git -C "$CAMP" log --oneline -3
git -C "$CAMP" diff
printf '\nArtifacts kept in %s\n' "$DEMO"
