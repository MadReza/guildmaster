import type { EngineInterface, Register, RenderChildren, RenderInput } from 'claude-code'

import {
  isSpriteName, packFrame, paletteFamily, PALETTES, pickSprite, rasterColumns, spriteFrame, spriteTick,
  SPRITE_ROWS, type Palette, type SpriteName,
} from '../lib/sprites'

// Heraldic banners: every message of a Guildmaster session is set under a rule naming who speaks. The patron's banner
// hangs on the right, everyone else's on the left; the heavy rule is for the patron and the one who answers them, the
// light one for what is done on their behalf. gm starts every session with this mod, tells it in GM_CHAT what
// guild.conf says of chat: (off keeps Claude Code's own drawing), and names in GM_CHAT_FOCUS the Party Leader's focus
// (none at the front desk). A claude started by hand in a checkout of Guildmaster loads it too, from
// .claude/skills/guild-chat, and asks guild.conf itself; in a camp, the GM_FOCUS its settings set names the Party Leader.
//
// The veil (vision/veil-design.md): while guild.conf says veil: on, the kinds of row veil-hides names draw at zero
// height, banner and all, and come back when it is lifted. It hides from the screen only: nothing stored changes.
// /veil sets it through the guild's one gm; every other session follows at its next turn, or at /veil refresh.
//
// The working sprites (../lib/sprites.ts): while sprites: is on, the row Claude Code animates while a turn runs gets a
// two-row sprite above its words, drawn at random each turn from the ones guild.conf names for this session's role, the
// way Claude Code samples its word: sprites-guildmaster at the front desk, sprites-party-leader in a camp. While the
// session waits for the patron, idle-guildmaster or idle-party-leader names the one drawn above the prompt. Both live
// in rows Claude Code redraws in place, so a sprite never enters the chat: it is gone when its turn, or the wait, ends.
// The mod repaints each one on its own tick through $.ui.blit, as Firstmate's calm mod repaints its boat.

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

