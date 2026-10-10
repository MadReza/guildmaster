import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderInput, Timer } from 'claude-code'

import type {
  SpyglassChangedFile, SpyglassContext, SpyglassDeed, SpyglassFileGroup, SpyglassFiles, SpyglassPostings, SpyglassSettings, SpyglassTree,
} from '../types'
import { contextOf, contextTab } from './tabs/context'
import { configsTab, parseSettings } from './tabs/configs'
import { activityTab, deedsOfTranscript, describeCall, FILTERS, isNoticeCommand, KEEP, noticeLines, type Filter } from './tabs/activity'
import { filesTab, lineCount, merged, openArgv, parseNumstat, untracked } from './tabs/files'
import { listArgs, parsePostings, postingsTab } from './tabs/postings'
import { tabLabel, tabNamed, tabStrip } from './tabs/ui'

// The spyglass: a pane beside the chat whose tabs show the party's work. It never opens by itself: /spyglass opens it,
// and /spyglass again, the pane's close mark, or ctrl+x x closes it. Every session of the guild has it, and the tabs
// it offers follow the seat it is opened in: the Guildmaster's front desk, a Party Leader's camp (GM_CHAT_FOCUS, or
// the GM_FOCUS a camp's settings set), or any other session, an adventurer's or a claude started by hand.

export const PANE = 'spyglass'
const TITLE = 'Spyglass'

export type Seat = 'guildmaster' | 'party-leader' | 'other'

// One tab of the pane: its name, its title, and which seats offer it. body() draws it.
export type Tab = { id: string; title: string; seats: readonly Seat[] }

// The tabs, in the order the strip shows them. Each tab is its own posting; they join here, and in body(), as they
// are built.
export const TABS: readonly Tab[] = [
  { id: 'postings', title: 'Postings', seats: ['guildmaster', 'party-leader'] },
  { id: 'files', title: 'Files', seats: ['party-leader', 'other'] },
  { id: 'activity', title: 'Activity', seats: ['guildmaster', 'party-leader', 'other'] },
  { id: 'configs', title: 'Configs', seats: ['guildmaster', 'party-leader'] },
  { id: 'context', title: 'Context', seats: ['guildmaster', 'party-leader', 'other'] },
]

// What the tab's body draws.
async function body($: EngineInterface, e: RenderInput<'Pane'>, id: string): Promise<RenderChildren> {
  const { Text } = $.ui.resolve(e)
  switch (id) {
    case 'postings': {
      const focus = await focusOf($)
      const view = { board: await read($, postings), focus, all: await read($, showAll), open: await read($, opened), now: await $.clock.now() }
      return postingsTab($.ui.resolve(e), view, {
        toggleAll: () => void update($, showAll, v => !v),
        refresh: () => void refreshPostings($, focus),
        toggle: ref => void update($, opened, v => (v === ref ? '' : ref)),
      })
    }
    case 'files':
      return filesTab($.ui.resolve(e), await read($, files), {
        open: (group, file) => void openFile($, group, file),
        refresh: () => void refreshFiles($),
      })
    case 'activity': {
      const chosen = await read($, activityFilter)
      const filter: Filter = FILTERS.find(f => f.id === chosen)?.id ?? 'all'
      return activityTab($.ui.resolve(e), await read($, deeds), filter, {
        filter: f => void update($, activityFilter, () => f),
        clear: () => void update($, deeds, () => []),
      })
    }
    case 'configs':
      return configsTab($.ui.resolve(e), await read($, settings), await read($, settingOpen), {
        toggle: key => void update($, settingOpen, v => (v === key ? '' : key)),
        set: (key, words) => void changeSetting($, ['set', key, ...words]),
        unset: key => void changeSetting($, ['unset', key]),
        refresh: () => void refreshSettings($),
      })
    case 'context':
      return contextTab($.ui.resolve(e), await read($, context), Math.max(20, e.props.bodyColumns), await $.clock.now(), {
        refresh: () => void refreshContext($, 'summary'),
        count: () => void refreshContext($, 'full'),
      })
    default:
      return <Text dimColor>Nothing here yet.</Text>
  }
}

export const tabsFor = (seat: Seat, tabs: readonly Tab[] = TABS) => tabs.filter(t => t.seats.includes(seat))

// The tab drawn: the one last chosen while this seat offers it, else the first it offers.
export function shown(chosen: string, offered: readonly Tab[]): Tab | undefined {
  return offered.find(t => t.id === chosen) ?? offered[0]
}

