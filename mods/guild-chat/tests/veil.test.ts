import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import { isNote, veilOf } from '../hooks/register'

// What stands for Claude Code and the machine beneath the mod: the environment gm starts a session with, a Guildhall
// whose guild.conf the test writes, the guild's gm at ~/.local/bin/gm, and the engine's own row. The journal records
// every call the mod makes on them.
const HOME = '/home/p'
const CONF = `${HOME}/.guildmaster/guild.conf`
const GM = `${HOME}/.local/bin/gm`
const STOCK = 'the engine row'
const viewport = { columns: 60, rows: 20 }

type World = {
  files: Map<string, string>
  journal: { reads: string[]; stats: string[]; runs: string[][]; toasts: string[]; invalidations: number; commands: string[] }
  // Sets what ~/.local/bin/gm is: a link to a gm (the default), a file of its own, or nothing.
  gm: (is: 'link' | 'file' | 'missing') => void
  // Makes gm config set fail with this line on stderr from now on.
  failGm: (why: string | undefined) => void
  // Another session's change: guild.conf rewritten, its time moved on.
  write: (conf: string) => void
  // The conversation the session already holds, as $.session.messages({ as: 'api' }) gives it.
  conversation: { role: 'user' | 'assistant'; content: { type: string; [field: string]: unknown }[] }[]
}

