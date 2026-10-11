// The guild's welcome: the card drawn above the prompt when the Guildmaster or a Party Leader starts, until the
// patron's first message folds it to one rule. It says who answers, what needs the patron, where the work stands and
// what the patron can type; the model never reads it. ../hooks/register.tsx owns when it is drawn and where its data
// comes from (gm welcome --json); this file owns what it says and how its art looks, which is why it has no `$` in it
// and tests read it directly.
//
// The art is pixel art in half blocks: each terminal cell is two pixels, its top the glyph's colour and its bottom the
// cell's background, so a 16×16 crest takes 16 columns by 8 rows. A piece is a grid of palette letters, '.' empty;
// the patron's own pieces are files of the same letters.
//
// The tutorial: every command the card can teach is counted as the patron uses it, across sessions, and is learned
// at LEARN_USES uses in LEARN_SESSIONS separate sessions. The patron's rank is how many of a seat's commands are
// learned, and the panel fades with it unless guild.conf says tutorial: on or off.

import { encodeBase64 } from './sprites'

export type Seat = 'guildmaster' | 'party-leader'

// ---- Settings ----

export type ArtChoice = 'rotate' | 'none' | ArtName | { file: string }
export type Welcome = {
  on: boolean
  artGuildmaster: ArtChoice
  artPartyLeader: ArtChoice
  artSize: 'auto' | 'full' | 'mini'
  fold: 'rule' | 'vanish'
  tutorial: 'auto' | 'on' | 'off'
}

export const WELCOME_DEFAULTS = {
  welcome: 'on',
  'welcome-art-guildmaster': 'rotate',
  'welcome-art-party-leader': 'rotate',
  'welcome-art-size': 'auto',
  'welcome-fold': 'rule',
  tutorial: 'auto',
} as const

const ON = ['on', 'yes', 'true']
const OFF = ['off', 'no', 'false']

function artChoice(value: string | undefined, fallback: ArtChoice): ArtChoice {
  if (!value) return fallback
  if (value === 'rotate' || value === 'none') return value
  if (isArtName(value)) return value
  if (value.startsWith('/') || value.startsWith('~/')) return { file: value }
  return fallback
}

// The welcome as guild.conf sets it, taken as gm takes it; `value` reads one setting's line.
export function welcomeOf(value: (key: string) => string | undefined): Welcome {
  const pick = <T extends string>(key: keyof typeof WELCOME_DEFAULTS, allowed: readonly T[], words: Record<string, T> = {}): T => {
    const v = value(key) ?? ''
    const w = words[v] ?? v
    return (allowed as readonly string[]).includes(w) ? (w as T) : (WELCOME_DEFAULTS[key] as T)
  }
  return {
    on: !OFF.includes(value('welcome') ?? ''),
    artGuildmaster: artChoice(value('welcome-art-guildmaster'), 'rotate'),
    artPartyLeader: artChoice(value('welcome-art-party-leader'), 'rotate'),
    artSize: pick('welcome-art-size', ['auto', 'full', 'mini']),
    fold: pick('welcome-fold', ['rule', 'vanish'], { shrink: 'rule', disappear: 'vanish' }),
    tutorial: pick('tutorial', ['auto', 'on', 'off'], Object.fromEntries([...ON.map(w => [w, 'on']), ...OFF.map(w => [w, 'off'])])),
  }
}

// ---- The art ----

export type Theme = 'dark' | 'light'
type Letters = Readonly<Record<string, number>>

