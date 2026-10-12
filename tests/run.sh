#!/usr/bin/env bash
# Test suite for bin/gm. Run: bash tests/run.sh [name-filter]
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
GM=$ROOT/bin/gm
FILTER=${1:-}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/gm-tests.XXXXXX")
WORK=$(cd "$WORK" && pwd -P)
# shellcheck disable=SC2329 # run by the EXIT trap
suite_cleanup() {
  local pid port
  [ ! -f "$WORK/listeners" ] || while read -r pid port; do
    kill "$pid" 2>/dev/null
    pkill -f "nc -l 127.0.0.1 $port" 2>/dev/null
  done <"$WORK/listeners"
  rm -rf "$WORK"
}
trap suite_cleanup EXIT
# A home of the suite's own: the front desk's hook links gm into ~/.local/bin, and nothing may reach the real one.
export HOME=$WORK/home
mkdir -p "$HOME"
# The suite may itself run inside Claude Code, whose session variables would join gm's spans to it.
unset CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT TRACEPARENT GM_FOCUS CLAUDECODE GM_HERDR_WORKSPACE GM_HERDR_AUTO GM_CHAT GM_CHAT_FOCUS
# gm never asks a question or looks for the real Claude Code unless a test says so.
export GM_INTERACTIVE=0 GM_CLAUDE=$ROOT/tests/fixtures/fake-claude GM_HERDR=$ROOT/tests/fixtures/herdr GM_HERDR_SOCKET_CMD=$ROOT/tests/fixtures/herdr-socket
# No test reaches a real herdr or launchd: the stubs in tests/fixtures come first on PATH; the herdr stub keeps its
# state under $HERDR_STUB (one directory a test) and refuses any session but this one.
export PATH="$ROOT/tests/fixtures:$PATH" GM_HERDR_SESSION=gm-test HERDR_STUB_SESSION=gm-test GM_HERDR_RESAMPLE=1 GM_LAUNCH_GRACE=0
# Nor a real launchd agent: whatever turns autostart on writes its property list here and loads it with the stub.
export GM_LAUNCH_AGENTS=$WORK/LaunchAgents GM_LAUNCHCTL=$ROOT/tests/fixtures/launchctl
# Nor a real Homebrew or herdr's real installer, from gm install herdr.
export GM_BREW=$WORK/no-brew GM_HERDR_INSTALLER=file://$WORK/no-installer.sh
unset HERDR_ENV HERDR_SESSION HERDR_WORKSPACE_ID HERDR_TAB_ID HERDR_PANE_ID GM_ATTACH
FAKE=$ROOT/tests/fixtures/fake-claude
pass=0
fail=0
failed=''

gm() { bash "$GM" "$@"; }

fail() {
  printf '    FAIL: %s\n' "$*" >&2
  : >"$WORK/failed-mark"
  return 1
}

assert_eq() {
  [ "$1" = "$2" ] || fail "${3:-values differ}: expected [$2], got [$1]"
}

assert_contains() {
  case $1 in *"$2"*) ;; *) fail "${3:-missing text}: [$2] not in output:
$1" ;; esac
}

assert_not_contains() {
  case $1 in *"$2"*) fail "${3:-unexpected text}: [$2] in output" ;; esac
}

# Waits for a lock as gm does: the last connection to close checkpoints the WAL under a lock for a moment.
db() { sqlite3 -batch -noheader -cmd '.timeout 15000' "$GM_HALL/register.db" "$@"; }

json() { sqlite3 -batch :memory: "$@"; }

sqlq() {
  local sq="'"
  printf "'%s'" "${1//$sq/$sq$sq}"
}

payload() {
  # payload <session> <prompt>, built by sqlite so any text is escaped correctly
  local sq="'" p=$2
  json "SELECT json_object('session_id','$1','prompt_id','p-$RANDOM','hook_event_name','UserPromptSubmit','cwd','/tmp','prompt','${p//$sq/$sq$sq}');"
}

new_repo() {
  local dir=$WORK/$1
  mkdir -p "$dir"
  git -C "$dir" init -q -b main
  git -C "$dir" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  printf '%s' "$dir"
}

setup() {
  export GM_HALL=$WORK/$1/hall
  unset GM_FOCUS
  REPO=$(new_repo "$1/repo")
  gm open appt-v2 --repo "$REPO" --ticket CRM-8965 --no-launch >/dev/null 2>&1 || fail "gm open failed"
  CAMP=$GM_HALL/camps/appt-v2
}

# ---- herdr, through the stub ----
# A Guildhall past its first run, so GM_INTERACTIVE=1 brings the muster and not gm init's questions.
initialized() { printf 'initialized: 2026-01-01T00:00:00Z\ncollector: off\n' >"$GM_HALL/guild.conf"; }

pl_pane() { db "SELECT pane_id FROM endpoint WHERE key='party-leader:$1';"; }

# stub_proc <pane> <shell|claude|command name>: what the stub says the pane runs.
stub_proc() {
  awk -F '\t' -v OFS='\t' -v k="$1" -v v="$2" '$1 == k { $4 = v } { print }' "$HERDR_STUB/panes" >"$HERDR_STUB/panes.new" &&
    mv "$HERDR_STUB/panes.new" "$HERDR_STUB/panes"
}

stub_close() {
  awk -F '\t' -v k="$1" '$1 != k' "$HERDR_STUB/panes" >"$HERDR_STUB/panes.new" && mv "$HERDR_STUB/panes.new" "$HERDR_STUB/panes"
}

runs_in() { awk -F '\t' -v p="$1" '$1 == p' "$HERDR_STUB/runs" 2>/dev/null | grep -c . || true; }

# Launch lines typed for Party Leaders, leaving out the front desk's Guildmaster.
pl_runs() { grep -v "start 'guildmaster'" "$HERDR_STUB/runs" 2>/dev/null | grep -c . || true; }

# Launch lines typed for the front desk's Guildmaster.
desk_runs() { grep -c "start 'guildmaster'" "$HERDR_STUB/runs" 2>/dev/null || true; }

roster_state() { gm roster | awk -v f="$1" '$1 == f { print $4 }'; }

t_schema_created_on_first_use() {
  export GM_HALL=$WORK/schema/hall
  [ ! -e "$GM_HALL" ] || return 1
  gm list >/dev/null || fail "first gm call failed"
  assert_eq "$(db 'PRAGMA journal_mode;')" wal "journal mode" &&
    assert_eq "$(db 'PRAGMA user_version;')" 6 "schema version" &&
    assert_eq "$(db "SELECT group_concat(name, ' ') FROM (SELECT name FROM sqlite_master WHERE type='table' ORDER BY name);")" \
      "endpoint event focus guard message model_sample open_span posting prompt_version run run_posting span span_link ticket" "tables"
}

t_home_is_configurable() {
  export GM_HALL=$WORK/home-env/elsewhere
  gm list >/dev/null && [ -s "$GM_HALL/register.db" ] || fail "GM_HALL not honoured"
  (cd "$WORK/home-env" && GM_HALL=relative bash "$GM" list >/dev/null) && [ -s "$WORK/home-env/relative/register.db" ] || fail "relative GM_HALL"
  local out
  out=$(HOME=$WORK/home-env/fakehome GM_HALL='' bash -c 'unset GM_HALL; bash "$0" list >/dev/null; ls "$HOME/.guildmaster"' "$GM")
  assert_contains "$out" register.db "default home under HOME"
}

t_open_makes_camp_on_feature_branch() {
  setup open
  assert_eq "$(git -C "$CAMP" rev-parse --abbrev-ref HEAD)" feature/CRM-8965 "camp branch" &&
    assert_eq "$(git -C "$REPO" rev-parse --abbrev-ref HEAD)" main "patron's clone stays on its branch" &&
    [ ! -e "$REPO/.claude" ] || fail "settings written into the patron's clone"
  git -C "$REPO" worktree list | grep -q "$CAMP" || fail "camp is not a worktree of the clone"
  assert_eq "$(db "SELECT name||' '||branch||' '||phase FROM focus;")" "appt-v2 feature/CRM-8965 intake" "focus row" &&
    assert_eq "$(db "SELECT key FROM ticket;")" CRM-8965 "ticket attached"
}

t_open_reuses_existing_branch() {
  export GM_HALL=$WORK/reuse/hall
  REPO=$(new_repo reuse/repo)
  git -C "$REPO" branch feature/CRM-1
  git -C "$REPO" checkout -q feature/CRM-1
  git -C "$REPO" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "work already on the branch"
  git -C "$REPO" checkout -q main
  local tip
  tip=$(git -C "$REPO" rev-parse feature/CRM-1)
  gm open reuse --repo "$REPO" --ticket CRM-1 --no-launch >/dev/null 2>&1 || fail "open failed"
  assert_eq "$(git -C "$GM_HALL/camps/reuse" rev-parse HEAD)" "$tip" "camp is on the existing branch tip" &&
    assert_eq "$(git -C "$REPO" branch --list 'feature/*' | wc -l | tr -d ' ')" 1 "no second branch made"
}

t_open_branch_option_and_refusals() {
  setup refuse
  local err
  err=$(gm open other --repo "$REPO" --ticket CRM-8965 --no-launch 2>&1) && fail "a ticket was attached to two focuses"
  assert_contains "$err" "already attached to focus appt-v2" "says which focus has the ticket"
  [ ! -d "$GM_HALL/camps/other" ] || fail "a refused open left its camp behind"
  gm open appt-v2 --branch feature/else --no-launch >/dev/null 2>&1 && fail "a focus changed branch"
  gm open Bad_Name --repo "$REPO" --no-launch >/dev/null 2>&1 && fail "a bad focus name was accepted"
  gm open named --repo "$REPO" --branch topic/x --no-launch >/dev/null 2>&1 || fail "--branch failed"
  assert_eq "$(git -C "$GM_HALL/camps/named" rev-parse --abbrev-ref HEAD)" topic/x "--branch honoured"
}

t_open_again_is_idempotent_and_rebuilds_a_missing_camp() {
  setup reopen
  local out
  out=$(gm open appt-v2 --no-launch 2>&1) || fail "reopen failed: $out"
  assert_eq "$(db 'SELECT count(*) FROM focus;')" 1 "one focus"
  git -C "$REPO" worktree remove --force "$CAMP"
  gm open appt-v2 --no-launch >/dev/null 2>&1 || fail "reopen after camp loss failed"
  assert_eq "$(git -C "$CAMP" rev-parse --abbrev-ref HEAD)" feature/CRM-8965 "camp rebuilt on the recorded branch" &&
    [ -f "$CAMP/.claude/settings.local.json" ] || fail "settings not reinstalled"
}

t_settings_are_project_local_and_complete() {
  setup settings
  local s=$CAMP/.claude/settings.local.json
  json "SELECT json_valid(CAST(readfile('$s') AS TEXT));" | grep -qx 1 || fail "settings are not valid JSON"
  local events
  events=$(json "SELECT group_concat(key, ' ') FROM (SELECT key FROM json_each(json_extract(CAST(readfile('$s') AS TEXT),'\$.hooks')) ORDER BY key);")
  assert_eq "$events" "PostToolUse PostToolUseFailure PreCompact PreToolUse SessionEnd SessionStart Stop StopFailure SubagentStart SubagentStop UserPromptSubmit" "hook events" &&
    assert_eq "$(json "SELECT json_extract(CAST(readfile('$s') AS TEXT),'\$.statusLine.type')||' '||json_extract(CAST(readfile('$s') AS TEXT),'\$.statusLine.refreshInterval');")" "command 5" "status line" &&
    assert_eq "$(json "SELECT json_extract(CAST(readfile('$s') AS TEXT),'\$.env.GM_FOCUS');")" appt-v2 "focus env"
  git -C "$CAMP" check-ignore -q .claude/settings.local.json || fail "camp settings would show up in git status"
  assert_eq "$(git -C "$CAMP" status --porcelain)" "" "camp is clean"
}

t_ten_posts_in_a_row_are_all_recorded() {
  setup ten
  export GM_FOCUS=appt-v2
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    payload s1 "bug $i: the thing number $i is broken, fix it" | gm hook prompt >/dev/null || fail "hook $i failed"
  done
  assert_eq "$(db "SELECT count(*), count(DISTINCT num), min(num), max(num) FROM posting;")" "10|10|1|10" "ten distinct postings" &&
    assert_eq "$(db "SELECT count(*) FROM message WHERE disposition='posting' AND posting_id IS NOT NULL;")" 10 "ten messages linked" &&
    assert_eq "$(db "SELECT words FROM posting WHERE num=7;")" "bug 7: the thing number 7 is broken, fix it" "words kept" &&
    assert_eq "$(db "SELECT group_concat(state) FROM (SELECT DISTINCT state FROM posting);")" received "all received"
}

t_concurrent_posts_lose_nothing() {
  setup concurrent
  export GM_FOCUS=appt-v2
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    payload "s$i" "parallel message $i" | gm hook prompt >/dev/null &
    gm post "posted by the party leader $i" >/dev/null &
  done
  wait
  assert_eq "$(db "SELECT count(*), count(DISTINCT num), max(num) FROM posting;")" "20|20|20" "twenty distinct numbers" &&
    assert_eq "$(db "SELECT count(*) FROM message;")" 10 "ten messages" &&
    assert_eq "$(db "SELECT count(*) FROM posting WHERE words LIKE 'parallel message %';")" 10 "every hook posting" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE verb='received';")" 20 "every received notice"
}

t_words_are_kept_verbatim() {
  setup verbatim
  export GM_FOCUS=appt-v2
  local words f
  # shellcheck disable=SC2016
  words=$(printf 'line one with "double" and '"'"'single'"'"' quotes\n\ttabbed \\ backslash $HOME `cmd` ✓ émoji 🐉\n\n  trailing spaces  ')
  f=$WORK/verbatim/expected
  printf '%s' "$words" >"$f"
  payload s1 "$words" | gm hook prompt >/dev/null || fail "hook failed"
  assert_eq "$(db "SELECT words = CAST(readfile('$f') AS TEXT) FROM message;")" 1 "message words byte for byte" &&
    assert_eq "$(db "SELECT words = CAST(readfile('$f') AS TEXT) FROM posting;")" 1 "posting words byte for byte"
}

t_pasted_content_is_named_from_its_words() {
  setup pasted
  export GM_FOCUS=appt-v2
  local words
  words=$(printf '<pasted_content id="3232">\nFrom the patron, relayed by the front desk: save the research below as a Markdown file.\n\n# Claude Code mods\n</pasted_content>')
  payload s1 "$words" | gm hook prompt >/dev/null || fail "hook failed"
  assert_eq "$(db "SELECT line FROM event WHERE verb='received';")" \
    'appt-v2#1 save-research-below-markdown received ("save the research below as a Markdown file.  # Claude Code m…")' "slug and title from the words" &&
    assert_eq "$(db "SELECT words FROM posting;")" "$words" "words kept with their wrapper" &&
    assert_contains "$(gm list)" "save the research below" "list title"
  gm post '<pasted_content id="7">the owner is empty</pasted_content>' >/dev/null
  gm post 'colour the <button> grey' >/dev/null
  gm post '<pasted_content id="8"></pasted_content>' >/dev/null
  assert_eq "$(db "SELECT group_concat(slug, ' ') FROM (SELECT slug FROM posting ORDER BY num);")" \
    "save-research-below-markdown owner-empty colour-button-grey posting" "slugs" &&
    assert_contains "$(gm list)" '"the owner is empty"' "a short wrapped posting loses its closing tag" &&
    assert_contains "$(gm list)" '"colour the <button> grey"' "a tag inside the words stays"
}

t_resolve_short_and_qualified_ids() {
  setup resolve
  gm open other --repo "$REPO" --ticket CRM-2 --no-launch >/dev/null 2>&1
  GM_FOCUS=appt-v2 gm post --slug fix-owner-empty "owner is empty" >/dev/null
  GM_FOCUS=appt-v2 gm post "second" >/dev/null
  GM_FOCUS=other gm post --slug other-one "in the other focus" >/dev/null
  assert_eq "$(GM_FOCUS=appt-v2 gm resolve 1)" "appt-v2#1 fix-owner-empty" "bare number in context" &&
    assert_eq "$(GM_FOCUS=appt-v2 gm resolve '#1')" "appt-v2#1 fix-owner-empty" "#n in context" &&
    assert_eq "$(cd "$GM_HALL/camps/other" && gm resolve '#1')" "other#1 other-one" "context from the camp directory" &&
    assert_eq "$(GM_FOCUS=other gm resolve 'appt-v2#1')" "appt-v2#1 fix-owner-empty" "qualified from another focus" &&
    assert_eq "$(gm resolve 'appt-v2#1')" "appt-v2#1 fix-owner-empty" "qualified at the front desk" &&
    assert_eq "$(gm resolve 'appt-v2#fix-owner-empty')" "appt-v2#1 fix-owner-empty" "focus#slug" &&
    assert_eq "$(GM_FOCUS=appt-v2 gm resolve fix-owner-empty)" "appt-v2#1 fix-owner-empty" "slug in context" &&
    assert_eq "$(gm resolve crm-8965)" appt-v2 "ticket key" &&
    assert_eq "$(gm resolve other)" other "focus name" &&
    assert_eq "$(gm resolve '#2')" "appt-v2#2 second" "unique bare number at the front desk"
  local err
  err=$(gm resolve '#1' 2>&1) && fail "ambiguous #1 resolved"
  assert_contains "$err" "appt-v2#1 fix-owner-empty" "candidates listed" &&
    assert_contains "$err" "other#1 other-one" "candidates listed"
  GM_FOCUS=appt-v2 gm resolve 99 >/dev/null 2>&1 && fail "a missing posting resolved"
  return 0
}

t_notice_states_and_lines() {
  setup notice
  export GM_FOCUS=appt-v2
  gm post "The owner field is empty after save" >/dev/null
  local out
  out=$(gm notice 1 queued --slug fix-owner-empty)
  assert_eq "$out" 'appt-v2#1 fix-owner-empty queued ("The owner field is empty after save")' "queued line" || return 1
  gm notice 1 started --slug renamed >/dev/null 2>&1 && fail "slug changed after sorting"
  out=$(gm notice 1 started)
  assert_eq "$(db 'SELECT state FROM posting;')" active "started means active"
  gm notice 1 needs-you >/dev/null 2>&1 && fail "needs-you without a question"
  out=$(gm notice 1 needs-you "keep the old URL?")
  assert_eq "$out" 'appt-v2#1 fix-owner-empty needs you: keep the old URL? ("The owner field is empty after save")' "needs-you line" &&
    assert_eq "$(db 'SELECT state FROM posting;')" needs-you "needs-you state"
  gm notice 1 bogus >/dev/null 2>&1 && fail "unknown verb accepted"
  gm notice 1 'done' "fixed in abc123" >/dev/null && assert_eq "$(db 'SELECT state FROM posting;')" 'done' "done state"
}

t_park_and_resume() {
  setup park
  export GM_FOCUS=appt-v2
  gm post --slug grey-button "The save button is grey on Safari" >/dev/null
  gm park 1 >/dev/null 2>&1 && fail "park without a reason"
  local out
  out=$(gm park grey-button --why "waits for dev deploy" --until 2000-01-01)
  assert_eq "$out" 'appt-v2#1 grey-button parked: waits for dev deploy (until 2000-01-01) ("The save button is grey on Safari")' "park line" &&
    assert_eq "$(db "SELECT state||'|'||park_why||'|'||park_until FROM posting;")" "parked|waits for dev deploy|2000-01-01" "park recorded"
  assert_contains "$(gm where)" "its time has come" "a due park is flagged"
  gm notice 1 resumed >/dev/null
  assert_eq "$(db "SELECT state||'|'||COALESCE(park_why,'-')||'|'||COALESCE(park_until,'-') FROM posting;")" "active|-|-" "resumed clears the park"
  assert_contains "$(gm list --all)" "grey-button" "listed"
}

t_list_json_is_what_the_spyglass_reads() {
  setup list-json
  export GM_FOCUS=appt-v2
  assert_eq "$(gm list --json)" "[]" "no postings, an empty array" || return 1
  gm post --slug grey-button "The save button is grey on Safari" >/dev/null
  gm post --slug owner-empty "The owner is empty after save" >/dev/null
  gm notice 2 started >/dev/null
  gm park 1 --why "waits for dev deploy" --until 2000-01-01 >/dev/null
  local f=$WORK/list-json/out.json
  # What the array says, read back by sqlite3: list <SQL over each posting as value>.
  list() { sqlite3 :memory: "SELECT $1 FROM json_each(readfile('$f'));"; }
  gm list --json >"$f"
  assert_eq "$(list "group_concat(value->>'ref'||' '||(value->>'state'),', ')")" "appt-v2#2 active, appt-v2#1 parked" \
    "the postings in the order gm list shows them" &&
    assert_eq "$(list "(value->>'why')||' | '||(value->>'until')||' | '||(value->>'summary')" | sed -n 2p)" \
      "waits for dev deploy | 2000-01-01 | The save button is grey on Safari" "with why, until and the summary" &&
    assert_eq "$(list "value->>'last'" | sed -n 1p)" 'appt-v2#2 owner-empty started ("The owner is empty after save")' \
      "and its last notice line"
  gm notice 2 'done' "fixed" >/dev/null
  assert_not_contains "$(gm list --json)" "owner-empty" "done is left out" &&
    assert_contains "$(gm list --json --all)" "owner-empty" "and in with --all"
}

t_welcome_json_is_what_the_card_shows() {
  setup welcome-json
  local f=$WORK/welcome-json/out.json
  # A field of the object, read back by sqlite3.
  field() { json "SELECT $1 FROM (SELECT json(readfile('$f')) AS j);"; }
  export GM_FOCUS=appt-v2
  gm welcome --json >"$f" || fail "gm welcome failed" || return 1
  assert_eq "$(field "j->>'seat'||' '||(j->>'focus')||' '||(j->>'kind')||' '||(j->>'tickets')")" 'party-leader appt-v2 ticket ["CRM-8965"]' \
    "a Party Leader's seat, focus, kind and tickets" &&
    assert_eq "$(field "j->>'branch'||' | '||json_array_length(j->'phases')||' | '||(j->>'counts')||' | '||(j->>'needs')")" \
      'feature/CRM-8965 | 8 | {} | []' "its branch, the playbook's phases, an empty board"
  gm post --slug grey-button "The save button is grey on Safari" >/dev/null
  gm post --slug owner-empty "The owner is empty after save" >/dev/null
  gm post --slug merge "Open the merge request" >/dev/null
  gm notice 1 started >/dev/null
  gm notice 2 queued >/dev/null
  gm notice 3 needs-you "Open the merge request to integration?" >/dev/null
  gm phase build >/dev/null
  gm welcome --json >"$f"
  assert_eq "$(field "(j->'counts'->>'active')||(j->'counts'->>'queued')||(j->'counts'->>'needs-you')")" 111 "the board counted by state" &&
    assert_eq "$(field "(j->>'active')||' | '||(j->>'next')||' | '||(j->>'phase')")" '#1 grey-button | #2 owner-empty | build' "now, next and the phase" &&
    assert_eq "$(field "j->'needs'->0->>'ref'||' '||(j->'needs'->0->>'question')")" '#3 Open the merge request to integration?' \
      "the question that waits on the patron" &&
    assert_eq "$(field "j->'last'->>'line'")" 'appt-v2 phase: build (3/8)' "the last notice"
  # At the front desk, the whole guild: what needs the patron in every focus, and each Party Leader's state.
  unset GM_FOCUS
  (cd "$WORK" && gm welcome --json) >"$f" || fail "gm welcome at the front desk failed"
  assert_eq "$(field "j->>'seat'||' '||(j->'needs'->0->>'ref')||' '||(j->'roster'->0->>'focus')||' '||(j->'roster'->0->>'state')")" \
    'guildmaster appt-v2#3 appt-v2 waiting' "the guild's needs and roster" &&
    assert_eq "$(field "j->>'trouble'")" '[]' "no trouble"
  db "UPDATE focus SET held_at='2026-01-01T00:00:00Z', start_attempts=3;"
  (cd "$WORK" && gm welcome --json) >"$f"
  assert_eq "$(field "j->'roster'->0->>'state'||' | '||(j->'trouble'->0->>'what')||' | '||(j->'trouble'->0->>'fix')")" \
    'held | appt-v2 is held after 3 failed starts | say "reopen appt-v2"' "a held Party Leader is trouble, with what to say"
  gm welcome >/dev/null 2>&1 && fail "gm welcome without --json was taken"
  return 0
}

t_config_welcome() {
  export GM_HALL=$WORK/conf-welcome/hall
  local out
  out=$(gm config)
  assert_contains "$out" "  welcome                 on        default" "the welcome is on" &&
    assert_contains "$out" "  welcome-art-guildmaster rotate    default" "the art rotates" &&
    assert_contains "$out" "  welcome-fold            rule      default" "it folds to a rule" &&
    assert_contains "$out" "  tutorial                auto      default" "the tutorial fades by rank"
  out=$(gm config set welcome-art-guildmaster hall)
  assert_eq "$(conf welcome-art-guildmaster)" hall "a piece named" &&
    assert_contains "$out" "welcome-art-guildmaster is hall: the Guildmaster and Party Leaders show it from their next start" "says when"
  gm config set welcome-art-party-leader "$GM_HALL/art/dragon.txt" >/dev/null
  assert_eq "$(conf welcome-art-party-leader)" "$GM_HALL/art/dragon.txt" "a file of the patron's own"
  gm config set welcome-fold disappear >/dev/null
  assert_eq "$(conf welcome-fold)" vanish "disappear is vanish"
  gm config set tutorial yes >/dev/null
  assert_eq "$(conf tutorial)" on "yes is on"
  out=$(gm config set welcome-art-guildmaster dragon 2>&1) && fail "a piece gm does not have was taken"
  assert_contains "$out" "welcome-art-guildmaster cannot be 'dragon' (rotate | crest | robed | hall | helm | bearer | tent | none | <file>)" \
    "refused, naming the pieces"
  out=$(gm config set welcome-art-size huge 2>&1) && fail "a size gm does not have was taken"
  grep -q '^# tutorial: auto | on | off, default auto$' "$GM_HALL/guild.conf" || fail "guild.conf documents tutorial"
  return 0
}

t_phase_follows_the_playbook() {
  setup phase
  export GM_FOCUS=appt-v2
  assert_eq "$(gm phase build)" "appt-v2 phase: build (3/8)" "phase line" || return 1
  gm phase nonsense >/dev/null 2>&1 && fail "a phase outside the playbook was accepted"
  assert_eq "$(db 'SELECT phase FROM focus;')" build "phase stored" &&
    assert_eq "$(unset GM_FOCUS; gm phase appt-v2 dev-test)" "appt-v2 phase: dev-test (4/8)" "phase from the front desk"
}

