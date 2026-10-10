import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { PANE, seatFrom, shown, tabsFor, type Tab } from '../hooks/register'
import { clock, describeCall, isNoticeCommand, noticeLines, shownDeeds } from '../hooks/tabs/activity'
import { lineCount, merged, openArgv, parseNumstat, untracked } from '../hooks/tabs/files'
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

// A working tree as the stand-in git knows it: its tracked changes as numstat lines, its untracked files and what
// they hold, and whether it has a base to diff from.
type Tree = { numstat: string[]; untracked: Record<string, string>; hasBase: boolean; broken?: string }

type World = {
  panes: Set<string>
  board: Row[]
  trees: Map<string, Tree>
  conf?: string
  clock: { advance: (ms: number) => Promise<void> }
  journal: { opens: string[]; closes: string[]; toasts: string[]; commands: string[]; runs: string[][]; gits: string[][]; edits: string[][] }
  failGm: (why: string | undefined) => void
}

function world(on: On, env: Record<string, string> = LEADER, placed = true): World {
  const panes = new Set<string>()
  const journal: World['journal'] = { opens: [], closes: [], toasts: [], commands: [], runs: [], gits: [], edits: [] }
  const w: World = { panes, board: [], trees: new Map(), clock: mock.clock(on), journal, failGm: why => (failure = why) }
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
      expect((await ui.findAll({ type: 'Button' })).map(b => b.text).filter(t => t === 'Postings' || t === 'Files')).toEqual(['Files'])
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
      expect(all).toContain('⚔ CAMP · appt-v2')
      expect(all).toMatch(/src\/a\.ts\s*\+12\s*−3/)
      expect(all).toMatch(/logo\.png\s*binary/)
      expect(all).toMatch(/notes\.md\s*\+2\s*new/)
      expect(all).toContain('3 files +14 −3')
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
    expect(all).toContain('⛨ ADVENTURER · fix-owner')
    expect(all).toMatch(/lib\/b\.ts\s*\+4\s*−0/)
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

  test('names and reads deeds as the tab holds them', () => {
    expect(describeCall('Bash', { command: 'ls  -la\n' })).toEqual({ kind: 'deed', title: 'Bash', detail: 'ls -la' })
    expect(describeCall('mcp__claude_ai_Gmail__send_message', { to: 'x' }).title).toBe('claude_ai_Gmail · send_message')
    expect(describeCall('Agent', { description: 'fix', prompt: 'p' })).toEqual({ kind: 'adventurer', title: 'sent fix', detail: 'p' })
    expect(describeCall('TodoWrite', {}).detail).toBe('')
    expect(isNoticeCommand('cd x && gm notice 3 done "y"')).toBe(true)
    expect(isNoticeCommand('gm list')).toBe(false)
    expect(isNoticeCommand('pgm notice')).toBe(false)
    expect(noticeLines('a\n\n b \n')).toEqual(['a', 'b'])
    expect(clock(0)).toMatch(/^\d\d:\d\d:\d\d$/)
    const d = (id: string, kind: 'deed' | 'mcp') => ({ id, at: 0, kind, who: '', title: id, detail: '', status: 'ok' as const })
    expect(shownDeeds([d('1', 'deed'), d('2', 'mcp'), d('3', 'deed')], 'all').map(x => x.id)).toEqual(['3', '2', '1'])
    expect(shownDeeds([d('1', 'deed'), d('2', 'mcp')], 'mcp').map(x => x.id)).toEqual(['2'])
  })
})