function world(on: On, conf: string | undefined, env: Record<string, string> = { HOME, GM_CHAT: 'banners' }): World {
  const files = new Map<string, string>()
  const mtimes = new Map<string, number>()
  let clock = 1000
  const write = (text: string) => {
    files.set(CONF, text)
    mtimes.set(CONF, (clock += 1000))
  }
  if (conf !== undefined) write(conf)
  const journal: World['journal'] = { reads: [], stats: [], runs: [], toasts: [], invalidations: 0, commands: [] }
  let gm: 'link' | 'file' | 'missing' = 'link'
  let failure: string | undefined
  mock.env(on, env)
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) }))
  on('fs.read', async (_$, e) => {
    journal.reads.push(e.path)
    return files.has(e.path) ? { value: files.get(e.path)! } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.stat', async (_$, e) => {
    journal.stats.push(e.path)
    if (e.path === GM) {
      if (gm === 'missing') return { deny: `ENOENT: ${e.path}` }
      return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: gm === 'link', realPath: gm === 'link' ? '/clone/bin/gm' : GM } }
    }
    if (!files.has(e.path)) return { deny: `ENOENT: ${e.path}` }
    return { value: { kind: 'file' as const, size: files.get(e.path)!.length, mtimeMs: mtimes.get(e.path)!, isLink: false } }
  })
  // gm config set veil <on|off>: the one writer of guild.conf.
  on('process.run', async (_$, e) => {
    journal.runs.push([...e.argv])
    if (failure) return { value: { exitCode: 1, stdout: '', stderr: `gm: ${failure}\n`, isStdoutTruncated: false, isStderrTruncated: false } }
    const [, , , key, value] = e.argv
    const lines = (files.get(CONF) ?? '').split('\n').filter(l => l && !l.startsWith(`${key}:`))
    write([...lines, `${key}: ${value}`].join('\n') + '\n')
    return { value: { exitCode: 0, stdout: `${key} is ${value}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', async (_$, e) => {
    journal.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.toast', async (_$, e) => {
    journal.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', async () => {
    journal.invalidations += 1
    return { value: undefined }
  })
  const conversation: World['conversation'] = []
  on('session.messages', async () => ({ value: conversation as never }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: [STOCK] }))
  return {
    files,
    journal,
    gm: is => (gm = is),
    failGm: why => (failure = why),
    write,
    conversation,
  }
}

const sessionStart = { cwd: '/work', surface: 'terminal' as const, isInteractive: true }
const veil = (args = '') => ({
  command: 'veil',
  args,
  origin: { kind: 'composer' as const },
  presentation: { layout: 'main' as const, isFullscreen: false, columns: 80 },
})

const at = { surface: 'terminal' as const, viewport }
const toolUse = (tool = 'Bash', id = 't1', input: unknown = { command: 'ls' }, more = {}) => ({ ...at, component: 'ToolUse' as const,
  requestId: id, props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false, ...more } })
const toolResult = (id = 't1') => ({ ...at, component: 'ToolResult' as const, requestId: id,
  props: { tool_use_id: id, tool: 'Bash', output: { stdout: 'x', stderr: '' }, isErrored: false } })
const toolGroup = (calls: { tool_use_id: string; tool: string }[] = [{ tool_use_id: 'g1', tool: 'Read' }]) => ({ ...at,
  component: 'ToolGroup' as const, requestId: 'group-1', props: { isActive: false, isExpanded: false,
    calls: calls.map(c => ({ ...c, input: {}, isRunning: false, isErrored: false, isInterrupted: false })) } })
const progress = () => ({ ...at, component: 'ToolProgress' as const, requestId: 't1',
  props: { tool_use_id: 't1', kind: 'background_hint' as const, hint: '(ctrl+b to run in background)' } })
const returns = () => ({ ...at, component: 'UserMessage' as const, requestId: 'u2',
  props: { text: 'scout-auth finished', origin: { kind: 'task-notification' as const }, isExpanded: false } })
const routed = () => ({ ...at, component: 'UserMessage' as const, requestId: 'u3',
  props: { text: 'the tests pass', origin: { kind: 'peer' as const }, from: { name: 'appt-v2' }, isExpanded: false } })
const patron = () => ({ ...at, component: 'UserMessage' as const, requestId: 'u1',
  props: { text: 'Read the files.', origin: { kind: 'composer' as const }, isExpanded: false } })
const said = (text: string, id = 'a1') => ({ ...at, component: 'AssistantMessage' as const, requestId: id,
  props: { text, isFirstOfReply: true } })

const isHidden = (tree: unknown) => JSON.stringify(tree).includes('"display":"none"')
const drawn = (tree: unknown) => JSON.stringify(tree)

// Every kind of row the veil can hide, with the kind it belongs to.
const rows = [
  ['deeds', toolUse()],
  ['deeds', toolResult()],
  ['deeds', toolGroup()],
  ['deeds', toolGroup([{ tool_use_id: 'g2', tool: 'Agent' }])],
  ['deeds', toolUse('Bash', 't9', { command: 'false' }, { isErrored: true })],
  ['adventurers', toolUse('Agent', 't2', { description: 'scout-auth' })],
  ['adventurers', toolUse('Task', 't3', { description: 'scout-auth' }, { isInterrupted: true })],
  ['adventurers', returns()],
  ['progress', progress()],
] as const

describe('the veil drawn', () => {
  test('hides every kind veil-hides names, banner and all', async ($, on) => {
    world(on, 'veil: on\n')
    for (const [, row] of rows) {
      const tree = await $.ui.render(row as never)
      expect(isHidden(tree)).toBe(true)
      expect(drawn(tree)).not.toContain(STOCK)
      expect(drawn(tree)).not.toMatch(/DEEDS|ADVENTURER/)
    }
  })

  test('the banner goes with a hidden row on every surface', async ($, on) => {
    world(on, 'veil: on\n')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'guild-chat', ...toolUse(), surface })
      expect(await ui.find({ type: 'Text', text: /DEEDS/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: STOCK })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('shows a kind veil-hides leaves out', async ($, on) => {
    world(on, 'veil: on\nveil-hides: adventurers progress\n')
    for (const [kind, row] of rows) expect(isHidden(await $.ui.render(row as never))).toBe(kind !== 'deeds')
    const deed = drawn(await $.ui.render(toolUse()))
    expect(deed).toContain(STOCK)
    expect(deed).toContain(' ⚒ DEEDS ')
  })

  test('never hides the patron, a routed message, or a reply', async ($, on) => {
    world(on, 'veil: on\n')
    expect(drawn(await $.ui.render(patron()))).toContain(' ⚜ PATRON ')
    expect(drawn(await $.ui.render(routed()))).toContain(' ⛨ APPT-V2 ')
    expect(drawn(await $.ui.render(said('Done: the three modules are small.')))).toContain(' ⚔ GUILDMASTER ')
  })

  test('works on Claude Code\'s own drawing with chat: off', async ($, on) => {
    world(on, 'chat: off\nveil: on\n', { HOME, GM_CHAT: 'off' })
    expect(isHidden(await $.ui.render(toolUse()))).toBe(true)
    expect(drawn(await $.ui.render(patron()))).toBe(drawn({ type: 'Text', props: {}, children: [STOCK] }))
  })
})

describe('the veil lifted', () => {
  for (const conf of ['', 'veil: off\n', 'veil: maybe\n', '# veil: on\n']) {
    test(`draws every row as before with ${JSON.stringify(conf)}`, async ($, on) => {
      world(on, conf)
      for (const [, row] of rows) expect(isHidden(await $.ui.render(row as never))).toBe(false)
    })
  }

  test('hides nothing and registers no /veil without a Guildhall', async ($, on) => {
    const w = world(on, undefined)
    await $.session.start(sessionStart)
    expect(w.journal.commands).toEqual([])
    for (const [, row] of rows) expect(isHidden(await $.ui.render(row as never))).toBe(false)
  })
})

describe('veil and veil-hides read as gm reads them', () => {
  test('veil is on only for on, yes or true', () => {
    for (const v of ['on', 'yes', 'true']) expect(veilOf(`veil: ${v}`).on).toBe(true)
    for (const v of ['off', 'no', 'false', 'maybe', '']) expect(veilOf(`veil: ${v}`).on).toBe(false)
    expect(veilOf('veil:\nveil: on').on).toBe(true)
    expect(veilOf('veil-hides: deeds').on).toBe(false)
  })

  test('veil-hides a value gm cannot take hides all four', () => {
    expect([...veilOf('veil-hides: notes deeds').hides].sort()).toEqual(['deeds', 'notes'])
    for (const v of ['', 'deeds rubbish', 'all']) expect(veilOf(`veil-hides: ${v}`).hides.size).toBe(4)
  })
})

// One model step through the mod: its text blocks, its tool calls, and why it stopped.
function stepper(on: On) {
  const step = { texts: [] as string[], tools: [] as string[], stopReason: 'tool_use' as string | null }
  on('turn.step', async function* (_$, e) {
    let index = 0
    for (const text of step.texts) yield { kind: 'text', index: index++, text } as never
    for (const id of step.tools) yield { kind: 'tool', index: index++, id, name: id.startsWith('agent') ? 'Agent' : 'Bash' } as never
    yield { kind: 'stop', stopReason: step.stopReason, usage: null } as never
    return { turnId: e.turnId, index: e.index, answer: step.texts.join('\n'), usage: null, stopReason: step.stopReason,
      toolUses: step.tools.map(id => ({ name: 'Bash', input: { id } })) } as never
  })
  return async ($: Engine, texts: string[], tools: string[], stopReason: string | null) => {
    Object.assign(step, { texts, tools, stopReason })
    const stream = $.turn.step({ turnId: 'turn-1', index: 0, model: 'haiku', messageCount: 1 })
    for (let r = await stream.next(); !r.done; r = await stream.next());
  }
}

describe('notes', () => {
  const short = 'Let me look at the files first.'
  const long = 'x'.repeat(240)

  test('the rule on its edges', () => {
    expect(isNote('tool_use', short)).toBe(true)
    expect(isNote('tool_use', 'y'.repeat(239))).toBe(true)
    expect(isNote('tool_use', long)).toBe(false)
    expect(isNote('tool_use', 'one\ntwo')).toBe(false)
    expect(isNote('end_turn', short)).toBe(false)
    expect(isNote('max_tokens', short)).toBe(false)
  })

  test('hides a short line before deeds, and keeps a long one, a newline and the reply that ends the turn', async ($, on) => {
    world(on, 'veil: on\n')
    const step = stepper(on)
    await step($, [short, long, 'one\ntwo'], ['t1'], 'tool_use')
    await step($, ['All done.'], [], 'end_turn')
    expect(isHidden(await $.ui.render(said(short)))).toBe(true)
    expect(isHidden(await $.ui.render(said(long)))).toBe(false)
    expect(isHidden(await $.ui.render(said('one\ntwo')))).toBe(false)
    expect(drawn(await $.ui.render(said('All done.')))).toContain(' ⚔ GUILDMASTER ')
  })

  for (const stop of ['max_tokens', 'model_context_window_exceeded']) {
    test(`a step that stopped on ${stop} is drawn whole: its text, its deeds and its adventurers`, async ($, on) => {
      world(on, 'veil: on\n')
      const step = stepper(on)
      await step($, [short], [`bash-${stop}`, `agent-${stop}`], stop)
      expect(isHidden(await $.ui.render(said(short)))).toBe(false)
      expect(isHidden(await $.ui.render(toolUse('Bash', `bash-${stop}`)))).toBe(false)
      expect(isHidden(await $.ui.render(toolResult(`bash-${stop}`)))).toBe(false)
      expect(isHidden(await $.ui.render(toolUse('Agent', `agent-${stop}`, { description: 'scout' })))).toBe(false)
      expect(isHidden(await $.ui.render(toolGroup([{ tool_use_id: `bash-${stop}`, tool: 'Read' }])))).toBe(false)
      expect(isHidden(await $.ui.render(toolUse('Bash', 'another')))).toBe(true)
    })
  }

  test('a session that starts with a conversation behind it, a reload or --continue, hides its notes again', async ($, on) => {
    const w = world(on, 'veil: on\n')
    w.conversation.push(
      { role: 'user', content: [{ type: 'text', text: 'Read the files.' }] },
      { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: short },
        { type: 'text', text: 'one\ntwo' }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    )
    await $.session.start(sessionStart)
    expect(w.journal.invalidations).toBe(1)
    expect(isHidden(await $.ui.render(said(short)))).toBe(true)
    expect(isHidden(await $.ui.render(said('one\ntwo')))).toBe(false)
    expect(drawn(await $.ui.render(said('Done.')))).toContain(' ⚔ GUILDMASTER ')
  })

  test('with the veil lifted, a session that starts learns its notes without a redraw', async ($, on) => {
    const w = world(on, 'veil: off\n')
    w.conversation.push({ role: 'assistant', content: [{ type: 'text', text: short }, { type: 'tool_use', id: 't1', name: 'Bash', input: {} }] })
    await $.session.start(sessionStart)
    expect(w.journal.invalidations).toBe(0)
    w.write('veil: on\n')
    await $.turn.start({ turnId: 'turn-1', prompt: '' } as never)
    expect(isHidden(await $.ui.render(said(short)))).toBe(true)
  })

  test('a summary Claude Code draws in place of narration between deeds hides, whatever its length', async ($, on) => {
    world(on, 'veil: on\n')
    const summary = (text: string) => ({ ...said(text), props: { text, isFirstOfReply: true, isSummary: true as const } })
    expect(isHidden(await $.ui.render(summary('Checked the stored lines; they look clean.')))).toBe(true)
    expect(isHidden(await $.ui.render(summary(`${long}\nand more`)))).toBe(true)
    expect(isHidden(await $.ui.render(said('Checked the stored lines; they look clean.')))).toBe(false)
  })

  test('with notes left out of veil-hides, a summary shows', async ($, on) => {
    world(on, 'veil: on\nveil-hides: deeds\n')
    expect(isHidden(await $.ui.render({ ...said(short), props: { text: short, isFirstOfReply: true, isSummary: true as const } }))).toBe(false)
  })

  test('with notes left out of veil-hides, a short line shows', async ($, on) => {
    world(on, 'veil: on\nveil-hides: deeds\n')
    const step = stepper(on)
    await step($, [short], ['t1'], 'tool_use')
    expect(isHidden(await $.ui.render(said(short)))).toBe(false)
  })
})

describe('/veil', () => {
  test('is registered at session start, and turns the veil through the guild\'s gm', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    expect(w.journal.commands).toEqual(['veil'])
    expect(isHidden(await $.ui.render(toolUse()))).toBe(false)

    expect(await $.command.run(veil())).toEqual({})
    expect(w.journal.runs).toEqual([[GM, 'config', 'set', 'veil', 'on']])
    expect(w.journal.toasts).toEqual(['The veil is drawn'])
    expect(w.journal.invalidations).toBe(1)
    expect(isHidden(await $.ui.render(toolUse()))).toBe(true)

    await $.command.run(veil())
    expect(w.journal.runs[1]).toEqual([GM, 'config', 'set', 'veil', 'off'])
    expect(w.journal.toasts[1]).toBe('The veil is lifted')
    expect(isHidden(await $.ui.render(toolUse()))).toBe(false)
  })

  test('on and off set it outright', async ($, on) => {
    const w = world(on, 'veil: on\n')
    await $.session.start(sessionStart)
    await $.command.run(veil('on'))
    await $.command.run(veil('off'))
    await $.command.run(veil('off'))
    expect(w.journal.runs.map(r => r[4])).toEqual(['on', 'off', 'off'])
    expect(w.journal.toasts).toEqual(['The veil is drawn', 'The veil is lifted', 'The veil is lifted'])
  })

  for (const [name, fail] of [
    ['a failing gm', (w: World) => w.failGm('config: guild.conf is not writable')],
    ['a missing ~/.local/bin/gm', (w: World) => w.gm('missing')],
    ['a ~/.local/bin/gm that is not a link', (w: World) => w.gm('file')],
  ] as const) {
    test(`${name} leaves the veil and the screen as they were`, async ($, on) => {
      const w = world(on, 'veil: off\n')
      await $.session.start(sessionStart)
      fail(w)
      await $.command.run(veil())
      expect(w.files.get(CONF)).toBe('veil: off\n')
      expect(w.journal.invalidations).toBe(0)
      expect(w.journal.toasts).toHaveLength(1)
      expect(w.journal.toasts[0]).toMatch(/^The veil is unchanged: /)
      expect(isHidden(await $.ui.render(toolUse()))).toBe(false)
      if (name !== 'a failing gm') expect(w.journal.runs).toEqual([])
    })
  }

  test('never runs the gm beside the mod', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    await $.command.run(veil('on'))
    expect(w.journal.runs.map(r => r[0])).toEqual([GM])
  })

  test('anything else is refused with a toast', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    await $.command.run(veil('sideways'))
    expect(w.journal.runs).toEqual([])
    expect(w.journal.toasts).toEqual(['/veil takes on, off or refresh'])
  })

  test('refresh reads guild.conf and redraws, whatever its time', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    const reads = w.journal.reads.length
    await $.command.run(veil('refresh'))
    expect(w.journal.reads.length).toBe(reads + 1)
    expect(w.journal.invalidations).toBe(1)
    expect(w.journal.toasts).toEqual(['The veil is lifted'])
    expect(w.journal.runs).toEqual([])
  })
})

describe('another session\'s change', () => {
  const turn = ($: Engine) => $.turn.start({ text: 'next', turnId: 'turn-2' })

  test('an unchanged guild.conf costs one stat a turn: no read, no redraw', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    const reads = w.journal.reads.length
    const stats = w.journal.stats.length
    await turn($)
    expect(w.journal.stats.length).toBe(stats + 1)
    expect(w.journal.reads.length).toBe(reads)
    expect(w.journal.invalidations).toBe(0)
  })

  test('is followed at the next turn, with one read and one redraw', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    w.write('veil: on\n')
    expect(isHidden(await $.ui.render(toolUse()))).toBe(false)
    const reads = w.journal.reads.length
    await turn($)
    expect(w.journal.reads.length).toBe(reads + 1)
    expect(w.journal.invalidations).toBe(1)
    expect(isHidden(await $.ui.render(toolUse()))).toBe(true)
  })

  test('a change of the file that leaves the veil alone draws nothing again', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    w.write('veil: off\nautostart: off\n')
    await turn($)
    expect(w.journal.invalidations).toBe(0)
  })

  test('a change of veil-hides is followed too', async ($, on) => {
    const w = world(on, 'veil: on\n')
    await $.session.start(sessionStart)
    w.write('veil: on\nveil-hides: progress\n')
    await turn($)
    expect(w.journal.invalidations).toBe(1)
    expect(isHidden(await $.ui.render(toolUse()))).toBe(false)
  })

  test('the session\'s own save does not redraw it a second time', async ($, on) => {
    const w = world(on, 'veil: off\n')
    await $.session.start(sessionStart)
    await $.command.run(veil('on'))
    await turn($)
    expect(w.journal.invalidations).toBe(1)
  })
})
