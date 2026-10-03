#!/usr/bin/env bash
# Test suite for bin/gm. Run: bash tests/run.sh [name-filter]
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
GM=$ROOT/bin/gm
FILTER=${1:-}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/gm-tests.XXXXXX")
WORK=$(cd "$WORK" && pwd -P)
trap 'rm -rf "$WORK"' EXIT
# The suite may itself run inside Claude Code, whose session variables would join gm's spans to it.
unset CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT TRACEPARENT GM_FOCUS
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
    assert_eq "$(db 'PRAGMA user_version;')" 2 "schema version" &&
    assert_eq "$(db "SELECT group_concat(name, ' ') FROM (SELECT name FROM sqlite_master WHERE type='table' ORDER BY name);")" \
      "event focus guard message model_sample open_span posting prompt_version span span_link ticket" "tables"
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
  assert_eq "$(db 'PRAGMA user_version;')" 2 "migrated to schema 2" &&
    assert_eq "$(for t in $tables; do db "SELECT $(db "SELECT group_concat(name, ',') FROM pragma_table_info('$t') WHERE name NOT IN ('trace_id','span_id','span_start_ms','follows_id');") FROM $t ORDER BY rowid;"; done)" "$before" "every schema-1 row kept as it was" &&
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

t_open_sends_telemetry_only_to_loopback() {
  setup tel-open
  local out bad n=0
  out=$(gm open appt-v2 --no-launch)
  assert_contains "$out" "Start its Party Leader from a terminal with: gm open appt-v2" "how to start it" &&
    assert_contains "$out" " -u OTEL_EXPORTER_OTLP_HEADERS " "inherited headers cleared" &&
    assert_contains "$out" " CLAUDE_CODE_ENABLE_TELEMETRY=1 CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1 " "telemetry and spans on" &&
    assert_contains "$out" " OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 " "the loopback collector" &&
    assert_contains "$out" " OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces " "every signal's own endpoint replaced" &&
    assert_contains "$out" " OTEL_RESOURCE_ATTRIBUTES=guild.focus=appt-v2,guild.role=party-leader " "the focus and role on every signal" &&
    assert_contains "$out" " OTEL_LOG_USER_PROMPTS=1 OTEL_LOG_ASSISTANT_RESPONSES=1 OTEL_LOG_TOOL_DETAILS=1 claude --name appt-v2" "prompts, responses and tool details captured" &&
    assert_contains "$out" " -u OTEL_LOG_TOOL_CONTENT -u OTEL_LOG_RAW_API_BODIES " "tool output and raw bodies not"
  assert_contains "$(GM_OTEL_PORT=4999 gm open appt-v2 --no-launch)" "OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4999 " "GM_OTEL_PORT moves it"
  for bad in http://example.com:4318 http://127.0.0.1.evil.example:4318 http://127.0.0.1@evil.example:4318 'http://localhost:4318@evil.example' \
    http://10.0.0.1:4318 https://otel.example.com 'http://127.0.0.1:4318 http://evil.example' ftp://127.0.0.1:4318; do
    n=$((n + 1))
    out=$(GM_OTEL_ENDPOINT=$bad gm open "other$n" --repo "$REPO" --no-launch 2>&1) && fail "$bad was accepted"
    assert_contains "$out" "telemetry goes only to 127.0.0.1, localhost or ::1" "$bad refused"
    assert_eq "$(db "SELECT count(*) FROM focus WHERE name='other$n';")" 0 "nothing made for $bad"
  done
  for bad in http://localhost:4318 'http://[::1]:4318' http://127.0.0.1:4318/; do
    GM_OTEL_ENDPOINT=$bad gm open appt-v2 --no-launch >/dev/null 2>&1 || fail "$bad was refused"
  done
  mkdir -p "$WORK/tel-open/home/.claude"
  printf '{"env":{"OTEL_EXPORTER_OTLP_LOGS_ENDPOINT":"https://otel.example.com/v1/logs"}}' >"$WORK/tel-open/home/.claude/settings.json"
  out=$(HOME=$WORK/tel-open/home gm open appt-v2 --no-launch 2>&1) && fail "settings that send telemetry elsewhere were accepted"
  assert_contains "$out" "settings.json: OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://otel.example.com/v1/logs" "and say which"
  printf '{"env":{"OTEL_EXPORTER_OTLP_ENDPOINT":"http://localhost:4318"}}' >"$WORK/tel-open/home/.claude/settings.json"
  HOME=$WORK/tel-open/home gm open appt-v2 --no-launch >/dev/null 2>&1 || fail "loopback settings were refused"
  assert_contains "$(GM_TELEMETRY=off gm open appt-v2 --no-launch)" "' && claude --name appt-v2" "GM_TELEMETRY=off starts without it"
}

# Runs a command on a pseudo-terminal, so gm open launches; BSD and util-linux script differ.
on_a_tty() {
  if script -q /dev/null true >/dev/null 2>&1; then
    script -q /dev/null "$@"
  elif script -qec true /dev/null >/dev/null 2>&1; then
    local c='' a
    for a in "$@"; do c="$c $(printf '%q' "$a")"; done
    script -qec "$c" /dev/null
  else
    return 2
  fi
}

t_open_launches_claude_with_the_telemetry_env() {
  setup tel-launch
  local envf=$WORK/tel-launch/env.txt rc=0
  [ -x "$ROOT/tests/fixtures/fake-claude" ] || fail "tests/fixtures/fake-claude is not executable"
  GM_CLAUDE=$ROOT/tests/fixtures/fake-claude GM_FAKE_CLAUDE_ENV=$envf GM_OTEL_PORT=1 \
    OTEL_EXPORTER_OTLP_HEADERS=x-api-key=sekrit OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://otel.example.com/v1/traces OTEL_LOG_RAW_API_BODIES=1 \
    on_a_tty bash "$GM" open appt-v2 >/dev/null 2>&1 || rc=$?
  if [ "$rc" = 2 ]; then
    printf '    (no script(1) to make a terminal; skipped)\n'
    return 0
  fi
  [ -s "$envf" ] || fail "claude was not started" || return 1
  local e
  e=$(cat "$envf")
  assert_contains "$e" "OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:1" "the loopback endpoint" &&
    assert_contains "$e" "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:1/v1/traces" "an inherited signal endpoint replaced" &&
    assert_contains "$e" "OTEL_RESOURCE_ATTRIBUTES=guild.focus=appt-v2,guild.role=party-leader" "the resource attributes" &&
    assert_contains "$e" "OTEL_LOG_ASSISTANT_RESPONSES=1" "responses captured" &&
    assert_not_contains "$e" "sekrit" "inherited headers cleared" &&
    assert_not_contains "$e" "OTEL_LOG_RAW_API_BODIES" "raw API bodies not captured" &&
    assert_not_contains "$e" "otel.example.com" "nothing points elsewhere"
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
