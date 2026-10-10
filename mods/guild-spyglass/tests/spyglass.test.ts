import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { PANE, seatFrom, shown, tabsFor, type Tab } from '../hooks/register'
import { clock, describeCall, isNoticeCommand, noticeLines, shownDeeds } from '../hooks/tabs/activity'
import { parseSettings, toggledWords } from '../hooks/tabs/configs'
import { banner, kTokens, resetsIn, stack } from '../hooks/tabs/context'
import { lineCount, merged, openArgv, parseNumstat, untracked } from '../hooks/tabs/files'
import { listArgs, parsePostings, stateMark } from '../hooks/tabs/postings'
import { ruleUnder, tabLabel, when } from '../hooks/tabs/ui'

// What stands for Claude Code and the machine beneath the mod: the environment gm starts a session with, the guild's gm
// at ~/.local/bin/gm and the board it lists, the clock, and the engine's record of open panes, which the mod's opens
// and closes change. The journal records what the mod asked for.
const HOME = '/home/p'
const GM = `${HOME}/.local/bin/gm`
const LEADER = { HOME, GM_CHAT: 'banners', GM_CHAT_FOCUS: 'appt-v2' }
const DESK = { HOME, GM_CHAT: 'banners' }

type Row = { ref: string; focus: string; num: number; slug: string; state: string; summary: string; why?: string; until?: string; last?: string }
const row = (focus: string, num: number, slug: string, state: string, more: Partial<Row> = {}): Row =>
  ({ ref: `${focus}#${num}`, focus, num, slug, state, summary: `the words of ${slug}`, ...more })

// A working tree as the stand-in git knows it: its tracked changes as numstat lines, its untracked files and what
// they hold, and whether it has a base to diff from.
type Tree = { numstat: string[]; untracked: Record<string, string>; hasBase: boolean; broken?: string; noCommit?: boolean }

type Setting = { key: string; value: string; source: string; default: string; kind: string; description: string; env: string; choices: string[]; isMulti: boolean }
const setting = (key: string, value: string, more: Partial<Setting> = {}): Setting =>
  ({ key, value, source: 'default', default: value, kind: 'text', description: `what ${key} is`, env: '', choices: [], isMulti: false, ...more })

type World = {
  panes: Set<string>
  board: Row[]
  trees: Map<string, Tree>
  conf?: string
  settings: Setting[]
  usage: { tokens?: number; percent?: number; asked: (string | undefined)[]; fails?: string }
  clock: { advance: (ms: number) => Promise<void>; now: () => number }
  journal: { opens: string[]; closes: string[]; toasts: string[]; commands: string[]; runs: string[][]; gits: string[][]; edits: string[][] }
  failGm: (why: string | undefined) => void
}

