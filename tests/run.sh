#!/usr/bin/env bash
# Test suite for bin/gm. Run: bash tests/run.sh [name-filter]
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
GM=$ROOT/bin/gm
FILTER=${1:-}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/gm-tests.XXXXXX")
WORK=$(cd "$WORK" && pwd -P)
trap 'rm -rf "$WORK"' EXIT
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

db() { sqlite3 -batch -noheader "$GM_HALL/register.db" "$@"; }

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

t_schema_created_on_first_use() {
  export GM_HALL=$WORK/schema/hall
  [ ! -e "$GM_HALL" ] || return 1
  gm list >/dev/null || fail "first gm call failed"
  assert_eq "$(db 'PRAGMA journal_mode;')" wal "journal mode" &&
    assert_eq "$(db 'PRAGMA user_version;')" 1 "schema version" &&
    assert_eq "$(db "SELECT group_concat(name, ' ') FROM (SELECT name FROM sqlite_master WHERE type='table' ORDER BY name);")" \
      "event focus guard message posting ticket" "tables"
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
  assert_eq "$events" "PreCompact SessionStart Stop UserPromptSubmit" "hook events" &&
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

t_shellcheck() {
  command -v shellcheck >/dev/null 2>&1 || { printf '    (shellcheck not installed; skipped)\n'; return 0; }
  shellcheck "$GM" "$ROOT/tests/run.sh" "$ROOT/tests/demo.sh"
}

for t in $(declare -F | awk '{print $3}' | grep '^t_'); do
  case $t in *"$FILTER"*) ;; *) continue ;; esac
  rm -f "$WORK/failed-mark"
  (set -e; "$t") >"$WORK/out.txt" 2>&1
  rc=$?
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