t_additions_and_commands() {
  setup addition
  export GM_FOCUS=appt-v2
  payload s1 "owner field empty after save" | gm hook prompt >/dev/null
  local out
  out=$(payload s1 "#1: also the edit form" | gm hook prompt)
  assert_contains "$out" "addition to posting appt-v2#1" "addition noted" &&
    assert_eq "$(db 'SELECT count(*) FROM posting;')" 1 "no new posting for an addition" &&
    assert_eq "$(db "SELECT disposition||'|'||posting_id FROM message WHERE id=2;")" "addition|1" "addition linked"
  out=$(payload s1 "appt-v2#1 and the list view" | gm hook prompt)
  assert_contains "$out" "addition to posting appt-v2#1" "qualified addition"
  out=$(payload s1 "#9 does not exist" | gm hook prompt)
  assert_contains "$out" "as posting appt-v2#2" "an unknown reference becomes a posting"
  out=$(payload s1 "/compact keep the postings" | gm hook prompt)
  assert_contains "$out" "slash command" "slash command" &&
    assert_eq "$(db "SELECT count(*) FROM message WHERE disposition='command';")" 1 "command recorded" &&
    assert_eq "$(db 'SELECT count(*) FROM posting;')" 2 "no posting for a command"
  out=$(payload s1 '<task-notification>
<task-id>a1b2</task-id>
<status>completed</status>
</task-notification>' | gm hook prompt)
  assert_contains "$out" "background task notification" "a task notification is named for what it is" &&
    assert_eq "$(db "SELECT count(*) FROM message WHERE disposition='command';")" 2 "recorded verbatim" &&
    assert_eq "$(db 'SELECT count(*) FROM posting;')" 2 "but not as the patron's posting"
}

t_hook_output_is_valid_json() {
  setup hookjson
  export GM_FOCUS=appt-v2
  local out
  out=$(payload s1 'a "quoted" message with \ and newline
here' | gm hook prompt)
  assert_eq "$(json "SELECT json_extract($(sqlq "$out"),'\$.hookSpecificOutput.hookEventName');")" UserPromptSubmit "prompt hook JSON"
}

t_stop_guard_blocks_until_sorted() {
  setup stop
  export GM_FOCUS=appt-v2
  payload s1 "fix the owner field" | gm hook prompt >/dev/null
  local out
  out=$(printf '{"session_id":"s1","stop_hook_active":false,"background_tasks":[]}' | gm hook stop)
  assert_eq "$(json "SELECT json_extract('$out','\$.decision');")" block "received blocks" &&
    assert_contains "$out" "appt-v2#1" "names the posting" || return 1
  gm notice 1 started >/dev/null
  out=$(printf '{"session_id":"s1"}' | gm hook stop)
  assert_contains "$out" "is active (claimed)" "active blocks"
  out=$(printf '{"session_id":"s1","background_tasks":[{"id":"t","type":"shell","status":"running"}]}' | gm hook stop)
  assert_eq "$out" "" "active with background work may stop"
  gm notice 1 'done' "fixed" >/dev/null
  out=$(printf '{"session_id":"s1"}' | gm hook stop)
  assert_eq "$out" "" "nothing pending lets the turn end"
  payload s1 "#1 one more thing" | gm hook prompt >/dev/null
  out=$(printf '{"session_id":"s1"}' | gm hook stop)
  assert_contains "$out" "addition to appt-v2#1" "an unacknowledged addition blocks"
  gm notice 1 update "looked at it" >/dev/null
  assert_eq "$(printf '{"session_id":"s1"}' | gm hook stop)" "" "acknowledged"
}

t_stop_guard_has_a_budget() {
  setup budget
  export GM_FOCUS=appt-v2
  payload s1 "never sorted" | gm hook prompt >/dev/null
  local i out
  for i in 1 2 3; do
    out=$(printf '{"session_id":"s1","stop_hook_active":true}' | gm hook stop)
    assert_contains "$out" '"decision":"block"' "block $i" || return 1
  done
  out=$(printf '{"session_id":"s1","stop_hook_active":true}' | gm hook stop)
  assert_not_contains "$out" '"decision"' "the guard gives up" &&
    assert_contains "$out" "gave up after 3 blocks" "and says so" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='guard.gave-up';")" 1 "giving up is recorded"
  out=$(printf '{"session_id":"s1"}' | gm hook stop)
  assert_contains "$out" '"decision":"block"' "the budget restarts"
}

t_resume_summary_rebuilds_context() {
  setup resume
  export GM_FOCUS=appt-v2
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    payload s1 "item $i from the patron, in their own words" | gm hook prompt >/dev/null
  done
  gm notice 1 started --slug first-item >/dev/null
  payload s1 "#1 and keep the old URL working" | gm hook prompt >/dev/null
  gm notice 1 update "will keep the old URL" >/dev/null
  payload s1 "#2 this one is urgent" | gm hook prompt >/dev/null
  for i in 2 3 4 5 6 7 8; do gm notice "$i" queued >/dev/null; done
  gm park 9 --why "waits for the dev deploy" >/dev/null
  gm phase build >/dev/null
  local out
  out=$(printf '{"session_id":"s2","source":"startup","hook_event_name":"SessionStart"}' | gm hook session-start)
  local ctx
  ctx=$(json "SELECT json_extract($(sqlq "$out"),'\$.hookSpecificOutput.additionalContext');")
  assert_eq "$(json "SELECT json_extract($(sqlq "$out"),'\$.hookSpecificOutput.sessionTitle');")" appt-v2 "session title" &&
    assert_contains "$ctx" "Party Leader of appt-v2" "who it is" &&
    assert_contains "$ctx" "Phase: build (3/8" "phase" &&
    assert_contains "$ctx" '#1 first-item, the patron'"'"'s words' "the active posting" &&
    assert_contains "$ctx" "item 1 from the patron, in their own words" "its words" &&
    assert_contains "$ctx" "addition (" "the active posting's additions" &&
    assert_contains "$ctx" "and keep the old URL working" "the addition's words" &&
    assert_contains "$ctx" "this one is urgent" "an unacknowledged addition" &&
    assert_contains "$ctx" "#9" "parked" &&
    assert_contains "$ctx" "waits for the dev deploy" "park reason" &&
    assert_contains "$ctx" "#10" "the unsorted one" &&
    assert_contains "$ctx" "Received, not yet sorted" "unsorted heading" &&
    assert_contains "$ctx" "Next on the board: the received postings need a state; then #1 first-item is active and unfinished." "next step" &&
    assert_contains "$ctx" "Camp git state" "git snapshot" &&
    assert_eq "$(db "SELECT detail FROM event WHERE kind='session.start';")" startup "session start recorded"
}

t_charter_hook_loads_the_patron_files() {
  setup charter
  export GM_FOCUS=appt-v2
  printf '\nPATRON-EDIT-MARKER\n' >>"$GM_HALL/charter.md"
  local out
  out=$(printf '{"session_id":"s1","source":"startup"}' | gm hook charter)
  assert_contains "$out" "PATRON-EDIT-MARKER" "the patron's charter" &&
    assert_contains "$out" "phase: dev-test" "the playbook" &&
    assert_contains "$out" "feature-branch:" "the rules"
  gm open appt-v2 --no-launch >/dev/null 2>&1
  grep -q PATRON-EDIT-MARKER "$GM_HALL/charter.md" || fail "gm overwrote the patron's charter"
}

t_precompact_records_a_snapshot() {
  setup compact
  export GM_FOCUS=appt-v2
  gm post "something open" >/dev/null
  printf 'scratch\n' >"$CAMP/new-file.txt"
  printf '{"session_id":"s1","trigger":"auto","custom_instructions":null}' | gm hook precompact
  local d
  d=$(db "SELECT detail FROM event WHERE kind='session.compact';")
  assert_contains "$d" "compaction (auto)" "trigger" &&
    assert_contains "$d" "new-file.txt" "git state" &&
    assert_contains "$d" "#1 something-open received" "open postings"
}

t_statusline() {
  setup status
  gm open other --repo "$REPO" --no-launch >/dev/null 2>&1
  GM_FOCUS=other gm post "elsewhere" >/dev/null
  GM_FOCUS=other gm notice 1 needs-you "which one?" >/dev/null
  export GM_FOCUS=appt-v2
  gm post "first" >/dev/null
  gm post "second" >/dev/null
  gm notice 1 started >/dev/null
  gm notice 2 queued >/dev/null
  local out
  out=$(printf '{"context_window":{"used_percentage":41.4},"model":{"display_name":"Opus"}}' | gm statusline)
  assert_eq "$(printf '%s\n' "$out" | sed -n 1p)" "▸ appt-v2 · ticket · CRM-8965 · phase 1/8 intake · feature/CRM-8965" "line 1" &&
    assert_eq "$(printf '%s\n' "$out" | sed -n 2p)" "postings 1 active · 1 queued · 0 done · next #2 second" "line 2" &&
    assert_eq "$(printf '%s\n' "$out" | sed -n 3p)" "guild 2 focuses · need you elsewhere: other 1 · ctx 41% · Opus" "line 3"
  unset GM_FOCUS
  out=$(printf '{"workspace":{"current_dir":"%s"}}' "$CAMP" | gm statusline)
  assert_contains "$out" "▸ appt-v2" "focus from the workspace directory"
}

t_db_failure_spills_the_message() {
  setup spill
  export GM_FOCUS=appt-v2
  mv "$GM_HALL/register.db" "$GM_HALL/register.db.away"
  printf 'not a database' >"$GM_HALL/register.db"
  local out
  out=$(payload s1 "do not lose me" | gm hook prompt)
  assert_contains "$out" "systemMessage" "the patron is told"
  grep -rq "do not lose me" "$GM_HALL/spill" || fail "the message was not spilled"
}

# ---- Tracing, slice 1: spans from recorded hook payloads, no model ----

# hookj "'key',value,..." prints a hook payload built by sqlite, so any text is escaped correctly.
hookj() { json "SELECT json_object($1);"; }

sha12() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-12
}

attr() { printf "json_extract(%s,'\$.\"%s\"')" "${2:-attrs}" "$1"; }

# The tracing design's done-when posting: a message, a Bash call that runs gm, an MCP call and a subagent.
scenario() {
  setup "$1"
  export GM_FOCUS=appt-v2
  hookj "'session_id','s1','hook_event_name','SessionStart','source','startup','model','claude-opus-5-5'" | gm hook session-start >/dev/null
  hookj "'session_id','s1','hook_event_name','SessionStart','source','startup'" | gm hook charter >/dev/null
  printf '{"session_id":"s1","prompt_id":"p1","model":{"id":"claude-opus-5-5"},"effort":{"level":"high"},"cost":{"total_cost_usd":0.10}}' | gm statusline >/dev/null
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','UserPromptSubmit','prompt','the owner field is empty after save, fix it'" | gm hook prompt >/dev/null
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','PreToolUse','tool_name','Bash','tool_use_id','t1','tool_input',json_object('command','GITHUB_TOKEN=abc123 gm notice 1 started')" | gm hook pre-tool
  CLAUDE_CODE_SESSION_ID=s1 gm notice 1 started >/dev/null
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','PostToolUse','tool_name','Bash','tool_use_id','t1','duration_ms',40" | gm hook post-tool
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','PreToolUse','tool_name','mcp__jira__getIssue','tool_use_id','t2','mcp_server',json_object('name','jira','source','user')" | gm hook pre-tool
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','PostToolUse','tool_name','mcp__jira__getIssue','tool_use_id','t2','duration_ms',1800,'mcp_server',json_object('name','jira','source','user')" | gm hook post-tool
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','PreToolUse','tool_name','Agent','tool_use_id','t3','tool_input',json_object('subagent_type','Explore','prompt','find the save handler')" | gm hook pre-tool
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','SubagentStart','agent_id','a1','agent_type','Explore'" | gm hook subagent-start
  hookj "'session_id','s1','prompt_id','p1','agent_id','a1','agent_type','Explore','hook_event_name','PreToolUse','tool_name','Read','tool_use_id','t4','tool_input',json_object('file_path','/src/owner.js')" | gm hook pre-tool
  hookj "'session_id','s1','prompt_id','p1','agent_id','a1','agent_type','Explore','hook_event_name','PostToolUseFailure','tool_name','Read','tool_use_id','t4','error','File does not exist.','is_interrupt',json('false'),'duration_ms',3" | gm hook post-tool-failure
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','SubagentStop','agent_id','a1','agent_type','Explore','stop_hook_active',json('false')" | gm hook subagent-stop
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','PostToolUse','tool_name','Agent','tool_use_id','t3','tool_response',json_object('status','completed','agentId','a1','resolvedModel','claude-haiku-4-5','totalToolUseCount',1)" | gm hook post-tool
  printf '{"session_id":"s1","prompt_id":"p1","model":{"id":"claude-opus-5-5"},"effort":{"level":"high"},"cost":{"total_cost_usd":0.31}}' | gm statusline >/dev/null
  CLAUDE_CODE_SESSION_ID=s1 gm notice 1 'done' "fixed" >/dev/null
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','Stop','stop_hook_active',json('false'),'effort',json_object('level','high')" | gm hook stop
}

t_trace_shows_the_posting_tree() {
  scenario waterfall
  local out
  out=$(gm trace 1)
  assert_contains "$out" "appt-v2#1 owner-field-empty-after  done  " "root line" &&
    assert_contains "$out" "  1 exchange  \$0.21 est." "root totals" &&
    assert_contains "$out" '├─ exchange 1  "the owner field is empty after save, fix it"  reply in ' "exchange" &&
    assert_contains "$out" "│  ├─ hook UserPromptSubmit  capture  " "capture hook first" &&
    assert_contains "$out" "│  ├─ invoke_agent party-leader  opus-5-5 · high  " "the turn, model and effort" &&
    assert_contains "$out" "│  │  ├─ execute_tool Bash  GITHUB_TOKEN=<REDACTED:assignment> gm notice 1 started  " "Bash call, redacted" &&
    assert_contains "$out" "│  │  │  └─ notice started" "the notice under the Bash call that ran it" &&
    assert_contains "$out" "│  │  ├─ execute_tool mcp__jira__getIssue  " "MCP call" &&
    assert_contains "$out" "│  │  └─ execute_tool Agent  Explore  haiku-4-5  " "Agent call" &&
    assert_contains "$out" "│  │     └─ invoke_agent Explore  haiku-4-5 · none  " "subagent under its Agent call" &&
    assert_contains "$out" "│  │        └─ execute_tool Read  /src/owner.js  " "the subagent's tool call" &&
    assert_contains "$out" "✗ tool_error" "a failed tool call" &&
    assert_contains "$out" "│  └─ hook Stop  guard allow  " "Stop hook last in the exchange" &&
    assert_contains "$out" "└─ notice done: fixed" "terminal notice" || return 1
  assert_eq "$(db "SELECT count(*) FROM open_span WHERE name<>'guild.session';")" 0 "nothing left open but the session" &&
    assert_eq "$(db "SELECT count(DISTINCT trace_id) FROM span WHERE $(attr guild.posting)='appt-v2#1';")" 1 "one posting, one trace" &&
    assert_eq "$(db "SELECT trace_id FROM posting WHERE num=1;")" "$(db "SELECT trace_id FROM span WHERE name='guild.exchange';")" "the posting row holds its trace id" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE $(attr guild.camp.commit)=$(sqlq "$(git -C "$CAMP" rev-parse HEAD)");")" "$(db "SELECT count(*) FROM span;")" "every span carries the camp commit" &&
    assert_eq "$(db "SELECT $(attr guild.mcp.server)||' '||$(attr mcp.method.name) FROM span WHERE name LIKE 'execute_tool mcp%';")" "jira tools/call" "MCP attributes" &&
    assert_eq "$(db "SELECT count(*) FROM span_link WHERE json_extract(attrs,'\$.\"guild.link\"')='served by session';")" 1 "the exchange links to its session" &&
    assert_eq "$(db "SELECT length(start_ms)=13 AND end_ms>=start_ms FROM span WHERE name='guild.exchange';")" 1 "millisecond epoch times" &&
    assert_eq "$(db "SELECT created_at GLOB '*T*:*:*.[0-9][0-9][0-9]Z' FROM posting;")" 1 "register times are millisecond now"
  [ ! -e "$GM_HALL/spans-dropped.log" ] || fail "spans were dropped: $(cat "$GM_HALL/spans-dropped.log")"
  out=$(gm trace appt-v2)
  assert_contains "$out" "appt-v2#1 owner-field-empty-after" "focus trace has the posting" &&
    assert_contains "$out" "session s1  startup" "and the session" &&
    assert_contains "$out" "hook SessionStart  charter" "with its session hooks" &&
    assert_contains "$out" "notice phase intake" "and focus notices"
}

t_stats_from_a_recorded_session() {
  scenario stats
  local out
  out=$(gm stats 1)
  assert_contains "$out" "appt-v2#1 owner-field-empty-after  done" "heading" &&
    assert_contains "$out" "  first reply " "first reply" &&
    assert_contains "$out" "  exchanges 1 · turns 1 · right first time: yes" "exchanges and turns" &&
    assert_contains "$out" "  steps 6: 1 turn · 4 tool calls (1 MCP, 1 failed) · 1 subagent · model calls need telemetry" "steps" &&
    assert_contains "$out" "  hooks 2 runs in " "hook overhead" &&
    assert_contains "$out" "  cost \$0.21 est., from Claude Code's status line" "cost from the status line"
  out=$(gm stats)
  assert_contains "$out" "appt-v2: 1 postings traced · 1 done · 1 right first time" "focus summary" &&
    assert_contains "$out" "appt-v2#1 owner-field-empty-after    done" "focus table"
  assert_eq "$(db "SELECT count(*) FROM sqlite_master WHERE sql LIKE '%first_reply%' OR sql LIKE '%cost%total%';")" 0 "no measure is stored"
}

# Spans with fixed times, so each measure's definition is checked to the millisecond.
t_each_stats_measure() {
  setup measures
  export GM_FOCUS=appt-v2
  gm post --slug fix-owner-empty "the owner field is empty" >/dev/null
  gm post --slug edit-form "the edit form too" >/dev/null
  gm notice 2 queued --follows 1 >/dev/null
  local t
  t=$(db "SELECT trace_id FROM posting WHERE num=1;")
  db "DELETE FROM span WHERE trace_id='$t';
      UPDATE posting SET state='done', span_start_ms=1000000 WHERE num=1;
      INSERT INTO span SELECT trace_id, span_id, NULL, 'guild.posting', 1000000, 4600000, 'ok', '{\"guild.state\":\"done\"}' FROM posting WHERE num=1;"
  local root
  root=$(db "SELECT span_id FROM posting WHERE num=1;")
  sp() { db "INSERT INTO span VALUES ('$t', '$1', '$2', '$3', $4, $5, '$6', '$7');"; }
  sp e1 "$root" guild.exchange 1000000 1041000 ok '{"guild.exchange.n":1}'
  sp e2 "$root" guild.exchange 1100000 1112000 ok '{"guild.exchange.n":2}'
  sp u1 e1 'invoke_agent party-leader' 1000100 1038000 ok '{"guild.cost.usd":0.5}'
  sp u2 e2 'invoke_agent party-leader' 1100100 1111000 ok '{"guild.cost.usd":0.25}'
  sp u3 "$root" 'invoke_agent party-leader' 1030000 1050000 ok '{}'
  sp n1 "$root" guild.notice 1000000 1000010 ok '{"guild.notice.verb":"received"}'
  sp n2 "$root" guild.notice 1009000 1009010 ok '{"guild.notice.verb":"started"}'
  sp n3 "$root" guild.notice 1200000 1200010 ok '{"guild.notice.verb":"parked"}'
  sp n4 "$root" guild.notice 1300000 1300010 ok '{"guild.notice.verb":"update"}'
  sp n5 "$root" guild.notice 1500000 1500010 ok '{"guild.notice.verb":"resumed"}'
  sp n6 "$root" guild.notice 4600000 4600000 ok '{"guild.notice.verb":"done"}'
  sp x1 u1 'execute_tool Bash' 1001000 1002000 ok '{}'
  sp x2 u1 'execute_tool mcp__jira__getIssue' 1003000 1004000 ok '{}'
  sp x3 u2 'execute_tool Read' 1101000 1101005 error '{"error.type":"tool_error"}'
  sp a1 x1 'invoke_agent Explore' 1001100 1001900 ok '{}'
  sp h1 e1 guild.hook 1000000 1000100 ok '{"guild.hook.decision":"none"}'
  sp h2 e1 guild.hook 1038000 1038200 ok '{"guild.hook.decision":"block"}'
  sp h3 e1 guild.hook 1041000 1041300 ok '{"guild.hook.decision":"allow"}'
  local out
  out=$(gm stats 1)
  assert_contains "$out" "  first reply 41s · first notice 9.0s · total 1h00m (working 1m00s, parked 5m00s)" "times" &&
    assert_contains "$out" "  exchanges 2 (topic 2, with #2) · turns 3 · right first time: no" "exchanges, topic, turns, right first time" &&
    assert_contains "$out" "  steps 7: 3 turns · 3 tool calls (1 MCP, 1 failed) · 1 subagent · model calls need telemetry · 0 Adventurer runs · 0 failed checks" "steps" &&
    assert_contains "$out" "  hooks 3 runs in 0.6s · 1 Stop-guard block" "hook overhead" &&
    assert_contains "$out" "  cost \$0.75 est." "cost"
  out=$(gm stats 2)
  assert_contains "$out" "exchanges 0 (topic 2, with #1)" "the follow-up counts toward the same topic"
  db "DELETE FROM span WHERE span_id='e2';"
  out=$(gm stats 1)
  assert_contains "$out" "right first time: yes" "done in one exchange is right first time"
}

t_follows_joins_postings_into_a_topic() {
  setup follows
  export GM_FOCUS=appt-v2
  payload s1 "the owner field is empty after save" | gm hook prompt >/dev/null
  payload s1 "the owner is empty on the edit form as well" | gm hook prompt >/dev/null
  local out
  out=$(gm notice 2 queued --follows 1)
  assert_contains "$out" "appt-v2#2" "the notice line" &&
    assert_eq "$(db "SELECT follows_id FROM posting WHERE num=2;")" 1 "follows recorded" &&
    assert_eq "$(db "SELECT line FROM event WHERE kind='posting.follows';")" "appt-v2#2 owner-empty-edit-form follows appt-v2#1 owner-field-empty-after" "ledger line"
  gm notice 1 queued --follows 2 >/dev/null 2>&1 && fail "a loop was accepted"
  gm notice 1 queued --follows 1 >/dev/null 2>&1 && fail "a posting followed itself"
  gm post --follows 2 "and the list view" >/dev/null
  assert_eq "$(db "SELECT follows_id FROM posting WHERE num=3;")" 2 "post --follows"
  assert_contains "$(gm stats 1)" "exchanges 1 (topic 2, with #2, #3)" "topic of three postings" &&
    assert_contains "$(gm stats 3)" "(topic 2, with #1, #2)" "the same topic from its last posting"
  gm notice 2 'done' "fixed" >/dev/null
  assert_eq "$(db "SELECT $(attr guild.follows) FROM span WHERE name='guild.posting';")" "appt-v2#1" "guild.follows on the posting span"
}

t_by_prompt_groups_postings_by_charter_hash() {
  setup byprompt
  export GM_FOCUS=appt-v2
  local h1 h2 out
  h1=$(sha12 "$GM_HALL/charter.md")
  hookj "'session_id','s1','source','startup'" | gm hook charter >/dev/null
  payload s1 "first under the old charter" | gm hook prompt >/dev/null
  payload s1 "second under the old charter" | gm hook prompt >/dev/null
  gm notice 1 'done' "ok" >/dev/null
  printf '\nA new rule from the patron.\n' >>"$GM_HALL/charter.md"
  h2=$(sha12 "$GM_HALL/charter.md")
  hookj "'session_id','s2','source','startup'" | gm hook charter >/dev/null
  payload s2 "third, under the edited charter" | gm hook prompt >/dev/null
  out=$(gm stats --by-prompt charter)
  assert_contains "$out" "not ranked: gm ranks prompt versions only when each has 10 postings or more" "small groups are not ranked" &&
    assert_contains "$out" "charter $h1" "the old charter's hash" &&
    assert_contains "$out" "  postings 2 · done 1 · right first time 1 · median exchanges 1" "the old charter's outcomes" &&
    assert_contains "$out" "charter $h2" "the edited charter's hash" &&
    assert_contains "$out" "  postings 1 · done 0 · right first time 0" "the edited charter's outcomes" &&
    assert_contains "$out" "focuses appt-v2 · fewer than 10 postings" "the mix and the group size"
  assert_eq "$(db "SELECT count(*) FROM prompt_version WHERE name='charter';")" 2 "each version stored once" &&
    assert_eq "$(db "SELECT text FROM prompt_version WHERE name='charter' AND sha256 LIKE '$h2%';")" "$(cat "$GM_HALL/charter.md")" "its text can be read back"
  assert_contains "$(gm stats --by-prompt playbook)" "postings 3" "every template is versioned"
  assert_contains "$(gm stats --by-prompt nothing-yet)" "No posting has run under a recorded nothing-yet prompt yet." "an unknown template"
}

t_compare_ranks_a_selection_against_its_baseline() {
  setup compare
  export GM_FOCUS=appt-v2
  local i dur tool model
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if [ "$i" -le 4 ]; then dur=45000 tool=Bash model=opus; else dur=2000 tool=Read model=haiku; fi
    [ "$i" != 5 ] || model=opus
    db "INSERT INTO span VALUES ('t$i', 's$i', NULL, 'execute_tool $tool', 1000, 1000+$dur, 'ok',
          json_object('gen_ai.tool.name', '$tool', 'guild.experiment', '$model', 'gen_ai.tool.call.id', 'toolu_$i', 'guild.focus', 'appt-v2', 'guild.tool.command', 'cmd $i'));"
  done
  local out
  out=$(gm stats --compare slow-tools)
  assert_contains "$out" "selection: 4 execute_tool spans slower than 30s · baseline: 6 others" "counts" &&
    assert_eq "$(printf '%s\n' "$out" | sed -n 3p | tr -s ' ')" "gen_ai.tool.name Bash 100.0% 0.0%" "the largest difference first" &&
    assert_contains "$(printf '%s\n' "$out" | tr -s ' ')" "guild.experiment opus 100.0% 16.7%" "an attribute no schema knows" &&
    assert_not_contains "$out" "gen_ai.tool.call.id" "ids are left out" &&
    assert_not_contains "$out" "guild.tool.command" "a value distinct on every span is left out"
  assert_contains "$(gm stats --compare slow-tools --over 1h)" "The selection is empty" "empty selection"
  assert_contains "$(gm stats --compare slow-tools --over 1s)" "The baseline is empty" "empty baseline"
  gm stats --compare everything >/dev/null 2>&1 && fail "an unknown selection was accepted"
  payload s1 "one" | gm hook prompt >/dev/null
  payload s1 "two" | gm hook prompt >/dev/null
  payload s1 "#2 and more" | gm hook prompt >/dev/null
  payload s1 "three" | gm hook prompt >/dev/null
  for i in 1 2 3; do gm notice "$i" 'done' "ok" >/dev/null; done
  assert_contains "$(gm stats --compare not-right-first-time)" "selection: 1 postings not right first time (of those done or failed) · baseline: 2 others" "postings" &&
    assert_contains "$(gm stats --compare slow-replies appt-v2)" "exchanges whose reply took over 2m" "replies" &&
    assert_contains "$(gm stats --compare slow-hooks --over 0ms)" "guild.hook spans slower than 0ms" "hooks"
}

t_new_attribute_needs_no_schema_change() {
  setup newattr
  export GM_FOCUS=appt-v2
  local before
  before=$(db "SELECT group_concat(sql, ';') FROM sqlite_master;")
  hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','n1','tool_input',json_object('command','ls'),'a_field_claude_code_adds_later',42" | gm hook pre-tool
  hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','n1','duration_ms',5" | gm hook post-tool
  db "INSERT INTO span VALUES ('tx', 'sx', NULL, 'execute_tool Bash', 1, 2, 'ok', json_object('guild.brand.new', 'yes'));"
  assert_eq "$(db "SELECT $(attr guild.brand.new) FROM span WHERE span_id='sx';")" yes "a new key is just a key in attrs" &&
    assert_eq "$(db "SELECT group_concat(sql, ';') FROM sqlite_master;")" "$before" "the schema is unchanged"
}

