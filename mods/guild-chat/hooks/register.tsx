import type { EngineInterface, Register, RenderChildren, RenderInput } from 'claude-code'

// Heraldic banners: every message of a Guildmaster session is set under a rule naming who speaks. The patron's banner
// hangs on the right, everyone else's on the left; the heavy rule is for the patron and the one who answers them, the
// light one for what is done on their behalf. gm starts a session with this mod while guild.conf says chat: banners,
// and names in GM_CHAT_FOCUS the Party Leader's focus (none at the front desk). A claude started by hand in a checkout
// of Guildmaster loads it too, from .claude/skills/guild-chat, and asks guild.conf itself.

const GOLD = '#d4a017'
const CRIMSON = '#c0392b'
const ROYAL = '#4a7bd9'
const STEEL = '#8a9199'
const GREEN = '#3fa34d'

type Banner = { sigil: string; name: string; color: string; heavy: boolean; right?: boolean }

// The banner as one line of the given width: the rule, then the sigil and name, then the rule again.
export function bannerLine(b: Banner, columns: number): { before: string; label: string; after: string } {
  const rule = b.heavy ? '━' : '─'
  const label = ` ${b.sigil} ${b.name} `
  const room = Math.max(0, columns - label.length)
  const lead = b.right ? Math.max(0, room - 2) : 2
  return { before: rule.repeat(Math.min(lead, room)), label, after: rule.repeat(Math.max(0, room - Math.min(lead, room))) }
}

const isAdventurer = (tool: string) => tool === 'Agent' || tool === 'Task'

function adventurerName(input: unknown): string {
  const i = (input ?? {}) as { description?: unknown; subagent_type?: unknown; name?: unknown }
  const n = [i.name, i.description, i.subagent_type].find(v => typeof v === 'string' && v.trim() !== '')
  return n ? `ADVENTURER · ${String(n).trim()}` : 'ADVENTURER'
}

// chat: in guild.conf, as gm reads it: off, no or false is off; anything else, or no line, is banners.
export function chatIsOn(conf: string): boolean {
  const line = conf.split('\n').find(l => l.startsWith('chat:'))
  return !['off', 'no', 'false'].includes((line ?? '').slice('chat:'.length).trim())
}

// Whether this session draws banners, decided once: it keeps what it started with. A session gm starts is told by
// GM_CHAT. Any other session draws them only for a patron whose Guildhall (GM_HALL, else ~/.guildmaster) has a
// guild.conf that does not turn the chat off: someone without a Guildhall keeps Claude Code's own chat.
let decided: Promise<boolean> | undefined

function bannersOn($: EngineInterface): Promise<boolean> {
  decided ??= (async () => {
    const told = await $.env.get('GM_CHAT')
    if (told) return chatIsOn(`chat: ${told}`)
    const hall = (await $.env.get('GM_HALL')) || `${await $.env.get('HOME')}/.guildmaster`
    try {
      return chatIsOn(await $.fs.read(`${hall}/guild.conf`))
    } catch {
      return false
    }
  })()
  return decided
}

// The engine's own drawing of the row, under the banner; with the chat off, the row as it is.
type Row = 'UserMessage' | 'AssistantMessage' | 'ToolUse' | 'ToolGroup'

async function draw<E extends RenderInput<Row>, R extends RenderChildren>($: EngineInterface, e: E, next: (e: E) => Promise<R>, banner: Banner) {
  if (!(await bannersOn($))) return next(e)
  const drawn = await next(e)
  const { Box, Text } = $.ui.resolve(e)
  const line = bannerLine(banner, Math.max(20, (e.viewport?.columns ?? 80) - 1))
  return (
    <Box flexDirection="column" marginTop={banner.heavy ? 1 : 0}>
      <Text wrap="truncate-end">
        <Text color={banner.color} dimColor={!banner.heavy}>{line.before}</Text>
        <Text color={banner.color} bold>{line.label}</Text>
        <Text color={banner.color} dimColor={!banner.heavy}>{line.after}</Text>
      </Text>
      {drawn}
    </Box>
  )
}

const deeds: Banner = { sigil: '⚒', name: 'DEEDS', color: STEEL, heavy: false }

export const register: Register = on => {
  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const p = e.props
    const banner: Banner =
      p.origin.kind === 'task-notification' ? { sigil: '⛨', name: 'ADVENTURER · returns', color: GREEN, heavy: false }
      : p.from ? { sigil: '⛨', name: p.from.name.toUpperCase(), color: GREEN, heavy: false }
      : { sigil: '⚜', name: 'PATRON', color: GOLD, heavy: true, right: true }
    return draw($, e, next, banner)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!e.props.isFirstOfReply) return next(e)
    const focus = await $.env.get('GM_CHAT_FOCUS')
    return draw($, e, next, focus
      ? { sigil: '⚔', name: `PARTY LEADER · ${focus}`, color: ROYAL, heavy: true }
      : { sigil: '⚔', name: 'GUILDMASTER', color: CRIMSON, heavy: true })
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) =>
    draw($, e, next, isAdventurer(e.props.tool)
      ? { sigil: '⛨', name: adventurerName(e.props.input), color: GREEN, heavy: false }
      : deeds))

  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => draw($, e, next, deeds))
}