function world(on: On, env: Record<string, string> = LEADER, placed = true): World {
  const panes = new Set<string>()
  const journal: World['journal'] = { opens: [], closes: [], toasts: [], commands: [], runs: [], gits: [], edits: [] }
  const w: World = { panes, board: [], trees: new Map(), settings: [], usage: { tokens: 124000, percent: 62, asked: [] }, clock: mock.clock(on), journal, failGm: why => (failure = why) }
  let failure: string | undefined
  mock.env(on, env)
  on('fs.read', async (_$, e) => {
    if (e.path === `${HOME}/.guildmaster/guild.conf` && w.conf !== undefined) return { value: w.conf }
    for (const [root, t] of w.trees) {
      const text = t.untracked[e.path.slice(root.length + 1)]
      if (e.path.startsWith(`${root}/`) && text !== undefined) return { value: text }
    }
    return { deny: `ENOENT: ${e.path}` }
  })
  on('fs.stat', async (_$, e) =>
    e.path === GM ? { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: true, realPath: '/clone/bin/gm' } } : { deny: `ENOENT: ${e.path}` })
  // gm list --json [--all] [focus]: the board, as gm prints it.
  const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  const no = (stderr: string) => ({ value: { exitCode: 128, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', async (_$, e) => {
    if (e.argv[0] === 'git') {
      journal.gits.push([...e.argv])
      const [, , dir = '', ...rest] = e.argv
      const root = [...w.trees.keys()].find(r => dir === r || dir.startsWith(`${r}/`))
      const t = root ? w.trees.get(root) : undefined
      if (!root || !t) return no('fatal: not a git repository')
      if (rest[0] === 'rev-parse' && rest[1] === '--verify') return t.noCommit ? no('') : ok('abc999\n')
      if (rest[0] === 'rev-parse') return ok(`${root}\n`)
      if (rest[0] === 'merge-base') return t.hasBase ? ok('abc123\n') : no('fatal: Not a valid object name origin/HEAD')
      if (t.broken) return no(t.broken)
      if (rest[0] === 'diff') return ok(t.numstat.map(l => `${l}\0`).join(''))
      if (rest[0] === 'ls-files') return ok(Object.keys(t.untracked).map(f => `${f}\0`).join(''))
      return no('unknown')
    }
    if (e.argv[0] === '/bin/sh') {
      journal.edits.push([...e.argv])
      return ok('')
    }
    journal.runs.push([...e.argv])
    if (failure) return { value: { exitCode: 1, stdout: '', stderr: `gm: ${failure}\n`, isStdoutTruncated: false, isStderrTruncated: false } }
    const args = e.argv.slice(1)
    // gm config --json, and gm config set|unset <key> [words]: the settings, and gm's one line for a change.
    if (args[0] === 'config') {
      if (args[1] === '--json') return ok(JSON.stringify(w.settings))
      const [, verb, key = '', ...words] = args
      const one = w.settings.find(x => x.key === key)
      if (!one || (verb === 'set' && words.length === 0)) return no(`gm: config: ${key} cannot be ''`)
      Object.assign(one, verb === 'set' ? { value: words.join(' '), source: 'guild.conf' } : { value: one.default, source: 'default' })
      return ok(`${key} is ${verb === 'set' ? words.join(' ') : 'its default'}: running sessions follow at their next turn.\n`)
    }
    const all = args.includes('--all')
    const focus = args.slice(2).find(a => a !== '--all')
    const rows = w.board.filter(r => (!focus || r.focus === focus) && (all || !['done', 'closed'].includes(r.state)))
      .map(r => ({ updated: '2026-10-10T02:00:00Z', why: null, until: null, last: null, ...r }))
    return { value: { exitCode: 0, stdout: JSON.stringify(rows), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // The status line's figures, and /context's breakdown when asked for one.
  on('session.usage', async (_$, e) => {
    w.usage.asked.push(e?.breakdown)
    if (w.usage.fails) return { deny: w.usage.fails }
    const breakdown = e?.breakdown ? {
      categories: [
        { name: 'Messages', tokens: 90000, color: '#4a7bd9', isDeferred: false, kind: 'used' as const },
        { name: 'MCP tools', tokens: 20000, color: '#9b59b6', isDeferred: false, kind: 'used' as const },
        { name: 'Free space', tokens: 50000, color: '#888888', isDeferred: false, kind: 'free' as const },
        { name: 'Empty', tokens: 0, color: '#888888', isDeferred: false, kind: 'used' as const },
      ],
      totalTokens: 120000, maxTokens: 200000, rawMaxTokens: 200000, autocompactSource: 'model' as never, percentage: 60, gridRows: [], model: 'm',
      memoryFiles: [{ path: '/camps/appt-v2/CLAUDE.md', type: 'Project', tokens: 900 }],
      mcpTools: [{ name: 'a', serverName: 'linear', tokens: 12000, isLoaded: true }, { name: 'b', serverName: 'linear', tokens: 3000, isLoaded: true },
        { name: 'c', serverName: 'gmail', tokens: 5000, isLoaded: true }, { name: 'd', serverName: 'gmail', tokens: 29000, isLoaded: false }],
      agents: [], autoCompactThreshold: 160000, isAutoCompactEnabled: true, apiUsage: null,
    } : undefined
    return { value: { startedAt: 0, context: { tokens: w.usage.tokens, window: 200000, percent: w.usage.percent, breakdown },
      rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: new Date(w.clock.now() + 3 * 3600_000 + 43 * 60_000).toISOString() }], cost: { usd: 1.234 } } }
  })
  on('command.register', async (_$, e) => {
    journal.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', async (_$, e) => {
    journal.opens.push(e.id)
    if (!placed) return { value: { isPlaced: false as const, reason: 'the terminal is too narrow' } }
    panes.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async (_$, e) => {
    journal.closes.push(e.id)
    panes.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', async () => ({
    value: [...panes].map(id => ({ id, title: 'Spyglass', isShown: true, isFocused: false, isPlaced: true })),
  }))
  on('ui.toast', async (_$, e) => {
    journal.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  return w
}

const CAMP = '/camps/appt-v2'
const sessionStart = { cwd: `${CAMP}/src`, surface: 'terminal' as const, isInteractive: true }
const spyglass = (args = '') => ({
  command: 'spyglass',
  args,
  origin: { kind: 'composer' as const },
  presentation: { layout: 'main' as const, isFullscreen: true, columns: 160 },
})
const pane = (surface: 'terminal' | 'desktop') => ({
  plugin: 'guild-spyglass',
  surface,
  component: 'Pane' as const,
  requestId: PANE,
  viewport: { columns: 160, rows: 40 },
  props: { title: 'Spyglass', isFocused: false, bodyColumns: 50, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 36 }, view: {} },
})

describe('/spyglass', () => {
  test('is registered at every session start, and opens nothing by itself', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    expect(w.journal.commands).toEqual(['spyglass'])
    expect(w.journal.opens).toEqual([])
  })

  test('opens the pane, and closes it the second time', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    expect(await $.command.run(spyglass())).toEqual({})
    expect([...w.panes]).toEqual([PANE])
    await $.command.run(spyglass())
    expect(w.panes.size).toBe(0)
    expect(w.journal.closes).toEqual([PANE])
  })

  test('open and close set it, whatever it was', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    await $.command.run(spyglass('open'))
    await $.command.run(spyglass('open'))
    expect([...w.panes]).toEqual([PANE])
    await $.command.run(spyglass('close'))
    await $.command.run(spyglass('close'))
    expect(w.panes.size).toBe(0)
  })

  test('says what it takes, and changes nothing, for anything else', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    await $.command.run(spyglass('sideways'))
    expect(w.journal.toasts).toEqual(['/spyglass takes open or close'])
    expect(w.journal.opens).toEqual([])
  })

  test('says why when the surface does not place it', async ($, on) => {
    const w = world(on, undefined, false)
    await $.session.start(sessionStart)
    await $.command.run(spyglass())
    expect(w.journal.toasts).toEqual(['The spyglass cannot open here: the terminal is too narrow'])
  })
})