// A Party Leader is known by its focus: GM_CHAT_FOCUS from gm, or the GM_FOCUS its camp's settings set. The front desk
// is known by GM_CHAT from gm, or by where it runs, since Claude Code's session host does not always keep the variables
// a session was started with: the guild's own clone (the one ~/.local/bin/gm leads into) or the Guildhall's
// front-desk folder. Any other session is not the guild's own.
export function seatFrom(env: { GM_CHAT_FOCUS?: string; GM_FOCUS?: string; GM_CHAT?: string }, isFrontDesk = false): Seat {
  if (env.GM_CHAT_FOCUS || env.GM_FOCUS) return 'party-leader'
  if (env.GM_CHAT || isFrontDesk) return 'guildmaster'
  return 'other'
}

// Whether this session runs at the front desk: worked out once a session, from its folder.
let frontDesk: Promise<boolean> | undefined

function atFrontDesk($: EngineInterface): Promise<boolean> {
  frontDesk ??= (async () => {
    if (!cwd) return false
    const hall = (await $.env.get('GM_HALL')) || `${await $.env.get('HOME')}/.guildmaster`
    if (cwd === `${hall}/front-desk`) return true
    try {
      const gm = await $.fs.stat(`${await $.env.get('HOME')}/.local/bin/gm`, { resolve: true })
      const clone = gm.isLink && gm.realPath?.endsWith('/bin/gm') ? gm.realPath.slice(0, -'/bin/gm'.length) : undefined
      return clone !== undefined && (await toplevel($, cwd)) === clone
    } catch {
      return false
    }
  })()
  return frontDesk
}

const seatOf = async ($: EngineInterface) => {
  const env = { GM_CHAT_FOCUS: await $.env.get('GM_CHAT_FOCUS'), GM_FOCUS: await $.env.get('GM_FOCUS'), GM_CHAT: await $.env.get('GM_CHAT') }
  return seatFrom(env, !env.GM_CHAT_FOCUS && !env.GM_FOCUS && !env.GM_CHAT && (await atFrontDesk($)))
}

// The Party Leader's focus, none at the front desk or elsewhere.
const focusOf = async ($: EngineInterface) => (await $.env.get('GM_CHAT_FOCUS')) || (await $.env.get('GM_FOCUS')) || undefined

// The guild's one gm, linked at ~/.local/bin/gm. Never the gm beside this mod, which in a camp of Guildmaster is the
// branch's draft: the mod runs it only when it is a link to a gm.
async function guildGm($: EngineInterface): Promise<{ gm: string } | { why: string }> {
  const gm = `${await $.env.get('HOME')}/.local/bin/gm`
  try {
    const s = await $.fs.stat(gm, { resolve: true })
    if (!s.isLink) return { why: '~/.local/bin/gm is not a link to the guild\'s gm' }
    if (s.kind !== 'file' || !s.realPath?.endsWith('/gm')) return { why: '~/.local/bin/gm does not lead to a gm' }
    return { gm }
  } catch {
    return { why: '~/.local/bin/gm is missing' }
  }
}

// Runs the guild's gm with these arguments: its standard output, or the first line saying why not.
async function runGm($: EngineInterface, args: string[]): Promise<{ out: string } | { why: string }> {
  const found = await guildGm($)
  if ('why' in found) return found
  try {
    const run = await $.process.run([found.gm, ...args])
    if (run.exitCode === 0) return { out: run.stdout }
    return { why: (run.stderr.trim() || run.stdout.trim()).split('\n')[0] || `gm exited ${run.exitCode}` }
  } catch (err) {
    return { why: err instanceof Error ? err.message : String(err) }
  }
}

// The postings tab's board, whether it shows finished postings, and the one posting opened.
const EMPTY_BOARD: SpyglassPostings = { rows: [], isLoaded: false }
const postings = atom({ plugin: 'guild-spyglass', key: 'postings' } as const, EMPTY_BOARD)
const showAll = atom({ plugin: 'guild-spyglass', key: 'postingsAll' } as const, false)
const opened = atom({ plugin: 'guild-spyglass', key: 'postingOpen' } as const, '')

