import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderInput, Timer } from 'claude-code'

import type { SpyglassPostings } from '../types'
import { listArgs, parsePostings, postingsTab } from './tabs/postings'

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
]

// What the tab's body draws.
async function body($: EngineInterface, e: RenderInput<'Pane'>, id: string): Promise<RenderChildren> {
  const { Text } = $.ui.resolve(e)
  switch (id) {
    case 'postings': {
      const focus = await focusOf($)
      const view = { board: await read($, postings), focus, all: await read($, showAll), open: await read($, opened),
        width: Math.max(20, e.props.bodyColumns) }
      return postingsTab($.ui.resolve(e), view, {
        toggleAll: () => void update($, showAll, v => !v).then(() => refreshPostings($, focus)),
        refresh: () => void refreshPostings($, focus),
        toggle: ref => void update($, opened, v => (v === ref ? '' : ref)),
      })
    }
    default:
      return <Text dimColor>Nothing here yet.</Text>
  }
}

export const tabsFor = (seat: Seat, tabs: readonly Tab[] = TABS) => tabs.filter(t => t.seats.includes(seat))

// The tab drawn: the one last chosen while this seat offers it, else the first it offers.
export function shown(chosen: string, offered: readonly Tab[]): Tab | undefined {
  return offered.find(t => t.id === chosen) ?? offered[0]
}

// A session gm starts is told its focus by GM_CHAT_FOCUS and its style by GM_CHAT, and the front desk has no focus; a
// camp's own settings set GM_FOCUS. A session told neither is not the guild's own.
export function seatFrom(env: { GM_CHAT_FOCUS?: string; GM_FOCUS?: string; GM_CHAT?: string }): Seat {
  if (env.GM_CHAT_FOCUS || env.GM_FOCUS) return 'party-leader'
  if (env.GM_CHAT) return 'guildmaster'
  return 'other'
}

const seatOf = async ($: EngineInterface) =>
  seatFrom({ GM_CHAT_FOCUS: await $.env.get('GM_CHAT_FOCUS'), GM_FOCUS: await $.env.get('GM_FOCUS'), GM_CHAT: await $.env.get('GM_CHAT') })

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

async function refreshPostings($: EngineInterface, focus: string | undefined): Promise<void> {
  const got = await runGm($, listArgs(focus, await read($, showAll)))
  const board: SpyglassPostings = 'why' in got ? { rows: [], why: got.why, isLoaded: true } : { rows: parsePostings(got.out), isLoaded: true }
  await update($, postings, () => board)
}

// What the tabs draw from, read again: at the open, every few seconds while the pane is up, and after this session's
// own gm commands, so a change made in any session shows here soon.
const EVERY_MS = 5000
let watch: Timer | undefined

async function refresh($: EngineInterface): Promise<void> {
  const seat = await seatOf($)
  if (tabsFor(seat).some(t => t.id === 'postings')) await refreshPostings($, await focusOf($))
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

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'spyglass',
      description: 'Open the spyglass, a pane of the party\'s work beside the chat, or close it: /spyglass turns it, /spyglass open|close sets it',
      argumentHint: '[open | close]',
      immediate: true,
    })
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

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (watch && /(^|[\s;&|(])gm\s/.test(e.command)) await refresh($)
    return ran
  })

  // Answers with the pane itself, or a toast, and leaves no row in the transcript.
  on('command.run', { command: 'spyglass' }, async ($, e) => {
    const arg = e.args.trim()
    if (!['', 'open', 'close'].includes(arg)) {
      $.ui.toast('/spyglass takes open or close')
      return {}
    }
    const want = arg || ((await isOpen($)) ? 'close' : 'open')
    if (want === 'close') {
      stopWatch()
      await $.ui.close({ id: PANE })
      return {}
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (!opened.isPlaced) {
      $.ui.toast(`The spyglass cannot open here: ${opened.reason}`)
      return {}
    }
    startWatch($)
    await refresh($)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const offered = tabsFor(await seatOf($))
    const current = shown(await read($, tab), offered)
    if (!current) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Nothing to see through the spyglass yet.</Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {offered.map(t => (
            <Button key={`tab:${t.id}`} label={t.title} variant={t.id === current.id ? 'primary' : undefined}
              dimColor={t.id !== current.id} onPress={() => void update($, tab, () => t.id)} />
          ))}
        </Box>
        <Box flexDirection="column" marginTop={1}>{await body($, e, current.id)}</Box>
      </Box>
    )
  })
}