describe('the pane', () => {
  test('draws on every surface; a session outside the guild is offered the files tab alone', async ($, on) => {
    world(on, { HOME })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(pane(surface))
      expect((await ui.findAll({ type: 'Button' })).map(b => b.text).filter(t => t === '⚑ Board' || t === '✎ Satchel')).toEqual(['✎ Satchel'])
      await ui.unmount()
    }
  })
})

describe('the seat and its tabs', () => {
  const tabs: Tab[] = [
    { id: 'postings', title: 'Postings', seats: ['guildmaster', 'party-leader'] },
    { id: 'files', title: 'Files', seats: ['party-leader', 'other'] },
  ]

  test('a Party Leader is told its focus, or its camp\'s settings name it; the front desk is told only the style', () => {
    expect(seatFrom({ GM_CHAT: 'banners', GM_CHAT_FOCUS: 'appt-v2' })).toBe('party-leader')
    expect(seatFrom({ GM_FOCUS: 'appt-v2' })).toBe('party-leader')
    expect(seatFrom({ GM_CHAT: 'off' })).toBe('guildmaster')
    expect(seatFrom({})).toBe('other')
  })

  test('each seat is offered its own tabs, in order', () => {
    expect(tabsFor('guildmaster', tabs).map(t => t.id)).toEqual(['postings'])
    expect(tabsFor('party-leader', tabs).map(t => t.id)).toEqual(['postings', 'files'])
    expect(tabsFor('other', tabs).map(t => t.id)).toEqual(['files'])
  })

  test('the tab last chosen is shown while the seat offers it, else the first', () => {
    expect(shown('files', tabs)?.id).toBe('files')
    expect(shown('', tabs)?.id).toBe('postings')
    expect(shown('files', tabsFor('guildmaster', tabs))?.id).toBe('postings')
    expect(shown('', [])).toBeUndefined()
  })
})

describe('the postings tab', () => {
  const opened = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
    await $.session.start(sessionStart)
    await $.command.run(spyglass())
    return $.ui.mount(pane(surface))
  }
  const texts = async (ui: { findAll: (q: { type: 'Text' | 'Button' }) => Promise<{ text?: string }[]> }) =>
    [...(await ui.findAll({ type: 'Button' })), ...(await ui.findAll({ type: 'Text' }))].map(t => t.text ?? '').join('\n')

  test('a Party Leader sees its own focus\'s board, read from the guild\'s gm at the open', async ($, on) => {
    const w = world(on)
    w.board = [row('appt-v2', 1, 'grey-button', 'active'), row('appt-v2', 2, 'owner-empty', 'needs-you'), row('crm-1', 1, 'elsewhere', 'queued')]
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await opened($, surface)
      expect(w.journal.runs[0]).toEqual([GM, 'list', '--json', '--all', 'appt-v2'])
      const all = await texts(ui)
      expect(all).toContain('#1 grey-button')
      expect(all).toContain('#2 owner-empty')
      expect(all).toMatch(/NEEDS YOU\n1\n/)
      expect(all).toMatch(/ACTIVE\n1\n/)
      expect(all.indexOf('#2 owner-empty')).toBeLessThan(all.indexOf('#1 grey-button'))
      expect(all).not.toContain('elsewhere')
      await ui.unmount()
      await $.command.run(spyglass('close'))
    }
  })

  test('the front desk sees every focus, each under its name', async ($, on) => {
    const w = world(on, DESK)
    w.board = [row('appt-v2', 1, 'grey-button', 'active'), row('crm-1', 1, 'elsewhere', 'queued')]
    const ui = await opened($)
    expect(w.journal.runs[0]).toEqual([GM, 'list', '--json', '--all'])
    const all = await texts(ui)
    expect(all).toContain('appt-v2#1 grey-button')
    expect(all).toContain('crm-1#1 elsewhere')
  })

  test('a press opens a posting to its last notice and why it is parked, and a second press folds it', async ($, on) => {
    const w = world(on)
    w.board = [row('appt-v2', 3, 'waits', 'parked', { why: 'dev deploy', until: 'Monday', last: 'appt-v2#3 waits parked: dev deploy' })]
    const ui = await opened($)
    expect(await texts(ui)).not.toContain('parked: dev deploy, until Monday')
    await ui.press({ key: 'posting:appt-v2#3' })
    expect(await texts(ui)).toContain('parked: dev deploy, until Monday')
    expect(await texts(ui)).toContain('appt-v2#3 waits parked: dev deploy')
    await ui.press({ key: 'posting:appt-v2#3' })
    expect(await texts(ui)).not.toContain('parked: dev deploy, until Monday')
  })

  test('finished postings show only while asked for', async ($, on) => {
    const w = world(on)
    w.board = [row('appt-v2', 1, 'shipped', 'done'), row('appt-v2', 2, 'next-one', 'queued')]
    const ui = await opened($)
    expect(await texts(ui)).not.toContain('shipped')
    expect(await texts(ui)).toContain('1 · hidden')
    const runs = w.journal.runs.length
    await ui.press({ key: 'postings:all' })
    expect(w.journal.runs.length).toBe(runs)
    expect(await texts(ui)).toContain('#1 shipped')
    expect(await texts(ui)).toContain('hide done')
  })

  test('a change made anywhere shows within the watch\'s few seconds, and the watch ends with the pane', async ($, on) => {
    const w = world(on)
    w.board = [row('appt-v2', 1, 'grey-button', 'queued')]
    const ui = await opened($)
    w.board = [row('appt-v2', 1, 'grey-button', 'active')]
    await w.clock.advance(5000)
    expect(await texts(ui)).toMatch(/ACTIVE\n1\n/)
    await $.command.run(spyglass('close'))
    const runs = w.journal.runs.length
    await w.clock.advance(20000)
    expect(w.journal.runs.length).toBe(runs)
  })

  test('this session\'s own gm command shows at once, any other command does not read the board', async ($, on) => {
    const w = world(on)
    on('tool.call', async () => ({ result: { stdout: 'ok', stderr: '' } }))
    w.board = [row('appt-v2', 1, 'grey-button', 'queued')]
    const ui = await opened($)
    w.board = [row('appt-v2', 1, 'grey-button', 'active')]
    const lists = () => w.journal.runs.filter(r => r[1] === 'list').length
    const runs = lists()
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'ls -la' })
    expect(lists()).toBe(runs)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'gm notice 1 started' })
    expect(lists()).toBe(runs + 1)
    expect(await texts(ui)).toMatch(/ACTIVE\n1\n/)
  })

  test('says plainly when the guild\'s gm is older than the tab', async ($, on) => {
    const w = world(on)
    w.failGm('list: unknown option --json')
    const ui = await opened($)
    expect(await texts(ui)).toContain('is older than the spyglass: it learns --json when the change that brings the spyglass is merged')
  })

  test('says why when gm cannot list the board', async ($, on) => {
    const w = world(on)
    w.failGm('no focus here')
    const ui = await opened($)
    expect(await texts(ui)).toContain('gm cannot list the postings: gm: no focus here')
  })

  test('reads gm list --json as the tab holds it', () => {
    expect(parsePostings('not json')).toEqual([])
    expect(parsePostings('{"ref":"x"}')).toEqual([])
    expect(parsePostings('[{"ref":"a#1","num":1,"state":"queued"},{"num":2}]')).toEqual([
      { ref: 'a#1', focus: '', num: 1, slug: '', state: 'queued', updated: '', summary: '', why: null, until: null, last: null },
    ])
    expect(listArgs(undefined)).toEqual(['list', '--json', '--all'])
    expect(listArgs('appt-v2')).toEqual(['list', '--json', '--all', 'appt-v2'])
    expect(stateMark('needs-you').isDim).toBe(false)
    expect(stateMark('done').isDim).toBe(true)
  })
})