// The guild's gm before gm list --json and gm config --json says only that it does not know them: the tab says why.
const OLD_GM = 'the guild\'s gm (~/.local/bin/gm) is older than the spyglass: it learns --json when the change that brings the spyglass is merged'
const whyNot = (why: string) => (/unknown option --json|gm config \[get <key>/.test(why) ? OLD_GM : why)

async function refreshPostings($: EngineInterface, focus: string | undefined): Promise<void> {
  const got = await runGm($, listArgs(focus))
  const board: SpyglassPostings = 'why' in got ? { rows: [], why: whyNot(got.why), isLoaded: true } : { rows: parsePostings(got.out), isLoaded: true }
  await update($, postings, () => board)
}

// A setting in guild.conf, as gm reads it: the first line naming the key with a value, comments skipped.
export function confValue(conf: string, key: string): string | undefined {
  for (const line of conf.split('\n')) {
    if (/^\s*#/.test(line) || !line.startsWith(`${key}:`)) continue
    const value = line.slice(key.length + 1).trim()
    if (value) return value
  }
  return undefined
}

async function hallConf($: EngineInterface): Promise<string> {
  return `${(await $.env.get('GM_HALL')) || `${await $.env.get('HOME')}/.guildmaster`}/guild.conf`
}

async function git($: EngineInterface, args: string[]): Promise<{ out: string } | { why: string }> {
  try {
    const run = await $.process.run(['git', ...args])
    if (run.exitCode === 0) return { out: run.stdout }
    return { why: run.stderr.trim().split('\n')[0] || `git exited ${run.exitCode}` }
  } catch (err) {
    return { why: err instanceof Error ? err.message : String(err) }
  }
}

// Where this session works, from its start, and the names of the adventurers it sent, by agent id.
let cwd: string | undefined
const adventurers = new Map<string, string>()

const files = atom({ plugin: 'guild-spyglass', key: 'files' } as const, { groups: [], isLoaded: false } as SpyglassFiles)
const trees = atom({ plugin: 'guild-spyglass', key: 'trees' } as const, [] as SpyglassTree[])

const toplevel = async ($: EngineInterface, dir: string) => {
  const got = await git($, ['-C', dir, 'rev-parse', '--show-toplevel'])
  return 'out' in got ? got.out.trim() || undefined : undefined
}

const dirOf = (path: string) => path.slice(0, Math.max(1, path.lastIndexOf('/')))

// An adventurer edited this file: its working tree joins the tab when it is not the camp's.
async function noteTree($: EngineInterface, path: string, agentId: string): Promise<void> {
  const root = await toplevel($, dirOf(path))
  if (!root || !cwd || root === (await toplevel($, cwd))) return
  const label = `ADVENTURER · ${adventurers.get(agentId) ?? root.slice(root.lastIndexOf('/') + 1)}`
  await update($, trees, list => (list.some(t => t.root === root) ? list : [...list, { root, label }]))
}

// git's empty tree: what a repository with no commit yet is compared against.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// One tree's changes against where it left the base, since its last commit when it has no base, or everything when
// it has no commit yet.
async function changesIn($: EngineInterface, root: string): Promise<{ files: SpyglassChangedFile[] } | { why: string }> {
  const base = await git($, ['-C', root, 'merge-base', 'HEAD', 'origin/HEAD'])
  const head = 'out' in base ? undefined : await git($, ['-C', root, 'rev-parse', '--verify', '--quiet', 'HEAD'])
  const from = 'out' in base && base.out.trim() ? base.out.trim() : head && 'why' in head ? EMPTY_TREE : 'HEAD'
  const tracked = await git($, ['-C', root, 'diff', '--numstat', '-z', '--no-renames', from])
  if ('why' in tracked) return { why: `git cannot read ${root}: ${tracked.why}` }
  const others = await git($, ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'])
  const fresh = 'out' in others ? others.out : ''
  const lines = new Map<string, number>()
  for (const path of fresh.split('\0').filter(Boolean).slice(0, 200)) {
    try {
      lines.set(path, lineCount(await $.fs.read(`${root}/${path}`)))
    } catch {
      lines.set(path, 0)
    }
  }
  return { files: merged(parseNumstat(tracked.out), untracked(fresh, p => lines.get(p) ?? 0)) }
}

async function refreshFiles($: EngineInterface): Promise<void> {
  const camp = cwd ? await toplevel($, cwd) : undefined
  const focus = await focusOf($)
  const groups: SpyglassFileGroup[] = []
  const wanted = [
    ...(camp ? [{ root: camp, label: focus ? `CAMP · ${focus}` : camp.slice(camp.lastIndexOf('/') + 1), isCamp: true }] : []),
    ...(await read($, trees)).map(t => ({ ...t, isCamp: false })),
  ]
  for (const w of wanted) {
    const got = await changesIn($, w.root)
    groups.push('why' in got ? { ...w, files: [], why: got.why } : { ...w, files: got.files })
  }
  if (!camp) groups.unshift({ root: cwd ?? '', label: 'this session', isCamp: true, files: [], why: 'not in a git working tree' })
  await update($, files, () => ({ groups, isLoaded: true }))
}

// Opens the file with editor: from guild.conf (the Mac's open by default), and says so under the prompt.
async function openFile($: EngineInterface, group: SpyglassFileGroup, file: SpyglassChangedFile): Promise<void> {
  let editor = 'open'
  try {
    editor = confValue(await $.fs.read(await hallConf($)), 'editor') ?? editor
  } catch {
    // No guild.conf: the default editor.
  }
  const path = `${group.root}/${file.path}`
  try {
    const run = await $.process.run(openArgv(editor, path))
    $.ui.toast(run.exitCode === 0 ? `Opened ${file.path}` : `${editor} could not open ${file.path}: ${run.stderr.trim().split('\n')[0] ?? ''}`)
  } catch (err) {
    $.ui.toast(`${editor} could not open ${file.path}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// The configs tab's settings, and the one opened.
const settings = atom({ plugin: 'guild-spyglass', key: 'settings' } as const, { rows: [], isLoaded: false } as SpyglassSettings)
const settingOpen = atom({ plugin: 'guild-spyglass', key: 'settingOpen' } as const, '')

async function refreshSettings($: EngineInterface): Promise<void> {
  const got = await runGm($, ['config', '--json'])
  const next: SpyglassSettings = 'why' in got ? { rows: [], why: whyNot(got.why), isLoaded: true } : { rows: parseSettings(got.out), isLoaded: true }
  await update($, settings, () => next)
}

// gm config set or unset, through the guild's gm: what it says goes under the prompt, and the tab reads the file again.
async function changeSetting($: EngineInterface, args: string[]): Promise<void> {
  const got = await runGm($, ['config', ...args])
  $.ui.toast('why' in got ? `Unchanged: ${got.why}` : got.out.trim().split('\n')[0] ?? '')
  await refreshSettings($)
}

// The context tab's figures. The plain read costs nothing and keeps the breakdown last estimated or counted.
const context = atom({ plugin: 'guild-spyglass', key: 'context' } as const, { isLoaded: false, window: 0, limits: [] } as SpyglassContext)

async function refreshContext($: EngineInterface, breakdown?: 'summary' | 'full'): Promise<void> {
  try {
    const usage = await $.session.usage(breakdown ? { breakdown } : undefined)
    const fresh = contextOf(usage, breakdown)
    await update($, context, held => ({ ...fresh, breakdown: fresh.breakdown ?? held.breakdown }))
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    await update($, context, held => ({ ...held, isLoaded: true, why }))
  }
}

// The activity tab's rows, oldest first, and the filter it shows them through.
const deeds = atom({ plugin: 'guild-spyglass', key: 'deeds' } as const, [] as SpyglassDeed[])
const activityFilter = atom({ plugin: 'guild-spyglass', key: 'activityFilter' } as const, 'all')
let deedCount = 0

async function addDeed($: EngineInterface, deed: Omit<SpyglassDeed, 'id' | 'at'> & { id?: string }): Promise<string> {
  const id = deed.id ?? `d${(deedCount += 1)}`
  const at = await $.clock.now()
  await update($, deeds, list => [...list, { ...deed, id, at }].slice(-KEEP))
  return id
}

const endDeed = ($: EngineInterface, id: string, status: SpyglassDeed['status']) =>
  update($, deeds, list => list.map(d => (d.id === id ? { ...d, status } : d)))

const adventurerName = (agentId: string | undefined) => (agentId === undefined ? '' : adventurers.get(agentId) ?? 'adventurer')

// What the tabs draw from, read again: at the open, every few seconds while the pane is up, and after this session's
// own gm commands, so a change made in any session shows here soon.
const EVERY_MS = 5000
let watch: Timer | undefined

async function refresh($: EngineInterface): Promise<void> {
  const seat = await seatOf($)
  const offered = tabsFor(seat)
  if (offered.some(t => t.id === 'postings')) await refreshPostings($, await focusOf($))
  if (offered.some(t => t.id === 'files')) await refreshFiles($)
  if (offered.some(t => t.id === 'configs')) await refreshSettings($)
  if (offered.some(t => t.id === 'context')) await refreshContext($)
}

function startWatch($: EngineInterface): void {
  watch?.cancel()
  watch = $.clock.every(EVERY_MS, () => void refresh($))
}

function stopWatch(): void {
  watch?.cancel()
  watch = undefined
}

const tab = atom({ plugin: 'guild-spyglass', key: 'tab' } as const, '')

async function closePane($: EngineInterface): Promise<void> {
  stopWatch()
  await $.ui.close({ id: PANE })
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    frontDesk = undefined
    await $.command.register({
      name: 'spyglass',
      description: 'Open the spyglass, a pane of the party\'s work beside the chat, or close it: /spyglass turns it, /spyglass open|close sets it, /spyglass <tab> or next opens it on a tab',
      argumentHint: '[open | close | board | satchel | deeds | codex | lantern | next]',
      immediate: true,
    })
    // A session that starts again or resumes has its transcript's deeds as rows, unless a reload kept the rows.
    if ((await read($, deeds)).length === 0) {
      try {
        const done = deedsOfTranscript(await $.session.messages())
        if (done.length) await update($, deeds, list => (list.length ? list : done))
      } catch {
        // No transcript to read: the tab starts empty.
      }
    }
    // A reload finds the pane still up: the watch starts again.
    if (await isOpen($)) {
      startWatch($)
      void refresh($)
    }
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) stopWatch()
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) adventurers.set(started.agentId, e.description)
    return started
  })

  // Every deed is an activity row while it runs and after, with the notice lines a gm command printed. An adventurer's
  // edit also names its working tree; the camp's own changes are read from git at each refresh.
  on('tool.call', async ($, e, next) => {
    const { tool, tool_use_id: toolUseId, agentId, ...input } = e
    const id = await addDeed($, { id: `t:${toolUseId}`, ...describeCall(tool, input), who: adventurerName(agentId), status: 'running' })
    const ran = await next(e)
    await endDeed($, id, ran.isError ? 'error' : 'ok')
    if (e.tool === 'Bash' && !ran.isError && isNoticeCommand(e.command)) {
      const out = (ran.result as { stdout?: unknown } | undefined)?.stdout
      for (const line of noticeLines(typeof out === 'string' ? out : ran.text ?? '')) {
        await addDeed($, { kind: 'notice', title: line, detail: '', who: adventurerName(agentId), status: 'ok' })
      }
    }
    if (agentId === undefined) return ran
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : undefined
    if (path) await noteTree($, path, agentId)
    return ran
  })

  // A turn's end changes what fills the context: the estimate is made again while the pane is up.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (watch) await refreshContext($, 'summary')
    return done
  })

  // An adventurer's return, whether it ran in the foreground or the background.
  on('classic.SubagentStop', async ($, e, next) => {
    await addDeed($, { kind: 'adventurer', title: `${adventurers.get(e.agent_id) ?? e.agent_type} returns`,
      detail: (e.last_assistant_message ?? '').replace(/\s+/g, ' ').slice(0, 160), who: '', status: 'ok' })
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (watch && /(^|[\s;&|(])gm\s/.test(e.command)) await refresh($)
    return ran
  })

  // Answers with the pane itself, or a toast, and leaves no row in the transcript.
  // Answers with the pane itself, or a toast, and leaves no row in the transcript. A tab's name, or next, opens the pane
  // on that tab: the way to choose one from the chat, where the cursor stays.
  on('command.run', { command: 'spyglass' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const offered = tabsFor(await seatOf($))
    const named = tabNamed(arg)
    if (!['', 'open', 'close', 'next'].includes(arg) && !named) {
      $.ui.toast(`/spyglass takes open, close, next or a tab: ${TABS.map(t => tabLabel(t.id).split(' ')[1]?.toLowerCase()).join(', ')}`)
      return {}
    }
    if (named && !offered.some(t => t.id === named)) {
      $.ui.toast(`The ${tabLabel(named).split(' ')[1]} is not offered here`)
      return {}
    }
    const isUp = await isOpen($)
    if (arg === 'close' || (arg === '' && isUp)) {
      await closePane($)
      return {}
    }
    if (named) await update($, tab, () => named)
    if (arg === 'next' && isUp) {
      const now = shown(await read($, tab), offered)
      const at = offered.findIndex(t => t.id === now?.id)
      await update($, tab, () => offered[(at + 1) % offered.length]?.id ?? '')
    }
    if (isUp) return {}
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (!opened.isPlaced) {
      $.ui.toast(`The spyglass cannot open here: ${opened.reason}`)
      return {}
    }
    startWatch($)
    await refresh($)
    await refreshContext($, 'summary')
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const offered = tabsFor(await seatOf($))
    const current = shown(await read($, tab), offered)
    if (!current) return <Text dimColor>Nothing to see through the spyglass yet.</Text>
    const width = Math.max(20, e.props.bodyColumns)
    return (
      <Box flexDirection="column">
        {tabStrip($.ui.resolve(e), offered, current.id, width, id => void update($, tab, () => id), () => void closePane($))}
        <Box flexDirection="column" marginTop={1}>{await body($, e, current.id)}</Box>
      </Box>
    )
  })
}