// A setting in guild.conf, as gm reads it: the first line naming the key with a value, comments skipped.
export function confValue(conf: string, key: string): string | undefined {
  for (const line of conf.split('\n')) {
    if (/^\s*#/.test(line) || !line.startsWith(`${key}:`)) continue
    const value = line.slice(key.length + 1).trim()
    if (value) return value
  }
  return undefined
}

// chat: in guild.conf: off, no or false is off; anything else, or no such line, is banners.
export function chatIsOn(conf: string): boolean {
  return !['off', 'no', 'false'].includes(confValue(conf, 'chat') ?? '')
}

// What the veil can hide, and what it hides when veil-hides says nothing gm can take.
export const KINDS = ['deeds', 'adventurers', 'notes', 'progress'] as const
export type Kind = (typeof KINDS)[number]
export type Veil = { on: boolean; hides: ReadonlySet<Kind> }

// veil and veil-hides in guild.conf, as gm takes them: veil is on for on, yes or true, and off for anything else;
// veil-hides is the kinds it names, or all four when it names none or anything that is not one.
export function veilOf(conf: string): Veil {
  const on = ['on', 'yes', 'true'].includes(confValue(conf, 'veil') ?? '')
  const words = (confValue(conf, 'veil-hides') ?? '').split(/\s+/).filter(Boolean)
  const valid = words.length > 0 && words.every(w => (KINDS as readonly string[]).includes(w))
  return { on, hides: new Set(valid ? (words as Kind[]) : KINDS) }
}

const sameVeil = (a: Veil, b: Veil) => a.on === b.on && a.hides.size === b.hides.size && [...a.hides].every(k => b.hides.has(k))

// The working sprites as guild.conf sets them, with gm's defaults: on, the quill for the Guildmaster, the dungeon and
// the builders for a Party Leader, the campfire while the Guildmaster waits and nothing while a Party Leader does.
export type Sprites = {
  on: boolean
  guildmaster: readonly SpriteName[]
  partyLeader: readonly SpriteName[]
  idleGuildmaster: readonly SpriteName[]
  idlePartyLeader: readonly SpriteName[]
}

export const SPRITE_DEFAULTS = {
  'sprites-guildmaster': 'quill',
  'sprites-party-leader': 'skirmish delve boss siege forge wall',
  'idle-guildmaster': 'campfire',
  'idle-party-leader': 'none',
} as const

// A list of sprites as gm takes it: the sprites it names, none for no sprite, and the default for a list naming
// anything else.
function spriteList(conf: string, key: keyof typeof SPRITE_DEFAULTS): SpriteName[] {
  const parse = (v: string) => {
    const words = v.split(/\s+/).filter(Boolean)
    if (words.length === 1 && words[0] === 'none') return []
    return words.length > 0 && words.every(isSpriteName) ? [...new Set(words)] : undefined
  }
  return parse(confValue(conf, key) ?? '') ?? parse(SPRITE_DEFAULTS[key])!
}

export function spritesOf(conf: string): Sprites {
  return {
    on: !['off', 'no', 'false'].includes(confValue(conf, 'sprites') ?? ''),
    guildmaster: spriteList(conf, 'sprites-guildmaster'),
    partyLeader: spriteList(conf, 'sprites-party-leader'),
    idleGuildmaster: spriteList(conf, 'idle-guildmaster'),
    idlePartyLeader: spriteList(conf, 'idle-party-leader'),
  }
}

const NO_SPRITES: Sprites = { on: false, guildmaster: [], partyLeader: [], idleGuildmaster: [], idlePartyLeader: [] }
const sameSprites = (a: Sprites, b: Sprites) => JSON.stringify(a) === JSON.stringify(b)

// Short narration between deeds, Firstmate's rule: a text block from a model step that stopped to call tools, with
// no newline and under 240 characters trimmed. A step that hit a limit is never a note: the patron must see it.
export const NOTE_MAX = 240
const STUCK = ['max_tokens', 'model_context_window_exceeded']
export const isNote = (stopReason: string | null, text: string) =>
  stopReason === 'tool_use' && !text.includes('\n') && text.trim().length < NOTE_MAX
const noteKey = (text: string) => (text.includes('\n') ? `${text.trim()}\n` : text.trim())

// Whether this session draws banners, decided once: it keeps what it started with. A session gm starts is told by
// GM_CHAT. Any other session draws them only for a patron whose Guildhall (GM_HALL, else ~/.guildmaster) has a
// guild.conf that does not turn the chat off: someone without a Guildhall keeps Claude Code's own chat.
let decided: Promise<boolean> | undefined

async function hallConf($: EngineInterface): Promise<string> {
  return `${(await $.env.get('GM_HALL')) || `${await $.env.get('HOME')}/.guildmaster`}/guild.conf`
}

function bannersOn($: EngineInterface): Promise<boolean> {
  decided ??= (async () => {
    const told = await $.env.get('GM_CHAT')
    if (told) return chatIsOn(`chat: ${told}`)
    try {
      return chatIsOn(await $.fs.read(await hallConf($)))
    } catch {
      return false
    }
  })()
  return decided
}

// The veil and the sprites as this session holds them: guild.conf's path (none without a Guildhall), what it last read
// there, and the file's modification time then. Read once, before the first row draws; afterwards only when the file
// changed. Without a Guildhall the veil is lifted and no sprite is drawn: that patron keeps Claude Code's own rows.
type Held = { conf?: string; veil: Veil; sprites: Sprites; mtimeMs?: number }
const LIFTED: Veil = { on: false, hides: new Set() }
let held: Promise<Held> | undefined

// Reads guild.conf; a file it cannot read leaves the veil lifted and draws no sprite.
async function readConf($: EngineInterface, conf: string): Promise<{ veil: Veil; sprites: Sprites; mtimeMs?: number }> {
  try {
    const { mtimeMs } = await $.fs.stat(conf)
    const text = await $.fs.read(conf)
    return { veil: veilOf(text), sprites: spritesOf(text), mtimeMs }
  } catch {
    return { veil: LIFTED, sprites: NO_SPRITES }
  }
}

function veil($: EngineInterface): Promise<Held> {
  held ??= (async () => {
    const conf = await hallConf($)
    try {
      if (!(await $.fs.exists(conf))) return { veil: LIFTED, sprites: NO_SPRITES }
    } catch {
      return { veil: LIFTED, sprites: NO_SPRITES }
    }
    return { conf, ...(await readConf($, conf)) }
  })()
  return held
}

// Takes what guild.conf says now; redraws when it changed the veil or the sprites, or always when asked.
async function follow($: EngineInterface, h: Held, always = false): Promise<void> {
  if (!h.conf) return
  const now = await readConf($, h.conf)
  const changed = !sameVeil(now.veil, h.veil) || !sameSprites(now.sprites, h.sprites)
  h.veil = now.veil
  h.sprites = now.sprites
  h.mtimeMs = now.mtimeMs
  if (changed || always) $.ui.invalidate('ui.render')
}

// What the turns of this session taught: which text blocks are notes, which are not, and the text and deeds of a step
// that hit a limit. Matched to the rows by the block's text and the call's id.
const notes = new Set<string>()
const replies = new Set<string>()
const stuckTool = new Set<string>()

async function hides($: EngineInterface, kind: Kind): Promise<boolean> {
  const { veil: v } = await veil($)
  return v.on && v.hides.has(kind)
}

// A row drawn out of the chat: it takes no room, and no banner is drawn for it.
function hidden($: EngineInterface, e: RenderInput) {
  const { Box } = $.ui.resolve(e)
  return <Box display="none" />
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

// ---- The working sprites on screen ----

// A session is the Guildmaster's unless gm named a Party Leader's focus, as for the banners.
async function focusOf($: EngineInterface): Promise<string | undefined> {
  return (await $.env.get('GM_CHAT_FOCUS')) || (await $.env.get('GM_FOCUS')) || undefined
}

// The sprite this turn draws, drawn at its start, and the one before it, which the next turn does not repeat.
let turnSprite: SpriteName | undefined
let lastSprite: SpriteName | undefined

async function drawTurnSprite($: EngineInterface): Promise<SpriteName | undefined> {
  const { sprites } = await veil($)
  const from = (await focusOf($)) ? sprites.partyLeader : sprites.guildmaster
  turnSprite = pickSprite(from, lastSprite, Math.random())
  if (turnSprite) lastSprite = turnSprite
  return turnSprite
}

async function idleSprite($: EngineInterface): Promise<SpriteName | undefined> {
  const { sprites } = await veil($)
  const from = (await focusOf($)) ? sprites.idlePartyLeader : sprites.idleGuildmaster
  // The idle sprite stays the same while the session waits: drawn again only when the list changes.
  if (!idlePick || !from.includes(idlePick)) idlePick = pickSprite(from, undefined, Math.random())
  return idlePick
}
let idlePick: SpriteName | undefined

// Claude Code's colours for its theme, read at the first drawing and again when the theme changes.
let palette: Promise<Palette> | undefined
function paletteOf($: EngineInterface): Promise<Palette> {
  palette ??= $.config.list().then(
    rows => PALETTES[paletteFamily(rows.find(r => r.key === 'theme')?.value)],
    () => PALETTES.light,
  )
  return palette
}

// Every site drawing a sprite now, by its requestId: which sprite, its tick count, its size and its clock. A site's
// clock stops when a repaint is refused, which is how the mod learns the turn or the wait is over.
type Site = { sprite: SpriteName; t: number; columns: number; timer: { cancel(): void } }
const sites = new Map<string, Site>()
const RASTER_KEY = 'guild-sprite'

function forget(requestId: string): void {
  sites.get(requestId)?.timer.cancel()
  sites.delete(requestId)
}

async function repaint($: EngineInterface, requestId: string, site: Site): Promise<void> {
  site.t += 1
  const result = await $.ui.blit({
    requestId, key: RASTER_KEY, columns: site.columns, rows: SPRITE_ROWS,
    cells: packFrame(spriteFrame(site.sprite, site.t), site.columns, await paletteOf($)),
  })
  if (result.deny !== undefined && sites.get(requestId) === site) forget(requestId)
}

// The sprite's Raster for a site, its clock started, or kept running when the site already draws this sprite. Only a
// terminal has Rasters: elsewhere there is none.
async function spriteRaster($: EngineInterface, e: RenderInput, sprite: SpriteName) {
  const elements = $.ui.resolve(e)
  if (e.surface !== 'terminal' || !('Raster' in elements)) return undefined
  const { Raster } = elements
  const columns = rasterColumns(e.viewport?.columns)
  let site = sites.get(e.requestId)
  if (!site || site.sprite !== sprite || site.columns !== columns) {
    forget(e.requestId)
    const fresh: Site = { sprite, t: 0, columns, timer: { cancel() {} } }
    fresh.timer = $.clock.every(spriteTick(sprite), () => void repaint($, e.requestId, fresh))
    sites.set(e.requestId, fresh)
    site = fresh
  }
  return <Raster key={RASTER_KEY} columns={columns} rows={SPRITE_ROWS} cells={packFrame(spriteFrame(sprite, site.t), columns, await paletteOf($))} />
}

const said = (v: Veil) => (v.on ? 'The veil is drawn' : 'The veil is lifted')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    notes.clear()
    replies.clear()
    stuckTool.clear()
    for (const id of [...sites.keys()]) forget(id)
    turnSprite = undefined
    idlePick = undefined
    if ((await veil($)).conf) {
      await $.command.register({
        name: 'veil',
        description: 'Draw the deeds out of the chat, or back in: /veil turns it, /veil on|off sets it, /veil refresh reads guild.conf again',
        argumentHint: '[on | off | refresh]',
        immediate: true,
      })
    }
    return next(e)
  })

  // Answers with a toast under the prompt and leaves no row in the transcript.
  on('command.run', { command: 'veil' }, async ($, e) => {
    const h = await veil($)
    if (!h.conf) return {}
    const arg = e.args.trim()
    if (arg === 'refresh') {
      await follow($, h, true)
      $.ui.toast(said(h.veil))
      return {}
    }
    if (!['', 'on', 'off'].includes(arg)) {
      $.ui.toast('/veil takes on, off or refresh')
      return {}
    }
    const want = arg || (h.veil.on ? 'off' : 'on')
    // Saved before the screen changes: a save that fails leaves the veil as it was.
    const found = await guildGm($)
    if ('why' in found) {
      $.ui.toast(`The veil is unchanged: ${found.why}`)
      return {}
    }
    let why: string | undefined
    try {
      const run = await $.process.run([found.gm, 'config', 'set', 'veil', want])
      if (run.exitCode !== 0) why = (run.stderr.trim() || run.stdout.trim()).split('\n')[0] || `gm exited ${run.exitCode}`
    } catch (err) {
      why = err instanceof Error ? err.message : String(err)
    }
    if (why) {
      $.ui.toast(`The veil is unchanged: ${why}`)
      return {}
    }
    // Keeps the file's new time, so this session's own save does not redraw it a second time at its next turn.
    await follow($, h, true)
    $.ui.toast(said(h.veil))
    return {}
  })

  // Another session's change reaches this one at its next turn: one stat, and a read only when the file changed.
  on('turn.start', async ($, e, next) => {
    const h = await veil($)
    if (h.conf) {
      try {
        if ((await $.fs.stat(h.conf)).mtimeMs !== h.mtimeMs) await follow($, h)
      } catch {
        // A guild.conf that cannot be read now leaves the veil as this session holds it.
      }
    }
    await drawTurnSprite($)
    return next(e)
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    palette = undefined
    if (sites.size) $.ui.invalidate('ui.render')
    return result
  })

  // The row Claude Code animates while a turn runs: this turn's sprite above Claude Code's own word and timer.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const { sprites } = await veil($)
    const sprite = sprites.on && e.surface === 'terminal' ? (turnSprite ?? (await drawTurnSprite($))) : undefined
    if (!sprite) {
      forget(e.requestId)
      return next(e)
    }
    const raster = await spriteRaster($, e, sprite)
    if (!raster) return next(e)
    const drawn = await next(e)
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {raster}
        {drawn}
      </Box>
    )
  })

  // Above the prompt while the session waits: the idle sprite, unless a survey holds the band.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { sprites } = await veil($)
    const sprite = sprites.on && e.surface === 'terminal' && !e.props.isWorking && !e.props.hasSurvey && !e.props.view.agentId
      ? await idleSprite($)
      : undefined
    if (!sprite) {
      forget(e.requestId)
      return next(e)
    }
    const raster = await spriteRaster($, e, sprite)
    if (!raster) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box flexDirection="column">{raster}</Box>
  })

  // Learns which text blocks are notes, and what a step that hit a limit carried. Subagents' steps never draw here.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    const blocks = new Map<number, string>()
    const tools: string[] = []
    for await (const chunk of stream) {
      if (chunk.kind === 'text') blocks.set(chunk.index, (blocks.get(chunk.index) ?? '') + chunk.text)
      if (chunk.kind === 'tool') tools.push(chunk.id)
      yield chunk
    }
    const result = await stream.result
    if (e.agentId !== undefined) return result
    const stuck = STUCK.includes(result.stopReason ?? '')
    let changed = false
    for (const text of blocks.size ? blocks.values() : [result.answer]) {
      const key = noteKey(text)
      if (!key) continue
      if (isNote(result.stopReason, text) && !replies.has(key)) {
        if (notes.has(key)) continue
        notes.add(key)
        changed = true
      } else {
        if (!replies.has(key)) changed = true
        replies.add(key)
        if (notes.delete(key)) changed = true
      }
    }
    if (stuck && tools.length) {
      for (const id of tools) stuckTool.add(id)
      changed = true
    }
    if (changed && (await veil($)).veil.on) $.ui.invalidate('ui.render')
    return result
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const p = e.props
    if (p.origin.kind === 'task-notification' && (await hides($, 'adventurers'))) return hidden($, e)
    const banner: Banner =
      p.origin.kind === 'task-notification' ? { sigil: '⛨', name: 'ADVENTURER · returns', color: GREEN, heavy: false }
      : p.from ? { sigil: '⛨', name: p.from.name.toUpperCase(), color: GREEN, heavy: false }
      : { sigil: '⚜', name: 'PATRON', color: GOLD, heavy: true, right: true }
    return draw($, e, next, banner)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const key = noteKey(e.props.text)
    if (notes.has(key) && !replies.has(key) && (await hides($, 'notes'))) return hidden($, e)
    if (!e.props.isFirstOfReply) return next(e)
    const focus = (await $.env.get('GM_CHAT_FOCUS')) || (await $.env.get('GM_FOCUS'))
    return draw($, e, next, focus
      ? { sigil: '⚔', name: `PARTY LEADER · ${focus}`, color: ROYAL, heavy: true }
      : { sigil: '⚔', name: 'GUILDMASTER', color: CRIMSON, heavy: true })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const adventurer = isAdventurer(e.props.tool)
    if (!stuckTool.has(e.props.tool_use_id) && (await hides($, adventurer ? 'adventurers' : 'deeds'))) return hidden($, e)
    return draw($, e, next, adventurer
      ? { sigil: '⛨', name: adventurerName(e.props.input), color: GREEN, heavy: false }
      : deeds)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    !stuckTool.has(e.props.tool_use_id) && (await hides($, 'deeds')) ? hidden($, e) : next(e))

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const stuck = e.props.calls.some(c => c.tool_use_id !== undefined && stuckTool.has(c.tool_use_id))
    if (!stuck && (await hides($, 'deeds'))) return hidden($, e)
    return draw($, e, next, deeds)
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => ((await hides($, 'progress')) ? hidden($, e) : next(e)))
}