/** What each letter of a piece paints, on a dark theme and on a light one. */
export const ART_PALETTES: Readonly<Record<Theme, Letters>> = {
  dark: {
    Y: 0xffd27a, G: 0xd4a017, g: 0x8a6510, R: 0xc0392b, r: 0x7d2018, B: 0x4a7bd9, b: 0x2c4f99, L: 0x8fb0ee,
    S: 0x9aa1a9, s: 0x5c6168, W: 0xe3e7ec, K: 0x0d0e10, N: 0x8a7560, n: 0x5a4636, C: 0xe9dcc0, E: 0x3fa34d, e: 0x2a6e34,
    O: 0xd77757, o: 0xa9573d,
  },
  light: {
    Y: 0xe0a52a, G: 0xb7791f, g: 0x7a5210, R: 0xc0392b, r: 0x8a2418, B: 0x3f6fcf, b: 0x2a4c94, L: 0x7fa2e6,
    S: 0x7d848c, s: 0x4f545b, W: 0xc3c9d0, K: 0x2b2d31, N: 0x7a6450, n: 0x4f3d2e, C: 0xb9a988, E: 0x2c7a39, e: 0x1f5a29,
    O: 0xd77757, o: 0xa9573d,
  },
}

/** The widest and tallest piece, in pixels: 16 columns by 8 rows. */
export const ART_MAX = 16

// A symmetric piece is written as its left half.
const mirror = (rows: string[]) => rows.map(r => r + [...r].reverse().join(''))

export const ART = {
  crest: mirror([
    '...Y...Y', '...G..GG', '...GGGGG', '...gGRGG', '.WSSSSSS', '.SRYRRRR', '.SRRYRRR', '.SRRRYRR',
    '.SRRRRYR', '.SRRRRRY', '.SRRRRYR', '.SRRGGGR', '..SRRnRR', '...SRGRR', '....SSRR', '......SS']),
  robed: mirror([
    '.......r', '......rR', '.....rRR', '....rRRR', '....rRCC', '....rRCK', '....rRCC', '...rRRRC',
    '...rRRGG', '..rRRRRG', '..rRRNNN', '..rRRNCC', '..rRRNCC', '..rRRNNN', '..rRRRRR', '..rrrrrr']),
  hall: mirror([
    '.......G', '.......R', '......RR', '.......N', '......nN', '.....nNN', '....nNNN', '...nNNNN',
    '..nnnnnn', '...CCCCC', '...CYCCC', '...CYCCC', '...CCCnn', '...CCCnK', '...CCCnK', '.sssssss']),
  helm: mirror([
    '.......B', '......BL', '......Bb', '.....WSb', '....WSSS', '...WSSSS', '...SSSSS', '..sSSSSS',
    '..sKKKKK', '..sSSSSS', '..sSSKSS', '..sSSSSS', '...sSSSS', '...sBBBB', '..BBBGBB', '.BBBBBBB']),
  bearer: [
    '..NBBBBBBB......', '..NBLBBBBBBB....', '..NBBBBBBBBBBB..', '..NBBBBBBBBB....', '..NBBBBBB.......', '..N.....SSSS....',
    '..N....SWSSSS...', '..N....SKKKKs...', '..N....SSSSSs...', '..NS..BBBBBBBB..', '..NSSBBBGGBBBBS.', '..N...BBBGGBBBS.',
    '..N...BBBBBBB...', '..N...ss...ss...', '..N...ss...ss...', '..N..sss...sss..'],
  tent: mirror([
    '.......N', '.......B', '......BB', '.......N', '......CN', '.....CCo', '....CCCo', '....CCoK',
    '...CCCoK', '...CCoKK', '..CCCoKK', '..CCoKKK', '.CCCoKKK', '.CCoKKKK', 'nnnnnnnn', '........']),
} as const satisfies Record<string, readonly string[]>

export type ArtName = keyof typeof ART
export const ART_NAMES = Object.keys(ART) as ArtName[]
export const isArtName = (w: string): w is ArtName => (ART_NAMES as string[]).includes(w)

/** The pieces each seat rotates through when guild.conf names none. */
export const SEAT_ART: Readonly<Record<Seat, readonly ArtName[]>> = {
  guildmaster: ['crest', 'robed', 'hall'],
  'party-leader': ['helm', 'bearer', 'tent'],
}