describe('the files tab', () => {
  const opened = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
    await $.session.start(sessionStart)
    await $.command.run(spyglass())
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: 'tab:files' })
    return ui
  }
  const texts = async (ui: { findAll: (q: { type: 'Text' | 'Button' }) => Promise<{ text?: string }[]> }) =>
    [...(await ui.findAll({ type: 'Button' })), ...(await ui.findAll({ type: 'Text' }))].map(t => t.text ?? '').join('\n')

  test('the camp\'s branch against its base, committed or not, new files with their lines', async ($, on) => {
    const w = world(on)
    w.trees.set(CAMP, { numstat: ['12\t3\tsrc/a.ts', '-\t-\tlogo.png'], untracked: { 'notes.md': 'one\ntwo\n' }, hasBase: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await opened($, surface)
      const all = await texts(ui)
      expect(all).toContain('CAMP · APPT-V2')
      expect(all).toContain('3 files +14 −3')
      expect(all).toMatch(/src\/a\.ts\nsrc\/\n\s*\+12 −3/)
      expect(all).toMatch(/logo\.png\n\nbinary/)
      expect(all).toMatch(/notes\.md\n\n\s*\+2\s*new/)
      expect(w.journal.gits).toContainEqual(['git', '-C', CAMP, 'diff', '--numstat', '-z', '--no-renames', 'abc123'])
      await ui.unmount()
      await $.command.run(spyglass('close'))
    }
  })

  test('a tree with no base is read since its last commit', async ($, on) => {
    const w = world(on)
    w.trees.set(CAMP, { numstat: [], untracked: {}, hasBase: false })
    const ui = await opened($)
    expect(await texts(ui)).toContain('No changes.')
    expect(w.journal.gits).toContainEqual(['git', '-C', CAMP, 'diff', '--numstat', '-z', '--no-renames', 'HEAD'])
  })

  test('an adventurer\'s worktree joins under its name the first time it edits there; the camp\'s own edits add nothing', async ($, on) => {
    const w = world(on)
    const TREE = '/camps/appt-v2/.claude/worktrees/agent-1'
    w.trees.set(TREE, { numstat: ['4\t0\tlib/b.ts'], untracked: {}, hasBase: true })
    w.trees.set(CAMP, { numstat: ['1\t1\tsrc/a.ts'], untracked: {}, hasBase: true })
    on('agent.spawn', async () => ({ model: 'm', agentId: 'agent-1' }))
    on('tool.call', async () => ({ result: {} }))
    const ui = await opened($)
    await $.agent.spawn({ tool_use_id: 'a1', prompt: 'p', description: 'fix-owner', subagentType: 'general-purpose',
      provider: { plugin: 'engine', tier: 'core' }, parentModel: 'm' } as never)
    await $.tool.call({ tool: 'Edit', tool_use_id: 'e0', file_path: `${CAMP}/src/a.ts`, old_string: 'a', new_string: 'b', agentId: 'agent-1' } as never)
    await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: `${TREE}/lib/b.ts`, old_string: 'a', new_string: 'b', agentId: 'agent-1' } as never)
    await $.tool.call({ tool: 'Write', tool_use_id: 'e2', file_path: `${TREE}/lib/c.ts`, content: 'x', agentId: 'agent-1' } as never)
    await ui.press({ key: 'files:refresh' })
    const all = await texts(ui)
    expect(all).toContain('ADVENTURER · FIX-OWNER')
    expect(all).toMatch(/lib\/b\.ts\nlib\/\n\s*\+4/)
    expect(all.match(/ADVENTURER/g)?.length).toBe(1)
  })

  test('a press opens the file in the editor guild.conf names, its path one argument', async ($, on) => {
    const w = world(on)
    w.trees.set(CAMP, { numstat: ['1\t0\tsrc/my file.ts'], untracked: {}, hasBase: true })
    w.conf = '# editor: <command>, default open\neditor: open -a Zed\n'
    const ui = await opened($)
    await ui.press({ key: `file:${CAMP}:src/my file.ts` })
    expect(w.journal.edits).toEqual([['/bin/sh', '-c', 'open -a Zed "$1"', 'spyglass', `${CAMP}/src/my file.ts`]])
    expect(w.journal.toasts).toContain('Opened src/my file.ts')
  })

  test('with no editor set, the Mac\'s open', async ($, on) => {
    const w = world(on)
    w.trees.set(CAMP, { numstat: ['1\t0\tsrc/a.ts'], untracked: {}, hasBase: true })
    const ui = await opened($)
    await ui.press({ key: `file:${CAMP}:src/a.ts` })
    expect(w.journal.edits[0]?.[2]).toBe('open "$1"')
  })

  test('a repository with no commit yet is read against the empty tree', async ($, on) => {
    const w = world(on)
    w.trees.set(CAMP, { numstat: [], untracked: { 'a.txt': 'hi\n' }, hasBase: false, noCommit: true })
    const ui = await opened($)
    expect(await texts(ui)).toMatch(/a\.txt\n\n\s*\+1\s*new/)
    expect(w.journal.gits).toContainEqual(['git', '-C', CAMP, 'diff', '--numstat', '-z', '--no-renames', '4b825dc642cb6eb9a060e54bf8d69288fbee4904'])
  })

  test('says why when git cannot read a tree, and when the session is in none', async ($, on) => {
    const w = world(on)
    w.trees.set(CAMP, { numstat: [], untracked: {}, hasBase: true, broken: 'fatal: bad object' })
    const ui = await opened($)
    expect(await texts(ui)).toContain(`git cannot read ${CAMP}: fatal: bad object`)
    w.trees.clear()
    await ui.press({ key: 'files:refresh' })
    expect(await texts(ui)).toContain('not in a git working tree')
  })

  test('reads git\'s output as the tab holds it', () => {
    expect(parseNumstat('3\t1\ta.ts\0-\t-\tb.png\0junk\0')).toEqual([
      { path: 'a.ts', added: 3, deleted: 1, isBinary: false, isNew: false },
      { path: 'b.png', added: 0, deleted: 0, isBinary: true, isNew: false },
    ])
    expect(lineCount('')).toBe(0)
    expect(lineCount('a')).toBe(1)
    expect(lineCount('a\nb\n')).toBe(2)
    expect(merged([{ path: 'b', added: 1, deleted: 0, isBinary: false, isNew: false }], untracked('a\0b\0', () => 5)).map(f => f.path)).toEqual(['a', 'b'])
    expect(openArgv('code -g', 'x y')).toEqual(['/bin/sh', '-c', 'code -g "$1"', 'spyglass', 'x y'])
  })
})