t_secret_masking_from_known_cases() {
  setup redact
  export GM_FOCUS=appt-v2
  local n=0 input expected got secrets=''
  while IFS=$'\t' read -r input expected; do
    case $input in '' | '#'*) continue ;; esac
    input=${input//\{\}/}
    expected=${expected//\{\}/}
    input=${input//\{nl\}/$'\n'}
    expected=${expected//\{nl\}/$'\n'}
    n=$((n + 1))
    hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','r$n','tool_input',json_object('command',$(sqlq "$input"))" | gm hook pre-tool
    got=$(db "SELECT $(attr guild.tool.command) FROM open_span WHERE key='tool:r$n';")
    assert_eq "$got" "$expected" "case $n"
  done <"$ROOT/tests/redaction-cases.tsv"
  [ "$n" -ge 30 ] || fail "only $n known cases"
  for secrets in hunter2 s3cr3t abc123def ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 IOSFODNN7EXAMPLE b3BlbnNzaC1rZXktdjEAAAA; do
    sqlite3 "$GM_HALL/register.db" .dump | grep -q "$secrets" && fail "the register holds $secrets"
  done
  return 0
}

t_record_hooks_never_block() {
  setup neverblock
  export GM_FOCUS=appt-v2
  local h out rc
  for h in session-end pre-tool post-tool post-tool-failure subagent-start subagent-stop stop-failure; do
    out=$(printf 'not json at all' | gm hook "$h"; printf 'rc=%s' "$?")
    assert_eq "$out" "rc=0" "$h on garbage prints nothing and exits 0"
    out=$(hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','u1','agent_id','a1','reason','other','error','rate_limit'" | gm hook "$h"; printf 'rc=%s' "$?")
    assert_eq "$out" "rc=0" "$h on a payload prints nothing and exits 0"
  done
  mv "$GM_HALL/register.db" "$GM_HALL/register.db.away"
  printf 'not a database' >"$GM_HALL/register.db"
  for h in session-end pre-tool post-tool post-tool-failure subagent-start subagent-stop stop-failure; do
    out=$(hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','u2','agent_id','a2'" | gm hook "$h"; printf 'rc=%s' "$?")
    assert_eq "$out" "rc=0" "$h with a broken register"
  done
  out=$(printf '{"session_id":"s1"}' | gm hook stop; printf 'rc=%s' "$?")
  assert_contains "$out" "rc=0" "the Stop guard with a broken register"
  rc=$(grep -c . "$GM_HALL/spans-dropped.log" || true)
  [ "$rc" -ge 7 ] || fail "dropped spans were not counted ($rc)"
  mv "$GM_HALL/register.db.away" "$GM_HALL/register.db"
  rm -f "$GM_HALL/register.db-wal" "$GM_HALL/register.db-shm"
  assert_contains "$(gm stats)" "spans dropped: $rc" "gm stats reports the count"
}

t_session_span_from_start_to_end() {
  setup session
  export GM_FOCUS=appt-v2
  hookj "'session_id','s1','source','startup','model','claude-sonnet-5-5'" | gm hook session-start >/dev/null
  hookj "'session_id','s1','trigger','auto'" | gm hook precompact
  hookj "'session_id','s1','source','compact'" | gm hook session-start >/dev/null
  payload s1 "a message the session never answers" | gm hook prompt >/dev/null
  hookj "'session_id','s1','prompt_id','p9','tool_name','Bash','tool_use_id','v1','tool_input',json_object('command','sleep 100')" | gm hook pre-tool
  assert_eq "$(db "SELECT count(*) FROM span WHERE name='guild.session';")" 0 "an open session is not a span yet" || return 1
  hookj "'session_id','s1','hook_event_name','SessionEnd','reason','prompt_input_exit'" | gm hook session-end
  assert_eq "$(db "SELECT $(attr guild.session.source)||' '||$(attr guild.session.end_reason)||' '||$(attr gen_ai.request.model) FROM span WHERE name='guild.session';")" \
    "startup prompt_input_exit claude-sonnet-5-5" "source, end reason and model" &&
    assert_eq "$(db "SELECT group_concat(json_extract(e.value,'\$.name'), ' ') FROM span, json_each(json_extract(attrs,'\$.events')) e WHERE name='guild.session';")" \
      "compaction session.resumed-after-compaction" "compactions are events on the session" &&
    assert_eq "$(db "SELECT count(*) FROM open_span;")" 0 "the session's end closes what it left open" &&
    assert_eq "$(db "SELECT group_concat(status||' '||$(attr guild.closed_by), ',') FROM span WHERE name IN ('execute_tool Bash','guild.exchange');")" \
      "unset session-end,unset session-end" "closed as unfinished, not as success" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name='guild.hook' AND $(attr guild.hook.event) IN ('SessionStart','PreCompact');")" 3 "hook spans for resume and snapshot"
  hookj "'session_id','s1','source','resume'" | gm hook session-start >/dev/null
  hookj "'session_id','s1','source','startup'" | gm hook session-start >/dev/null
  assert_eq "$(db "SELECT count(*) FROM span WHERE name='guild.session' AND $(attr guild.closed_by)='session-start';")" 1 "a killed session is closed by the next start"
}

t_stop_guard_block_is_only_a_hook_span() {
  setup stopblock
  export GM_FOCUS=appt-v2
  payload s1 "fix the owner field" | gm hook prompt >/dev/null
  local pid
  pid=$(db "SELECT prompt_id FROM message;")
  hookj "'session_id','s1','prompt_id','$pid'" | gm hook stop >/dev/null
  assert_eq "$(db "SELECT $(attr guild.hook.decision)||' '||$(attr guild.hook.blocks) FROM span WHERE $(attr guild.hook.event)='Stop';")" "block 1" "a blocking Stop" &&
    assert_eq "$(db "SELECT count(*) FROM open_span WHERE name='guild.exchange';")" 1 "the exchange stays open" &&
    assert_eq "$(db "SELECT count(*) FROM prompt_version WHERE name='stop-guard';")" 1 "the guard's message is a prompt version" || return 1
  gm notice 1 queued >/dev/null
  hookj "'session_id','s1','prompt_id','$pid'" | gm hook stop >/dev/null
  assert_eq "$(db "SELECT count(*) FROM open_span WHERE name IN ('guild.exchange','invoke_agent party-leader');")" 0 "the allowed Stop ends the exchange and the turn" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name='guild.exchange' AND status='ok';")" 1 "one exchange"
}

t_stop_failure_ends_the_turn_with_an_error() {
  setup stopfail
  export GM_FOCUS=appt-v2
  hookj "'session_id','s1','prompt_id','p1','prompt','fix it'" | gm hook prompt >/dev/null
  hookj "'session_id','s1','prompt_id','p1','hook_event_name','StopFailure','error','rate_limit','error_details','429 Too Many Requests','last_assistant_message','API Error: Rate limit reached'" | gm hook stop-failure
  assert_eq "$(db "SELECT group_concat(name||' '||status||' '||$(attr error.type), ', ') FROM (SELECT * FROM span WHERE name IN ('guild.exchange','invoke_agent party-leader') ORDER BY name);")" \
    "guild.exchange error rate_limit, invoke_agent party-leader error rate_limit" "turn and exchange end in error" &&
    assert_eq "$(db "SELECT json_extract(attrs,'\$.events[0].name') FROM span WHERE name='invoke_agent party-leader';")" stop_failure "an event on the turn"
}

t_interrupted_turn_is_closed_by_the_next_stop() {
  setup interrupt
  export GM_FOCUS=appt-v2
  hookj "'session_id','s1','prompt_id','p1','prompt','first, then interrupted'" | gm hook prompt >/dev/null
  hookj "'session_id','s1','prompt_id','p2','prompt','second'" | gm hook prompt >/dev/null
  gm notice 1 queued >/dev/null
  gm notice 2 queued >/dev/null
  hookj "'session_id','s1','prompt_id','p2'" | gm hook stop >/dev/null
  assert_eq "$(db "SELECT group_concat($(attr prompt.id)||' '||status||' '||COALESCE($(attr guild.closed_by),'-'), ', ') FROM (SELECT * FROM span WHERE name='guild.exchange' ORDER BY $(attr prompt.id));")" \
    "p1 unset interrupted, p2 ok -" "the earlier turn ends as interrupted"
}

t_tool_calls_and_subagents_from_payloads() {
  setup tools
  export GM_FOCUS=appt-v2
  hookj "'session_id','s1','prompt_id','p1','prompt','look around'" | gm hook prompt >/dev/null
  hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','w1','duration_ms',1200,'error','Exit code 2
grep: nope','is_interrupt',json('false')" | gm hook post-tool-failure
  hookj "'session_id','s1','prompt_id','p1','tool_name','Agent','tool_use_id','w2','tool_input',json_object('subagent_type','general-purpose','run_in_background',json('true'))" | gm hook pre-tool
  hookj "'session_id','s1','prompt_id','p1','tool_name','Agent','tool_use_id','w2','tool_response',json_object('status','async_launched','agentId','b1','resolvedModel','claude-sonnet-5-5')" | gm hook post-tool
  hookj "'session_id','s1','agent_id','b1','agent_type','general-purpose'" | gm hook subagent-start
  hookj "'session_id','s1','agent_id','b1','agent_type','general-purpose','effort',json_object('level','medium')" | gm hook subagent-stop
  hookj "'session_id','s1','agent_id','internal','agent_type',''" | gm hook subagent-stop
  assert_eq "$(db "SELECT status||' '||$(attr guild.exit_code)||' '||(end_ms-start_ms BETWEEN 1200 AND 1210) FROM span WHERE name='execute_tool Bash';")" "error 2 1" "a failure with no PreToolUse, timed from duration_ms" &&
    assert_eq "$(db "SELECT $(attr guild.background)||' '||$(attr gen_ai.request.model) FROM span WHERE name='execute_tool Agent';")" "1 claude-sonnet-5-5" "a background Agent call" &&
    assert_eq "$(db "SELECT p.name||' '||json_extract(s.attrs,'\$.\"gen_ai.request.reasoning.level\"')||' '||json_extract(s.attrs,'\$.\"guild.background\"') FROM span s JOIN span p ON p.span_id=s.parent_id WHERE s.name='invoke_agent general-purpose';")" \
      "execute_tool Agent medium 1" "the subagent hangs under its Agent call" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name LIKE 'invoke_agent %' AND name<>'invoke_agent general-purpose';")" 0 "an internal agent's stop writes nothing"
}

t_statusline_records_model_effort_and_cost() {
  setup samples
  export GM_FOCUS=appt-v2
  local s='{"session_id":"s1","prompt_id":"p1","model":{"id":"claude-opus-5-5","display_name":"Opus"},"effort":{"level":"xhigh"},"cost":{"total_cost_usd":0.5}}'
  printf '%s' "$s" | gm statusline >/dev/null
  printf '%s' "$s" | gm statusline >/dev/null
  assert_eq "$(db "SELECT count(*) FROM model_sample;")" 1 "unchanged values are not recorded twice"
  printf '%s' "${s/0.5/0.75}" | gm statusline >/dev/null
  assert_eq "$(db "SELECT group_concat(model||' '||effort||' '||cost_usd, ', ') FROM model_sample;")" "claude-opus-5-5 xhigh 0.5, claude-opus-5-5 xhigh 0.75" "a change is recorded"
}

t_reopened_posting_gets_a_new_root_span() {
  setup reopen-span
  export GM_FOCUS=appt-v2
  gm post "fix the owner" >/dev/null
  gm notice 1 'done' "fixed" >/dev/null
  local first
  first=$(db "SELECT span_id FROM posting;")
  gm notice 1 resumed >/dev/null
  assert_eq "$(db "SELECT span_id<>'$first' FROM posting;")" 1 "a new root span id" &&
    assert_eq "$(db "SELECT linked_span_id||' '||json_extract(attrs,'\$.\"guild.link\"') FROM span_link;")" "$first reopens" "linked to the earlier root"
  gm notice 1 failed "it came back" >/dev/null
  assert_eq "$(db "SELECT group_concat(status||' '||$(attr guild.state), ', ') FROM (SELECT * FROM span WHERE name='guild.posting' ORDER BY start_ms);")" "ok done, error failed" "two roots in one trace" &&
    assert_eq "$(db "SELECT count(DISTINCT trace_id) FROM span WHERE name='guild.posting';")" 1 "one trace"
}

t_migration_keeps_schema1_data() {
  export GM_HALL=$WORK/migrate/hall
  mkdir -p "$GM_HALL"
  sqlite3 "$GM_HALL/register.db" <"$ROOT/tests/fixtures/register-schema1.sql"
  sqlite3 "$GM_HALL/register.db" 'PRAGMA journal_mode=WAL;' >/dev/null
  local before t tables='focus ticket message posting event guard'
  before=$(for t in $tables; do db "SELECT * FROM $t ORDER BY rowid;"; done)
  assert_eq "$(db 'PRAGMA user_version;')" 1 "a schema-1 register" || return 1
  local i
  for i in 1 2 3 4 5 6; do gm list --all >/dev/null 2>"$WORK/migrate/err$i" & done
  wait
  for i in 1 2 3 4 5 6; do assert_eq "$(cat "$WORK/migrate/err$i")" "" "migration $i ran clean"; done
  assert_eq "$(db 'PRAGMA user_version;')" 6 "migrated to schema 6" &&
    assert_eq "$(for t in $tables; do db "SELECT $(db "SELECT group_concat(name, ',') FROM pragma_table_info('$t') WHERE name NOT IN ('trace_id','span_id','span_start_ms','follows_id','closed_at','start_attempts','held_at','held_told','close_requested_at','origin','summoned_at','unheard_at');") FROM $t ORDER BY rowid;"; done)" "$before" "every schema-1 row kept as it was" &&
    assert_eq "$(db "SELECT count(*) FROM posting WHERE trace_id IS NULL;")" 2 "old postings have no trace" &&
    assert_eq "$(db "SELECT group_concat(name, ' ') FROM (SELECT name FROM sqlite_master WHERE type='table' AND name IN ('span','span_link','open_span','prompt_version','model_sample') ORDER BY name);")" \
      "model_sample open_span prompt_version span span_link" "the tracing tables" &&
    assert_eq "$(db "SELECT created_at FROM posting WHERE num=1;")" "2026-10-03T01:50:18Z" "old times keep their seconds"
  export GM_FOCUS=appt-v2
  assert_contains "$(gm trace 1)" "made before tracing began" "an old posting has a ledger and no spans" &&
    assert_contains "$(gm stats 2)" "made before tracing began" "and no measures"
  gm notice 2 resumed >/dev/null || fail "a notice on an old posting"
  assert_eq "$(db "SELECT count(*) FROM span WHERE name<>'guild.notice' OR $(attr guild.posting) IS NOT NULL;")" 0 "an old posting gets no spans"
  gm post "a new posting after the migration" >/dev/null
  assert_eq "$(db "SELECT trace_id IS NOT NULL AND created_at GLOB '*.[0-9][0-9][0-9]Z' FROM posting WHERE num=3;")" 1 "a new posting is traced, with milliseconds"
  assert_contains "$(gm show 1)" "fixed in abc123" "the old ledger reads as before"
}

t_concurrent_span_writes_lose_nothing() {
  setup concurrent-spans
  export GM_FOCUS=appt-v2
  hookj "'session_id','s1','prompt_id','p1','prompt','many tools at once'" | gm hook prompt >/dev/null
  local i
  for i in $(seq 1 20); do
    (hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','c$i','tool_input',json_object('command','echo $i')" | gm hook pre-tool
      hookj "'session_id','s1','prompt_id','p1','tool_name','Bash','tool_use_id','c$i','duration_ms',3" | gm hook post-tool) &
  done
  for i in 1 2 3 4 5; do printf '{"session_id":"s1","prompt_id":"p1","cost":{"total_cost_usd":0.%s}}' "$i" | gm statusline >/dev/null & done
  wait
  assert_eq "$(db "SELECT count(*), count(DISTINCT $(attr gen_ai.tool.call.id)) FROM span WHERE name='execute_tool Bash';")" "20|20" "twenty tool spans" &&
    assert_eq "$(db "SELECT count(*) FROM open_span WHERE name LIKE 'execute_tool %';")" 0 "none left open" &&
    assert_eq "$(db "SELECT count(DISTINCT parent_id) FROM span WHERE name='execute_tool Bash';")" 1 "all under the one turn"
  [ ! -e "$GM_HALL/spans-dropped.log" ] || fail "spans dropped under load: $(cat "$GM_HALL/spans-dropped.log")"
}

# ---- Tracing, slice 2: Claude Code's telemetry from recorded OTLP files, no model ----
# tests/fixtures/telemetry/recorded is one real headless Claude Code 2.1.288 session (Haiku 4.5) as the collector
# in templates/otelcol.yaml wrote it, with its hook payloads; edge is made by hand around the slice-1 scenario.

# telemetry <fixture>: the collector's files for a recorded session, put where gm trace import reads them.
telemetry() {
  mkdir -p "$GM_HALL/telemetry"
  cp "$ROOT/tests/fixtures/telemetry/$1/traces.jsonl" "$ROOT/tests/fixtures/telemetry/$1/logs.jsonl" "$ROOT/tests/fixtures/telemetry/$1/metrics.jsonl" "$GM_HALL/telemetry/"
}

# The recorded session's hooks, replayed through gm: a prompt, a Bash call, a second message sent while the
# turn ran (captured with the same prompt_id), and the Stop, once both postings have a state.
replay_recorded_hooks() {
  local l ev
  while IFS= read -r l; do
    ev=$(json "SELECT json_extract($(sqlq "$l"),'\$.hook_event_name');")
    case $ev in
      UserPromptSubmit) printf '%s' "$l" | gm hook prompt >/dev/null ;;
      PreToolUse) printf '%s' "$l" | gm hook pre-tool ;;
      PostToolUse) printf '%s' "$l" | gm hook post-tool ;;
      Stop)
        gm notice 1 queued >/dev/null
        gm notice 2 queued >/dev/null
        printf '%s' "$l" | gm hook stop >/dev/null ;;
    esac
  done <"$ROOT/tests/fixtures/telemetry/recorded/hooks.jsonl"
}

t_telemetry_from_a_recorded_session() {
  setup tel-recorded
  export GM_FOCUS=appt-v2
  replay_recorded_hooks
  telemetry recorded
  local out
  out=$(gm trace import)
  assert_contains "$out" "imported 6 spans (2 merged into gm's own, 2 folded, 2 added) and 5 events: 2 model calls (\$0.0401 est.), 1 prompts, 1 responses" "the import" &&
    assert_contains "$out" "session 2c2c6112: 2 model calls, \$0.0401 est.; claude_code.cost.usage \$0.0401, the same to the cent" "cost matches Claude Code's own metric" || return 1
  out=$(gm trace 1)
  assert_contains "$out" "invoke_agent party-leader  " "the turn" &&
    assert_contains "$out" "chat haiku-4-5 · none  in 31k (cached 14k) out 143  \$0.04  1.9s" "the first model call, with tokens and cost" &&
    assert_contains "$out" "chat haiku-4-5 · none  in 31k (cached 31k) out 54  \$0.004  1.2s" "the second" &&
    assert_contains "$out" "execute_tool Bash  sleep 6  " "the Bash call" || return 1
  assert_eq "$(db "SELECT count(*) FROM span WHERE name='execute_tool Bash';")" 1 "Claude Code's tool span merged into the hook's, not added beside it" &&
    assert_eq "$(db "SELECT $(attr span.type)||' '||$(attr guild.tool.command)||' '||$(attr gen_ai.tool.call.id) FROM span WHERE name='execute_tool Bash';")" "tool sleep 6 toolu_01X6BSepMR1cMAEE1A3GKGk6" "with Claude Code's keys added" &&
    assert_eq "$(db "SELECT count(*) FROM span s JOIN span p ON p.span_id=s.parent_id WHERE s.name LIKE 'chat %' AND p.name='invoke_agent party-leader';")" 2 "both calls under the turn, by session.id and prompt.id" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name='invoke_agent party-leader';")" 1 "the interaction span is the hooks' turn" &&
    assert_eq "$(db "SELECT $(attr guild.prompt.text) FROM span WHERE name='invoke_agent party-leader';")" "Run the shell command: sleep 6 . Then reply with only the word one." "the prompt on its turn" &&
    assert_eq "$(db "SELECT $(attr guild.response.text) FROM span WHERE $(attr gen_ai.response.id)='req_011CffNdMYFEgp9bQ499SYEa';")" "two" "the response on its model call" &&
    assert_eq "$(db "SELECT count(*) FROM span_link WHERE json_extract(attrs,'\$.\"guild.link\"')='claude_code';")" 6 "Claude Code's own ids kept as links: two merged, two folded, two moved into the posting's trace" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name LIKE 'chat %' AND $(attr guild.posting)='appt-v2#1' AND $(attr guild.camp.commit) IS NOT NULL;")" 2 "imported spans carry the posting and the camp commit" || return 1
  out=$(gm stats 1)
  assert_contains "$out" "· 2 model calls ·" "model calls count as steps" &&
    assert_contains "$out" "  cost \$0.04 est., from Claude Code's telemetry: haiku-4-5/none \$0.04 (party-leader, 2 calls)" "cost by model, effort and role" &&
    assert_contains "$out" "  tokens in 62k (45k read from cache, 17k written to it) · out 197" "tokens"
  assert_contains "$(gm stats)" "appt-v2#1 run-shell-command-sleep" "the focus table" &&
    assert_contains "$(gm stats | sed -n 3p)" "\$0.04" "with a cost column"
  # The second message, typed while the turn ran, has an exchange of its own that the same Stop ends.
  assert_eq "$(db "SELECT status FROM span WHERE name='guild.exchange' AND $(attr guild.posting)='appt-v2#2';")" ok "the queued message's exchange" &&
    assert_eq "$(db "SELECT count(*) FROM span_link WHERE json_extract(attrs,'\$.\"guild.link\"')='answered by turn';")" 1 "linked to the turn that answered it" &&
    assert_not_contains "$(gm stats 2)" "first reply —" "so its reply is timed"
  # Importing the same files again, from the start, adds nothing.
  local before
  before=$(db "SELECT count(*), round(sum($(attr guild.cost.usd)),6), (SELECT count(*) FROM span_link) FROM span;")
  rm -f "$GM_HALL/telemetry/imported/offsets"
  gm trace import >/dev/null
  assert_eq "$(db "SELECT count(*), round(sum($(attr guild.cost.usd)),6), (SELECT count(*) FROM span_link) FROM span;")" "$before" "a second import is a no-op"
  assert_contains "$(gm trace import)" "Nothing new to import." "and with nothing new, says so"
  [ ! -e "$GM_HALL/spans-dropped.log" ] || fail "spans dropped: $(cat "$GM_HALL/spans-dropped.log")"
}

t_telemetry_reparents_masks_and_drops_identity() {
  scenario tel-edge
  telemetry edge
  local out
  out=$(gm trace import)
  assert_contains "$out" "imported 8 spans (4 merged into gm's own, 1 folded, 3 added) and 8 events: 3 model calls (\$0.2700 est.), 1 prompts, 1 responses" "the import" &&
    assert_contains "$out" "session s1: 3 model calls, \$0.2700 est.; claude_code.cost.usage \$0.2700, the same to the cent" "the cost check" || return 1
  out=$(gm trace 1)
  assert_contains "$out" "chat opus-5-5 · high  in 31k (cached 29k) out 1.2k  \$0.20  9.0s" "the turn's model call, model and effort" &&
    assert_contains "$out" "invoke_agent Explore  haiku-4-5 · none  " "the subagent" &&
    assert_contains "$out" "chat haiku-4-5 · none  in 12k (cached 11k) out 900  \$0.02  11s" "its model call" &&
    assert_contains "$out" "chat opus-5-5 · high  in 33k (cached 33k) out 300  \$0.05  5.0s" "a call whose span was lost, from its api_request event" &&
    assert_contains "$out" "execute_tool Bash  curl -H \"Authorization: <REDACTED:authorization>\" https://u:…" "a tool call no hook saw" &&
    assert_contains "$(printf '%s\n' "$out" | grep 'invoke_agent Explore')" "  \$0.02" "a subagent's cost is its own calls'" || return 1
  assert_eq "$(db "SELECT $(attr guild.tool.command) FROM span WHERE $(attr gen_ai.tool.call.id)='t9';")" \
    "curl -H \"Authorization: <REDACTED:authorization>\" https://u:<REDACTED:url-password>@example.com --password <REDACTED:argument>" "its command masked" || return 1
  assert_eq "$(db "SELECT p.name FROM span s JOIN span p ON p.span_id=s.parent_id WHERE $(attr gen_ai.response.id s.attrs)='req_edge_subagent_0002';")" "invoke_agent Explore" "a subagent's call hangs under its invoke_agent span, by agent_id" &&
    assert_eq "$(db "SELECT p.name FROM span s JOIN span p ON p.span_id=s.parent_id WHERE $(attr gen_ai.response.id s.attrs)='req_edge_lost_span_0003';")" "invoke_agent party-leader" "the lost span's call under its turn" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name LIKE 'execute_tool %';")" 5 "four hook tool spans merged, one added" &&
    assert_eq "$(db "SELECT $(attr guild.tool.command) FROM span WHERE $(attr gen_ai.tool.call.id)='t1';")" "GITHUB_TOKEN=<REDACTED:assignment> gm notice 1 started" "the hook's masked command kept" &&
    assert_eq "$(db "SELECT $(attr guild.mcp.server) FROM span WHERE $(attr gen_ai.tool.call.id)='t2';")" "jira" "the MCP call" &&
    assert_eq "$(db "SELECT json_extract(attrs,'\$.events[0].name')||' '||json_extract(attrs,'\$.events[0].attempt')||' '||$(attr guild.attempt) FROM span WHERE $(attr gen_ai.response.id)='req_edge_call_one_0001';")" "gen_ai.request.attempt 2 2" "a retry is an event on its call" &&
    assert_eq "$(db "SELECT $(attr gen_ai.usage.input_tokens)||' '||$(attr gen_ai.usage.cache_read.input_tokens)||' '||$(attr gen_ai.usage.cache_write.input_tokens)||' '||$(attr gen_ai.request.model) FROM span WHERE $(attr gen_ai.response.id)='req_edge_lost_span_0003';")" \
      "33103 33000 100 claude-opus-5-5" "GenAI input tokens include the cached ones; the date suffix is dropped" &&
    assert_eq "$(db "SELECT group_concat(json_extract(e.value,'\$.name'), ' ') FROM span, json_each(json_extract(attrs,'\$.events')) e WHERE name='invoke_agent party-leader';")" "api_error" "an API error is an event on the turn" &&
    assert_eq "$(db "SELECT group_concat(json_extract(e.value,'\$.name'), ' ') FROM span, json_each(json_extract(attrs,'\$.events')) e WHERE name='invoke_agent Explore';")" "subagent_completed" "a finished subagent is an event on it" &&
    assert_eq "$(db "SELECT json_extract(e.value,'\$.post_tokens') FROM open_span o, json_each(json_extract(o.attrs,'\$.events')) e WHERE o.key='session:s1' AND json_extract(e.value,'\$.name')='compaction';")" "30000" "a compaction is an event on the session" &&
    assert_eq "$(db "SELECT $(attr guild.prompt.text) FROM span WHERE name='invoke_agent party-leader';")" "my key is <REDACTED:api-key> and password=<REDACTED:assignment>" "the prompt, masked" &&
    assert_eq "$(db "SELECT $(attr guild.response.text) FROM span WHERE $(attr gen_ai.response.id)='req_edge_lost_span_0003';")" "Fixed. I did not print the token <REDACTED:github-token>." "the response, masked" || return 1
  local dump s
  dump=$(sqlite3 "$GM_HALL/register.db" .dump)
  for s in patron@example.com -identity user_identity user.email user.account organization.id FAKEfake hunter2 abc.def ':pw@'; do
    case $dump in *"$s"*) fail "the register holds $s" ;; esac
  done
  out=$(gm stats 1)
  assert_contains "$out" "  cost \$0.27 est., from Claude Code's telemetry: opus-5-5/high \$0.25 (party-leader, 2 calls) · haiku-4-5/none \$0.02 (party-leader, 1 call)" "telemetry's cost replaces the status line's, never adds to it" &&
    assert_contains "$out" "· 3 model calls ·" "three model calls"
  assert_contains "$(gm trace 1 | head -n 1)" "\$0.27 est." "the trace's total"
  out=$(gm stats --compare slow-calls --over 10s)
  assert_contains "$out" "selection: 1 chat spans (model calls) slower than 10s · baseline: 2 others" "slow model calls" &&
    assert_contains "$(printf '%s\n' "$out" | tr -s ' ')" "gen_ai.request.reasoning.level high 0.0% 100.0%" "and what sets them apart"
}

t_telemetry_import_reads_each_line_once() {
  setup tel-offsets
  local t=$GM_HALL/telemetry src=$ROOT/tests/fixtures/telemetry/recorded first rest
  mkdir -p "$t"
  cp "$src/traces.jsonl" "$src/metrics.jsonl" "$t/"
  first=$(head -n 1 "$src/logs.jsonl")
  rest=$(tail -n +2 "$src/logs.jsonl")
  printf '%s\n%s' "$first" "${rest:0:300}" >"$t/logs.jsonl"
  gm trace import >/dev/null || fail "a line still being written broke the import"
  assert_eq "$(awk -F '\t' '$3 ~ /logs.jsonl$/ {print $2}' "$t/imported/offsets")" "$((${#first} + 1))" "it stops before the unfinished line" &&
    assert_eq "$(db "SELECT count(*) FROM span WHERE name LIKE 'chat %' AND $(attr guild.cost.usd) IS NOT NULL;")" 1 "and folds what was complete"
  printf '%s\n' "${rest:300}" >>"$t/logs.jsonl"
  gm trace import >/dev/null
  assert_eq "$(db "SELECT count(*), round(sum($(attr guild.cost.usd)),7) FROM span WHERE name LIKE 'chat %';")" "2|0.0400932" "the rest arrives in the next import"
  # The collector rotates by renaming; the renamed file is read on from where it stopped, then moved aside.
  mv "$t/logs.jsonl" "$t/logs-2026-10-03T13-21-40.000.jsonl"
  : >"$t/logs.jsonl"
  gm trace import >/dev/null
  [ -f "$t/imported/logs-2026-10-03T13-21-40.000.jsonl" ] && [ ! -e "$t/logs-2026-10-03T13-21-40.000.jsonl" ] || fail "a rotated file read to its end is moved to imported/"
  assert_eq "$(db "SELECT count(*) FROM span WHERE name LIKE 'chat %';")" 2 "and nothing is read twice"
  touch -t 202601010000 "$t/imported/logs-2026-10-03T13-21-40.000.jsonl"
  gm trace import >/dev/null
  [ ! -e "$t/imported/logs-2026-10-03T13-21-40.000.jsonl" ] || fail "imported files are deleted after 14 days"
}

# pane_start <env file> [VAR=value...]: runs the last line gm typed into a herdr pane, as the pane's shell would,
# with fake-claude recording what it was started with.
pane_start() {
  local f=$1 line
  shift
  line=$(awk -F '\t' 'END { print $2 }' "$HERDR_STUB/runs")
  [ -n "$line" ] || fail "nothing was typed into a pane" || return 1
  env "$@" GM_FAKE_CLAUDE_ENV="$f" sh -c "$line" </dev/null >/dev/null 2>&1
}

