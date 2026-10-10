import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { PANE, seatFrom, shown, tabsFor, type Tab } from '../hooks/register'
import { listArgs, parsePostings, stateMark, tally } from '../hooks/tabs/postings'

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

type World = {
  panes: Set<string>
  board: Row[]
  clock: { advance: (ms: number) => Promise<void> }
  journal: { opens: string[]; closes: string[]; toasts: string[]; commands: string[]; runs: string[][] }
  failGm: (why: string | undefined) => void
}

function world(on: On, env: Record<string, string> = LEADER, placed = true): World {
  const panes = new Set<string>()
  const journal: World['journal'] = { opens: [], closes: [], toasts: [], commands: [], runs: [] }
  const w: World = { panes, board: [], clock: mock.clock(on), journal, failGm: why => (failure = why) }
  let failure: string | undefined
  mock.env(on, env)
  on('fs.stat', async (_$, e) =>
    e.path === GM ? { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: true, realPath: '/clone/bin/gm' } } : { deny: `ENOENT: ${e.path}` })
  // gm list --json [--all] [focus]: the board, as gm prints it.
  on('process.run', async (_$, e) => {
    journal.runs.push([...e.argv])
    if (failure) return { value: { exitCode: 1, stdout: '', stderr: `gm: ${failure}\n`, isStdoutTruncated: false, isStderrTruncated: false } }
    const args = e.argv.slice(1)
    const all = args.includes('--all')
    const focus = args.slice(2).find(a => a !== '--all')
    const rows = w.board.filter(r => (!focus || r.focus === focus) && (all || !['done', 'closed'].includes(r.state)))
      .map(r => ({ updated: '2026-10-10T02:00:00Z', why: null, until: null, last: null, ...r }))
    return { value: { exitCode: 0, stdout: JSON.stringify(rows), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
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

const sessionStart = { cwd: '/work', surface: 'terminal' as const, isInteractive: true }
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
  test('draws on every surface, and says so where the seat is offered no tab', async ($, on) => {
    world(on, { HOME })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ type: 'Text', text: /Nothing to see through the spyglass yet/ })).toBeDefined()
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
      expect(w.journal.runs[0]).toEqual([GM, 'list', '--json', 'appt-v2'])
      const all = await texts(ui)
      expect(all).toContain('#1 grey-button')
      expect(all).toContain('#2 owner-empty')
      expect(all).toContain('1 active · 1 needs-you')
      expect(all).not.toContain('elsewhere')
      await ui.unmount()
      await $.command.run(spyglass('close'))
    }
  })

  test('the front desk sees every focus, each under its name', async ($, on) => {
    const w = world(on, DESK)
    w.board = [row('appt-v2', 1, 'grey-button', 'active'), row('crm-1', 1, 'elsewhere', 'queued')]
    const ui = await opened($)
    expect(w.journal.runs[0]).toEqual([GM, 'list', '--json'])
    const all = await texts(ui)
    expect(all).toContain('⚔ appt-v2')
    expect(all).toContain('⚔ crm-1')
    expect(all).toContain('#1 elsewhere')
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
    await ui.press({ key: 'postings:all' })
    expect(w.journal.runs.at(-1)).toEqual([GM, 'list', '--json', '--all', 'appt-v2'])
    expect(await texts(ui)).toContain('#1 shipped')
    expect(await texts(ui)).toContain('Hide finished')
  })

  test('a change made anywhere shows within the watch\'s few seconds, and the watch ends with the pane', async ($, on) => {
    const w = world(on)
    w.board = [row('appt-v2', 1, 'grey-button', 'queued')]
    const ui = await opened($)
    w.board = [row('appt-v2', 1, 'grey-button', 'active')]
    await w.clock.advance(5000)
    expect(await texts(ui)).toContain('1 active')
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
    const runs = w.journal.runs.length
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'ls -la' })
    expect(w.journal.runs.length).toBe(runs)
    await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'gm notice 1 started' })
    expect(w.journal.runs.length).toBe(runs + 1)
    expect(await texts(ui)).toContain('1 active')
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
    expect(listArgs(undefined, false)).toEqual(['list', '--json'])
    expect(listArgs('appt-v2', true)).toEqual(['list', '--json', '--all', 'appt-v2'])
    expect(stateMark('needs-you').isDim).toBe(false)
    expect(stateMark('done').isDim).toBe(true)
    expect(tally([])).toBe('no postings')
  })
})