describe('the activity tab', () => {
  const opened = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
    await $.session.start(sessionStart)
    await $.command.run(spyglass())
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: 'tab:activity' })
    return ui
  }
  const texts = async (ui: { findAll: (q: { type: 'Text' | 'Button' }) => Promise<{ text?: string }[]> }) =>
    (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').join('\n')

  // What the tools answer beneath the mod: Bash prints its command's output, gm notice its notice line.
  const tools = (on: On, failing: string[] = []) =>
    on('tool.call', async (_$, e) => {
      if (failing.includes(e.tool)) return { isError: true as const, result: {}, text: 'it failed' }
      if (e.tool === 'Bash' && e.command.startsWith('gm notice')) return { result: { stdout: 'appt-v2#2 owner-empty started ("the owner")\n', stderr: '' } }
      return { result: {} }
    })

  test('every deed as it ends, newest first, an MCP tool by its server, a failure marked', async ($, on) => {
    world(on)
    tools(on, ['WebFetch'])
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await opened($, surface)
      await $.tool.call({ tool: 'Read', tool_use_id: `r-${surface}`, file_path: '/camps/appt-v2/src/a.ts' } as never)
      await $.tool.call({ tool: 'mcp__linear__get_issue', tool_use_id: `m-${surface}`, id: 'CRM-12' } as never)
      await $.tool.call({ tool: 'WebFetch', tool_use_id: `w-${surface}`, url: 'https://example.com', prompt: 'x' } as never)
      const all = await texts(ui)
      expect(all).toContain('/camps/appt-v2/src/a.ts')
      expect(all).toContain('linear · get_issue')
      expect(all).toMatch(/WebFetch[^\n]*✗/)
      expect(all.indexOf('WebFetch')).toBeLessThan(all.indexOf('linear · get_issue'))
      await ui.press({ key: 'activity:mcp' })
      const mcp = await texts(ui)
      expect(mcp).toContain('linear · get_issue')
      expect(mcp).not.toContain('/camps/appt-v2/src/a.ts')
      await ui.press({ key: 'activity:all' })
      await ui.press({ key: 'activity:clear' })
      expect(await texts(ui)).toContain('Nothing done yet.')
      await ui.unmount()
      await $.command.run(spyglass('close'))
    }
  })

  test('gm\'s notice lines are rows of their own', async ($, on) => {
    world(on)
    tools(on)
    const ui = await opened($)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'gm notice 2 started' })
    await ui.press({ key: 'activity:notice' })
    const all = await texts(ui)
    expect(all).toContain('appt-v2#2 owner-empty started ("the owner")')
    expect(all).not.toContain('gm notice 2 started')
  })

  test('an adventurer sent, its deeds under its name, and its return', async ($, on) => {
    world(on)
    tools(on)
    on('agent.spawn', async () => ({ model: 'm', agentId: 'agent-7' }))
    on('classic.SubagentStop', async () => ({}))
    const ui = await opened($)
    await $.tool.call({ tool: 'Agent', tool_use_id: 'a1', description: 'scout-auth', prompt: 'Read the auth module' } as never)
    await $.agent.spawn({ tool_use_id: 'a1', prompt: 'Read the auth module', description: 'scout-auth', subagentType: 'Explore',
      provider: { plugin: 'engine', tier: 'core' }, parentModel: 'm' } as never)
    await $.tool.call({ tool: 'Grep', tool_use_id: 'g1', pattern: 'login', agentId: 'agent-7' } as never)
    await $.classic.SubagentStop({ agent_id: 'agent-7', agent_type: 'Explore', stop_hook_active: false, agent_transcript_path: '/t',
      last_assistant_message: 'Auth is in src/auth.' } as never)
    await ui.press({ key: 'activity:adventurer' })
    const advent = await texts(ui)
    expect(advent).toContain('sent scout-auth')
    expect(advent).toContain('scout-auth returns')
    expect(advent).toContain('Auth is in src/auth.')
    await ui.press({ key: 'activity:all' })
    expect(await texts(ui)).toMatch(/scout-auth › [^\n]*Grep/)
  })

  test('a session that starts again or resumes shows what its transcript did, its notices included', async ($, on) => {
    world(on)
    on('session.messages', async () => ({ value: [
      { role: 'user' as const, text: 'go', toolUses: [] },
      { role: 'assistant' as const, text: '', toolUses: [
        { tool_use_id: 'old1', tool: 'Read', input: { file_path: '/camps/appt-v2/README.md' }, text: 'x' },
        { tool_use_id: 'old2', tool: 'Bash', input: { command: 'gm notice 3 done "x"' }, text: 'appt-v2#3 x done: x ("y")\n' },
        { tool_use_id: 'old3', tool: 'mcp__linear__get_issue', input: { id: 'A-1' }, isError: true as const, text: 'no' },
      ] },
    ] }))
    const ui = await opened($)
    const all = await texts(ui)
    expect(all).toMatch(/earlier\s*⚒\s*Read/)
    expect(all).toContain('/camps/appt-v2/README.md')
    expect(all).toContain('appt-v2#3 x done: x ("y")')
    expect(all).toMatch(/linear · get_issue[^\n]*✗/)
  })

  test('names and reads deeds as the tab holds them', () => {
    expect(describeCall('Bash', { command: 'ls  -la\n' })).toEqual({ kind: 'deed', title: 'Bash', detail: 'ls -la' })
    expect(describeCall('mcp__claude_ai_Gmail__send_message', { to: 'x' }).title).toBe('claude_ai_Gmail · send_message')
    expect(describeCall('Agent', { description: 'fix', prompt: 'p' })).toEqual({ kind: 'adventurer', title: 'sent fix', detail: 'p' })
    expect(describeCall('TodoWrite', {}).detail).toBe('')
    expect(isNoticeCommand('cd x && gm notice 3 done "y"')).toBe(true)
    expect(isNoticeCommand('gm list')).toBe(false)
    expect(isNoticeCommand('pgm notice')).toBe(false)
    expect(noticeLines('a\n\n b \n')).toEqual(['a', 'b'])
    expect(clock(1)).toMatch(/^\d\d:\d\d:\d\d$/)
    expect(clock(0)).toBe('earlier')
    const d = (id: string, kind: 'deed' | 'mcp') => ({ id, at: 0, kind, who: '', title: id, detail: '', status: 'ok' as const })
    expect(shownDeeds([d('1', 'deed'), d('2', 'mcp'), d('3', 'deed')], 'all').map(x => x.id)).toEqual(['3', '2', '1'])
    expect(shownDeeds([d('1', 'deed'), d('2', 'mcp')], 'mcp').map(x => x.id)).toEqual(['2'])
  })
})