t_open_sends_telemetry_only_to_loopback() {
  unset GM_CLAUDE # the command shown is the real default, claude
  setup tel-open
  local out bad n=0 e f=$WORK/tel-open/env.txt
  GM_CLAUDE=$FAKE GM_OTEL_PORT=4999 gm open appt-v2 >/dev/null 2>&1 || fail "open failed"
  pane_start "$f"
  e=$(cat "$f")
  assert_contains "$e" "OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4999" "GM_OTEL_PORT moves it" &&
    assert_contains "$e" "CLAUDE_CODE_ENABLE_TELEMETRY=1" "telemetry on" &&
    assert_contains "$e" "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1" "spans on" &&
    assert_contains "$e" "OTEL_LOG_USER_PROMPTS=1" "prompts captured" &&
    assert_contains "$e" "OTEL_LOG_TOOL_DETAILS=1" "tool details captured"
  for bad in http://example.com:4318 http://127.0.0.1.evil.example:4318 http://127.0.0.1@evil.example:4318 'http://localhost:4318@evil.example' \
    http://10.0.0.1:4318 https://otel.example.com 'http://127.0.0.1:4318 http://evil.example' ftp://127.0.0.1:4318; do
    n=$((n + 1))
    out=$(GM_OTEL_ENDPOINT=$bad gm open "other$n" --repo "$REPO" --no-launch 2>&1) && fail "$bad was accepted"
    assert_contains "$out" "telemetry goes only to 127.0.0.1, localhost or ::1" "$bad refused"
    assert_eq "$(db "SELECT count(*) FROM focus WHERE name='other$n';")" 0 "nothing made for $bad"
  done
  out=$(GM_OTEL_ENDPOINT=http://example.com:4318 gm up 2>&1) && fail "gm up launched with a remote endpoint"
  assert_contains "$out" "telemetry goes only to 127.0.0.1" "gm up refuses it too"
  for bad in http://localhost:4318 'http://[::1]:4318' http://127.0.0.1:4318/; do
    GM_OTEL_ENDPOINT=$bad gm open appt-v2 --no-launch >/dev/null 2>&1 || fail "$bad was refused"
  done
  mkdir -p "$WORK/tel-open/home/.claude"
  printf '{"env":{"OTEL_EXPORTER_OTLP_LOGS_ENDPOINT":"https://otel.example.com/v1/logs"}}' >"$WORK/tel-open/home/.claude/settings.json"
  out=$(HOME=$WORK/tel-open/home gm open appt-v2 --no-launch 2>&1) && fail "settings that send telemetry elsewhere were accepted"
  assert_contains "$out" "settings.json: OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://otel.example.com/v1/logs" "and say which"
  out=$(HOME=$WORK/tel-open/home pane_start "$f.2"; cat "$f.2" 2>/dev/null || true)
  assert_not_contains "$out" "CLAUDE_CODE_ENABLE_TELEMETRY" "gm start refuses those settings too"
  printf '{"env":{"OTEL_EXPORTER_OTLP_ENDPOINT":"http://localhost:4318"}}' >"$WORK/tel-open/home/.claude/settings.json"
  HOME=$WORK/tel-open/home gm open appt-v2 --no-launch >/dev/null 2>&1 || fail "loopback settings were refused"
  stub_proc "$(pl_pane appt-v2)" shell
  GM_TELEMETRY=off GM_CLAUDE=$FAKE gm open appt-v2 >/dev/null 2>&1 || fail "relaunch failed"
  pane_start "$f.off"
  assert_not_contains "$(cat "$f.off")" "CLAUDE_CODE_ENABLE_TELEMETRY" "GM_TELEMETRY=off starts without it" &&
    assert_contains "$(cat "$f.off.args")" "appt-v2" "and still names the session"
}

t_open_starts_the_party_leader_in_herdr_with_the_telemetry_env() {
  setup tel-launch
  local f=$WORK/tel-launch/env.txt out e pane
  out=$(GM_CLAUDE=$FAKE GM_OTEL_PORT=1 gm open appt-v2 2>&1) || fail "open failed: $out"
  pane=$(pl_pane appt-v2)
  assert_contains "$out" "appt-v2: Party Leader started in herdr pane $pane (missing: no pane recorded)" "says where it started" &&
    assert_contains "$out" "appt-v2's Party Leader is in herdr workspace └ appt-v2, under guild (pane $pane); see it with: herdr --session gm-test" "which workspace, and how to see it" &&
    assert_eq "$(awk -F '\t' -v p="$pane" '$1 == p { print $2 }' "$HERDR_STUB/panes")" "$(db "SELECT tab_id FROM endpoint WHERE key='party-leader:appt-v2';")" "the recorded tab" &&
    assert_eq "$(awk -F '\t' -v w="$(db "SELECT workspace_id FROM endpoint WHERE key='party-leader:appt-v2';")" '$1 == w { print $2 }' "$HERDR_STUB/workspaces")" "└ appt-v2" "a workspace of its own, named after the focus"
  assert_contains "$(cat "$HERDR_STUB/runs")" "start 'appt-v2' --pane '$pane'" "the pane runs gm start"
  pane_start "$f" OTEL_EXPORTER_OTLP_HEADERS=x-api-key=sekrit OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.example.com/v1/traces \
    OTEL_LOG_RAW_API_BODIES=1 CLAUDECODE=1 GM_FOCUS=elsewhere
  [ -s "$f" ] || fail "claude was not started" || return 1
  e=$(cat "$f")
  assert_contains "$e" "OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:1" "the loopback endpoint" &&
    assert_contains "$e" "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:1/v1/traces" "an inherited signal endpoint replaced" &&
    assert_contains "$e" "OTEL_RESOURCE_ATTRIBUTES=guild.focus=appt-v2,guild.role=party-leader" "the resource attributes" &&
    assert_contains "$e" "OTEL_LOG_ASSISTANT_RESPONSES=1" "responses captured" &&
    assert_not_contains "$e" "sekrit" "inherited headers cleared" &&
    assert_not_contains "$e" "OTEL_LOG_RAW_API_BODIES" "raw API bodies not captured" &&
    assert_not_contains "$e" "otel.example.com" "nothing points elsewhere" &&
    assert_not_contains "$e" "CLAUDECODE=" "the server's Claude Code variables are not passed on" &&
    assert_not_contains "$e" "GM_FOCUS=elsewhere" "nor a stray focus" &&
    assert_eq "$(cat "$f.args")" "--name
appt-v2
--plugin-dir
$ROOT/mods/guild-chat
--plugin-dir
$ROOT/mods/guild-spyglass
--plugin-dir
$ROOT/mods/paste-viewer" "claude --name <focus>, with the chat's mod (chat: banners, the default), the spyglass and the paste viewer" &&
    assert_eq "$(cat "$f.pwd")" "$CAMP" "in the camp"
}

t_doctor_checks_loopback_and_the_collector() {
  setup tel-doctor
  local out
  out=$(GM_OTELCOL=$WORK/none GM_OTEL_PORT=1 gm doctor 2>&1; printf 'rc=%s' "$?")
  assert_contains "$out" "ok    telemetry endpoint http://127.0.0.1:1 is loopback" "loopback endpoint" &&
    assert_contains "$out" "ok    collector configuration $ROOT/templates/otelcol.yaml: listens on loopback only, exports to files only" "the shipped configuration" &&
    assert_contains "$out" "FAIL  no OpenTelemetry Collector found" "no collector installed" &&
    assert_contains "$out" "FAIL  no collector answers at http://127.0.0.1:1: start it with gm collector" "none answering" &&
    assert_contains "$out" "rc=1" "a failure fails"
  assert_contains "$(GM_OTEL_ENDPOINT=http://example.com:4318 gm doctor 2>&1)" "FAIL  telemetry endpoint http://example.com:4318 is not loopback" "a remote endpoint"
  cat >"$WORK/tel-doctor/bad.yaml" <<'YAML'
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  otlphttp:
    endpoint: https://otel.example.com
  file:
    path: /tmp/x.jsonl
extensions:
  health_check: {}
service:
  telemetry:
    metrics:
      level: detailed
YAML
  out=$(GM_COLLECTOR_CONFIG=$WORK/tel-doctor/bad.yaml gm doctor 2>&1 || true)
  assert_contains "$out" "listens on 0.0.0.0:4318, not loopback" "a receiver open to the network" &&
    assert_contains "$out" "listens on https://otel.example.com, not loopback" "an endpoint elsewhere" &&
    assert_contains "$out" "exporter otlphttp is not a file exporter" "an exporter that sends" &&
    assert_not_contains "$out" "exporter file is not" "a file exporter is fine" &&
    assert_contains "$out" "extension health_check" "an extension" &&
    assert_contains "$out" "serves its own metrics" "the collector's own metrics"
  mkdir -p "$WORK/tel-doctor/home/.claude"
  printf '{"env":{"BETA_TRACING_ENDPOINT":"https://trace.example.com"}}' >"$WORK/tel-doctor/home/.claude/settings.json"
  assert_contains "$(HOME=$WORK/tel-doctor/home gm doctor 2>&1)" "FAIL  Claude Code settings send telemetry elsewhere: $WORK/tel-doctor/home/.claude/settings.json: BETA_TRACING_ENDPOINT=https://trace.example.com" "settings"
}

# post_otlp <port> <path> <file>: an OTLP/HTTP JSON export to 127.0.0.1, through bash's /dev/tcp; prints the status.
post_otlp() {
  local n
  n=$(wc -c <"$3" | tr -d ' ')
  (
    exec 3<>"/dev/tcp/127.0.0.1/$1" || exit 1
    printf 'POST %s HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\n\r\n' "$2" "$n" >&3
    cat "$3" >&3
    IFS=' ' read -r -t 5 _ code _ <&3 && printf '%s' "$code"
  ) 2>/dev/null
}

t_collector_masks_secrets_and_drops_identity() {
  local bin=${GM_OTELCOL:-$(command -v otelcol-contrib 2>/dev/null || true)}
  [ -n "$bin" ] || { printf '    (no otelcol-contrib installed or GM_OTELCOL set; skipped)\n'; return 0; }
  scenario tel-collector
  local port=$((20000 + RANDOM % 20000)) pid i sig out files
  GM_OTELCOL=$bin GM_OTEL_PORT=$port gm collector >"$WORK/tel-collector/collector.log" 2>&1 &
  pid=$!
  for i in $(seq 1 40); do
    [ "$(printf '{"resourceLogs":[]}' >"$WORK/tel-collector/empty.json"; post_otlp "$port" /v1/logs "$WORK/tel-collector/empty.json")" = 200 ] && break
    sleep 0.25
  done
  out=$(GM_OTELCOL=$bin GM_OTEL_PORT=$port gm doctor 2>&1 || true)
  assert_contains "$out" "ok    a collector answers at http://127.0.0.1:$port" "doctor sees it" &&
    assert_contains "$out" "ok    the collector accepts its configuration" "and its configuration"
  for sig in traces logs metrics; do
    assert_eq "$(post_otlp "$port" "/v1/$sig" "$ROOT/tests/fixtures/telemetry/edge/$sig.jsonl")" 200 "$sig accepted"
  done
  for i in $(seq 1 40); do
    [ -s "$GM_HALL/telemetry/traces.jsonl" ] && [ -s "$GM_HALL/telemetry/logs.jsonl" ] && [ -s "$GM_HALL/telemetry/metrics.jsonl" ] && break
    sleep 0.25
  done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  files=$(cat "$GM_HALL"/telemetry/*.jsonl)
  assert_contains "$files" "<REDACTED:api-key>" "a prompt's key masked by the collector" &&
    assert_contains "$files" "<REDACTED:github-token>" "a response's token masked" &&
    assert_contains "$files" "--password <REDACTED:argument>" "a command's password masked"
  for i in patron@example.com -identity user_identity user.email user.account organization.id FAKEfake hunter2 abc.def; do
    case $files in *"$i"*) fail "the collector wrote $i" ;; esac
  done
  assert_contains "$(gm trace import)" "3 model calls (\$0.2700 est.)" "its files import"
}

# First run (gm init). A fixture release stands in for GitHub: a tar.gz holding an executable named otelcol-contrib
# (a copy of fake-claude) and its published checksum, fetched through GM_OTELCOL_BASE_URL=file://. No test touches the
# network, a real bin directory, or chmod.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f1
}

otel_release() {
  # otel_release <scenario>: makes $WORK/<scenario>/release for linux amd64 and sets REL, TARBALL and SUM
  REL=$WORK/$1/release
  mkdir -p "$REL/pkg" "$WORK/$1/tmpd"
  cp "$ROOT/tests/fixtures/fake-claude" "$REL/pkg/otelcol-contrib"
  TARBALL=$REL/otelcol-contrib_0.162.0_linux_amd64.tar.gz
  tar -czf "$TARBALL" -C "$REL/pkg" otelcol-contrib
  SUM=$(sha256_of "$TARBALL")
  printf '%s' "$SUM" >"$TARBALL.sha256"
}

# gm init against the fixture: the collector is missing, the platform is linux amd64, files come from REL.
ginit() {
  GM_OTELCOL=$WORK/no-collector GM_PLATFORM_OS=Linux GM_PLATFORM_ARCH=x86_64 GM_OTELCOL_BASE_URL=file://$REL \
    TMPDIR=$WORK/$SCENARIO/tmpd gm "$@"
}

t_first_run_is_detected_asks_once_and_records_the_choice() {
  export GM_HALL=$WORK/fr-once/hall
  local out
  out=$(printf 's\n' | GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm list 2>&1) || fail "the command did not go on after the first run"
  assert_contains "$out" "gm: first run" "first run announced" &&
    assert_contains "$out" "ok       sqlite3" "what is present" &&
    assert_contains "$out" "missing  otelcol-contrib" "what is missing" &&
    assert_contains "$out" "per-call model, tokens and cost" "what the missing piece means" &&
    assert_contains "$out" "Skipped" "the choice taken"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" off "the choice recorded" &&
    [ -n "$(sed -n 's/^initialized: //p' "$GM_HALL/guild.conf")" ] || fail "initialized not recorded"
  [ -s "$GM_HALL/register.db" ] || fail "the command did not run after the first run"
  out=$(GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm list </dev/null 2>&1)
  assert_not_contains "$out" "first run" "it never nags afterwards"
  assert_not_contains "$out" "Install, skip" "it never asks again"
}

t_first_run_respects_a_hand_written_setup_file() {
  export GM_HALL=$WORK/fr-hand/hall
  mkdir -p "$GM_HALL"
  printf 'initialized: 2026-01-01T00:00:00Z\ncollector: skipped\n' >"$GM_HALL/guild.conf"
  local out
  out=$(GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm list </dev/null 2>&1)
  assert_not_contains "$out" "first run" "a written setup file means the first run is over"
}

t_first_run_never_blocks_without_a_terminal() {
  export GM_HALL=$WORK/fr-quiet/hall
  local out
  out=$(gm list </dev/null 2>&1) || fail "a command failed for want of a terminal"
  assert_not_contains "$out" "first run" "no questions without a terminal"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "setup recorded though nobody answered"
  out=$(GM_OTELCOL=$WORK/none gm init </dev/null 2>&1) || fail "gm init without a terminal failed"
  assert_contains "$out" "missing  otelcol-contrib" "it still reports" &&
    assert_contains "$out" "Not asking: this is not a terminal" "and says why it did not ask" &&
    assert_contains "$out" "gm init --yes" "and how to answer"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "gm init recorded a choice nobody made"
}

t_first_run_never_runs_in_a_hook_or_the_status_line() {
  export GM_HALL=$WORK/fr-hook/hall
  local out
  out=$(printf '{}' | GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm hook session-end 2>&1 </dev/null)
  out="$out$(printf '{}' | GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm statusline 2>&1)"
  assert_not_contains "$out" "first run" "hooks and the status line never ask"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "a hook ran the first run"
}

t_init_yes_and_no_answer_for_scripts() {
  export GM_HALL=$WORK/fr-flags/hall
  GM_OTELCOL=$WORK/none gm init --no >/dev/null 2>&1 || fail "gm init --no failed"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" off "--no skips" &&
    [ -n "$(sed -n 's/^initialized: //p' "$GM_HALL/guild.conf")" ] || fail "--no leaves it uninitialized"
  export GM_HALL=$WORK/fr-flags2/hall SCENARIO=fr-flags2
  otel_release fr-flags2
  local bin=$WORK/fr-flags2/bin out
  out=$(ginit init --yes --bin-dir "$bin" 2>&1) || fail "gm init --yes failed: $out"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" on "--yes installs" &&
    [ -x "$bin/otelcol-contrib" ] || fail "nothing installed at $bin/otelcol-contrib"
}

t_choosing_later_asks_again_only_in_gm_init() {
  export GM_HALL=$WORK/fr-later/hall
  local out
  out=$(printf 'l\n' | GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm list 2>&1)
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" later "later recorded"
  out=$(GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm list </dev/null 2>&1)
  assert_not_contains "$out" "first run" "later does not nag in other commands"
  out=$(printf 's\n' | GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm init 2>&1)
  assert_contains "$out" "Install, skip, or later?" "gm init asks again" &&
    assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" off "and the new answer replaces the old"
  out=$(GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm init </dev/null 2>&1)
  assert_contains "$out" "not asking again" "a skip is respected by gm init" &&
    assert_not_contains "$out" "Install, skip" "and not asked"
  out=$(printf 'l\n' | GM_INTERACTIVE=1 GM_OTELCOL=$WORK/none gm init --again 2>&1)
  assert_contains "$out" "Install, skip, or later?" "--again asks about a skip"
}

t_init_installs_the_collector_after_checking_its_checksum() {
  export GM_HALL=$WORK/fr-install/hall SCENARIO=fr-install
  otel_release fr-install
  local bin=$WORK/fr-install/newdir/bin out leftovers
  out=$(printf 'i\n%s\n' "$bin" | GM_INTERACTIVE=1 ginit init 2>&1) || fail "install failed: $out"
  assert_contains "$out" "SHA-256 matches the published checksum: $SUM" "the checksum is shown" &&
    assert_contains "$out" "installed $bin/otelcol-contrib" "it says exactly where" &&
    assert_contains "$out" "is not on your PATH" "and what the patron must do about the PATH"
  [ -x "$bin/otelcol-contrib" ] || fail "no executable at $bin/otelcol-contrib"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" on "recorded as on" &&
    assert_eq "$(sed -n 's/^collector-path: //p' "$GM_HALL/guild.conf")" "$bin/otelcol-contrib" "with its path" &&
    assert_eq "$(sed -n 's/^collector-sha256: //p' "$GM_HALL/guild.conf")" "$SUM" "and its checksum" &&
    assert_eq "$(sed -n 's/^collector-version: //p' "$GM_HALL/guild.conf")" 0.162.0 "and the pinned version"
  leftovers=$(find "$WORK/fr-install/tmpd" "$bin" -mindepth 1 | sed "s|^$WORK/fr-install/||")
  assert_eq "$leftovers" "newdir/bin/otelcol-contrib" "no temporary file or staged copy left"
  if command -v otelcol-contrib >/dev/null 2>&1; then
    printf '    (otelcol-contrib is on the PATH; recorded-path lookup skipped)\n'
  else
    out=$(GM_PLATFORM_OS=Linux gm doctor 2>&1 || true)
    assert_contains "$out" "ok    collector $bin/otelcol-contrib" "gm finds the installed collector without the PATH"
  fi
  out=$(ginit init --yes --bin-dir "$bin" 2>&1)
  assert_contains "$out" "is already there; using it" "a collector already at the destination is not fetched again" &&
    assert_not_contains "$out" "  downloading https" "nothing downloaded"
}

t_init_refuses_a_collector_whose_checksum_does_not_match() {
  export GM_HALL=$WORK/fr-badsum/hall SCENARIO=fr-badsum
  otel_release fr-badsum
  printf '%064d' 0 >"$TARBALL.sha256"
  local bin=$WORK/fr-badsum/newdir/bin out rc=0
  out=$(ginit init --yes --bin-dir "$bin" 2>&1) || rc=$?
  assert_eq "$rc" 1 "a mismatch fails" &&
    assert_contains "$out" "REFUSED" "and says it refused" &&
    assert_contains "$out" "$SUM" "showing what the file really hashes to" &&
    assert_contains "$out" "nothing was installed" "and that nothing happened"
  [ ! -e "$bin" ] && [ ! -e "$WORK/fr-badsum/newdir" ] || fail "a refused install left a directory behind"
  assert_eq "$(find "$WORK/fr-badsum/tmpd" -mindepth 1 | wc -l | tr -d ' ')" 0 "no temporary file left"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" later "recorded so gm init offers it again" &&
    assert_not_contains "$(cat "$GM_HALL/guild.conf")" collector-path "no path recorded"
}

t_init_leaves_nothing_when_the_download_fails() {
  export GM_HALL=$WORK/fr-nodl/hall SCENARIO=fr-nodl
  otel_release fr-nodl
  rm -f "$TARBALL.sha256"
  local bin=$WORK/fr-nodl/newdir/bin out rc=0
  out=$(ginit init --yes --bin-dir "$bin" 2>&1) || rc=$?
  assert_eq "$rc" 1 "a failed download fails" &&
    assert_contains "$out" "could not download the published checksum" "and says which file" &&
    assert_contains "$out" "nothing was installed" "and that nothing happened"
  [ ! -e "$WORK/fr-nodl/newdir" ] || fail "a failed install left a directory behind"
  assert_eq "$(find "$WORK/fr-nodl/tmpd" -mindepth 1 | wc -l | tr -d ' ')" 0 "no temporary file left"
}

t_init_offers_no_install_for_a_platform_without_a_build() {
  export GM_HALL=$WORK/fr-plan9/hall SCENARIO=fr-plan9
  otel_release fr-plan9
  local out
  out=$(printf 's\n' | GM_INTERACTIVE=1 GM_PLATFORM_OS=Plan9 GM_OTELCOL=$WORK/none gm init 2>&1)
  assert_contains "$out" "has no build of it for" "it says so" &&
    assert_not_contains "$out" "i  install it now" "and offers no install"
  out=$(GM_PLATFORM_OS=Plan9 GM_OTELCOL=$WORK/none gm init --yes 2>&1) && fail "--yes cannot install on a platform without a build"
  assert_contains "$out" "no official build" "and says why"
}

t_init_stops_with_instructions_when_something_required_is_missing() {
  export GM_HALL=$WORK/fr-req/hall
  local out rc=0
  out=$(GM_CLAUDE=$WORK/no-claude GM_OTELCOL=$WORK/none gm init --yes 2>&1) || rc=$?
  assert_eq "$rc" 1 "init fails" &&
    assert_contains "$out" "MISSING  Claude Code" "the missing piece is marked" &&
    assert_contains "$out" "Install Claude Code" "with a plain instruction" &&
    assert_not_contains "$out" "Install, skip" "and no question"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "a failed first run recorded something"
  rc=0
  out=$(GM_INTERACTIVE=1 GM_CLAUDE=$WORK/no-claude gm list </dev/null 2>&1) || rc=$?
  assert_eq "$rc" 1 "the command that triggered the first run stops" &&
    assert_contains "$out" "Install Claude Code" "with the same instruction"
}

t_init_requires_herdr() {
  export GM_HALL=$WORK/fr-herdr/hall
  local out rc=0 fakebin=$WORK/fr-herdr/bin
  out=$(GM_HERDR=$WORK/no-herdr GM_OTELCOL=$WORK/none gm init --yes 2>&1) || rc=$?
  assert_eq "$rc" 1 "a missing herdr stops init" &&
    assert_contains "$out" "MISSING  herdr" "it is marked missing" &&
    assert_contains "$out" "https://herdr.dev/docs/install/" "with the official install page" &&
    assert_contains "$out" "curl -fsSL https://herdr.dev/install.sh | sh" "and the official command" &&
    assert_not_contains "$out" "Install, skip" "and no question"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "a failed first run recorded something"
  # A herdr that reports its version is listed with it.
  mkdir -p "$fakebin"
  cp "$ROOT/tests/fixtures/fake-claude" "$fakebin/herdr-run"
  out=$(GM_HERDR=$fakebin/herdr-run GM_OTELCOL=$WORK/none gm init --no 2>&1)
  assert_contains "$out" "ok       " "present herdr passes"
  out=$(GM_HERDR=$WORK/no-herdr GM_OTELCOL=$WORK/none gm doctor 2>&1 || true)
  assert_contains "$out" "FAIL  herdr: " "doctor reports it too"
}

t_doctor_keeps_reporting_the_setup_state() {
  export GM_HALL=$WORK/fr-doctor/hall
  gm list >/dev/null
  local out rc=0
  out=$(GM_OTELCOL=$WORK/none GM_OTEL_PORT=1 gm doctor 2>&1) || rc=$?
  assert_contains "$out" "warn  first-run setup not done: run gm init" "before the first run" &&
    assert_contains "$out" "ok    sqlite3" "dependencies are listed" &&
    assert_contains "$out" "FAIL  no OpenTelemetry Collector found" "a missing collector nobody decided on fails"
  GM_OTELCOL=$WORK/none gm init --no >/dev/null 2>&1
  out=$(GM_OTELCOL=$WORK/none GM_OTEL_PORT=1 gm doctor 2>&1) || rc=$?
  assert_contains "$out" "ok    first-run setup done" "after it" &&
    assert_contains "$out" "warn  no OpenTelemetry Collector: you chose to go without it" "a skip is a warning, not a failure" &&
    assert_not_contains "$out" "FAIL" "doctor passes for a patron who chose to go without"
}

t_herdr_states_alive_dead_missing_unknown() {
  setup states
  local out pane
  out=$(gm roster)
  assert_contains "$out" "appt-v2                  party leader  missing  -        no pane recorded" "never started: missing"
  gm open appt-v2 >/dev/null 2>&1 || fail "open failed"
  pane=$(pl_pane appt-v2)
  [ -n "$pane" ] || fail "no pane recorded" || return 1
  out=$(gm roster)
  assert_contains "$out" "guildmaster              front desk    alive    " "the front desk's Guildmaster" &&
    assert_contains "$out" "appt-v2                  party leader  alive    $pane" "claude in the pane: alive" &&
    assert_contains "$out" " idle" "with herdr's agent status"
  stub_proc "$pane" shell
  assert_contains "$(gm roster)" "party leader  dead     $pane    the pane holds only a shell" "a shell only: dead"
  assert_contains "$(GM_LAUNCH_GRACE=600 gm roster)" "starting" "a shell moments after launch: starting"
  stub_proc "$pane" vim
  assert_contains "$(gm roster)" "unknown  $pane    the pane runs vim, not a Party Leader" "something else: unknown"
  stub_proc "$pane" claude
  rm -f "$HERDR_STUB/running"
  assert_contains "$(gm roster)" "unknown  $pane    herdr session gm-test is not running" "no server: unknown, not missing"
  touch "$HERDR_STUB/running"
  stub_close "$pane"
  assert_contains "$(gm roster)" "missing  $pane    pane $pane is gone" "pane gone: missing"
  printf '%s\t%s\t%s\tclaude\n' "$pane" w99:t1 w99 >>"$HERDR_STUB/panes"
  assert_eq "$(roster_state appt-v2)" missing "the same pane id in another workspace is not this Party Leader"
}

t_up_relaunches_only_dead_and_missing() {
  setup up
  local f out before_b before_c
  for f in bravo charlie delta; do gm open "$f" --repo "$REPO" --no-launch >/dev/null 2>&1 || fail "open $f"; done
  out=$(gm up 2>&1) || fail "gm up failed: $out"
  assert_eq "$(pl_runs)" 4 "every open focus started once" &&
    assert_eq "$(desk_runs)" 1 "and the Guildmaster"
  for f in appt-v2 bravo charlie delta; do
    assert_contains "$out" "$f: Party Leader started in herdr pane $(pl_pane "$f") (missing: no pane recorded)" "$f started"
  done
  before_b=$(pl_pane bravo)
  before_c=$(pl_pane charlie)
  stub_proc "$before_b" shell
  stub_close "$before_c"
  stub_proc "$(pl_pane delta)" vim
  : >"$HERDR_STUB/runs"
  : >"$HERDR_STUB/calls"
  out=$(gm up 2>&1) || fail "second gm up failed: $out"
  assert_eq "$(pl_pane bravo)" "$before_b" "a dead Party Leader restarts in its own pane" &&
    assert_eq "$(runs_in "$before_b")" 1 "once" &&
    assert_eq "$(runs_in "$(pl_pane charlie)")" 1 "a missing one gets a new pane" &&
    assert_eq "$(runs_in "$(pl_pane appt-v2)")" 0 "the live one is left alone" &&
    assert_eq "$(runs_in "$(pl_pane delta)")" 0 "the unknown one is left alone" &&
    assert_eq "$(grep -c . "$HERDR_STUB/runs")" 2 "nothing else typed"
  [ "$(pl_pane charlie)" != "$before_c" ] || fail "charlie kept a gone pane"
  assert_contains "$out" "appt-v2: Party Leader already running (idle), left as it is" "live reported" &&
    assert_contains "$out" "bravo: Party Leader started in herdr pane $before_b (dead: the pane holds only a shell)" "dead relaunched" &&
    assert_contains "$out" "charlie: Party Leader started in herdr pane $(pl_pane charlie) (missing: pane $before_c is gone)" "missing relaunched" &&
    assert_contains "$out" "delta: unknown (the pane runs vim, not a Party Leader); left alone" "ambiguous reported"
  if grep -q 'pane close' "$HERDR_STUB/calls"; then fail "gm up closed something"; fi
  assert_eq "$(db "SELECT count(*) FROM event WHERE kind='party-leader.launched';")" 6 "each launch is in the ledger"
}

t_no_double_launch() {
  setup double
  mkdir -p "$GM_HALL"
  initialized
  gm open bravo --repo "$REPO" --no-launch >/dev/null 2>&1
  gm up >/dev/null 2>&1
  gm up >/dev/null 2>&1
  assert_eq "$(pl_runs)" 2 "a second muster starts nothing" &&
    assert_eq "$(desk_runs)" 1 "not even a second Guildmaster"
  : >"$HERDR_STUB/runs"
  printf 'shell' >"$HERDR_STUB/run-proc"
  stub_proc "$(pl_pane appt-v2)" shell
  stub_proc "$(pl_pane bravo)" shell
  db "UPDATE endpoint SET launched_ms=0;"
  export GM_LAUNCH_GRACE=600
  gm up >/dev/null 2>&1 &
  gm up >/dev/null 2>&1 &
  GM_INTERACTIVE=1 gm list >/dev/null 2>&1 &
  wait
  assert_eq "$(grep -c . "$HERDR_STUB/runs")" 2 "three musters at once start each Party Leader once"
  assert_contains "$(gm up 2>&1)" "appt-v2: starting (launched moments ago); left alone" "one still starting is not started again"
  assert_eq "$(grep -c . "$HERDR_STUB/runs")" 2 "still once each"
  [ ! -e "$GM_HALL/herdr.lock" ] || fail "the lock was left behind"
}

t_roster_lists_each_focus() {
  setup roster
  gm open bravo --repo "$REPO" >/dev/null 2>&1
  local out
  out=$(gm roster)
  assert_eq "$(printf '%s\n' "$out" | awk '{ print $1 }' | tr '\n' ' ')" "guildmaster appt-v2 bravo " "front desk, then each focus by name" &&
    assert_eq "$(roster_state appt-v2)" alive "opening one focus musters the others too" &&
    assert_eq "$(roster_state bravo)" alive "bravo running"
}

t_visit_brings_a_party_leader_to_the_front() {
  setup visit
  gm open bravo --repo "$REPO" >/dev/null 2>&1
  local out ws tab
  : >"$HERDR_STUB/focused"
  out=$(gm visit bravo) || fail "visit failed: $out"
  IFS='|' read -r ws tab <<<"$(db "SELECT workspace_id||'|'||tab_id FROM endpoint WHERE key='party-leader:bravo';")"
  assert_eq "$(cat "$HERDR_STUB/focused")" "$ws
$tab" "its workspace, then its tab" &&
    assert_contains "$out" "bravo is in front: herdr workspace $ws" "says where it went"
  out=$(gm visit nobody 2>&1) && fail "visited a focus that does not exist"
  gm open charlie --repo "$REPO" --no-launch >/dev/null 2>&1
  out=$(gm visit charlie 2>&1) && fail "visited a focus with no Party Leader"
  assert_contains "$out" "charlie has no Party Leader in herdr; gm open charlie starts one" "says how to start one"
}

t_open_needs_herdr() {
  export GM_HALL=$WORK/needs/hall
  mkdir -p "$GM_HALL"
  initialized
  REPO=$(new_repo needs/repo)
  local out
  out=$(GM_HERDR=$WORK/no-herdr gm open appt-v2 --repo "$REPO" 2>&1) && fail "gm open launched without herdr"
  assert_contains "$out" "gm needs herdr" "says herdr is required"
  [ ! -s "$GM_HALL/register.db" ] || assert_eq "$(db 'SELECT count(*) FROM focus;')" 0 "nothing recorded"
  GM_HERDR=$WORK/no-herdr gm open appt-v2 --repo "$REPO" --no-launch >/dev/null 2>&1 || fail "--no-launch needs no herdr"
  out=$(GM_HERDR=$WORK/no-herdr gm up 2>&1) && fail "gm up ran without herdr"
  assert_contains "$out" "gm needs herdr" "gm up says so"
  assert_contains "$(GM_HERDR=$WORK/no-herdr GM_INTERACTIVE=1 gm list 2>&1)" "herdr is not installed" "other commands warn and still answer"
}

t_init_musters_and_offers_autostart() {
  setup init-muster
  initialized
  local out
  out=$(GM_OTELCOL=$WORK/none gm init --no 2>&1) || true
  assert_eq "$(roster_state appt-v2)" alive "gm init brings the Party Leaders up" &&
    assert_contains "$out" "appt-v2: Party Leader started in herdr pane" "and says so"
  if [ "$(uname -s)" = Darwin ]; then
    assert_contains "$out" "autostart is on: launchd brings the Guildmaster and the Party Leaders back" "and turns autostart on" &&
      [ -n "$(find "$GM_LAUNCH_AGENTS" -name 'com.guildmaster.up*.plist' 2>/dev/null)" ] || fail "no launchd property list"
  fi
}

# The sidebar's labels, in herdr's order, one a line.
sidebar() { cut -f 2 "$HERDR_STUB/workspaces"; }

t_party_leaders_have_workspaces_under_the_guild() {
  setup pl-ws
  local guild ws pane old_tab old_pane
  gm open appt-v2 >/dev/null 2>&1 || fail "open failed"
  guild=$(db "SELECT workspace_id FROM endpoint WHERE key='front-desk';")
  ws=$(db "SELECT workspace_id FROM endpoint WHERE key='party-leader:appt-v2';")
  [ "$ws" != "$guild" ] || fail "the Party Leader is in the guild's workspace" || return 1
  # A workspace the patron opened lands after the guild's; the next Party Leader still goes under the guild.
  "$ROOT/tests/fixtures/herdr" workspace create --cwd "$WORK" --label other --no-focus --session gm-test >/dev/null
  gm open bravo --repo "$REPO" >/dev/null 2>&1 || fail "open bravo failed"
  assert_eq "$(sidebar | tr '\n' '|')" "guild|└ appt-v2|└ bravo|other|" "each Party Leader nested under the guild, in herdr's order" &&
    assert_contains "$(cat "$HERDR_STUB/socket-calls")" '"method":"workspace.move"' "moved with workspace.move"
  # Its pane gone but its workspace still there (another tab open in it): a new tab there, not a second workspace.
  stub_close "$(pl_pane appt-v2)"
  gm up >/dev/null 2>&1 || fail "gm up failed"
  assert_eq "$(db "SELECT workspace_id FROM endpoint WHERE key='party-leader:appt-v2';")" "$ws" "the same workspace" &&
    assert_eq "$(sidebar | grep -c 'appt-v2')" 1 "and no second one" &&
    assert_eq "$(roster_state appt-v2)" alive "running again"
  # A Party Leader from before, in a tab of the guild's workspace: left there while it runs, moved out once it is dead.
  IFS=$'\t' read -r _ old_tab old_pane <<<"$(herdr_tab bravo)"
  stub_proc "$old_pane" claude
  db "UPDATE endpoint SET workspace_id='$guild', tab_id='$old_tab', pane_id='$old_pane', label='bravo' WHERE key='party-leader:bravo';"
  gm up >/dev/null 2>&1 || fail "gm up failed"
  assert_eq "$(pl_pane bravo)" "$old_pane" "a running one stays in its tab"
  assert_contains "$(gm open bravo 2>&1 | tail -n 1)" "bravo's Party Leader is in herdr tab bravo (workspace guild, pane $old_pane)" "and is said to be there"
  stub_proc "$old_pane" shell
  gm up >/dev/null 2>&1 || fail "gm up failed"
  pane=$(pl_pane bravo)
  [ "$pane" != "$old_pane" ] || fail "a dead one was started again in the guild's tab"
  grep -q "pane close $old_pane --session gm-test" "$HERDR_STUB/calls" || fail "its husk was not closed"
  assert_eq "$(db "SELECT label FROM endpoint WHERE key='party-leader:bravo';")" "└ bravo" "it has a workspace of its own" &&
    assert_eq "$(roster_state bravo)" alive "and runs there"
}

t_close_retires_a_focus() {
  setup close
  local out pane
  gm open appt-v2 >/dev/null 2>&1
  pane=$(pl_pane appt-v2)
  out=$(gm close appt-v2 2>&1) && fail "a live Party Leader was closed"
  assert_contains "$out" "appt-v2's Party Leader is alive (idle) in herdr pane $pane; end it there first (/exit)" "says to end it first"
  assert_eq "$(db "SELECT closed_at IS NULL FROM focus;")" 1 "still open"
  if grep -q 'pane close' "$HERDR_STUB/calls"; then fail "a live pane was closed"; fi
  stub_proc "$pane" shell
  out=$(gm close appt-v2) || fail "close failed"
  assert_contains "$out" "appt-v2 is closed: its Party Leader is not started again. Its camp $CAMP and its postings are kept" "says what stays"
  grep -q "pane close $pane --session gm-test" "$HERDR_STUB/calls" || fail "its husk pane was not closed"
  if grep -q "└ appt-v2" "$HERDR_STUB/workspaces"; then fail "its workspace was left behind"; fi
  assert_eq "$(db "SELECT count(*) FROM endpoint WHERE key='party-leader:appt-v2';")" 0 "endpoint forgotten"
  [ -d "$CAMP" ] || fail "the camp was removed"
  : >"$HERDR_STUB/runs"
  gm up >/dev/null 2>&1
  assert_eq "$(grep -c . "$HERDR_STUB/runs")" 0 "a closed focus is not started"
  assert_not_contains "$(gm roster)" "appt-v2" "nor listed" &&
    assert_contains "$(gm roster --all)" "closed" "except with --all"
  assert_contains "$(gm close appt-v2)" "already closed" "closing twice is harmless"
  gm open appt-v2 >/dev/null 2>&1 || fail "reopen failed"
  assert_eq "$(db "SELECT closed_at IS NULL FROM focus;")" 1 "gm open reopens it" &&
    assert_eq "$(roster_state appt-v2)" alive "and starts it"
}

# wait_for <sql> <expected> [seconds]: the register answers that within the time (the self-close finisher runs
# detached, so its tests wait for it).
wait_for() {
  local i=0
  while [ "$i" -lt "${3:-15}" ]; do
    [ "$(db "$1")" != "$2" ] || return 0
    sleep 1
    i=$((i + 1))
  done
  [ "$(db "$1")" = "$2" ]
}

# as_pl <command...>: run as appt-v2's Party Leader, in its recorded herdr pane.
as_pl() { HERDR_ENV=1 HERDR_PANE_ID="$(pl_pane appt-v2)" HERDR_SESSION=gm-test GM_FOCUS=appt-v2 "$@"; }

typed_exit() { cat "$HERDR_STUB/typed" 2>/dev/null | grep -c "	/exit$" || true; }

t_party_leader_closes_itself() {
  setup selfclose
  export GM_CLOSE_POLL=1 GM_CLOSE_WAIT=20
  local out pane
  gm open appt-v2 >/dev/null 2>&1
  pane=$(pl_pane appt-v2)
  GM_FOCUS=appt-v2 gm post "fix the owner field" >/dev/null
  out=$(as_pl gm close appt-v2 2>&1) && fail "closed with a posting unfinished"
  assert_contains "$out" "appt-v2 still has postings that are not finished: #1 fix-owner-field received" "names what is open" &&
    assert_eq "$(db "SELECT closed_at IS NULL AND close_requested_at IS NULL FROM focus;")" 1 "nothing recorded" || return 1
  GM_FOCUS=appt-v2 gm notice 1 'done' "fixed" >/dev/null
  # Its turn is still running: the request is recorded, and nothing is typed until the turn ends.
  printf 'working' >"$HERDR_STUB/agent-status"
  local t0=$SECONDS
  out=$(GM_FOCUS=appt-v2 CLAUDECODE=1 gm close appt-v2 2>&1) && fail "another claude in the camp asked to close it"
  assert_contains "$out" "end it there first (/exit)" "only the Party Leader in its pane may ask" || return 1
  out=$(as_pl env CLAUDECODE=1 bash "$GM" close appt-v2 2>&1) || fail "the request failed: $out"
  [ $((SECONDS - t0)) -lt 5 ] || fail "the request waited for the finisher"
  assert_contains "$out" "appt-v2 closes when this turn ends" "says what happens next" &&
    assert_eq "$(db "SELECT closed_at IS NULL AND close_requested_at IS NOT NULL FROM focus;")" 1 "the request is recorded" || return 1
  sleep 3
  assert_eq "$(typed_exit)" 0 "nothing typed while the turn runs" || return 1
  printf 'idle' >"$HERDR_STUB/agent-status"
  wait_for "SELECT closed_at IS NOT NULL FROM focus;" 1 || fail "the focus was not closed"
  assert_eq "$(typed_exit)" 1 "/exit typed once" &&
    assert_eq "$(grep -c "pane close $pane --session gm-test" "$HERDR_STUB/calls")" 1 "its husk pane closed" &&
    assert_eq "$(db "SELECT count(*) FROM endpoint WHERE key='party-leader:appt-v2';")" 0 "endpoint forgotten" &&
    assert_eq "$(db "SELECT group_concat(actor||' '||kind, ', ') FROM (SELECT * FROM event WHERE kind IN ('focus.close-requested','party-leader.exit','focus.closed') ORDER BY id);")" \
      "party-leader focus.close-requested, gm party-leader.exit, gm focus.closed" "the ledger says who did what" &&
    assert_eq "$(db "SELECT close_requested_at IS NULL FROM focus;")" 1 "the request is spent" || return 1
  [ -d "$CAMP" ] || fail "the camp was removed"
  : >"$HERDR_STUB/runs"
  gm up >/dev/null 2>&1
  assert_eq "$(pl_runs)" 0 "a closed focus is not started again"
  # From anywhere else, a live Party Leader is still never ended by gm.
  gm open appt-v2 >/dev/null 2>&1
  out=$(GM_FOCUS=other gm close appt-v2 2>&1) && fail "another session closed a live Party Leader"
  assert_contains "$out" "end it there first (/exit)" "and is told to end it first"
}

t_patron_message_cancels_a_self_close() {
  setup selfcancel
  export GM_CLOSE_POLL=1 GM_CLOSE_WAIT=20
  local out
  gm open appt-v2 >/dev/null 2>&1
  printf 'working' >"$HERDR_STUB/agent-status"
  as_pl gm close appt-v2 >/dev/null 2>&1 || fail "the request failed"
  out=$(payload s1 "one more thing before you go" | GM_FOCUS=appt-v2 gm hook prompt)
  assert_contains "$out" "This message cancels the close that the Party Leader of appt-v2 asked for" "the patron is told" &&
    assert_eq "$(db "SELECT close_requested_at IS NULL FROM focus;")" 1 "the request is dropped" || return 1
  printf 'idle' >"$HERDR_STUB/agent-status"
  sleep 3
  assert_eq "$(typed_exit)" 0 "nothing typed after a cancel" &&
    assert_eq "$(db "SELECT closed_at IS NULL FROM focus;")" 1 "still open" || return 1
  # gm open on a focus asked to close keeps it open too.
  GM_FOCUS=appt-v2 gm notice 1 closed "answered" >/dev/null
  printf 'working' >"$HERDR_STUB/agent-status"
  as_pl gm close appt-v2 >/dev/null 2>&1 || fail "the second request failed"
  gm open appt-v2 >/dev/null 2>&1
  assert_eq "$(db "SELECT close_requested_at IS NULL FROM focus;")" 1 "gm open keeps it open" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='focus.close-cancelled';")" 2 "one ledger row each"
}

t_muster_finishes_a_self_close() {
  setup selfmuster
  local out pane
  gm open appt-v2 >/dev/null 2>&1
  pane=$(pl_pane appt-v2)
  # The finisher gives up at once, as if it had died: the muster starts another, which ends it.
  GM_CLOSE_WAIT=0 as_pl gm close appt-v2 >/dev/null 2>&1 || fail "the request failed"
  wait_for "SELECT count(*) FROM event WHERE kind='focus.close-requested';" 1 || return 1
  sleep 2
  assert_eq "$(typed_exit)" 0 "the first finisher typed nothing" || return 1
  : >"$HERDR_STUB/runs"
  out=$(GM_CLOSE_WAIT=20 GM_CLOSE_POLL=1 gm up 2>&1)
  assert_contains "$out" "appt-v2: asked to close; gm ends it once its turn is over" "the muster starts a finisher" || return 1
  out=$(GM_CLOSE_WAIT=20 GM_CLOSE_POLL=1 gm up 2>&1)
  wait_for "SELECT closed_at IS NOT NULL FROM focus;" 1 || fail "the focus was not closed"
  assert_eq "$(typed_exit)" 1 "one finisher, one /exit" &&
    assert_eq "$(pl_runs)" 0 "never started again" || return 1
  grep -q "pane close $pane --session gm-test" "$HERDR_STUB/calls" || fail "its husk pane was not closed"
  # Ended some other way while no finisher runs: the muster closes the focus itself.
  gm open appt-v2 >/dev/null 2>&1
  pane=$(pl_pane appt-v2)
  GM_CLOSE_WAIT=0 as_pl gm close appt-v2 >/dev/null 2>&1 || fail "the second request failed"
  sleep 2
  stub_proc "$pane" shell
  : >"$HERDR_STUB/runs"
  out=$(gm up 2>&1)
  assert_contains "$out" "appt-v2: closed, as its Party Leader asked" "the muster closes it" &&
    assert_eq "$(db "SELECT closed_at IS NOT NULL FROM focus;")" 1 "closed" &&
    assert_eq "$(pl_runs)" 0 "and does not start it again"
}

t_start_runs_only_in_the_recorded_pane() {
  setup start
  local out
  out=$(GM_CLAUDE=$FAKE GM_FAKE_CLAUDE_ENV=$WORK/start/env gm start appt-v2 --pane w9:p9 2>&1) && fail "gm start ran in an unrecorded pane"
  assert_contains "$out" "gm start runs only in appt-v2's own herdr pane" "and says why"
  GM_CLAUDE=$FAKE GM_FAKE_CLAUDE_ENV=$WORK/start/env gm start appt-v2 >/dev/null 2>&1 && fail "gm start ran with no pane"
  [ ! -e "$WORK/start/env" ] || fail "claude was started"
}

t_muster_before_interactive_commands() {
  setup muster
  mkdir -p "$GM_HALL"
  initialized
  local pane out
  gm open appt-v2 >/dev/null 2>&1
  pane=$(pl_pane appt-v2)
  stub_proc "$pane" shell
  : >"$HERDR_STUB/runs"
  gm list >/dev/null 2>&1
  GM_INTERACTIVE=1 GM_FOCUS=appt-v2 gm list >/dev/null 2>&1
  GM_INTERACTIVE=1 GM_HERDR_AUTO=off gm list >/dev/null 2>&1
  GM_INTERACTIVE=1 gm hook stop </dev/null >/dev/null 2>&1
  assert_eq "$(grep -c . "$HERDR_STUB/runs")" 0 "no muster from a pipe, a Party Leader, when turned off, or from a hook"
  out=$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)
  assert_contains "$out" "appt-v2: Party Leader started in herdr pane $pane (dead: the pane holds only a shell)" "a terminal command musters first" &&
    assert_eq "$(runs_in "$pane")" 1 "and restarts the dead one"
  assert_eq "$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)" "" "quiet when all are running"
}

t_herdr_server_and_workspace_come_back() {
  setup server
  rm -f "$HERDR_STUB/running"
  gm up >/dev/null 2>&1 || fail "gm up failed"
  grep -q '^server --session gm-test' "$HERDR_STUB/calls" || fail "the server was not started"
  local ws
  ws=$(db "SELECT workspace_id FROM endpoint WHERE key='front-desk';")
  assert_eq "$(awk -F '\t' -v w="$ws" '$1 == w { print $2 }' "$HERDR_STUB/workspaces")" guild "the guild workspace" &&
    assert_eq "$(awk -F '\t' -v t="$(db "SELECT tab_id FROM endpoint WHERE key='front-desk';")" '$1 == t { print $3 }' "$HERDR_STUB/tabs")" guildmaster "its first tab is the front desk"
  : >"$HERDR_STUB/workspaces"
  : >"$HERDR_STUB/tabs"
  : >"$HERDR_STUB/panes"
  printf 'w99\tguild\n' >"$HERDR_STUB/workspaces"
  gm up >/dev/null 2>&1 || fail "gm up after the layout was lost"
  local ws2
  ws2=$(db "SELECT workspace_id FROM endpoint WHERE key='party-leader:appt-v2';")
  [ -n "$ws2" ] && [ "$ws2" != w99 ] && [ "$ws2" != "$ws" ] || fail "another guild workspace was adopted by its label, or none made ($ws2)"
  assert_eq "$(roster_state appt-v2)" alive "the Party Leader is back"
}

t_failing_party_leader_is_held_with_one_notice() {
  setup held
  mkdir -p "$GM_HALL"
  initialized
  local out
  printf 'shell' >"$HERDR_STUB/run-proc"
  gm up >/dev/null 2>&1
  gm up >/dev/null 2>&1
  gm up >/dev/null 2>&1
  assert_eq "$(pl_runs)" 3 "three tries"
  out=$(gm up --quiet 2>&1)
  assert_eq "$(gm up --quiet 2>&1)" "" "the agent logs it once"
  assert_contains "$out" "appt-v2: held: its Party Leader failed to start 3 times in a row (dead: the pane holds only a shell); gm open appt-v2 tries again" "one line says so"
  assert_eq "$(pl_runs)" 3 "and no fourth try" &&
    assert_eq "$(desk_runs)" 3 "nor for the Guildmaster" &&
    assert_contains "$out" "guildmaster: held: the Guildmaster failed to start 3 times in a row" "which is held the same way"
  out=$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)
  assert_contains "$out" "appt-v2: held" "the next command at a terminal says it once"
  assert_eq "$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)" "" "and only once"
  assert_eq "$(gm up --quiet 2>&1)" "" "nor again in the agent's log"
  assert_contains "$(gm up 2>&1)" "appt-v2: held" "gm up by hand always says it"
  assert_eq "$(db "SELECT count(*) FROM event WHERE kind='party-leader.held';")" 1 "one ledger entry, not one a muster" &&
    assert_eq "$(roster_state appt-v2)" held "the roster shows it"
  rm -f "$HERDR_STUB/run-proc"
  gm open appt-v2 >/dev/null 2>&1
  assert_eq "$(pl_runs)" 4 "gm open tries again" &&
    assert_eq "$(roster_state appt-v2)" alive "and it runs"
  gm up >/dev/null 2>&1
  assert_eq "$(db "SELECT start_attempts||held_told||COALESCE(held_at,'-') FROM focus;")" "00-" "seen alive, the count starts over"
}

t_restarts_stay_out_of_the_party_leaders_chat() {
  setup quiet
  gm open appt-v2 >/dev/null 2>&1
  stub_proc "$(pl_pane appt-v2)" shell
  gm up --quiet >/dev/null 2>&1
  assert_eq "$(db "SELECT count(*) FROM event WHERE kind='party-leader.launched';")" 2 "both starts recorded"
  assert_not_contains "$(gm where appt-v2)" "herdr" "the resume summary does not carry them"
  assert_contains "$(gm roster)" "last started " "the roster does"
  assert_eq "$(gm up --quiet 2>&1)" "" "a muster with nothing to do says nothing"
}

t_autostart_installs_a_launchd_agent() {
  [ "$(uname -s)" = Darwin ] || { printf '    (not macOS; skipped)\n'; return 0; }
  setup autostart
  export GM_LAUNCH_AGENTS=$WORK/autostart/LaunchAgents
  local out plist
  out=$(gm autostart on --every 7) || fail "autostart on failed: $out"
  plist=$(ls "$GM_LAUNCH_AGENTS"/com.guildmaster.up.*.plist)
  [ -f "$plist" ] || fail "no property list" || return 1
  if command -v plutil >/dev/null 2>&1; then plutil -lint "$plist" >/dev/null || fail "the property list is not valid"; fi
  local x
  x=$(tr -d '\n ' <"$plist")
  assert_contains "$x" "<string>up</string><string>--quiet</string>" "runs gm up --quiet" &&
    assert_contains "$x" "<key>RunAtLoad</key><true/>" "at login" &&
    assert_contains "$x" "<key>StartInterval</key><integer>420</integer>" "and every 7 minutes" &&
    assert_contains "$x" "<key>GM_HALL</key><string>$GM_HALL</string>" "for this Guildhall" &&
    assert_contains "$x" "<key>GM_HERDR_SESSION</key><string>gm-test</string>" "and this herdr session" &&
    assert_contains "$(cat "$HERDR_STUB/launchctl")" "bootstrap gui/$(id -u) $plist" "loaded into the user's launchd"
  assert_contains "$(gm autostart)" "autostart is on" "status"
  gm autostart off >/dev/null
  [ ! -e "$plist" ] || fail "off left the agent"
  assert_contains "$(cat "$HERDR_STUB/launchctl")" "bootout gui/$(id -u)/com.guildmaster.up." "and unloaded it" &&
    assert_contains "$(gm autostart)" "autostart is off" "status after"
}

# ---- the zero-touch start: gm alone, the front desk's Guildmaster and its SessionStart hook ----

# front_desk_hook [session id]: the Guildmaster's SessionStart hook as Claude Code runs it in the front desk's herdr
# pane: the committed settings' command, in the suite's plain clone, with the ids herdr gives that pane; prints its
# JSON, and its stderr into $WORK/hook-err.
front_desk_hook() {
  local ws tab pane
  IFS=$'\t' read -r ws tab pane <<<"$(db "SELECT workspace_id, tab_id, pane_id FROM endpoint WHERE key='front-desk';" | tr '|' '\t')"
  [ -n "$pane" ] || fail "no front desk recorded for the hook to run in" || return 1
  in_pane "$ws" "$tab" "$pane" "${1:-s1}"
}

# in_pane <workspace> <tab> <pane> [session id] [herdr session]: the hook as Claude Code runs it in that herdr pane.
in_pane() {
  desk_ready
  printf '{"session_id":"%s","source":"startup","hook_event_name":"SessionStart"}' "${4:-s1}" |
    (cd "$DESK" && CLAUDECODE=1 CLAUDE_PROJECT_DIR=$DESK HERDR_ENV=1 HERDR_SESSION=${5:-gm-test} HERDR_WORKSPACE_ID=$1 \
      HERDR_TAB_ID=$2 HERDR_PANE_ID=$3 sh -c "$(clone_hook_command)" 2>"$WORK/hook-err")
}

hook_context() { json "SELECT json_extract($(sqlq "$1"),'\$.hookSpecificOutput.additionalContext');"; }

bootstraps() { grep -c '^bootstrap ' "$HERDR_STUB/launchctl" 2>/dev/null || true; }

t_gm_alone_opens_the_front_desk() {
  setup desk
  local out pane dir
  out=$(gm 2>/dev/null) || fail "gm alone failed"
  pane=$(db "SELECT pane_id FROM endpoint WHERE key='front-desk';")
  [ -n "$pane" ] || fail "no front desk recorded" || return 1
  assert_eq "$out" "The Guildmaster is in herdr tab guildmaster (workspace guild, pane $pane); see it with: herdr --session gm-test" "one line says where" &&
    assert_eq "$(desk_runs)" 1 "the Guildmaster started once" &&
    assert_eq "$(pl_runs)" 1 "and the Party Leader" &&
    assert_contains "$(cat "$HERDR_STUB/runs")" "start 'guildmaster' --pane '$pane'" "the front desk's pane runs gm start guildmaster"
  [ ! -e "$HERDR_STUB/attached" ] || fail "attached herdr without a terminal"
  dir=$GM_HALL/front-desk
  cmp -s "$dir/CLAUDE.md" "$ROOT/templates/guildmaster.md" || fail "the Guildmaster's charter was not copied"
  # The clone's committed settings are the front desk's; the Guildhall's folder holds only the charter.
  [ ! -e "$dir/.claude" ] || fail "settings written into the Guildhall's front-desk folder"
  [ ! -e "$GM_HALL/CLAUDE.md" ] || fail "a CLAUDE.md above the camps would reach every Party Leader"
  # The pane's line starts the Guildmaster: claude --name guildmaster in the clone, without the server's Claude Code
  # variables, and with the Guildhall and herdr session gm runs with.
  local f=$WORK/desk/env.txt line
  line=$(awk -F '\t' -v p="$pane" '$1 == p { print $2 }' "$HERDR_STUB/runs")
  env CLAUDECODE=1 GM_FOCUS=elsewhere GM_FAKE_CLAUDE_ENV="$f" sh -c "$line" </dev/null >/dev/null 2>&1
  assert_eq "$(cat "$f.args")" "--name
guildmaster" "claude --name guildmaster: the clone loads the chat's mod itself, from .claude/skills" &&
    assert_contains "$(cat "$f")" "GM_CHAT=banners" "told the chat's style" &&
    assert_eq "$(cat "$f.pwd")" "$ROOT" "in the clone" &&
    assert_contains "$(cat "$f")" "GM_HERDR_SESSION=gm-test" "in the herdr session it was opened in" &&
    assert_contains "$(cat "$f")" "GM_HALL=$GM_HALL" "and the Guildhall" &&
    assert_not_contains "$(cat "$f")" "CLAUDECODE=" "without the server's Claude Code variables" &&
    assert_not_contains "$(cat "$f")" "GM_FOCUS=" "and never as a focus"
  out=$(GM_CLAUDE=$FAKE GM_FAKE_CLAUDE_ENV=$WORK/desk/env2 gm start guildmaster --pane w9:p9 2>&1) && fail "gm start guildmaster ran in another pane"
  assert_contains "$out" "runs only in the front desk's own herdr pane" "and says why"
  # Again: nothing is started twice, and the patron's own charter is kept.
  printf 'my own charter\n' >"$dir/CLAUDE.md"
  gm >/dev/null 2>&1 || fail "gm alone again failed"
  assert_eq "$(desk_runs)" 1 "a running Guildmaster is left as it is" &&
    assert_eq "$(pl_runs)" 1 "and so is the Party Leader" &&
    assert_eq "$(cat "$dir/CLAUDE.md")" "my own charter" "the patron's charter is never overwritten"
  # At a terminal it opens herdr at the front desk; inside herdr it only switches to the tab.
  GM_INTERACTIVE=1 gm >/dev/null 2>&1
  [ -e "$HERDR_STUB/attached" ] || fail "herdr was not attached at a terminal"
  assert_contains "$(cat "$HERDR_STUB/focused")" "$(db "SELECT tab_id FROM endpoint WHERE key='front-desk';")" "at the front desk's tab"
  rm -f "$HERDR_STUB/attached"
  out=$(HERDR_ENV=1 GM_INTERACTIVE=1 gm 2>/dev/null)
  [ ! -e "$HERDR_STUB/attached" ] || fail "attached a herdr client inside herdr"
  assert_eq "$out" "The Guildmaster is in the guildmaster tab of workspace guild." "inside herdr it switches tabs" &&
    assert_eq "$(desk_runs)" 1 "still one Guildmaster"
  assert_contains "$(gm nonsense 2>&1)" "unknown command 'nonsense'" "an unknown command is not the front desk"
}

t_gm_alone_explains_what_is_missing() {
  export GM_HALL=$WORK/desk-missing/hall
  local out rc=0
  out=$(GM_HERDR=$WORK/no-herdr gm 2>&1) || rc=$?
  assert_eq "$rc" 1 "gm alone stops" &&
    assert_contains "$out" "the Guildmaster cannot start until these are installed" "and says so plainly" &&
    assert_contains "$out" "https://herdr.dev/docs/install/" "with how to install herdr"
}

t_front_desk_hook_sets_up_and_is_silent_on_repeat() {
  setup hook
  rm -f "$GM_HALL/guild.conf"
  export GM_OTELCOL=$WORK/none
  local out ctx
  gm >/dev/null 2>&1 || fail "gm alone failed"
  out=$(front_desk_hook s1) || fail "the hook failed"
  assert_eq "$(json "SELECT json_valid($(sqlq "$out"));")" 1 "the hook prints JSON" &&
    assert_eq "$(json "SELECT json_extract($(sqlq "$out"),'\$.systemMessage') IS NULL;")" 1 "and nothing for the patron's screen" &&
    assert_eq "$(cat "$WORK/hook-err")" "" "and nothing on stderr"
  ctx=$(hook_context "$out")
  assert_contains "$ctx" "You are the Guildmaster" "it tells the session who it is" &&
    assert_contains "$ctx" "first-run check passed" "the first-run check ran without a question" &&
    assert_contains "$ctx" "appt-v2                  party leader  alive" "the roster" &&
    assert_contains "$ctx" "guildmaster              front desk    alive" "with the front desk" &&
    assert_contains "$ctx" "init --yes" "the collector offer, with how to record the answer" &&
    assert_contains "$ctx" "init --later" "including later"
  [ -n "$(sed -n 's/^initialized: //p' "$GM_HALL/guild.conf")" ] || fail "the first run was not recorded"
  [ -n "$(sed -n 's/^collector-offered: //p' "$GM_HALL/guild.conf")" ] || fail "the offer was not recorded"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" "" "and no answer invented for the patron"
  if [ "$(uname -s)" = Darwin ]; then
    assert_contains "$ctx" "autostart on" "autostart is on" &&
      assert_eq "$(bootstraps)" 1 "loaded once" &&
      [ -n "$(ls "$GM_LAUNCH_AGENTS"/com.guildmaster.up.*.plist 2>/dev/null)" ] || fail "no property list in the test's LaunchAgents"
  fi
  # Again, three at once and then once more: the same state, nothing started or loaded again, no second offer.
  front_desk_hook s2 >/dev/null &
  front_desk_hook s3 >/dev/null &
  front_desk_hook s4 >/dev/null &
  wait
  out=$(front_desk_hook s5)
  ctx=$(hook_context "$out")
  assert_eq "$(cat "$WORK/hook-err")" "" "silent on repeat" &&
    assert_eq "$(desk_runs)" 1 "one Guildmaster, ever" &&
    assert_eq "$(pl_runs)" 1 "one Party Leader, ever" &&
    assert_not_contains "$ctx" "init --yes" "the offer is not repeated" &&
    assert_not_contains "$ctx" "Done just now by gm (routine;" "nothing done when all is running" &&
    assert_contains "$ctx" "appt-v2                  party leader  alive" "the roster still"
  [ "$(uname -s)" != Darwin ] || assert_eq "$(bootstraps)" 1 "autostart loaded once"
  [ ! -e "$GM_HALL/herdr.lock" ] || fail "the lock was left behind"
  # A Party Leader that died is brought back by the hook, which mentions it only as routine.
  stub_proc "$(pl_pane appt-v2)" shell
  ctx=$(hook_context "$(front_desk_hook s6)")
  assert_contains "$ctx" "Done just now by gm (routine; do not mention it unless asked):
- appt-v2: Party Leader started in herdr pane" "a restart is routine" &&
    assert_eq "$(pl_runs)" 2 "restarted once"
}

t_front_desk_hook_explains_a_missing_required_piece() {
  export GM_HALL=$WORK/hook-missing/hall
  local out ctx
  desk_ready
  out=$(GM_CLAUDE=$WORK/no-claude in_pane w1 w1:t1 w1:p1)
  ctx=$(hook_context "$out")
  assert_contains "$ctx" "required pieces are missing" "the Guildmaster is told" &&
    assert_contains "$ctx" "Claude Code: $WORK/no-claude not found" "what is missing" &&
    assert_contains "$ctx" "Tell the patron plainly" "and to say it plainly"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "a failed first run recorded something"
}

t_collector_answer_is_recorded_through_gm() {
  export GM_HALL=$WORK/hook-collector/hall GM_OTELCOL=$WORK/none
  mkdir -p "$GM_HALL"
  local ctx
  gm >/dev/null 2>&1 || fail "gm alone failed"
  ctx=$(hook_context "$(front_desk_hook)")
  assert_contains "$ctx" "Offer the tracing collector once" "offered"
  gm init --later >/dev/null 2>&1 || fail "gm init --later failed"
  assert_eq "$(sed -n 's/^collector: //p' "$GM_HALL/guild.conf")" later "later recorded"
  assert_not_contains "$(hook_context "$(front_desk_hook)")" "Offer the tracing collector" "not offered again the same day"
  sed -i.bak 's/^collector-offered: .*/collector-offered: 2026-01-01T00:00:00Z/' "$GM_HALL/guild.conf"
  assert_contains "$(hook_context "$(front_desk_hook)")" "Offer the tracing collector" "offered again another day"
  gm init --no >/dev/null 2>&1
  sed -i.bak 's/^collector-offered: .*/collector-offered: 2026-01-01T00:00:00Z/' "$GM_HALL/guild.conf"
  ctx=$(hook_context "$(front_desk_hook)")
  assert_not_contains "$ctx" "Offer the tracing collector" "a skip is never offered again" &&
    assert_contains "$ctx" "tracing collector off: the patron chose to go without it" "and the Guildmaster knows it"
}

t_autostart_stays_off_once_turned_off() {
  [ "$(uname -s)" = Darwin ] || { printf '    (not macOS; skipped)\n'; return 0; }
  setup autostart-off
  initialized
  local ctx
  gm >/dev/null 2>&1 || fail "gm alone failed"
  front_desk_hook >/dev/null
  assert_eq "$(bootstraps)" 1 "on by itself"
  assert_contains "$(gm autostart off)" "stays off" "off says it stays off"
  assert_eq "$(sed -n 's/^autostart: //p' "$GM_HALL/guild.conf")" off "recorded"
  ctx=$(hook_context "$(front_desk_hook)")
  assert_eq "$(bootstraps)" 1 "the Guildmaster does not turn it back on" &&
    assert_contains "$ctx" "autostart off: the patron turned it off" "and knows why"
  [ -z "$(ls "$GM_LAUNCH_AGENTS" 2>/dev/null)" ] || fail "the property list came back"
  gm autostart on >/dev/null || fail "on failed"
  assert_eq "$(sed -n 's/^autostart: //p' "$GM_HALL/guild.conf")" on "on again" &&
    assert_eq "$(bootstraps)" 2 "and loaded"
}

t_open_from_an_agent_without_a_terminal() {
  export GM_HALL=$WORK/agent-open/hall
  REPO=$(new_repo agent-open/appointments)
  local out pane t0 t1
  t0=$(date +%s)
  out=$(CLAUDECODE=1 GM_FAKE_CLAUDE_ENV=$WORK/agent-open/env gm open --repo "$REPO" --ticket CRM-1234 </dev/null 2>/dev/null) ||
    fail "gm open from an agent failed"
  t1=$(date +%s)
  pane=$(pl_pane crm-1234)
  [ -n "$pane" ] || fail "no focus crm-1234, named after its ticket" || return 1
  assert_eq "$(printf '%s\n' "$out" | tail -n 1)" "crm-1234's Party Leader is in herdr workspace └ crm-1234, under guild (pane $pane); see it with: herdr --session gm-test" "one line names the workspace" &&
    assert_eq "$(db "SELECT key FROM ticket;")" CRM-1234 "the ticket attached" &&
    assert_contains "$(cat "$HERDR_STUB/calls")" "workspace create --cwd $GM_HALL/camps/crm-1234 --label └ crm-1234 --no-focus" "a workspace of its own, not focused"
  [ ! -e "$WORK/agent-open/env" ] || fail "claude ran in the agent's own terminal"
  [ ! -e "$HERDR_STUB/attached" ] || fail "herdr was attached"
  [ ! -e "$HERDR_STUB/focused" ] || fail "the Guildmaster's terminal lost its tab"
  [ $((t1 - t0)) -lt 30 ] || fail "gm open took $((t1 - t0))s"
  out=$(CLAUDECODE=1 gm open crm-1234 </dev/null 2>/dev/null) || fail "reopening failed"
  assert_eq "$(pl_pane crm-1234)" "$pane" "the same pane is reused" &&
    assert_eq "$(pl_runs)" 1 "and nothing launched twice" &&
    assert_contains "$out" "crm-1234: Party Leader already running" "a running Party Leader is left as it is" &&
    assert_contains "$out" "crm-1234's Party Leader is in herdr workspace └ crm-1234" "and the workspace is named again"
  out=$(CLAUDECODE=1 gm open guildmaster --repo "$REPO" </dev/null 2>&1) && fail "a focus took the front desk's name"
  assert_contains "$out" "the front desk's name" "and says why"
}

t_repos_finds_the_clone_the_patron_names() {
  export GM_HALL=$WORK/repos/hall
  mkdir -p "$GM_HALL" "$WORK/repos/src/team"
  new_repo repos/src/appointments >/dev/null
  new_repo repos/src/team/appointments-legacy >/dev/null
  new_repo repos/src/billing >/dev/null
  mkdir -p "$WORK/repos/src/node_modules/appointments-x/.git"
  printf 'repo-roots: %s\n' "$WORK/repos/src" >"$GM_HALL/guild.conf"
  assert_eq "$(gm repos billing)" "$WORK/repos/src/billing" "one clone for one word" &&
    assert_eq "$(gm repos Appoint | sort | tr '\n' ' ')" "$WORK/repos/src/appointments $WORK/repos/src/team/appointments-legacy " "every candidate, ignoring case and node_modules" &&
    assert_eq "$(gm repos nothing-like-it)" "" "none"
  gm open billing-v2 --repo "$WORK/repos/src/billing" --no-launch >/dev/null 2>&1
  assert_eq "$(gm repos | head -n 1)" "$WORK/repos/src/billing" "repositories gm knows come first" &&
    assert_eq "$(gm repos | grep -c billing)" 1 "once"
}

# ---- the clone's front desk: claude, started at the clone's root, is the Guildmaster ----

# The suite runs from wherever it was checked out, often a linked worktree, where the clone's hooks stand down. So
# the front desk's tests run in a plain clone of their own: a copy of what the hooks need, committed in a new
# repository. desk_ready also makes a linked worktree of it, and a folder that is no repository at all.
DESK=$WORK/desk/guildmaster
DESK_GM=$DESK/bin/gm
DESK_WT=$WORK/desk/worktree
desk_ready() {
  [ -d "$DESK" ] && return 0
  mkdir -p "$DESK/.claude"
  cp -Rp "$ROOT/bin" "$ROOT/templates" "$ROOT/CLAUDE.md" "$ROOT/.gitignore" "$DESK/"
  cp -p "$ROOT/.claude/settings.json" "$DESK/.claude/"
  git -C "$DESK" init -q -b main
  git -C "$DESK" add -A
  git -C "$DESK" -c user.name=t -c user.email=t@t commit -q -m guildmaster
  git -C "$DESK" worktree add -q --detach "$DESK_WT"
}

# What the committed .claude/settings.json gives Claude Code: settings_field <path>.
settings_field() {
  json "SELECT json_extract(CAST(readfile($(sqlq "$ROOT/.claude/settings.json")) AS TEXT),'\$.$1');"
}

# The hook command the committed settings give Claude Code at session start.
clone_hook_command() { settings_field 'hooks.SessionStart[0].hooks[0].command'; }

# clone_hook [session id] [folder]: that hook exactly as Claude Code runs it, in the plain clone (or the folder) with
# CLAUDE_PROJECT_DIR set; prints its JSON, its stderr into $WORK/hook-err, and its exit status into $WORK/hook-rc.
clone_hook() {
  local rc=0 dir=${2:-$DESK}
  desk_ready
  printf '{"session_id":"%s","source":"startup","hook_event_name":"SessionStart"}' "${1:-c1}" |
    (cd "$dir" && CLAUDECODE=1 CLAUDE_PROJECT_DIR=$dir sh -c "$(clone_hook_command)" 2>"$WORK/hook-err") || rc=$?
  printf '%s' "$rc" >"$WORK/hook-rc"
}

# clone_hook_bare [session id]: gm's side of it alone, without the command's own 2>/dev/null, to see that gm itself
# says nothing on stderr.
clone_hook_bare() {
  desk_ready
  printf '{"session_id":"%s","source":"startup","hook_event_name":"SessionStart"}' "${1:-c1}" |
    (cd "$DESK" && CLAUDECODE=1 CLAUDE_PROJECT_DIR=$DESK bash "$DESK_GM" hook front-desk --clone 2>"$WORK/hook-err")
}

# guard <tool> <command or ''> [folder]: the PreToolUse guard exactly as Claude Code runs it before a tool call, in
# the plain clone (or the folder); prints its JSON.
guard() {
  local dir=${3:-$DESK} input
  desk_ready
  input=$(json "SELECT json_object('session_id','g1','hook_event_name','PreToolUse','cwd',$(sqlq "$dir"),'tool_name',$(sqlq "$1"),
    'tool_input', json_object('command',$(sqlq "$2"),'file_path',$(sqlq "$dir/x.md"),'content','x'));")
  printf '%s' "$input" |
    (cd "$dir" && CLAUDECODE=1 CLAUDE_PROJECT_DIR=$dir sh -c "$(settings_field 'hooks.PreToolUse[0].hooks[0].command')")
}

decision() { json "SELECT json_extract($(sqlq "$1"),'\$.hookSpecificOutput.permissionDecision');"; }

# A home of the test's own, so nothing reaches the real ~/.local/bin.
own_home() {
  export HOME=$WORK/$1/home
  mkdir -p "$HOME"
}

t_clone_front_desk_settings_are_committed_and_scoped() {
  # shellcheck disable=SC2016 # the command as written, variable and all
  assert_contains "$(clone_hook_command)" 'bash "$CLAUDE_PROJECT_DIR/bin/gm" hook front-desk --clone' "the start-up hook runs gm" &&
    assert_contains "$(clone_hook_command)" '|| true' "and never fails the session" &&
    assert_eq "$(settings_field 'hooks.SessionStart[0].hooks[0].timeout')" 120 "with a timeout" &&
    assert_eq "$(settings_field 'hooks.PreToolUse[0].matcher')" "Edit|Write|NotebookEdit|MultiEdit|Bash" "the guard sees edits and commands" &&
    assert_contains "$(settings_field 'hooks.PreToolUse[0].hooks[0].command')" 'bin/gm" hook front-desk-guard 2>/dev/null || true' "and never fails a tool call"
  # Permissions in committed settings would bind every contributor's session at the root; the guard holds them.
  assert_eq "$(settings_field permissions)" "" "no permissions in the committed settings" &&
    assert_contains "$(sed -n 3p "$ROOT/CLAUDE.md")" "This file is guidance for agents that change Guildmaster, not the Guildmaster's charter" "the root CLAUDE.md says it is no charter"
  [ ! -e "$ROOT/front-desk" ] || fail "the front desk moved to the clone's root; front-desk/ is gone"
  grep -qx '/.gm-front-desk' "$ROOT/.gitignore" || fail "the marker could be committed"
  grep -qx '/.claude/settings.local.json' "$ROOT/.gitignore" || fail "the patron's always-allow answers could be committed"
}

t_front_desk_home_is_a_plain_clone_or_a_marked_folder() {
  desk_ready
  # shellcheck source=bin/gm-front-desk-lib.sh
  . "$ROOT/bin/gm-front-desk-lib.sh"
  local bare=$WORK/desk/bare
  gm_front_desk_home "$DESK" || fail "a plain clone is the front desk"
  ! gm_front_desk_home "$DESK_WT" || fail "a linked worktree is not"
  ! gm_front_desk_home "$DESK/bin" || fail "nor a folder inside the clone"
  mkdir -p "$bare"
  cp -Rp "$ROOT/bin" "$bare/"
  ! gm_front_desk_home "$bare" || fail "nor a folder that is no repository"
  mkdir -p "$WORK/desk/outer/inner"
  git -C "$WORK/desk/outer" init -q
  cp -Rp "$ROOT/bin" "$WORK/desk/outer/inner/"
  ! gm_front_desk_home "$WORK/desk/outer/inner" || fail "nor a folder inside another repository"
  # The marker: a regular file holding one plain word, in a worktree or anywhere.
  printf 'patron\n' >"$bare/.gm-front-desk"
  gm_front_desk_home "$bare" || fail "a marked folder is the front desk"
  printf 'patron' >"$DESK_WT/.gm-front-desk"
  gm_front_desk_home "$DESK_WT" || fail "so is a marked worktree, without a newline"
  rm -f "$DESK_WT/.gm-front-desk"
  : >"$bare/.gm-front-desk"
  ! gm_front_desk_home "$bare" || fail "an empty marker is not genuine"
  printf 'pa tron;rm\n' >"$bare/.gm-front-desk"
  ! gm_front_desk_home "$bare" || fail "nor one that is not one plain word"
  printf 'patron\n' >"$WORK/desk/real-marker"
  rm -f "$bare/.gm-front-desk"
  ln -s "$WORK/desk/real-marker" "$bare/.gm-front-desk"
  ! gm_front_desk_home "$bare" || fail "nor a link"
  rm -f "$bare/.gm-front-desk"
  mkdir "$bare/.gm-front-desk"
  ! gm_front_desk_home "$bare" || fail "nor a folder"
  mkdir -p "$WORK/desk/no-gm"
  printf 'patron\n' >"$WORK/desk/no-gm/.gm-front-desk"
  ! gm_front_desk_home "$WORK/desk/no-gm" || fail "and never a folder without gm"
}

t_clone_hooks_stand_down_in_a_worktree() {
  own_home standdown
  export GM_HALL=$WORK/standdown/hall GM_LAUNCH_AGENTS=$WORK/standdown/LaunchAgents
  desk_ready
  local out
  out=$(clone_hook w1 "$DESK_WT")
  assert_eq "$out" "" "the start-up hook prints nothing" &&
    assert_eq "$(cat "$WORK/hook-rc")" 0 "and exits 0"
  out=$(printf '{}' | (cd "$DESK_WT" && CLAUDE_PROJECT_DIR=$DESK_WT bash "$DESK_WT/bin/gm" hook front-desk --clone 2>&1)) ||
    fail "gm itself failed"
  assert_eq "$out" "" "gm alone says nothing, on stderr either" &&
    assert_eq "$(guard Edit '' "$DESK_WT")" "" "edits are left to Claude Code" &&
    assert_eq "$(guard Write '' "$DESK_WT")" "" "and writes" &&
    assert_eq "$(guard Bash 'bin/gm roster' "$DESK_WT")" "" "and commands, gm too"
  # Nothing at all happened: no link, no Guildhall, no launchd agent, no herdr.
  assert_eq "$(find "$HOME" -mindepth 1 | head -n 3)" "" "nothing in the home"
  [ ! -e "$GM_HALL" ] || fail "a Guildhall was made"
  [ ! -e "$GM_LAUNCH_AGENTS" ] && [ ! -e "$HERDR_STUB/launchctl" ] || fail "launchd was touched"
  [ ! -e "$HERDR_STUB/calls" ] || fail "herdr was called"
  # An existing Guildhall is not touched either, not even migrated.
  mkdir -p "$GM_HALL"
  sqlite3 "$GM_HALL/register.db" <"$ROOT/tests/fixtures/register-schema1.sql"
  cp "$GM_HALL/register.db" "$WORK/standdown/before.db"
  clone_hook w2 "$DESK_WT" >/dev/null
  cmp -s "$GM_HALL/register.db" "$WORK/standdown/before.db" || fail "the register changed"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "the setup was recorded"
}

t_marked_folder_is_the_front_desk() {
  own_home marked
  export GM_HALL=$WORK/marked/hall GM_OTELCOL=$WORK/none
  desk_ready
  local ctx
  printf 'patron\n' >"$DESK_WT/.gm-front-desk"
  ctx=$(hook_context "$(clone_hook m1 "$DESK_WT")")
  rm -f "$DESK_WT/.gm-front-desk"
  assert_contains "$ctx" "The Guildmaster is in herdr tab guildmaster" "a marked worktree is the front desk" &&
    assert_eq "$(readlink "$HOME/.local/bin/gm")" "$DESK_WT/bin/gm" "gm linked from it" &&
    assert_contains "$(cat "$HERDR_STUB/runs")" "cd '$DESK_WT' && env" "and the Guildmaster started in it, in herdr"
}

t_front_desk_guard_binds_only_the_front_desk() {
  own_home guard
  desk_ready
  local out
  for tool in Edit Write NotebookEdit MultiEdit; do
    out=$(guard "$tool" '')
    assert_eq "$(decision "$out")" deny "$tool denied at the front desk" &&
      assert_contains "$out" "a Party Leader's work" "with the reason"
  done
  assert_eq "$(decision "$(guard Bash 'bin/gm roster')")" allow "bin/gm runs without a prompt" &&
    assert_eq "$(decision "$(guard Bash './bin/gm open --repo ~/work/x --ticket CRM-1')")" allow "./bin/gm too" &&
    assert_eq "$(decision "$(guard Bash "bash $DESK_GM list")")" allow "and this gm by its path" &&
    assert_eq "$(decision "$(guard Bash "  $DESK_GM init --later")")" allow "with or without bash"
  # shellcheck disable=SC2016 # commands as the Guildmaster might write them, never expanded here
  for cmd in 'bin/gm roster; rm -rf x' 'bin/gm roster && ls' 'bin/gm roster | sh' 'bin/gm roster > x' \
    'bin/gm $(id)' 'bin/gm `id`' 'bin/gm list
ls' 'bash gm list' 'gm roster' 'ls' 'bash x/bin/gm roster' 'bin/gmx roster'; do
    assert_eq "$(guard Bash "$cmd")" "" "left to Claude Code: $cmd"
  done
  # bin/gm is this gm only in the clone's own folder; plain gm only where it resolves to this one.
  assert_eq "$(printf '%s' "$(json "SELECT json_object('cwd','$WORK','tool_name','Bash','tool_input',json_object('command','bin/gm roster'));")" |
      (cd "$DESK" && CLAUDE_PROJECT_DIR=$DESK bash "$DESK_GM" hook front-desk-guard))" "" "bin/gm elsewhere is another program"
  mkdir -p "$HOME/.local/bin"
  ln -s "$DESK_GM" "$HOME/.local/bin/gm"
  assert_eq "$(decision "$(PATH="$HOME/.local/bin:$PATH" guard Bash 'gm roster')")" allow "gm, linked to this one" &&
    assert_eq "$(guard Read '')" "" "other tools are left alone"
}

t_clone_front_desk_links_gm_once_and_is_silent_on_repeat() {
  own_home clone
  setup clone
  rm -f "$GM_HALL/guild.conf"
  export GM_OTELCOL=$WORK/none
  local out ctx link=$HOME/.local/bin/gm before after
  [ ! -e "$HOME/.local" ] || return 1
  # claude in a terminal outside herdr: the setup is done, and the Guildmaster is started in herdr, not here.
  clone_hook c1 >"$WORK/clone/out"
  out=$(cat "$WORK/clone/out")
  assert_eq "$(cat "$WORK/hook-rc")" 0 "the hook succeeds" &&
    assert_eq "$(json "SELECT json_valid($(sqlq "$out"));")" 1 "the hook prints JSON" &&
    assert_eq "$(json "SELECT json_extract($(sqlq "$out"),'\$.systemMessage') IS NULL;")" 1 "and nothing for the patron's screen"
  [ -L "$link" ] || fail "gm was not linked into ~/.local/bin" || return 1
  assert_eq "$(readlink "$link")" "$DESK_GM" "the link points at this clone's gm"
  ctx=$(hook_context "$out")
  assert_contains "$ctx" "You are not the Guildmaster. The Guildmaster always lives in herdr, in tab guildmaster of workspace guild" "this session is not the front desk" &&
    assert_contains "$ctx" "started outside herdr, does not act for the guild" "and knows why" &&
    assert_contains "$ctx" '"The Guildmaster is in herdr tab guildmaster; open it with: herdr --session gm-test"' "its one line for the patron" &&
    assert_not_contains "$ctx" "<charter>" "no charter for it" &&
    assert_eq "$(desk_runs)" 1 "the Guildmaster started in herdr" &&
    assert_eq "$(pl_runs)" 1 "and the Party Leader" &&
    assert_contains "$(cat "$HERDR_STUB/runs")" "cd '$DESK' && env" "the Guildmaster's claude runs in the clone"
  [ -n "$(sed -n 's/^initialized: //p' "$GM_HALL/guild.conf")" ] || fail "the first run was not recorded"
  [ -z "$(sed -n 's/^collector-offered: //p' "$GM_HALL/guild.conf")" ] || fail "the collector was offered outside the front desk"
  if [ "$(uname -s)" = Darwin ]; then
    assert_eq "$(bootstraps)" 1 "autostart loaded once" &&
      assert_contains "$(cat "$GM_LAUNCH_AGENTS"/com.guildmaster.up.*.plist)" "<key>PATH</key><string>$HOME/.local/bin:" "the agent's PATH has ~/.local/bin"
  fi
  # Again, three at once and then once more: nothing linked, started or loaded again, and gm says nothing on stderr.
  before=$(ls -li "$link")
  clone_hook c2 >/dev/null &
  clone_hook c3 >/dev/null &
  clone_hook c4 >/dev/null &
  wait
  out=$(clone_hook_bare c5)
  after=$(ls -li "$link")
  assert_eq "$after" "$before" "the link is left as it is" &&
    assert_eq "$(cat "$WORK/hook-err")" "" "silent on repeat" &&
    assert_contains "$(hook_context "$out")" "You are not the Guildmaster" "still not the front desk" &&
    assert_eq "$(desk_runs)" 1 "one Guildmaster, ever" &&
    assert_eq "$(pl_runs)" 1 "one Party Leader, ever"
  [ "$(uname -s)" != Darwin ] || assert_eq "$(bootstraps)" 1 "autostart loaded once"
  # The Guildmaster's own start, in its herdr pane: its charter, the setup and the roster.
  ctx=$(hook_context "$(front_desk_hook g1)")
  assert_contains "$ctx" "You are the Guildmaster, at the front desk: this Claude Code session, in herdr's guildmaster tab of workspace guild" "the session in herdr is the front desk" &&
    assert_contains "$ctx" "<charter>
# Guildmaster charter" "with the patron's charter" &&
    assert_contains "$ctx" "/.local/bin is not on the patron's PATH" "where ~/.local/bin is not on the PATH, the Guildmaster knows" &&
    assert_contains "$ctx" "Run gm as: bin/gm" "and runs the clone's gm" &&
    assert_contains "$ctx" "first-run check passed" "the first-run check" &&
    assert_contains "$ctx" "init --yes" "the collector offered, at the front desk only" &&
    assert_contains "$ctx" "appt-v2                  party leader  alive" "the Party Leader" &&
    assert_contains "$ctx" "guildmaster              front desk    alive" "the roster's front desk" &&
    assert_not_contains "$ctx" "Done just now by gm (routine; do not mention it unless asked):" "nothing done when all is running" &&
    assert_eq "$(desk_runs)" 1 "nothing started" &&
    assert_eq "$(cat "$WORK/hook-err")" "" "silently"
  # With ~/.local/bin on the PATH, the Guildmaster runs plain gm.
  ctx=$(PATH="$HOME/.local/bin:$PATH" hook_context "$(PATH="$HOME/.local/bin:$PATH" front_desk_hook g2)")
  assert_contains "$ctx" "Run gm as: gm
" "gm on the PATH" &&
    assert_not_contains "$ctx" "not on the patron's PATH" "and nothing said about the PATH"
}

t_clone_front_desk_never_clobbers_a_foreign_gm() {
  own_home foreign
  export GM_HALL=$WORK/foreign/hall
  mkdir -p "$HOME/.local/bin" "$WORK/foreign/other"
  local link=$HOME/.local/bin/gm ctx
  printf '#!/bin/sh\necho mine\n' >"$link"
  # Outside herdr, then at the Guildmaster's own start in herdr, which hears about it.
  clone_hook >/dev/null
  ctx=$(hook_context "$(front_desk_hook)")
  assert_eq "$(cat "$link")" "#!/bin/sh
echo mine" "a gm of the patron's own is kept" &&
    assert_contains "$ctx" "A different gm is at ~/.local/bin/gm (a file of its own), left as it is; you run this one as bin/gm" "and the Guildmaster knows"
  rm -f "$link"
  ln -s "$WORK/foreign/other/gm" "$link"
  printf 'x\n' >"$WORK/foreign/other/gm"
  ctx=$(hook_context "$(front_desk_hook)")
  assert_eq "$(readlink "$link")" "$WORK/foreign/other/gm" "a link to another gm is kept" &&
    assert_contains "$ctx" "a link to $WORK/foreign/other/gm" "and named"
  rm -f "$WORK/foreign/other/gm"
  clone_hook >/dev/null
  assert_eq "$(readlink "$link")" "$WORK/foreign/other/gm" "so is a broken one" &&
    assert_eq "$(cat "$WORK/hook-rc")" 0 "the hook succeeds"
}

t_clone_front_desk_never_blocks_the_session() {
  own_home noblock
  export GM_HALL=$WORK/noblock/hall
  local out ctx
  # ~/.local/bin cannot be made: said, and the rest goes on.
  printf 'not a folder\n' >"$HOME/.local"
  clone_hook >/dev/null
  ctx=$(hook_context "$(front_desk_hook)")
  assert_eq "$(cat "$WORK/hook-rc")" 0 "a link that cannot be made fails nothing" &&
    assert_contains "$ctx" "gm could not be linked into ~/.local/bin" "and the Guildmaster knows" &&
    assert_contains "$ctx" "first-run check passed" "the rest still ran"
  # gm itself fails (a Guildhall it cannot write): the session still starts, told in one line.
  out=$(GM_HALL=/dev/null/hall clone_hook)
  assert_eq "$(cat "$WORK/hook-rc")" 0 "a failing gm fails nothing" &&
    assert_eq "$(json "SELECT json_valid($(sqlq "$out"));")" 1 "still JSON" &&
    assert_contains "$(hook_context "$out")" "the guild's start-up did not finish" "saying it did not finish" &&
    assert_eq "$(cat "$WORK/hook-err")" "" "nothing on the patron's screen"
  out=$(GM_HALL=/dev/null/hall clone_hook_bare)
  assert_contains "$(hook_context "$out")" "did not finish" "gm alone, too" &&
    assert_eq "$(cat "$WORK/hook-err")" "" "and silently"
  # No gm at all where the settings look for it.
  out=$(printf '{}' | (cd "$WORK" && CLAUDE_PROJECT_DIR=$WORK/nowhere sh -c "$(clone_hook_command)" 2>&1)) || fail "a missing gm failed the hook"
  assert_eq "$out" "" "and printed nothing"
}

t_clone_front_desk_offers_to_install_herdr() {
  own_home offer
  export GM_HALL=$WORK/offer/hall GM_HERDR=$WORK/no-herdr
  local ctx
  ctx=$(GM_BREW=$ROOT/tests/fixtures/launchctl hook_context "$(GM_BREW=$ROOT/tests/fixtures/launchctl clone_hook)")
  assert_contains "$ctx" "herdr is not installed" "the Guildmaster is told" &&
    assert_contains "$ctx" "Shall I install it now with Homebrew (brew install herdr)?" "to offer it in one line" &&
    assert_contains "$ctx" "Only on the patron's yes, run bin/gm install herdr" "only on a yes" &&
    assert_not_contains "$ctx" "required pieces are missing" "herdr is offered, not demanded"
  [ -L "$HOME/.local/bin/gm" ] || fail "gm was not linked first"
  [ ! -e "$GM_HALL/guild.conf" ] || fail "the setup was recorded without herdr"
  ctx=$(GM_BREW=$WORK/no-brew hook_context "$(GM_BREW=$WORK/no-brew clone_hook)")
  assert_contains "$ctx" "with herdr's official installer (curl -fsSL https://herdr.dev/install.sh | sh)" "without Homebrew, the official installer"
}

t_install_herdr_with_homebrew_or_the_official_installer() {
  own_home install
  export GM_HALL=$WORK/install/hall
  mkdir -p "$WORK/install"
  local out brew=$WORK/install/brew installer=$WORK/install/install.sh
  # A copy keeps the stub's executable mode; its text is then replaced.
  cp "$ROOT/tests/fixtures/launchctl" "$brew"
  printf '#!/bin/sh\nprintf "%%s\\n" "$*" >>"%s/brew-calls"\n' "$WORK/install" >"$brew"
  printf 'printf "ran\\n" >>"%s/installer-ran"\n' "$WORK/install" >"$installer"
  out=$(GM_BREW=$brew gm install herdr 2>&1) || fail "already installed failed"
  assert_contains "$out" "herdr is already installed" "nothing to do when herdr is there"
  [ ! -e "$WORK/install/brew-calls" ] || fail "brew ran for an installed herdr"
  # The stub stands in for the herdr the installer would put on the PATH.
  out=$(GM_HERDR=herdr-not-yet GM_BREW=$brew gm install herdr 2>&1) || fail "install with Homebrew failed: $out"
  assert_eq "$(cat "$WORK/install/brew-calls" 2>/dev/null)" "install herdr" "brew install herdr" &&
    assert_contains "$out" "herdr is installed with Homebrew, at $ROOT/tests/fixtures/herdr; the guild is set up, and the Guildmaster is in herdr tab guildmaster: open it with: herdr --session gm-test." "says so in one line" &&
    assert_eq "$(desk_runs)" 1 "and the Guildmaster started in herdr"
  [ -n "$(sed -n 's/^initialized: //p' "$GM_HALL/guild.conf")" ] || fail "the setup was not finished"
  [ "$(uname -s)" != Darwin ] || assert_eq "$(bootstraps)" 1 "and autostart turned on"
  out=$(GM_HERDR=herdr-not-yet GM_BREW=$WORK/no-brew GM_HERDR_INSTALLER="file://$installer" gm install herdr 2>&1) || fail "the official installer failed: $out"
  assert_eq "$(cat "$WORK/install/installer-ran" 2>/dev/null)" ran "without Homebrew, herdr's official installer ran" &&
    assert_contains "$out" "herdr is installed with herdr's official installer" "and says so" &&
    assert_eq "$(desk_runs)" 1 "a running Guildmaster left as it is"
  out=$(GM_HERDR=herdr-not-yet GM_BREW=$WORK/no-brew GM_HERDR_INSTALLER="file://$WORK/install/missing.sh" gm install herdr 2>&1) && fail "a failed download succeeded"
  assert_contains "$out" "failed; nothing else was changed" "a failure says so"
}

# herdr_tab <label>: a tab of the test's own in the guild's workspace, as the patron would open one; prints its
# workspace, tab and pane, tab-separated.
herdr_tab() {
  local out
  out=$("$ROOT/tests/fixtures/herdr" tab create --workspace "$(db "SELECT workspace_id FROM endpoint WHERE key='front-desk';")" \
    --cwd "$WORK" --label "$1" --no-focus --session gm-test)
  json "SELECT json_extract(j,'\$.result.tab.workspace_id')||char(9)||json_extract(j,'\$.result.tab.tab_id')||char(9)||json_extract(j,'\$.result.root_pane.pane_id') FROM (SELECT $(sqlq "$out") AS j);"
}

t_clone_front_desk_lives_in_herdr() {
  own_home inherdr
  setup inherdr
  initialized
  local ctx ws tab pane fd
  # From a terminal outside herdr: the Guildmaster and the Party Leader are started in herdr.
  clone_hook >/dev/null
  fd=$(db "SELECT pane_id FROM endpoint WHERE key='front-desk';")
  assert_eq "$(desk_runs)" 1 "the Guildmaster in herdr" &&
    assert_eq "$(pl_runs)" 1 "the Party Leader up" &&
    assert_eq "$(roster_state guildmaster)" alive "the roster's front desk"
  # The launchd agent's muster keeps both running, like any Party Leader.
  stub_proc "$fd" shell
  stub_proc "$(pl_pane appt-v2)" shell
  gm up --quiet >/dev/null 2>&1 || fail "gm up --quiet failed"
  assert_eq "$(desk_runs)" 2 "the Guildmaster came back" &&
    assert_eq "$(pl_runs)" 2 "and the Party Leader" &&
    assert_eq "$(db "SELECT pane_id FROM endpoint WHERE key='front-desk';")" "$fd" "in its own pane"
  # Never two: claude again outside herdr, in another tab of the guild, or in another herdr session, while the
  # Guildmaster runs, starts nothing and is pointed at it.
  clone_hook >/dev/null
  IFS=$'\t' read -r ws tab pane <<<"$(herdr_tab other)"
  stub_proc "$pane" claude
  ctx=$(hook_context "$(in_pane "$ws" "$tab" "$pane")")
  assert_contains "$ctx" "started in another herdr tab, does not act for the guild" "another tab is not the front desk" &&
    assert_contains "$ctx" '"The Guildmaster is in herdr tab guildmaster; switch to it in herdr"' "and points to it" &&
    assert_eq "$(db "SELECT pane_id FROM endpoint WHERE key='front-desk';")" "$fd" "the front desk stays where it is"
  ctx=$(hook_context "$(in_pane w1 w1:t1 "$fd" s1 another)")
  assert_contains "$ctx" "started in another herdr session (another)" "another herdr session is not either" &&
    assert_contains "$ctx" "open it with: herdr --session gm-test" "and is told how to get there" &&
    assert_eq "$(desk_runs)" 2 "nothing started"
  # With the Guildmaster gone, claude started in a tab of the guild's workspace becomes the front desk there.
  stub_proc "$fd" shell
  ctx=$(hook_context "$(in_pane "$ws" "$tab" "$pane")")
  assert_contains "$ctx" "You are the Guildmaster, at the front desk" "that tab is the front desk" &&
    assert_eq "$(db "SELECT pane_id FROM endpoint WHERE key='front-desk';")" "$pane" "recorded as its endpoint" &&
    assert_eq "$(awk -F '\t' -v t="$tab" '$1 == t { print $3 }' "$HERDR_STUB/tabs")" guildmaster "its tab named for it" &&
    assert_eq "$(desk_runs)" 2 "and no second one started"
  gm up --quiet >/dev/null 2>&1
  assert_eq "$(desk_runs)" 2 "the muster keeps that one" &&
    assert_eq "$(roster_state guildmaster)" alive "alive"
  # A guild.conf from when the front desk could be the patron's own session is ignored: it is in herdr.
  printf 'front-desk: clone\n' >>"$GM_HALL/guild.conf"
  stub_proc "$pane" shell
  gm up --quiet >/dev/null 2>&1
  assert_eq "$(desk_runs)" 3 "the Guildmaster is started again in herdr"
}

# ---- guild.conf, and the tracing collector the muster keeps running ----

conf() { sed -n "s/^$1: //p" "$GM_HALL/guild.conf"; }

# Launch lines typed for the collector, and the collector's recorded pane.
coll_runs() { grep -c "start 'collector'" "$HERDR_STUB/runs" 2>/dev/null || true; }
coll_pane() { db "SELECT pane_id FROM endpoint WHERE key='collector';"; }

# otlp_listener <port>: something on 127.0.0.1:<port> that answers every OTLP export with 200, as a running collector
# would. stop_listeners stops it; the suite stops any left at its end.
otlp_listener() {
  local i=0
  (while :; do printf 'HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n' | nc -l 127.0.0.1 "$1" >/dev/null 2>&1 || sleep 0.1; done) &
  printf '%s %s\n' "$!" "$1" >>"$WORK/listeners"
  printf '{"resourceLogs":[]}' >"$WORK/empty-logs.json"
  while [ "$i" -lt 50 ] && [ "$(post_otlp "$1" /v1/logs "$WORK/empty-logs.json")" != 200 ]; do
    sleep 0.1
    i=$((i + 1))
  done
}

stop_listeners() {
  local pid port
  while read -r pid port; do
    kill "$pid" 2>/dev/null
    pkill -f "nc -l 127.0.0.1 $port" 2>/dev/null
  done <"$WORK/listeners"
  : >"$WORK/listeners"
}
: >"$WORK/listeners"

t_config_file_is_documented_and_read() {
  export GM_HALL=$WORK/conf/hall
  local out k
  out=$(gm config set collector-port 4999) || fail "set failed: $out"
  assert_contains "$out" "collector-port is 4999" "it says what it set"
  [ -f "$GM_HALL/guild.conf" ] || fail "no guild.conf" || return 1
  for k in collector collector-port telemetry chat veil veil-hides sprites sprites-guildmaster sprites-party-leader \
    idle-guildmaster idle-party-leader welcome welcome-art-guildmaster welcome-art-party-leader welcome-art-size welcome-fold \
    tutorial autostart autostart-every muster-before-commands attach herdr-session \
    herdr-workspace launch-grace start-tries repo-roots editor; do
    grep -q "^# $k: " "$GM_HALL/guild.conf" || fail "guild.conf does not document $k"
  done
  assert_eq "$(conf collector-port)" 4999 "the line written"
  out=$(gm config)
  assert_contains "$out" "Settings, from $GM_HALL/guild.conf" "where they are" &&
    assert_contains "$out" "  collector-port          4999      guild.conf" "a setting from the file, with its source" &&
    assert_contains "$out" "  telemetry               on        default" "a default" &&
    assert_contains "$out" "  collector               off       default (not decided yet)" "the collector, undecided" &&
    assert_contains "$out" "  repo-roots              (the usual source folders) default" "a setting with no default value"
  assert_eq "$(gm config get collector-port)" 4999 "get prints the value"
  assert_contains "$(GM_OTELCOL=$WORK/none gm doctor 2>&1 || true)" "telemetry endpoint http://127.0.0.1:4999 is loopback" "gm uses it"
  # A value gm cannot take keeps the default, and both gm config and gm doctor say so.
  printf 'start-tries: soon\n' >>"$GM_HALL/guild.conf"
  assert_contains "$(gm config)" "  start-tries             3         ignored: guild.conf says 'soon'" "a bad value is ignored" &&
    assert_contains "$(GM_OTELCOL=$WORK/none gm doctor 2>&1 || true)" "warn  guild.conf: start-tries" "and doctor warns"
  out=$(gm config set collector-port 99999 2>&1) && fail "a port out of range was taken"
  assert_contains "$out" "collector-port cannot be '99999' (<port>)" "refused, with what it takes"
  out=$(gm config set autostart maybe 2>&1) && fail "an on/off setting took maybe"
  assert_contains "$out" "autostart cannot be 'maybe' (on | off)" "refused"
  out=$(gm config set colour blue 2>&1) && fail "an unknown setting was taken"
  assert_contains "$out" "no setting named 'colour'; the settings are: collector collector-port" "refused, naming the settings"
  gm config set telemetry no >/dev/null
  assert_eq "$(conf telemetry)" off "plain words are taken: no is off"
  gm config unset collector-port >/dev/null
  assert_eq "$(conf collector-port)" "" "unset removes the line" &&
    assert_eq "$(gm config get collector-port)" 4318 "and the default holds"
  gm config set repo-roots "$WORK/a" "$WORK/b" >/dev/null
  assert_eq "$(conf repo-roots)" "$WORK/a $WORK/b" "several folders"
  out=$(gm config set editor open -a Zed)
  assert_eq "$(conf editor)" "open -a Zed" "the editor, a command with its arguments" &&
    assert_contains "$out" "the spyglass opens a changed file with it" "says what it does"
  # --json: every setting, for the spyglass, read back by sqlite3.
  gm config --json >"$WORK/conf/settings.json"
  local q="SELECT value->>'value'||' | '||(value->>'source')||' | '||(value->'choices')||' | '||(value->>'isMulti') FROM json_each(readfile('$WORK/conf/settings.json')) WHERE value->>'key'="
  assert_eq "$(sqlite3 :memory: "SELECT json_array_length(readfile('$WORK/conf/settings.json'));")" "$(gm config | grep -c '^  ')" "every setting gm config shows" &&
    assert_eq "$(sqlite3 :memory: "$q'editor';")" "open -a Zed | guild.conf | [] | 0" "a command, from the file" &&
    assert_eq "$(sqlite3 :memory: "$q'telemetry';" | cut -d '|' -f 3)" ' ["on","off"] ' "a switch, its two values" &&
    assert_eq "$(sqlite3 :memory: "$q'veil-hides';")" "deeds adventurers notes progress | default | [\"deeds\",\"adventurers\",\"notes\",\"progress\"] | 1" "words, several at once" &&
    assert_eq "$(GM_TELEMETRY=off gm config --json >"$WORK/conf/settings.json"; sqlite3 :memory: "$q'telemetry';" | cut -d '|' -f 2)" \
      " environment (GM_TELEMETRY) " "and where a value came from"
  grep -q '^# collector: on | off | later, default off; GM_COLLECTOR overrides it' "$GM_HALL/guild.conf" ||
    fail "the documentation is kept through every write"
}

t_config_environment_overrides_the_file() {
  setup conf-env
  initialized
  local out f=$WORK/conf-env/env.txt
  gm config set telemetry off >/dev/null
  assert_contains "$(gm config)" "  telemetry               off       guild.conf" "from the file"
  assert_contains "$(GM_TELEMETRY=on gm config)" "  telemetry               on        environment (GM_TELEMETRY)" "the environment overrides it"
  out=$(GM_TELEMETRY=on gm config set telemetry off)
  assert_contains "$out" "GM_TELEMETRY=on is set in this environment, and overrides it" "set says so"
  # A setting from the file reaches gm and what it starts: the herdr session from guild.conf alone, and telemetry off.
  gm config set herdr-session gm-test >/dev/null
  (
    unset GM_HERDR_SESSION
    GM_CLAUDE=$FAKE gm open appt-v2 >/dev/null 2>&1 || fail "open failed"
    assert_eq "$(roster_state appt-v2)" alive "the Party Leader runs, in the session guild.conf names"
    assert_not_contains "$(grep "start 'guildmaster'" "$HERDR_STUB/runs" | tail -n 1)" "GM_HERDR_SESSION" \
      "a setting from the file is not pinned on the Guildmaster's line"
    line=$(grep "start 'appt-v2'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)
    assert_not_contains "$line" "GM_TELEMETRY" "nor on a Party Leader's"
    env GM_FAKE_CLAUDE_ENV="$f" sh -c "$line" </dev/null >/dev/null 2>&1
    assert_not_contains "$(cat "$f")" "CLAUDE_CODE_ENABLE_TELEMETRY" "the pane's gm reads telemetry: off from guild.conf"
  ) || return 1
  # One given in the environment is pinned, as before.
  stub_proc "$(pl_pane appt-v2)" shell
  stub_proc "$(db "SELECT pane_id FROM endpoint WHERE key='front-desk';")" shell
  GM_TELEMETRY=on GM_CLAUDE=$FAKE gm up >/dev/null 2>&1
  assert_contains "$(grep "start 'guildmaster'" "$HERDR_STUB/runs" | tail -n 1)" "GM_HERDR_SESSION='gm-test'" "the environment's session is" &&
    assert_contains "$(grep "start 'appt-v2'" "$HERDR_STUB/runs" | tail -n 1)" "GM_TELEMETRY='on'" "and its telemetry"
}

t_config_chat_starts_sessions_with_the_guild_chat_mod() {
  setup conf-chat
  initialized
  local out line f=$WORK/conf-chat/env.txt
  assert_contains "$(gm config)" "  chat                    banners   default" "on for everyone unless the patron turns it off"
  out=$(gm config set chat maybe 2>&1) && fail "chat took maybe"
  assert_contains "$out" "chat cannot be 'maybe' (off | banners)" "refused, with what it takes"
  # By default the Guildmaster and each Party Leader load the mod from the clone, a Party Leader told its focus.
  GM_CLAUDE=$FAKE gm open appt-v2 >/dev/null 2>&1 || fail "open failed"
  line=$(grep "start 'appt-v2'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)
  env GM_CHAT_FOCUS=stray GM_FAKE_CLAUDE_ENV="$f" sh -c "$line" </dev/null >"$WORK/conf-chat/start.out" 2>&1 || cat "$WORK/conf-chat/start.out" >&2
  assert_eq "$(cat "$f.args")" "--name
appt-v2
--plugin-dir
$ROOT/mods/guild-chat
--plugin-dir
$ROOT/mods/guild-spyglass
--plugin-dir
$ROOT/mods/paste-viewer" "claude --name <focus> --plugin-dir <each mod>" &&
    assert_contains "$(cat "$f")" "GM_CHAT=banners" "the mod is told the style" &&
    assert_contains "$(cat "$f")" "GM_CHAT_FOCUS=appt-v2" "and the focus, not a stray one"
  line=$(grep "start 'guildmaster'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)
  env GM_CHAT_FOCUS=stray GM_FAKE_CLAUDE_ENV="$f.desk" sh -c "$line" </dev/null >/dev/null 2>&1
  assert_eq "$(cat "$f.desk.args")" "--name
guildmaster" "the Guildmaster loads it too, from the clone's .claude/skills, with no second copy" &&
    assert_contains "$(cat "$f.desk")" "GM_CHAT=banners" "and is told the style" &&
    assert_not_contains "$(cat "$f.desk")" "GM_CHAT_FOCUS=" "as the front desk, with no focus"
  env GM_CHAT=no GM_FAKE_CLAUDE_ENV="$f.no" sh -c "$(grep "start 'appt-v2'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)" </dev/null >/dev/null 2>&1
  assert_contains "$(cat "$f.no")" "GM_CHAT=off" "GM_CHAT=no in the environment is off too"
  out=$(gm config set chat off)
  assert_contains "$out" "chat is off: the Guildmaster and Party Leaders started from now on draw Claude Code's own chat" "says what it does"
  # chat: off still gives every session the mod, which carries the veil and /veil, and tells it to draw no banners.
  env GM_FAKE_CLAUDE_ENV="$f.off" sh -c "$(grep "start 'appt-v2'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)" </dev/null >/dev/null 2>&1
  assert_eq "$(cat "$f.off.args")" "--name
appt-v2
--plugin-dir
$ROOT/mods/guild-chat
--plugin-dir
$ROOT/mods/guild-spyglass
--plugin-dir
$ROOT/mods/paste-viewer" "chat: off starts a Party Leader with the mod too" &&
    assert_contains "$(cat "$f.off")" "GM_CHAT=off" "told to draw Claude Code's own chat" &&
    assert_contains "$(cat "$f.off")" "GM_CHAT_FOCUS=appt-v2" "with its focus"
  env GM_FAKE_CLAUDE_ENV="$f.desk-off" sh -c "$(grep "start 'guildmaster'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)" </dev/null >/dev/null 2>&1
  assert_contains "$(cat "$f.desk-off")" "GM_CHAT=off" "and the Guildmaster, from its own .claude/skills"
  out=$(gm config set chat on)
  assert_eq "$(conf chat)" banners "on is the one style there is: banners" &&
    assert_contains "$out" "chat is banners: the Guildmaster and Party Leaders started from now on draw their chat under heraldic banners" "and back"
  for mod in guild-chat guild-spyglass paste-viewer; do
    [ -f "$ROOT/mods/$mod/.claude-plugin/plugin.json" ] && [ -f "$ROOT/mods/$mod/hooks/register.tsx" ] &&
      [ -f "$ROOT/.claude/skills/$mod/.claude-plugin/plugin.json" ] || fail "the mod $mod gm loads is not in the clone"
  done
}

t_config_veil_and_what_it_hides() {
  export GM_HALL=$WORK/conf-veil/hall
  local out
  out=$(gm config)
  assert_contains "$out" "  veil                    off       default" "the veil is lifted unless the patron draws it" &&
    assert_contains "$out" "  veil-hides              deeds adventurers notes progress default" "and hides all four kinds"
  out=$(gm config set veil on)
  assert_eq "$(conf veil)" on "veil: on written" &&
    assert_contains "$out" "veil is on: the veil is drawn over deeds adventurers notes progress; running sessions follow at their next turn, or at once with /veil refresh" "says what it does"
  grep -q '^# veil: on | off, default off$' "$GM_HALL/guild.conf" ||
    fail "guild.conf documents veil, with no variable for it"
  grep -q '^# veil-hides: deeds adventurers notes progress, any of them, default deeds adventurers notes progress$' "$GM_HALL/guild.conf" ||
    fail "guild.conf documents veil-hides, with no variable for it"
  out=$(gm config set veil maybe 2>&1) && fail "veil took maybe"
  assert_contains "$out" "veil cannot be 'maybe' (on | off)" "refused, with what it takes"
  out=$(gm config set veil-hides deeds notes)
  assert_eq "$(conf veil-hides)" "deeds notes" "several kinds, as words" &&
    assert_contains "$out" "veil-hides is deeds notes" "says so"
  gm config set veil-hides "progress  progress" >/dev/null
  assert_eq "$(conf veil-hides)" progress "a kind named twice is kept once"
  out=$(gm config set veil-hides deeds everything 2>&1) && fail "veil-hides took everything"
  assert_contains "$out" "veil-hides cannot be 'deeds everything' (deeds adventurers notes progress)" "refused, naming the kinds" &&
    assert_eq "$(conf veil-hides)" progress "and the setting kept"
  out=$(gm config set veil-hides '*' 2>&1) && fail "veil-hides took a pattern"
  gm config set veil off >/dev/null
  assert_contains "$(gm config set veil off)" "veil is off: the veil is lifted" "lifted"
  # A value gm cannot take is ignored: the veil reads as off, veil-hides as all four.
  printf 'veil: perhaps\n' >"$GM_HALL/guild.conf"
  printf 'veil-hides: rubbish\n' >>"$GM_HALL/guild.conf"
  out=$(gm config)
  assert_contains "$out" "  veil                    off       ignored: guild.conf says 'perhaps'" "a bad veil is off" &&
    assert_contains "$out" "  veil-hides              deeds adventurers notes progress ignored: guild.conf says 'rubbish'" "a bad veil-hides is all four"
}

t_config_working_sprites() {
  export GM_HALL=$WORK/conf-sprites/hall
  local out
  out=$(gm config)
  assert_contains "$out" "  sprites                 on        default" "the sprites are on unless the patron turns them off" &&
    assert_contains "$out" "  sprites-guildmaster     quill     default" "the Guildmaster writes with the quill" &&
    assert_contains "$out" "  sprites-party-leader    skirmish delve boss siege forge wall default" "a Party Leader fights and builds" &&
    assert_contains "$out" "  idle-guildmaster        campfire  default" "the Guildmaster waits by the campfire" &&
    assert_contains "$out" "  idle-party-leader       none      default" "a Party Leader waits with nothing drawn"
  out=$(gm config set sprites off)
  assert_eq "$(conf sprites)" off "sprites: off written" &&
    assert_contains "$out" "sprites is off: no session draws a working sprite; running sessions follow at their next turn" "says what it does"
  grep -q '^# sprites-party-leader: skirmish delve boss siege forge wall quill campfire, any of them, or none, default skirmish delve boss siege forge wall$' \
    "$GM_HALL/guild.conf" || fail "guild.conf documents sprites-party-leader"
  out=$(gm config set sprites-party-leader forge wall forge)
  assert_eq "$(conf sprites-party-leader)" "forge wall" "several sprites, as words, each kept once" &&
    assert_contains "$out" "sprites-party-leader is forge wall: running sessions follow at their next turn" "says so"
  gm config set idle-party-leader campfire >/dev/null
  assert_eq "$(conf idle-party-leader)" campfire "a Party Leader can wait by the fire too"
  gm config set idle-guildmaster none >/dev/null
  assert_eq "$(conf idle-guildmaster)" none "none draws nothing"
  out=$(gm config set sprites-guildmaster quill dragon 2>&1) && fail "sprites-guildmaster took a dragon"
  assert_contains "$out" "sprites-guildmaster cannot be 'quill dragon' (skirmish delve boss siege forge wall quill campfire" "refused, naming the sprites"
  out=$(gm config set idle-guildmaster none campfire 2>&1) && fail "none took company"
  printf 'sprites-guildmaster: rubbish\n' >>"$GM_HALL/guild.conf"
  assert_contains "$(gm config)" "  sprites-guildmaster     quill     ignored: guild.conf says 'rubbish'" "a bad list keeps the default"
}

t_config_moves_setup_conf_into_guild_conf() {
  export GM_HALL=$WORK/conf-migrate/hall
  mkdir -p "$GM_HALL"
  printf '%s\n' "# Guildmaster first-run setup, written by gm init. Plain text: edit it, or run gm init again." \
    "initialized: 2026-01-01T00:00:00Z" "collector: installed" "collector-path: /opt/otel/otelcol-contrib" "autostart: off" \
    "repo-roots: /src /work" >"$GM_HALL/setup.conf"
  printf '{}' | gm hook session-end >/dev/null 2>&1
  [ -f "$GM_HALL/setup.conf" ] && [ ! -e "$GM_HALL/guild.conf" ] || fail "a hook moved the settings"
  assert_eq "$(gm config get collector)" on "read from setup.conf until then: installed is on"
  [ ! -e "$GM_HALL/setup.conf" ] && [ -f "$GM_HALL/setup.conf.old" ] || fail "setup.conf was not moved aside" || return 1
  assert_eq "$(conf collector)" on "installed became on" &&
    assert_eq "$(conf initialized)" 2026-01-01T00:00:00Z "the first run kept" &&
    assert_eq "$(conf collector-path)" /opt/otel/otelcol-contrib "where gm put the collector kept" &&
    assert_eq "$(conf autostart)" off "autostart kept" &&
    assert_eq "$(conf repo-roots)" "/src /work" "repo-roots kept"
  grep -q '^# collector-port: <port>, default 4318; GM_OTEL_PORT overrides it' "$GM_HALL/guild.conf" || fail "no documentation"
  assert_not_contains "$(cat "$GM_HALL/guild.conf")" "first-run setup, written by gm init" "the old header is gone"
  assert_contains "$(gm config)" "  autostart               off       guild.conf" "gm config reads it"
  # Should setup.conf come back beside it, guild.conf keeps its own lines and takes only what it lacks.
  printf 'autostart: on\nstart-tries: 5\n' >"$GM_HALL/setup.conf"
  gm list >/dev/null 2>&1
  assert_eq "$(conf autostart)" off "guild.conf's own line kept" &&
    assert_eq "$(conf start-tries)" 5 "a key it lacked taken"
  [ ! -e "$GM_HALL/setup.conf" ] || fail "setup.conf left beside guild.conf"
  # The old answers still read in guild.conf, written by hand.
  sed -i.bak 's/^collector: on$/collector: skipped/' "$GM_HALL/guild.conf"
  assert_eq "$(gm config get collector)" off "skipped is off"
}

t_collector_is_kept_running_by_the_muster() {
  setup coll
  initialized
  export GM_OTELCOL=$FAKE GM_OTEL_PORT=1
  local out pane pane2 ctx line f=$WORK/coll/env.txt
  gm up >/dev/null 2>&1
  out=$(gm config set collector on) || fail "set failed: $out"
  pane=$(coll_pane)
  [ -n "$pane" ] || fail "no collector pane recorded" || return 1
  assert_eq "$out" "collector is on: gm keeps the tracing collector running in herdr tab collector, on 127.0.0.1:1; Party Leaders started from now on send to it." "one line says so" &&
    assert_eq "$(awk -F '\t' -v t="$(db "SELECT tab_id FROM endpoint WHERE key='collector';")" '$1 == t { print $2"/"$3 }' "$HERDR_STUB/tabs")" \
      "$(db "SELECT workspace_id FROM endpoint WHERE key='front-desk';")/collector" "in a tab of its own in the guild's workspace" &&
    assert_eq "$(coll_runs)" 1 "started once" &&
    assert_contains "$(cat "$HERDR_STUB/runs")" "start 'collector' --pane '$pane'" "its pane runs gm start collector" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='collector.launched';")" 1 "one ledger row"
  # The pane's line runs the collector with its configuration, on loopback.
  line=$(grep "start 'collector'" "$HERDR_STUB/runs" | tail -n 1 | cut -f 2)
  env GM_FAKE_CLAUDE_ENV="$f" sh -c "$line" </dev/null >/dev/null 2>&1
  assert_eq "$(cat "$f.args")" "--config
$ROOT/templates/otelcol.yaml" "otelcol-contrib --config templates/otelcol.yaml" &&
    assert_contains "$(cat "$f")" "GM_OTEL_PORT=1" "on the port" &&
    assert_contains "$(cat "$f")" "GM_HALL=$GM_HALL" "writing under the Guildhall"
  out=$(gm start collector --pane w9:p9 2>&1) && fail "gm start collector ran in another pane"
  assert_contains "$out" "runs only in the collector's own herdr pane" "and says why"
  # Alive: a check says nothing, writes nothing and starts nothing.
  assert_eq "$(gm up --quiet 2>&1)" "" "the agent's muster is silent" &&
    assert_eq "$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)" "" "so is the one before a command" &&
    assert_eq "$(coll_runs)" 1 "and starts no second copy" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind LIKE 'collector.%';")" 1 "a check writes no row"
  assert_contains "$(gm roster)" "collector                collector     alive    $pane    running on 127.0.0.1:1" "the roster shows it" &&
    assert_contains "$(gm up 2>&1)" "collector: already running (running on 127.0.0.1:1), left as it is" "gm up by hand says it"
  # Dead: started again once, in its own pane, with nothing said.
  stub_proc "$pane" shell
  assert_eq "$(gm up --quiet 2>&1)" "" "a restart is silent" &&
    assert_eq "$(runs_in "$pane")" 2 "in its own pane" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='collector.launched';")" 2 "one more ledger row"
  gm up --quiet >/dev/null 2>&1
  stub_proc "$pane" shell
  assert_eq "$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)" "" "before a command too" &&
    assert_eq "$(runs_in "$pane")" 3 "started again"
  gm up --quiet >/dev/null 2>&1
  # Missing: a new tab.
  stub_close "$pane"
  gm up --quiet >/dev/null 2>&1
  gm up --quiet >/dev/null 2>&1
  pane2=$(coll_pane)
  [ "$pane2" != "$pane" ] && [ "$(runs_in "$pane2")" = 1 ] || fail "a gone pane was not replaced ($pane2)"
  # Three musters at once start it once.
  stub_proc "$pane2" shell
  db "UPDATE endpoint SET launched_ms=0;"
  : >"$HERDR_STUB/runs"
  export GM_LAUNCH_GRACE=600
  gm up --quiet >/dev/null 2>&1 &
  gm up --quiet >/dev/null 2>&1 &
  GM_INTERACTIVE=1 gm list >/dev/null 2>&1 &
  wait
  assert_eq "$(coll_runs)" 1 "three musters at once start it once"
  export GM_LAUNCH_GRACE=0
  # The Guildmaster knows, and is told nothing routine about it.
  ctx=$(hook_context "$(front_desk_hook)")
  assert_contains "$ctx" "tracing collector on: gm keeps it running in herdr tab collector (routine" "the Guildmaster's setup line" &&
    assert_contains "$ctx" "config set <key> <value> (never edit the file yourself)" "and how it changes a setting" &&
    assert_not_contains "$ctx" "Tell the patron, once" "nothing to tell"
  out=$(gm open collector --repo "$REPO" --no-launch 2>&1) && fail "a focus took the collector's name"
  assert_contains "$out" "collector is the tracing collector's tab" "refused"
}

t_collector_failure_says_one_line_a_day() {
  setup coll-fail
  initialized
  export GM_OTELCOL=$FAKE GM_OTEL_PORT=1
  local out
  gm up >/dev/null 2>&1
  printf 'shell' >"$HERDR_STUB/run-proc-collector"
  gm config set collector on >/dev/null
  assert_eq "$(gm up --quiet 2>&1)$(gm up --quiet 2>&1)" "" "a failed start is tried again, silently"
  assert_eq "$(coll_runs)" 3 "three tries"
  out=$(gm up --quiet 2>&1)
  assert_eq "$out" "collector: held: the tracing collector failed to start 3 times in a row (dead: the pane holds only a shell); gm tries again in a day, or now with gm config set collector on" "then one line" &&
    assert_eq "$(gm up --quiet 2>&1)" "" "once in the agent's log" &&
    assert_eq "$(coll_runs)" 3 "and no fourth try"
  out=$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)
  assert_contains "$out" "collector: held: the tracing collector failed to start 3 times" "once at a terminal" &&
    assert_eq "$(GM_INTERACTIVE=1 gm list 2>&1 >/dev/null)" "" "and only once"
  assert_eq "$(db "SELECT count(*) FROM event WHERE kind='collector.held';")" 1 "one ledger row for the hold" &&
    assert_eq "$(gm roster | awk '$1 == "collector" { print $3 }')" held "the roster shows it"
  # A day later it is tried again, from the start, and says nothing until it has failed three times more.
  db "UPDATE endpoint SET held_at='2020-01-01T00:00:00.000Z' WHERE key='collector';"
  assert_eq "$(gm up --quiet 2>&1)" "" "tried again a day later, silently" &&
    assert_eq "$(coll_runs)" 4 "once"
  # gm config set collector on tries again at once; started, it runs.
  rm -f "$HERDR_STUB/run-proc-collector"
  gm config set collector on >/dev/null
  assert_eq "$(gm roster | awk '$1 == "collector" { print $3 }')" alive "running"
  gm up --quiet >/dev/null 2>&1
  assert_eq "$(db "SELECT start_attempts||held_told||COALESCE(held_at,'-') FROM endpoint WHERE key='collector';")" "00-" "seen alive, the count starts over"
  # No collector installed is a failure too: silent three times, then one line.
  gm config set collector off >/dev/null
  export GM_OTELCOL=$WORK/none
  : >"$HERDR_STUB/runs"
  gm config set collector on >/dev/null
  assert_eq "$(gm up --quiet 2>&1)$(gm up --quiet 2>&1)" "" "silent while it counts"
  out=$(gm up --quiet 2>&1)
  assert_contains "$out" "collector: held: the tracing collector failed to start 3 times in a row (no OpenTelemetry Collector is installed (gm init --yes installs it))" "then one line saying why" &&
    assert_eq "$(coll_runs)" 0 "nothing was typed into a pane"
}