/** The small pieces, 10×6 pixels in 3 rows: the size of Claude Code's own mark. */
export const MINI_ART: Readonly<Record<Seat, readonly string[]>> = {
  guildmaster: mirror(['.Y.YY', '.GGGG', 'SRRRR', 'SRYRR', '.SRRY', '..SSS']),
  'party-leader': mirror(['....B', '..WSS', '.SSSS', '.sKKK', '.sSSK', '..BBB']),
}

/**
 * A piece from the patron's own file: one row of letters a line, '.' empty, lines starting with # skipped. Undefined
 * for a file that holds no row, a row wider than ART_MAX, more than ART_MAX rows, or a letter no palette paints.
 */
export function parseArt(text: string): string[] | undefined {
  const rows = text.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '' && !l.trimStart().startsWith('#'))
  if (!rows.length || rows.length > ART_MAX) return undefined
  const width = Math.max(...rows.map(r => r.length))
  if (width > ART_MAX) return undefined
  if (!rows.every(r => [...r].every(ch => ch === '.' || ch in ART_PALETTES.dark))) return undefined
  return rows.map(r => r.padEnd(width, '.'))
}

const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584

/** A piece as a Raster's cells: two pixel rows to a terminal row, an odd last row over an empty one. */
export function artCells(grid: readonly string[], theme: Theme): { columns: number; rows: number; cells: string } {
  const paint = ART_PALETTES[theme]
  const columns = Math.max(1, ...grid.map(r => r.length))
  const rows = Math.ceil(grid.length / 2)
  const words = new Uint32Array(columns * rows * 3)
  const at = (y: number, x: number) => {
    const ch = grid[y]?.[x]
    return ch && ch !== '.' ? paint[ch] : undefined
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const top = at(r * 2, c)
      const bottom = at(r * 2 + 1, c)
      const o = (r * columns + c) * 3
      if (top !== undefined) {
        words.set([UPPER_HALF, top, bottom ?? DEFAULT_COLOR], o)
      } else if (bottom !== undefined) {
        words.set([LOWER_HALF, bottom, DEFAULT_COLOR], o)
      } else {
        words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], o)
      }
    }
  }
  return { columns, rows, cells: encodeBase64(new Uint8Array(words.buffer)) }
}

/** One piece of the pool, never the one shown last when there is another. */
export function pickArt<T>(pool: readonly T[], last: T | undefined, roll: number): T | undefined {
  const from = pool.length > 1 ? pool.filter(p => p !== last) : pool
  return from.length ? from[Math.min(from.length - 1, Math.floor(roll * from.length))] : undefined
}

// ---- The tutorial ----

export type CommandId =
  | 'ref' | 'spyglass' | 'veil' | 'open' | 'roster' | 'board' | 'park' | 'config' | 'art' | 'tutorial' | 'close'

type Command = {
  id: CommandId
  seats: readonly Seat[]
  /** What the patron types, per seat. */
  type: Readonly<Partial<Record<Seat, string>>> & { all?: string }
  says: string
  /** A tab line under the command, per seat. */
  tabs?: Readonly<Partial<Record<Seat, string>>>
  /** Offered as a sentence to try. */
  tryIt?: boolean
}

const BOTH: readonly Seat[] = ['guildmaster', 'party-leader']

/** Every command the card can teach, in the order it lists them. */
export const COMMANDS: readonly Command[] = [
  { id: 'ref', seats: BOTH, type: { guildmaster: 'appt-v2#12 …', 'party-leader': '#12 …' }, says: 'add to a posting, or answer it', tryIt: true },
  { id: 'open', seats: ['guildmaster'], type: { all: 'open CRM-1234 in ~/src/crm' }, says: 'start a Party Leader', tryIt: true },
  { id: 'spyglass', seats: BOTH, type: { all: '/spyglass' }, says: "the party's work in a pane",
    tabs: { guildmaster: '/spyglass board · deeds · codex · lantern', 'party-leader': '/spyglass board · satchel · deeds · codex · lantern' } },
  { id: 'veil', seats: BOTH, type: { all: '/veil' }, says: 'hide the deeds, keep the talk' },
  { id: 'roster', seats: ['guildmaster'], type: { all: "who's working?" }, says: 'see the roster' },
  { id: 'board', seats: ['party-leader'], type: { all: "what's on the board?" }, says: 'see the postings', tryIt: true },
  { id: 'park', seats: ['party-leader'], type: { all: 'park #3 until Monday' }, says: 'set a posting aside' },
  { id: 'config', seats: BOTH, type: { all: 'turn the sprites off' }, says: 'change a guild setting' },
  { id: 'art', seats: BOTH, type: { all: 'use the guildhall art' }, says: 'change this art' },
  { id: 'tutorial', seats: BOTH, type: { all: 'turn the tutorial off' }, says: 'hide this panel for good' },
  { id: 'close', seats: BOTH, type: { guildmaster: 'close appt-v2', 'party-leader': 'close this focus' }, says: 'retire a focus once its work is done' },
]