describe('the configs tab', () => {
  const opened = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
    await $.session.start(sessionStart)
    await $.command.run(spyglass())
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: 'tab:configs' })
    return ui
  }
  const texts = async (ui: { findAll: (q: { type: 'Text' | 'Button' }) => Promise<{ text?: string }[]> }) =>
    [...(await ui.findAll({ type: 'Button' })), ...(await ui.findAll({ type: 'Text' }))].map(t => t.text ?? '').join('\n')
  const settings = () => [
    setting('veil', 'off', { kind: 'onoff', choices: ['on', 'off'] }),
    setting('veil-hides', 'deeds notes', { kind: 'veilhides', choices: ['deeds', 'adventurers', 'notes', 'progress'], isMulti: true, source: 'guild.conf' }),
    setting('editor', 'open', { kind: 'command' }),
    setting('telemetry', 'on', { kind: 'onoff', choices: ['on', 'off'], env: 'GM_TELEMETRY', source: 'environment (GM_TELEMETRY)' }),
  ]

  test('every setting with its value and where it came from; a press opens one to its description', async ($, on) => {
    const w = world(on)
    w.settings = settings()
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await opened($, surface)
      const all = await texts(ui)
      expect(all).toMatch(/veil\noff\n/)
      expect(all).toContain('deeds notes · file')
      expect(all).toContain('on · env')
      expect(all).not.toContain('what veil is')
      await ui.press({ key: 'setting-key:veil' })
      expect(await texts(ui)).toContain('what veil is')
      await ui.press({ key: 'setting-key:veil' })
      expect(await texts(ui)).not.toContain('what veil is')
      await ui.unmount()
      await $.command.run(spyglass('close'))
    }
  })

  test('a switch is set with a press, through the guild\'s gm, which says what it did', async ($, on) => {
    const w = world(on)
    w.settings = settings()
    const ui = await opened($)
    await ui.press({ key: 'setting-key:veil' })
    await ui.press({ key: 'set:veil:on' })
    expect(w.journal.runs).toContainEqual([GM, 'config', 'set', 'veil', 'on'])
    expect(w.journal.toasts).toContain('veil is on: running sessions follow at their next turn.')
    expect(await texts(ui)).toContain('on · file')
  })

  test('a word of a list is added or taken away, and Default takes the line out', async ($, on) => {
    const w = world(on)
    w.settings = settings()
    const ui = await opened($)
    await ui.press({ key: 'setting-key:veil-hides' })
    await ui.press({ key: 'set:veil-hides:progress' })
    expect(w.journal.runs).toContainEqual([GM, 'config', 'set', 'veil-hides', 'deeds', 'notes', 'progress'])
    await ui.press({ key: 'set:veil-hides:deeds' })
    expect(w.journal.runs).toContainEqual([GM, 'config', 'set', 'veil-hides', 'notes', 'progress'])
    await ui.press({ key: 'unset:veil-hides' })
    expect(w.journal.runs).toContainEqual([GM, 'config', 'unset', 'veil-hides'])
  })

  test('anything else is typed in its field', async ($, on) => {
    const w = world(on)
    w.settings = settings()
    const ui = await opened($)
    await ui.press({ key: 'setting-key:editor' })
    await ui.input({ key: 'input:editor', text: ' open -a Zed ' })
    expect(w.journal.runs).toContainEqual([GM, 'config', 'set', 'editor', 'open', '-a', 'Zed'])
  })

  test('says when the environment overrides a setting, and what gm refused', async ($, on) => {
    const w = world(on)
    w.settings = settings()
    const ui = await opened($)
    await ui.press({ key: 'setting-key:telemetry' })
    expect(await texts(ui)).toContain('GM_TELEMETRY overrides it in this session')
    await ui.press({ key: 'setting-key:editor' })
    await ui.input({ key: 'input:editor', text: '   ' })
    expect(w.journal.toasts.at(-1)).toBe("Unchanged: gm: config: editor cannot be ''")
  })

  test('the quiet ledger: the gold rule sits under the chosen tab, times read as the hour or the day', () => {
    const labels = ['⚑ Board', '✎ Satchel', '⚒ Deeds']
    expect(ruleUnder(labels, 0, 40)).toEqual({ before: 0, under: 7, after: 33 })
    expect(ruleUnder(labels, 1, 40)).toEqual({ before: 9, under: 9, after: 22 })
    expect(tabLabel('context')).toBe('◔ Lantern')
    const now = new Date(2026, 9, 10, 15, 0).getTime()
    expect(when(new Date(2026, 9, 10, 9, 5).toISOString(), now)).toBe('09:05')
    expect(when(new Date(2026, 9, 9, 9, 5).toISOString(), now)).toBe('Oct 9')
    expect(when('not a time', now)).toBe('')
  })

  test('reads gm config --json as the tab holds it', () => {
    expect(parseSettings('nope')).toEqual([])
    expect(parseSettings('[{"key":"veil","choices":["on",3]}]')[0]).toMatchObject({ key: 'veil', value: '', choices: ['on'], isMulti: false })
    expect(toggledWords('deeds notes', 'notes')).toEqual(['deeds'])
    expect(toggledWords('deeds', 'progress')).toEqual(['deeds', 'progress'])
    expect(toggledWords('quill', 'none')).toEqual(['none'])
    expect(toggledWords('none', 'quill')).toEqual(['quill'])
  })
})