t_collector_off_runs_nothing() {
  setup coll-off
  initialized
  export GM_OTELCOL=$FAKE GM_OTEL_PORT=1
  local out pane
  gm up >/dev/null 2>&1
  out=$(gm up 2>&1)
  assert_not_contains "$out" "collector" "nothing said, even by gm up"
  assert_eq "$(coll_runs)" 0 "nothing started" &&
    assert_eq "$(db "SELECT count(*) FROM endpoint WHERE key='collector';")" 0 "nothing recorded" &&
    assert_not_contains "$(gm roster)" "collector" "nor listed"
  if awk -F '\t' '$3 == "collector"' "$HERDR_STUB/tabs" | grep -q .; then fail "a collector tab was made"; fi
  # On, then off: stopped, its pane closed, one ledger row; then nothing again.
  gm config set collector on >/dev/null
  pane=$(coll_pane)
  out=$(gm config set collector off)
  assert_eq "$out" "collector is off: gm keeps no collector running, and says nothing about it." "one line says so"
  grep -q "pane close $pane --session gm-test" "$HERDR_STUB/calls" || fail "its pane was not closed"
  assert_eq "$(db "SELECT count(*) FROM endpoint WHERE key='collector';")" 0 "forgotten" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='collector.stopped';")" 1 "one ledger row"
  : >"$HERDR_STUB/runs"
  assert_eq "$(gm up --quiet 2>&1)" "" "silent" &&
    assert_eq "$(coll_runs)" 0 "and nothing started"
  # Turned off by hand in guild.conf, or by GM_COLLECTOR=off: the next muster stops it, silently.
  gm config set collector on >/dev/null
  pane=$(coll_pane)
  sed -i.bak 's/^collector: on$/collector: off/' "$GM_HALL/guild.conf"
  assert_eq "$(gm up --quiet 2>&1)" "" "silent"
  grep -q "pane close $pane --session gm-test" "$HERDR_STUB/calls" || fail "a hand edit did not stop it"
  gm config set collector on >/dev/null
  GM_COLLECTOR=off gm up --quiet >/dev/null 2>&1
  assert_eq "$(db "SELECT count(*) FROM endpoint WHERE key='collector';")" 0 "the environment turns it off too"
}

