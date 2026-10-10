import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { PANE, seatFrom, shown, tabsFor, type Tab } from '../hooks/register'

// What stands for Claude Code beneath the mod: the environment gm starts a session with, and the engine's record of
// open panes, which the mod's opens and closes change. The journal records what the mod asked for.
type World = { panes: Set<string>; journal: { opens: string[]; closes: string[]; toasts: string[]; commands: string[] } }

function world(on: On, env: Record<string, string> = { HOME: '/home/p', GM_CHAT: 'banners', GM_CHAT_FOCUS: 'appt-v2' }, placed = true): World {
  const panes = new Set<string>()
  const journal: World['journal'] = { opens: [], closes: [], toasts: [], commands: [] }
  mock.env(on, env)
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
  return { panes, journal }
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
  test('draws on every surface, and says so while no tab is built', async ($, on) => {
    world(on)
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