describe('the context tab', () => {
  const opened = async ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') => {
    await $.session.start(sessionStart)
    await $.command.run(spyglass())
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: 'tab:context' })
    return ui
  }
  const texts = async (ui: { findAll: (q: { type: 'Text' | 'Button' }) => Promise<{ text?: string }[]> }) =>
    (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').join('\n')

  test('the fill, the cost, when it compacts, and what fills it, estimated at the open', async ($, on) => {
    const w = world(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await opened($, surface)
      const all = await texts(ui)
      expect(all).toContain('━━ THE LANTERN BURNS ━')
      expect(all).toContain(' 62% ━━')
      expect(all).toMatch(/124k of 200k tokens\n\$1\.23/)
      expect(all).toMatch(/compacts at 160k\n40k to go/)
      expect(all).toMatch(/five hour limit 30%\nresets in 3h 43m/)
      expect(all).toMatch(/WHAT FEEDS IT\nestimated/)
      expect(all).toMatch(/■ Messages\n■\n90k/)
      expect(all).not.toContain('Empty')
      expect(all.indexOf('linear')).toBeLessThan(all.indexOf('gmail'))
      expect(all).toMatch(/gmail\n5k · 29k/)
      expect(all).toMatch(/linear\n15k · 0/)
      expect(all).toMatch(/\/camps\/appt-v2\/CLAUDE\.md\n900/)
      expect(w.usage.asked).toContain('summary')
      await ui.unmount()
      await $.command.run(spyglass('close'))
    }
  })

  test('Count exactly asks for the token-count API\'s figures; the watch reads only the free ones and keeps the breakdown', async ($, on) => {
    const w = world(on)
    const ui = await opened($)
    await ui.press({ key: 'context:count' })
    expect(w.usage.asked.at(-1)).toBe('full')
    expect(await texts(ui)).toMatch(/WHAT FEEDS IT\ncounted/)
    w.usage.tokens = 150000
    w.usage.percent = 75
    await w.clock.advance(5000)
    expect(w.usage.asked.at(-1)).toBeUndefined()
    expect(await texts(ui)).toContain('150k of 200k tokens')
    expect(await texts(ui)).toContain(' 75% ━━')
    expect(await texts(ui)).toMatch(/WHAT FEEDS IT\ncounted/)
  })

  test('before the first reply, and when the engine will not say', async ($, on) => {
    const w = world(on)
    w.usage.tokens = undefined
    w.usage.percent = undefined
    const ui = await opened($)
    expect(await texts(ui)).toContain('no reply yet')
    w.usage.fails = 'no session bound'
    await ui.press({ key: 'context:refresh' })
    expect(await texts(ui)).toMatch(/The context cannot be read: .*no session bound/)
  })

  test('the lantern burns low past 80%', async ($, on) => {
    const w = world(on)
    w.usage.tokens = 170000
    w.usage.percent = 85
    const ui = await opened($)
    expect(await texts(ui)).toContain('THE LANTERN BURNS LOW')
  })

  test('draws its figures as the tab holds them', () => {
    expect(kTokens(999)).toBe('999')
    expect(kTokens(1500)).toBe('1.5k')
    expect(kTokens(124000)).toBe('124k')
    expect(kTokens(1_000_000)).toBe('1M')
    expect(kTokens(1_500_000)).toBe('1.5M')
    expect(resetsIn('2026-10-12T17:00:00Z', Date.parse('2026-10-10T02:30:00Z'))).toBe('in 2d 14h')
    expect(resetsIn('2026-10-10T02:40:00Z', Date.parse('2026-10-10T02:30:00Z'))).toBe('in 10m')
    expect(resetsIn('2026-10-10T02:00:00Z', Date.parse('2026-10-10T02:30:00Z'))).toBe('now')
    expect(resetsIn('soon', 0)).toBe('soon')
    const cat = (name: string, tokens: number, kind = 'used') => ({ name, tokens, color: '#fff', kind })
    expect(stack([cat('a', 50), cat('b', 1), cat('free', 49, 'free')], 100, 10)).toEqual({ cells: [{ name: 'a', color: '#fff', n: 5 }, { name: 'b', color: '#fff', n: 1 }], free: 4 })
    expect(stack([cat('a', 300), cat('b', 300)], 100, 4).cells.reduce((t, c) => t + c.n, 0)).toBe(4)
    const top = banner('THE LANTERN BURNS', '29%', 40)
    expect(top).toEqual({ lead: '━━', label: ' THE LANTERN BURNS ', tail: `${'━'.repeat(12)} 29% ━━` })
    expect([...top.lead + top.label + top.tail].length).toBe(40)
  })
})