t_collector_is_never_a_second_copy() {
  command -v nc >/dev/null 2>&1 || { printf '    (nc not installed; skipped)\n'; return 0; }
  setup coll-two
  initialized
  local port=$((40000 + RANDOM % 20000)) out
  export GM_OTELCOL=$FAKE GM_OTEL_PORT=$port
  gm up >/dev/null 2>&1
  otlp_listener "$port"
  out=$(gm config set collector on)
  assert_contains "$out" "a collector already answers on 127.0.0.1:$port, so gm starts no second one" "a collector answering already" &&
    assert_eq "$(coll_runs)" 0 "is left to serve"
  assert_eq "$(gm up --quiet 2>&1)" "" "silently" &&
    assert_eq "$(coll_runs)" 0 "with none started beside it" &&
    assert_eq "$(db "SELECT start_attempts FROM endpoint WHERE key='collector';")" 0 "and no failure counted"
  out=$(gm collector 2>&1) && fail "gm collector started a second one"
  assert_contains "$out" "a collector already answers on 127.0.0.1:$port, so gm starts no second one (while guild.conf says collector: on" "gm collector by hand refuses too"
  stop_listeners
  gm up --quiet >/dev/null 2>&1
  assert_eq "$(coll_runs)" 1 "once it is gone, gm starts its own"
}

