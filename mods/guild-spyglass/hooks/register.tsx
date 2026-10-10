import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderInput } from 'claude-code'

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
export const TABS: readonly Tab[] = []

// What the tab's body draws.
async function body($: EngineInterface, e: RenderInput<'Pane'>, id: string): Promise<RenderChildren> {
  const { Text } = $.ui.resolve(e)
  switch (id) {
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
    return next(e)
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
      await $.ui.close({ id: PANE })
      return {}
    }
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    if (!opened.isPlaced) $.ui.toast(`The spyglass cannot open here: ${opened.reason}`)
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