export const commandsFor = (seat: Seat) => COMMANDS.filter(c => c.seats.includes(seat))
const typed = (c: Command, seat: Seat) => c.type[seat] ?? c.type.all ?? c.id

/** The commands a slash command counts as. */
export const SLASH: Readonly<Record<string, CommandId>> = { veil: 'veil', spyglass: 'spyglass' }

/** The commands a message the patron typed counts as, told by its words. */
export function commandsIn(text: string): CommandId[] {
  const t = text.trim()
  const found = new Set<CommandId>()
  if (/^([a-z0-9][a-z0-9-]*)?#\d+\b/i.test(t)) found.add('ref')
  if (/^(please\s+)?open\s+\S/i.test(t)) found.add('open')
  if (/\broster\b|\bwho'?s (working|out|busy|up)\b/i.test(t)) found.add('roster')
  if (/\b(the|my) board\b|\bgm list\b|\bwhat'?s (queued|next)\b/i.test(t)) found.add('board')
  if (/^(please\s+)?park\b|\bpark #?\d+/i.test(t)) found.add('park')
  if (/^(please\s+)?close\s+\S/i.test(t)) found.add('close')
  if (/\btutorial\b/i.test(t)) found.add('tutorial')
  else if (/\b(art|crest|helm|guildhall)\b/i.test(t) && /\b(use|give|change|set|pick|switch|rotate|show)\b/i.test(t)) found.add('art')
  else if (/\b(turn|set|switch|change)\b.*\b(on|off|chat|veil|sprites?|collector|autostart|telemetry|editor|setting)\b/i.test(t)) found.add('config')
  return [...found]
}

export const LEARN_USES = 5
export const LEARN_SESSIONS = 3

/** How often the patron used each command, and the sessions (by id, the last LEARN_SESSIONS) they used it in. */
export type Usage = Readonly<Partial<Record<CommandId, { uses: number; sessions: readonly string[] }>>>

export function recordUse(usage: Usage, id: CommandId, session: string): Usage {
  const was = usage[id] ?? { uses: 0, sessions: [] }
  const sessions = was.sessions.includes(session) ? was.sessions : [...was.sessions, session].slice(-LEARN_SESSIONS)
  return { ...usage, [id]: { uses: was.uses + 1, sessions } }
}

export const isLearned = (u: Usage[CommandId]) => !!u && u.uses >= LEARN_USES && u.sessions.length >= LEARN_SESSIONS

export type Rank = 'novice' | 'journeyman' | 'master'
/** Learned commands at which a novice becomes a journeyman. */
export const JOURNEYMAN_AT = 4

export function rankOf(usage: Usage, seat: Seat): Rank {
  const all = commandsFor(seat)
  const learned = all.filter(c => isLearned(usage[c.id])).length
  return learned === all.length ? 'master' : learned >= JOURNEYMAN_AT ? 'journeyman' : 'novice'
}

// ---- The card ----

export type Hue = 'gold' | 'crimson' | 'royal' | 'steel' | 'green' | 'orange'
export type Seg = { text: string; hue?: Hue; bold?: boolean; dim?: boolean; badge?: boolean }
export type Line = readonly Seg[]

export type Need = { ref: string; question: string }
export type GuildmasterData = {
  seat: 'guildmaster'
  patron?: string | null
  needs: readonly Need[]
  roster: readonly { focus: string; phase: string | null; state: 'working' | 'waiting' | 'idle' | 'held' }[]
  trouble: readonly { what: string; fix: string }[]
}
export type PartyLeaderData = {
  seat: 'party-leader'
  focus: string
  kind: string
  tickets: readonly string[]
  phase: string | null
  phases: readonly string[]
  branch: string
  upstream: string | null
  ahead: number | null
  counts: Readonly<Record<string, number>>
  needs: readonly Need[]
  active: string | null
  next: string | null
  last: { at: string; line: string } | null
}
/** What the card shows when gm could not say: the seat, and why. */
export type BareData = { seat: Seat; focus?: string; why: string }
export type WelcomeData = GuildmasterData | PartyLeaderData | BareData

export const isBare = (d: WelcomeData): d is BareData => 'why' in d

export type CardOptions = {
  now: Date
  columns: number
  tutorial: Welcome['tutorial']
  usage: Usage
  /** Commands this patron has never been shown: marked new at a master's rank. */
  unseen: ReadonlySet<CommandId>
  /** A band too short for the whole panel: the commands left to learn as one line, whatever the rank. */
  compact?: boolean
}

const seg = (text: string, hue?: Hue, more: Omit<Seg, 'text' | 'hue'> = {}): Seg => ({ text, hue, ...more })
const dim = (text: string): Seg => ({ text, dim: true })
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`)

/** A heavy rule naming the seat, filled to the width: `━━ ⚔ GUILDMASTER ━━━…`. */
export function seatRule(label: string, hue: Hue, columns: number, after: Seg[] = []): Line {
  const head = ` ⚔ ${label} `
  const tail = after.reduce((n, s) => n + s.text.length, 0)
  return [seg('━━', hue), seg(head, hue, { bold: true }), ...after, seg('━'.repeat(Math.max(2, columns - 2 - head.length - tail)), hue)]
}

const greeting = (now: Date) => (now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening')
const day = (now: Date) =>
  `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()]} ${now.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()]}`

const seatOf = (d: WelcomeData): Seat => d.seat
const labelOf = (d: WelcomeData) =>
  d.seat === 'guildmaster' ? 'GUILDMASTER' : `PARTY LEADER · ${'focus' in d && d.focus ? d.focus : '?'}`
const hueOf = (d: WelcomeData): Hue => (d.seat === 'guildmaster' ? 'crimson' : 'royal')

function needLines(needs: readonly Need[], columns: number): Line[] {
  if (!needs.length) return []
  const out: Line[] = [[seg(` ⚜ ${needs.length} need${needs.length === 1 ? 's' : ''} you `, 'gold', { badge: true })]]
  const w = Math.min(20, Math.max(...needs.map(n => n.ref.length)) + 2)
  for (const n of needs.slice(0, 4)) out.push([seg('  '), seg(pad(n.ref, w), 'gold', { bold: true }), seg(clip(n.question || 'waits on your word', columns - w - 4))])
  if (needs.length > 4) out.push([dim(`  … and ${needs.length - 4} more`)])
  return out
}

/** The road through the playbook's phases: passed ●, here ◆, ahead ○. */
export function phaseRoad(phases: readonly string[], phase: string | null): Line {
  const at = phase ? phases.indexOf(phase) : -1
  const out: Seg[] = []
  phases.forEach((_, i) => {
    if (i) out.push(dim('─'))
    out.push(i < at ? seg('●', 'steel') : i === at ? seg('◆', 'gold') : dim('○'))
  })
  out.push(seg('  '), seg(phase ?? 'no phase yet', 'gold', { bold: true }))
  if (at >= 0) out.push(dim(` ${at + 1}/${phases.length}`))
  return out
}

function tutorialLines(seat: Seat, o: CardOptions, ref?: string): Line[] {
  if (o.tutorial === 'off') return []
  const all = commandsFor(seat)
  const learned = all.filter(c => isLearned(o.usage[c.id]))
  const rank = rankOf(o.usage, seat)
  const meter = [seg('▰'.repeat(learned.length), 'gold'), dim('▱'.repeat(all.length - learned.length))]
  if ((o.tutorial === 'on' || rank === 'novice') && !o.compact) {
    const out: Line[] = [[dim('── '), seg('What you can type', undefined, { bold: true }), dim(' ── '), ...meter, dim(` ${learned.length}/${all.length} learned · ${rank}`)]]
    for (const c of all) {
      const u = o.usage[c.id]
      const n = Math.min(LEARN_USES, u?.uses ?? 0)
      const mark: Seg[] = isLearned(u) ? [seg('✓    ', 'green')] : [seg('●'.repeat(n), 'gold'), dim('○'.repeat(LEARN_USES - n))]
      out.push([seg('  '), seg(pad(clip(typed(c, seat), 24), 25), 'orange'), ...mark, seg('  '), seg(c.says)])
      if (c.tabs?.[seat]) out.push([seg(' '.repeat(34)), dim(`tabs: ${c.tabs[seat]}`)])
    }
    const tryIt = all.find(c => c.tryIt && !isLearned(o.usage[c.id]))
    // The sentence to try names a real posting when one waits on the patron.
    const sentence = tryIt?.id === 'ref' && ref ? `${ref} yes, go ahead` : tryIt && typed(tryIt, seat).replace(' …', ' yes, go ahead')
    if (sentence) out.push([dim('  try: '), seg(`"${sentence}"`, 'gold')])
    out.push([seg('  '), seg('⚜ you  ', 'gold'), seg('⚔ guildmaster  ', 'crimson'), seg('⚔ party leader  ', 'royal'), seg('⛨ adventurer', 'green')])
    return out
  }
  const left = rank === 'master' && !o.compact ? all.filter(c => o.unseen.has(c.id)) : all.filter(c => !isLearned(o.usage[c.id]))
  if (!left.length) return []
  // As many as the line holds, the rest counted; the meter at the end.
  const withMeter = rank !== 'master' || o.compact
  const room = o.columns - 5 - (withMeter ? all.length + 3 : 0) - 9
  const chips: Seg[] = [dim('try  ')]
  let width = 0
  let shown = 0
  for (const c of left) {
    const t = typed(c, seat)
    const word = c.id === 'ref' ? (ref ?? t.split(' ')[0]!) : t.startsWith('/') ? t : `"${t}"`
    const isNew = rank === 'master' && o.unseen.has(c.id)
    const w = word.length + (shown ? 3 : 0) + (isNew ? 5 : 0)
    if (shown && width + w > room) break
    if (shown) chips.push(dim(' · '))
    chips.push(seg(word, 'orange'))
    if (isNew) chips.push(seg(' new ', 'gold', { badge: true }))
    width += w
    shown += 1
  }
  if (shown < left.length) chips.push(dim(` +${left.length - shown} more`))
  if (withMeter) chips.push(seg('   '), ...meter)
  return [chips]
}

const STATE_HUE: Readonly<Record<GuildmasterData['roster'][number]['state'], Hue | undefined>> = {
  working: 'green', waiting: 'gold', idle: undefined, held: 'crimson',
}
const STATE_SAYS = { working: 'working', waiting: 'waiting on you', idle: 'idle', held: 'held' } as const

/**
 * The card: `side` beside the art, `below` under it. The art is drawn by the caller; columns is the width the card
 * may take beside it.
 */
export function cardOf(d: WelcomeData, o: CardOptions): { side: Line[]; below: Line[] } {
  const side: Line[] = [seatRule(labelOf(d), hueOf(d), Math.min(o.columns, 60))]
  const below: Line[] = []
  if (isBare(d)) {
    side.push([dim(`The board could not be read: ${clip(d.why, o.columns - 32)}`)])
  } else if (d.seat === 'guildmaster') {
    side.push([seg(`${greeting(o.now)}${d.patron ? `, ${d.patron}` : ''}`, undefined, { bold: true }), dim(` · ${day(o.now)}`)])
    if (!d.roster.length) {
      side.push([dim('No parties yet. Name a ticket and a repository,')])
      side.push([dim('and I will open a Party Leader for it.')])
    } else if (!d.needs.length) {
      side.push([seg('⚜ Nothing needs you.', 'gold')])
    }
    side.push(...needLines(d.needs, o.columns))
    for (const t of d.trouble) side.push([seg('⚠ ', 'crimson', { bold: true }), seg(clip(t.what, o.columns - 30), 'crimson'), dim(`  ${t.fix}`)])
    if (d.roster.length) {
      below.push([])
      const w = Math.min(24, Math.max(...d.roster.map(r => r.focus.length)) + 2)
      for (const r of d.roster) {
        below.push([seg('⛨ ', 'royal'), seg(pad(r.focus, w), undefined, { bold: true }), dim(pad(r.phase ?? '—', 15)), seg(STATE_SAYS[r.state], STATE_HUE[r.state], { dim: !STATE_HUE[r.state] })])
      }
    }
  } else {
    const kind = d.tickets.length ? `${d.tickets.join(', ')} · ${d.kind}` : `${d.kind} focus`
    side.push([dim(kind)])
    if (d.phases.length) side.push(phaseRoad(d.phases, d.phase))
    side.push([dim('⎇ '), seg(d.branch), ...(d.ahead !== null && d.upstream ? [dim(`  ${d.ahead} ahead of ${d.upstream}`)] : [])])
    const c = (k: string) => d.counts[k] ?? 0
    const total = Object.values(d.counts).reduce((a, b) => a + b, 0)
    if (d.needs.length) side.push(...needLines(d.needs, o.columns))
    else if (!total) side.push([seg('Nothing on the board yet. Tell me what to work on.', undefined, { bold: true })])
    if (total) side.push([dim(`${c('active')} active · ${c('queued')} queued · ${c('needs-you')} needs you · ${c('parked')} parked`)])
    if (d.active || d.next || d.last) below.push([])
    if (d.active) below.push([dim('now   '), seg(d.active, undefined, { bold: true })])
    if (d.next) below.push([dim('next  '), seg(d.next, undefined, { bold: true })])
    if (d.last) below.push([dim('last  '), dim(clip(`${d.last.at} ${d.last.line}`, o.columns - 8))])
  }
  const lessons = tutorialLines(seatOf(d), o, !isBare(d) ? d.needs[0]?.ref : undefined)
  if (lessons.length) below.push([], ...lessons)
  return { side, below }
}

/** The one line the card folds to after the patron's first message. */
export function foldedOf(d: WelcomeData, columns: number): Line {
  const bits: string[] = []
  if (!isBare(d)) {
    if (d.seat === 'party-leader' && d.phase) {
      const at = d.phases.indexOf(d.phase)
      bits.push(at >= 0 ? `${d.phase} ${at + 1}/${d.phases.length}` : d.phase)
    }
    bits.push(d.needs.length ? `⚜ ${d.needs.length} need${d.needs.length === 1 ? 's' : ''} you` : 'nothing needs you')
    if (d.seat === 'guildmaster') bits.push(`${d.roster.length} part${d.roster.length === 1 ? 'y' : 'ies'}`)
  }
  const after = bits.length
    ? [seg('━ ', hueOf(d)), seg(`${bits.join(' · ')} `, !isBare(d) && d.needs.length ? 'gold' : undefined, { dim: isBare(d) || !d.needs.length })]
    : []
  return seatRule(labelOf(d), hueOf(d), columns, after)
}

/** How many rows a card takes beside art of the given height, and below it. */
export const cardRows = (card: { side: Line[]; below: Line[] }, artRows: number) => Math.max(card.side.length, artRows) + card.below.length