t_autostart_interval_from_the_config() {
  [ "$(uname -s)" = Darwin ] || { printf '    (not macOS; skipped)\n'; return 0; }
  setup autostart-every
  export GM_LAUNCH_AGENTS=$WORK/autostart-every/LaunchAgents
  interval() { tr -d ' \n' <"$(ls "$GM_LAUNCH_AGENTS"/com.guildmaster.up.*.plist)" | sed -n 's/.*<key>StartInterval<\/key><integer>\([0-9]*\)<.*/\1/p'; }
  assert_contains "$(gm config set autostart-every 10)" "the launchd agent runs the muster every 10 minutes" "says so"
  assert_eq "$(interval)" 600 "the agent runs every 10 minutes"
  gm autostart on >/dev/null
  assert_eq "$(interval)" 600 "gm autostart on keeps the interval"
  gm autostart on --every 7 >/dev/null
  assert_eq "$(conf autostart-every)" 7 "--every records it" && assert_eq "$(interval)" 420 "and uses it"
  sed -i.bak 's/^autostart-every: 7$/autostart-every: 3/' "$GM_HALL/guild.conf"
  GM_OTELCOL=$WORK/none gm init --no >/dev/null 2>&1
  assert_eq "$(interval)" 180 "a hand edit is picked up at the next start"
  gm config set autostart off >/dev/null
  assert_eq "$(conf autostart)" off "off recorded"
  [ -z "$(ls "$GM_LAUNCH_AGENTS"/com.guildmaster.up.*.plist 2>/dev/null)" ] || fail "the agent was left"
  gm config set autostart on >/dev/null
  assert_eq "$(interval)" 180 "on again, at the configured interval"
}

# ---- Adventurers: dispatch, the keeper, the summons and the watch (vision/step-3-design.md, slice 1) ----

# fake_run <dir>: the fake claude acts as an Adventurer, recording what it was given in <dir>.
fake_run() {
  export GM_FAKE_RUN=$1
  mkdir -p "$GM_FAKE_RUN"
}

# A result event as claude -p --output-format stream-json ends with, after a message whose text mentions it.
fake_stream() {
  printf '%s\n' '{"type":"system","subtype":"init","session_id":"x"}' \
    '{"type":"assistant","message":{"content":[{"type":"text","text":"not this: {\"type\":\"result\"}"}]}}' \
    "{\"duration_ms\":1200,\"type\":\"result\",\"subtype\":\"${2:-success}\",\"is_error\":false,\"num_turns\":22,\"result\":\"Fixed the owner field in abc123.\",\"total_cost_usd\":1.41,\"modelUsage\":{\"claude-sonnet-5-5\":{\"costUSD\":1.41}}}" >"$1/stream.jsonl"
}

run_ended() { wait_for "SELECT ended_at IS NOT NULL FROM run WHERE id=$1;" 1; }

t_dispatch_hands_a_posting_to_an_adventurer() {
  setup dispatch
  export GM_FOCUS=appt-v2
  fake_run "$WORK/dispatch/run"
  fake_stream "$GM_FAKE_RUN"
  gm post "the owner field is empty after save" >/dev/null
  payload s1 "#1 and keep the old URL" | gm hook prompt >/dev/null
  local out t0 messages
  messages=$(db "SELECT count(*) FROM message;")
  out=$(gm dispatch 1 2>&1) && fail "dispatched a posting nobody started"
  assert_contains "$out" "appt-v2#1 owner-field-empty-after is received; start it first (gm notice 1 started)" "says to start it first" || return 1
  gm notice 1 started >/dev/null
  t0=$SECONDS
  out=$(cd "$CAMP" && gm dispatch 1 --brief "Check it with the unit tests." --model sonnet 2>&1) || fail "dispatch failed: $out"
  [ $((SECONDS - t0)) -lt 5 ] || fail "dispatch waited for the run"
  assert_contains "$out" "appt-v2#1 owner-field-empty-after dispatched: contract, run 1 on sonnet at medium effort (\"the owner field is empty after save\")" "the notice line" &&
    assert_contains "$out" "gm summons you when it finishes" "says what happens next" || return 1
  run_ended 1 || fail "the run never ended"
  local dir=$GM_HALL/runs/1 writ sid
  writ=$(cat "$dir/writ.md")
  assert_eq "$(cat "$GM_FAKE_RUN/stdin")" "$writ" "the writ is the Adventurer's prompt" &&
    assert_contains "$writ" "# Writ: appt-v2#1 owner-field-empty-after" "{{posting}}" &&
    assert_contains "$writ" "the owner field is empty after save" "{{original_words}}" &&
    assert_contains "$writ" "#1 and keep the old URL" "with every addition, verbatim" &&
    assert_contains "$writ" "Check it with the unit tests." "{{brief}}" &&
    assert_contains "$writ" "feature branch \`feature/CRM-8965\`" "{{branch}}" &&
    assert_contains "$writ" "$GM_HALL/rules/repo.md" "{{rules}}, a path" &&
    assert_contains "$writ" "phase intake" "{{phase}}" &&
    assert_not_contains "$writ" "{{" "every slot filled" &&
    assert_not_contains "$writ" "This file is the patron's" "the template's own note stays out" || return 1
  [ -f "$GM_HALL/prompts/adventurer/contract.md" ] || fail "the template was not copied into the Guildhall"
  sid=$(db "SELECT session_id FROM run WHERE id=1;")
  assert_eq "$(cat "$GM_FAKE_RUN/pwd")" "$CAMP" "it runs in the camp" &&
    assert_eq "$(tr '\n' ' ' <"$GM_FAKE_RUN/args")" "-p --session-id $sid --output-format stream-json --verbose --setting-sources user,project --settings $dir/settings.json --model sonnet --effort medium --permission-mode acceptEdits " "its command line" &&
    assert_eq "$(grep -c '^CLAUDECODE=' "$GM_FAKE_RUN/env")" 0 "not as a session inside Claude Code" || return 1
  local settings
  settings=$(cat "$dir/settings.json")
  assert_eq "$(json "SELECT json_extract('$settings','\$.env.GM_RUN')||' '||json_extract('$settings','\$.env.GM_FOCUS')")" "1 appt-v2" "its own environment" &&
    assert_eq "$(json "SELECT json_type('$settings','\$.hooks')||json_type('$settings','\$.statusLine')")" "" "no capture, charter, Stop guard or status line" &&
    assert_eq "$(json "SELECT json_extract('$settings','\$.attribution.commit')||'|'||json_extract('$settings','\$.includeCoAuthoredBy')")" "|0" "commit attribution off" &&
    assert_contains "$settings" '"Bash(git push*)"' "never a push" &&
    assert_contains "$settings" '"Bash(git commit*)"' "commits allowed" || return 1
  assert_eq "$(db "SELECT count(*) FROM message;")" "$messages" "the writ is never recorded as a patron message" &&
    assert_eq "$(cat "$dir/result.md")" "Fixed the owner field in abc123." "the result kept" &&
    assert_eq "$(db "SELECT kind||' '||model||' '||effort||' '||exit_code||' '||result_subtype||' '||turns||' '||cost_usd||' '||duration_ms FROM run WHERE id=1;")" \
      "contract sonnet medium 0 success 22 1.41 1200" "the run's facts" &&
    assert_contains "$(gm show 1)" "appt-v2#1 owner-field-empty-after run 1 finished: exit 0, 22 turns, \$1.41 (\"the owner field is empty after save\")" "the finish notice" &&
    assert_contains "$(gm runs)" "run 1  contract  appt-v2#1 owner-field-empty-after  finished: exit 0, 22 turns, \$1.41" "gm runs" &&
    assert_contains "$(gm where)" "run 1 for appt-v2#1 owner-field-empty-after finished: exit 0, 22 turns, \$1.41, not reviewed yet" "the resume summary names it"
}

t_one_contract_at_a_time() {
  setup onecontract
  export GM_FOCUS=appt-v2
  fake_run "$WORK/onecontract/run"
  : >"$GM_FAKE_RUN/hold"
  gm post "first" >/dev/null && gm post "second" >/dev/null
  gm notice 1 started >/dev/null && gm notice 2 started >/dev/null
  gm dispatch 1 >/dev/null || fail "first dispatch"
  wait_for "SELECT pid IS NOT NULL FROM run WHERE id=1;" 1 || fail "no keeper pid"
  local out
  out=$(gm dispatch 2 2>&1) && fail "a second contract ran beside the first"
  assert_contains "$out" "run 1 is still working in appt-v2's camp" "says why" &&
    assert_contains "$(gm where)" "an Adventurer is working in the camp" "the summary says a run works" || return 1
  # While it works, the turn may end with the posting active; then a finished, unreviewed run holds it.
  local stop
  stop=$(json "SELECT json_object('session_id','s1','background_tasks',json_array());")
  gm notice 2 queued >/dev/null
  assert_eq "$(printf '%s' "$stop" | gm hook stop)" "" "a live run lets the turn end" || return 1
  rm -f "$GM_FAKE_RUN/hold"
  run_ended 1 || fail "the run never ended"
  out=$(printf '%s' "$stop" | gm hook stop)
  assert_contains "$out" '"decision":"block"' "an unreviewed run holds the turn" &&
    assert_contains "$out" "run 1 for appt-v2#1 first finished: exit 0, no result, and no notice has reviewed it yet" "naming it" &&
    assert_contains "$(cat "$GM_HALL/runs/1/result.md")" "without a result" "a run with no result says so" || return 1
  gm notice 2 started >/dev/null
  gm dispatch 2 >/dev/null || fail "the second contract once the first ended"
  run_ended 2 || fail "run 2 never ended"
  gm notice 1 'done' "abc123" >/dev/null
  gm notice 2 needs-you "keep the old URL?" >/dev/null
  assert_eq "$(printf '%s' "$stop" | gm hook stop)" "" "reviewed runs let it end" &&
    assert_eq "$(db "SELECT group_concat(id||' '||outcome, ', ') FROM run;")" "1 accepted, 2 escalated" "outcomes from the notices" || return 1
  # Another run on the same posting means the last one was not enough.
  gm notice 2 started >/dev/null
  gm dispatch 2 --brief "keep it" >/dev/null
  run_ended 3 || fail "run 3 never ended"
  assert_eq "$(db "SELECT outcome FROM run WHERE id=2;")" escalated "an outcome stands once recorded" || return 1
  gm notice 2 started >/dev/null
  gm dispatch 2 >/dev/null
  run_ended 4 || fail "run 4 never ended"
  assert_eq "$(db "SELECT outcome FROM run WHERE id=3;")" redispatched "a run followed by another is redispatched"
}

t_dispatch_several_postings_and_settings() {
  setup severalruns
  export GM_FOCUS=appt-v2
  fake_run "$WORK/severalruns/run"
  printf 'adventurer-allow: Bash(npm test*)\n' >>"$GM_HALL/rules/repo.md"
  gm post "the export button" >/dev/null && gm post "the export format" >/dev/null
  gm notice 1 started >/dev/null && gm notice 2 started >/dev/null
  gm config set commit-attribution on >/dev/null
  gm config set contract-model opus >/dev/null
  gm config set contract-effort high >/dev/null
  local out
  out=$(gm dispatch 1 2 --effort extreme 2>&1) && fail "took an effort that does not exist"
  out=$(gm dispatch 1 2)
  assert_contains "$out" "appt-v2#1 export-button dispatched: contract, run 1 on opus at high effort" "the first posting" &&
    assert_contains "$out" "appt-v2#2 export-format dispatched: contract, run 1 on opus at high effort" "the second, in the same run" || return 1
  run_ended 1 || fail "the run never ended"
  local settings
  settings=$(cat "$GM_HALL/runs/1/settings.json")
  assert_contains "$(cat "$GM_HALL/runs/1/writ.md")" "# Writ: appt-v2#1 export-button, #2 export-format" "one writ for both" &&
    assert_contains "$settings" '"Bash(npm test*)"' "the rules file's build and test commands" &&
    assert_eq "$(json "SELECT json_type('$settings','\$.attribution')")" "" "attribution left to Claude Code when on" &&
    assert_contains "$(gm show 2)" "run 1 finished" "both postings get the finish notice"
}

t_lost_run_is_reaped() {
  setup lostrun
  export GM_FOCUS=appt-v2
  gm post "something" >/dev/null && gm notice 1 started >/dev/null
  db "INSERT INTO run(focus_id, kind, session_id, pid, started_at) VALUES (1, 'contract', 'sx', 999999, '2026-01-01T00:00:00Z');
      INSERT INTO run_posting VALUES (1, 1);"
  assert_contains "$(gm runs)" "run 1  contract  appt-v2#1 something  lost: its keeper ended without recording a result" "a keeper that is gone" &&
    assert_eq "$(db "SELECT result_subtype FROM run;")" lost "recorded once"
}

t_open_brief_and_post_focus_reach_a_party_leader() {
  export GM_HALL=$WORK/brief/hall
  REPO=$(new_repo brief/repo)
  local out
  out=$(gm open demo --repo "$REPO" --no-launch --brief "say hello" --slug hello 2>&1) || fail "open --brief: $out"
  assert_contains "$out" 'demo#1 hello received ("say hello")' "the first posting, before the launch" &&
    assert_eq "$(db "SELECT origin FROM posting WHERE num=1;")" outside "from outside its chat" || return 1
  out=$(printf 'the second job\nin two lines' | gm open demo --brief - 2>&1 >/dev/null; gm list demo)
  assert_contains "$out" "#2 second-job-two-lines" "--brief - reads standard input" || return 1
  out=$(gm post --focus demo "and a third" 2>&1)
  assert_contains "$out" 'demo#3 third received ("and a third")' "gm post --focus from the front desk" &&
    assert_eq "$(db "SELECT origin FROM posting WHERE num=3;")" outside "from outside" || return 1
  payload s1 "a patron message" | GM_FOCUS=demo gm hook prompt >/dev/null
  assert_eq "$(db "SELECT origin FROM posting WHERE num=4;")" patron "the patron's own message" || return 1
  out=$(gm open demo2 --repo "$REPO" --no-launch --slug x 2>&1) && fail "--slug without --brief"
  assert_contains "$out" "give --brief too" "says why"
}

# The watch hook's environment in appt-v2's Party Leader's own herdr pane, polling every second.
as_watch() { HERDR_ENV=1 HERDR_PANE_ID="$(pl_pane appt-v2)" HERDR_SESSION=gm-test GM_FOCUS=appt-v2 GM_WATCH_POLL=1 "$@"; }

t_watch_summons_an_idle_party_leader() {
  setup watch
  gm open appt-v2 >/dev/null 2>&1
  export GM_WATCH_TIMEOUT=40
  local out rc pidf=$GM_HALL/watch.appt-v2.pid
  # Anywhere but the Party Leader's own pane, it does nothing.
  rc=0; out=$(printf '{}' | GM_FOCUS=appt-v2 bash "$GM" hook watch 2>&1) || rc=$?
  assert_eq "$rc" 0 "outside its pane: exit 0" && [ ! -e "$pidf" ] || fail "outside its pane it armed"
  # A patron's own message, and a posting the Party Leader made and sorted itself, never summon.
  payload s1 "the patron's own words" | GM_FOCUS=appt-v2 gm hook prompt >/dev/null
  as_pl gm post --from 1 "a split item" >/dev/null
  assert_eq "$(db "SELECT group_concat(origin, ' ') FROM posting ORDER BY num;")" "patron party-leader" "where each came from" || return 1
  printf '{}' | as_watch bash "$GM" hook watch >/dev/null 2>&1 & local w1=$! p1
  sleep 1
  p1=$(cat "$pidf" 2>/dev/null)
  if [ -z "$p1" ] || ! kill -0 "$p1" 2>/dev/null; then fail "not armed, or its pid not recorded"; fi
  # A newer watch replaces it, and the older one stands down.
  printf '{}' | as_watch bash "$GM" hook watch >"$WORK/watch/out" 2>&1 & local w2=$!
  sleep 2
  kill -0 "$p1" 2>/dev/null && fail "the older watch did not stand down"
  rc=0; wait "$w1" || rc=$?
  assert_eq "$rc" 0 "it exits 0" || return 1
  # A job posted from the front desk wakes it within a poll.
  gm post --focus appt-v2 "add a CSV export" >/dev/null
  rc=0; wait "$w2" || rc=$?
  out=$(cat "$WORK/watch/out")
  assert_eq "$rc" 2 "exit 2 wakes the session" &&
    assert_contains "$out" "gm: while you were idle:" "says why" &&
    assert_contains "$out" '- appt-v2#3 add-csv-export was posted from outside your chat (received): "add a CSV export"' "names the posting" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='summoned';")" 1 "a summoned event" || return 1
  [ ! -e "$pidf" ] || fail "the pid file was left"
  # Never twice for the same thing: the next watch finds nothing, and times out quietly.
  rc=0; out=$(printf '{}' | as_watch env GM_WATCH_TIMEOUT=33 bash "$GM" hook watch 2>&1) || rc=$?
  assert_eq "$rc" 0 "nothing new: exit 0 at its time" && assert_eq "$out" "" "and says nothing" || return 1
  # A finished run wakes it the same way; the patron's turn retires an armed watch.
  printf '{}' | as_watch bash "$GM" hook watch >/dev/null 2>&1 & local w3=$!
  sleep 1
  payload s2 "#3 one more detail" | as_pl gm hook prompt >/dev/null
  sleep 2
  kill -0 "$w3" 2>/dev/null && fail "the patron's message did not retire the watch"
  [ ! -e "$pidf" ] || fail "the capture hook left the pid file"
  GM_FOCUS=appt-v2 gm notice 3 started >/dev/null
  fake_run "$WORK/watch/run"
  fake_stream "$GM_FAKE_RUN"
  GM_FOCUS=appt-v2 gm dispatch 3 >/dev/null
  run_ended 1 || fail "the run never ended"
  rc=0; out=$(printf '{}' | as_watch bash "$GM" hook watch 2>&1) || rc=$?
  assert_eq "$rc" 2 "a finished run wakes it, even at start" &&
    assert_contains "$out" "- run 1 for appt-v2#3 add-csv-export finished: exit 0, 22 turns, \$1.41. Its result: $GM_HALL/runs/1/result.md" "names the run and its result" &&
    assert_contains "$(GM_FOCUS=appt-v2 gm summons)" "Nothing is waiting for you" "gm summons finds it heard"
}

t_camp_settings_arm_the_watch() {
  setup watchsettings
  local s ev
  s="CAST(readfile($(sqlq "$CAMP/.claude/settings.local.json")) AS TEXT)"
  for ev in SessionStart Stop StopFailure; do
    assert_eq "$(json "SELECT count(*) FROM json_each($s,'\$.hooks.${ev}[0].hooks') WHERE json_extract(value,'\$.command') LIKE '%hook watch' AND json_extract(value,'\$.asyncRewake')=1 AND json_extract(value,'\$.timeout')=86400;")" 1 "$ev arms the watch" || return 1
  done
}

# nudge_ready: a Party Leader alive in herdr with a run finished long ago that nobody summoned, and no watch.
nudge_ready() {
  setup "$1"
  initialized
  gm open appt-v2 >/dev/null 2>&1
  GM_FOCUS=appt-v2 gm post "fix it" >/dev/null
  db "UPDATE posting SET state='active' WHERE num=1;
      INSERT INTO run(focus_id, kind, session_id, started_at, ended_at, exit_code, result_subtype, turns, cost_usd)
        VALUES (1, 'contract', 'sx', '2026-01-01T00:00:00Z', '2026-01-01T00:10:00Z', 0, 'success', 3, 0.2);
      INSERT INTO run_posting VALUES (1, 1);"
  mkdir -p "$HERDR_STUB/screens"
  export GM_NUDGE_IDLE_GAP=0 GM_NUDGE_SETTLE=0
}

screen() { printf '%s\n' '────────────────' "$2" '────────────────' "  ${3:-? for shortcuts}" >"$HERDR_STUB/screens/$1"; }

typed_summons() { grep -c "	/guild-chat:summons$" "$HERDR_STUB/typed" 2>/dev/null || true; }

t_nudge_types_summons_into_an_empty_input() {
  nudge_ready nudgeempty
  screen 1 $'❯ \e[2mTry "fix lint errors"\e[0m'
  local out
  out=$(gm up 2>&1)
  assert_contains "$out" "appt-v2: summoned its Party Leader (run 1), whose watch was not running" "says it" &&
    assert_eq "$(typed_summons)" 1 "typed /guild-chat:summons" &&
    assert_eq "$(grep -c '<ctrl+s>' "$HERDR_STUB/typed")" 0 "no Ctrl+S on an empty input" &&
    assert_eq "$(tail -n 1 "$HERDR_STUB/typed" | cut -f 2)" "<enter>" "then Enter" || return 1
  # Not while a turn runs, nor with a live watch.
  : >"$HERDR_STUB/typed"
  printf 'working' >"$HERDR_STUB/agent-status"
  gm up >/dev/null 2>&1
  assert_eq "$(typed_summons)" 0 "not while it works" || return 1
  printf 'idle' >"$HERDR_STUB/agent-status"
  sleep 30 & local live=$!
  printf '%s' "$live" >"$GM_HALL/watch.appt-v2.pid"
  gm up >/dev/null 2>&1
  kill "$live"
  assert_eq "$(typed_summons)" 0 "not while its watch lives"
}

t_nudge_stashes_a_draft_first() {
  nudge_ready nudgedraft
  screen 1 '❯ half a sentence the patron'
  screen after-stash '❯ '
  gm up >/dev/null 2>&1
  assert_eq "$(cut -f 2 "$HERDR_STUB/typed" | tr '\n' ' ')" "<ctrl+s> /guild-chat:summons <enter> " "Ctrl+S, then the command"
}

t_nudge_types_nothing_when_unsafe() {
  nudge_ready nudgeunsafe
  screen 1 '❯ a draft'
  printf '%s\n' '────' '❯ a draft' '────' '  › stashed' >"$HERDR_STUB/screens/2"
  gm up >/dev/null 2>&1
  assert_eq "$(cat "$HERDR_STUB/typed" 2>/dev/null)" "" "a draft and a stash: nothing typed" &&
    assert_eq "$(db "SELECT count(*) FROM event WHERE kind='unheard';")" 1 "recorded unheard" &&
    assert_contains "$(gm roster)" "unheard: run 1 since 00:10" "the roster shows it" || return 1
  gm up >/dev/null 2>&1
  assert_eq "$(db "SELECT count(*) FROM event WHERE kind='unheard';")" 1 "once" || return 1
  # Someone typing: the input changes between the two reads.
  rm -rf "$HERDR_STUB/screens" && mkdir -p "$HERDR_STUB/screens"
  screen 1 '❯ hel'
  screen 2 '❯ hello th'
  gm up >/dev/null 2>&1
  assert_eq "$(cat "$HERDR_STUB/typed" 2>/dev/null)" "" "nothing typed over typing" || return 1
  # gm summons hears it, and the roster no longer shows it.
  GM_FOCUS=appt-v2 gm summons >/dev/null
  assert_not_contains "$(gm roster)" "unheard" "heard"
}

t_shellcheck() {
  command -v shellcheck >/dev/null 2>&1 || { printf '    (shellcheck not installed; skipped)\n'; return 0; }
  shellcheck -x "$GM" "$ROOT/bin/gm-front-desk-lib.sh" "$ROOT/tests/run.sh" "$ROOT/tests/demo.sh" "$ROOT/tests/fixtures/herdr" "$ROOT/tests/fixtures/herdr-socket" "$ROOT/tests/fixtures/launchctl"
}

for t in $(declare -F | awk '{print $3}' | grep '^t_'); do
  case $t in *"$FILTER"*) ;; *) continue ;; esac
  rm -f "$WORK/failed-mark"
  export HERDR_STUB=$WORK/herdr.$t
  mkdir -p "$HERDR_STUB"
  (set -e; [ -z "${GM_TEST_TRACE:-}" ] || set -x; "$t") >"$WORK/out.txt" 2>&1
  rc=$?
  if [ -e "$HERDR_STUB/violations" ]; then
    printf '    FAIL: herdr was called outside the test session:\n%s\n' "$(cat "$HERDR_STUB/violations")" >>"$WORK/out.txt"
    : >"$WORK/failed-mark"
  fi
  if [ "$rc" -eq 0 ] && [ ! -e "$WORK/failed-mark" ]; then
    pass=$((pass + 1))
    printf 'ok   %s\n' "${t#t_}"
  else
    fail=$((fail + 1))
    failed="$failed ${t#t_}"
    printf 'FAIL %s\n' "${t#t_}"
    sed 's/^/     /' "$WORK/out.txt"
  fi
done
printf '\n%d passed, %d failed%s\n' "$pass" "$fail" "${failed:+:$failed}"
[ "$fail" -eq 0 ]
