// The guild's working sprites: two terminal rows drawn while a turn runs, in place of nothing at all when the veil hides
// the deeds, and the one drawn above the prompt while a session waits. Each sprite is a function of its own tick count
// that paints a grid of one-column glyphs, each tagged with a colour class; the palette turns a class into Claude Code's
// own colours for the theme. ../hooks/register.tsx owns when and where a sprite is drawn and how it is repainted;
// this file owns what each one looks like, which is why it has no `$` in it and tests read it directly.
//
// The quill writes in real braille. Its line reads as handwriting to anyone who does not read braille, and as one of
// QUILL_SAYINGS to anyone who does.

/** The width every sprite is drawn at, in terminal columns. */
export const SPRITE_COLUMNS = 40
/** Every sprite is two rows tall. */
export const SPRITE_ROWS = 2

export type SpriteColor =
  | 'plain' | 'orange' | 'deep' | 'cream' | 'white' | 'gold' | 'flame' | 'ember'
  | 'muted' | 'stone' | 'log' | 'tent' | 'slime' | 'meter'

export type Cell = readonly [glyph: string, color: SpriteColor]
export type Frame = Cell[][]

/** The sprites a setting can name, in the order guild.conf documents them. */
export const SPRITE_NAMES = ['skirmish', 'delve', 'boss', 'siege', 'forge', 'wall', 'quill', 'campfire'] as const
export type SpriteName = (typeof SPRITE_NAMES)[number]
export const isSpriteName = (w: string): w is SpriteName => (SPRITE_NAMES as readonly string[]).includes(w)

type Sprite = { tick: number; draw: (t: number) => Frame }

const W = SPRITE_COLUMNS

function blank(): Frame {
  return Array.from({ length: SPRITE_ROWS }, () => Array.from({ length: W }, (): Cell => [' ', 'plain']))
}

const put = (g: Frame, r: number, c: number, ch: string, k: SpriteColor) => {
  if (c >= 0 && c < W && r >= 0 && r < SPRITE_ROWS) g[r]![c] = [ch, k]
}

const putText = (g: Frame, r: number, c: number, text: string, k: SpriteColor) =>
  [...text].forEach((ch, i) => put(g, r, c + i, ch, k))

/** A stable pseudo-random number in [0, 1) for a seed, so a frame depends on its tick alone. */
export function rnd(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b1, 0x85ebca6b) >>> 0
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35) >>> 0
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

// ---- The quill's braille ----

// Six-dot braille, dot n being bit n-1 of the cell's offset from U+2800.
const DOTS: Record<string, number[]> = {
  a: [1], b: [1, 2], c: [1, 4], d: [1, 4, 5], e: [1, 5], f: [1, 2, 4], g: [1, 2, 4, 5], h: [1, 2, 5], i: [2, 4],
  j: [2, 4, 5], k: [1, 3], l: [1, 2, 3], m: [1, 3, 4], n: [1, 3, 4, 5], o: [1, 3, 5], p: [1, 2, 3, 4],
  q: [1, 2, 3, 4, 5], r: [1, 2, 3, 5], s: [2, 3, 4], t: [2, 3, 4, 5], u: [1, 3, 6], v: [1, 2, 3, 6],
  w: [2, 4, 5, 6], x: [1, 3, 4, 6], y: [1, 3, 4, 5, 6], z: [1, 3, 5, 6],
  ' ': [], '!': [2, 3, 5], '?': [2, 3, 6], '.': [2, 5, 6], "'": [3],
}

/** A saying in braille, one cell a character; anything braille here has no cell for is left out. */
export function toBraille(text: string): string {
  return [...text.toLowerCase()]
    .filter(ch => ch in DOTS)
    .map(ch => String.fromCodePoint(0x2800 + DOTS[ch]!.reduce((bits, d) => bits | (1 << (d - 1)), 0)))
    .join('')
}

/** Braille read back as text, the way a patron who reads it would. */
export function fromBraille(cells: string): string {
  const back = new Map(Object.keys(DOTS).map(ch => [toBraille(ch), ch]))
  return [...cells].map(c => back.get(c) ?? '?').join('')
}

const QUILL_START = 6
/** The most cells a saying may take: the line from the entry number to the seal. */
export const QUILL_ROOM = W - 5 - QUILL_START

/** What the Guildmaster writes in the ledger, for whoever can read braille. */
export const QUILL_SAYINGS = [
  'the guildmaster sees all',
  'roll for initiative',
  'no dragons were harmed',
  'the patron is always right',
  'you found the secret ledger',
  'do not feed the slimes',
  'here be dragons',
  'a party leader owes me gold',
  'the quill is mightier',
  'beware the mimic',
  'natural twenty!',
  'nothing is hidden from me',
  'ask the patron nicely',
  'this entry is append only',
  'who left a slime in the hall?',
  'the forge never sleeps',
  'gm stands for game master',
  'the guild remembers',
] as const

/** The saying the quill writes in a given entry: every one of them in turn, in an order that shuffles each round. */
export function quillSaying(entry: number): string {
  const n = QUILL_SAYINGS.length
  const round = Math.floor(entry / n)
  const order = [...QUILL_SAYINGS.keys()].sort((a, b) => rnd(round * 131 + a) - rnd(round * 131 + b))
  return QUILL_SAYINGS[order[((entry % n) + n) % n]!]!
}

// ---- The sprites ----

const sprites: Record<SpriteName, Sprite> = {
  // A shielded adventurer holds the corridor; slimes hop in, take three strokes, burst and leave a coin.
  skirmish: { tick: 110, draw(t) {
    const g = blank(), stop = 8, enter = W - 8, approach = (enter - stop) * 2, strokeT = 6, fight = strokeT * 3
    const burst = 4, coinT = 10, cycle = approach + fight + burst + coinT
    const n = Math.floor(t / cycle), local = t % cycle
    const f = local - approach, s = Math.floor(f / strokeT), p = f % strokeT
    const striking = f >= 0 && f < fight && (p === 2 || p === 3)
    put(g, 0, 4, '●', 'orange'); put(g, 1, 3, '▗', 'orange'); put(g, 1, 4, '█', 'orange'); put(g, 1, 5, '▐', 'cream')
    if (striking) { put(g, 0, 5, '─', 'white'); put(g, 0, 6, '╲', 'white') }
    else if (f >= 0 && f < fight && p < 2) put(g, 0, 5, '│', 'white')
    else put(g, 0, 5, '╱', 'white')
    if (local < approach) {
      const x = enter - 2 * Math.floor(local / 4), air = local % 4 === 1 || local % 4 === 2
      if (air) { put(g, 0, x, '▄', 'slime'); put(g, 0, x + 1, '▄', 'slime') }
      else { put(g, 1, x, '▟', 'slime'); put(g, 1, x + 1, '▙', 'slime') }
    } else if (f < fight) {
      const hp = 3 - s - (p >= 2 ? 1 : 0), k: SpriteColor = striking ? 'white' : 'slime'
      const shape = hp >= 2 ? ['▟', '▙'] : ['▗', '▖']
      put(g, 1, stop, shape[0]!, k); put(g, 1, stop + 1, shape[1]!, k)
      if (striking) put(g, 0, stop + 1, '✦', 'gold')
      if (p >= 2) putText(g, 0, stop + 3, `-${4 + Math.floor(rnd(n * 7 + s) * 9)}`, p < 5 ? 'white' : 'muted')
    } else if (f < fight + burst) {
      const b = f - fight
      for (const [r, dx, ch] of [[0, -1 - b, '˙'], [0, 2 + b, '˙'], [1, -1 - b, '·'], [1, 2 + b, '·']] as const) put(g, r, stop + dx, ch, 'slime')
    } else {
      const c = f - fight - burst
      if (c < 4) put(g, 1, stop, '◉', 'gold')
      else put(g, 0, stop + Math.round((c - 3) * (W - 6 - stop) / (coinT - 3)), '◉', 'gold')
    }
    const tally = `◉×${7 + n}`
    ;[...tally].forEach((ch, i) => put(g, 0, W - tally.length + i, ch, i === 0 ? 'gold' : 'cream'))
    return g
  } },

  // The party of three walks a torchlit corridor while the wall scrolls past.
  delve: { tick: 200, draw(t) {
    const g = blank(), off = Math.floor(t / 2), lead = 22, party = [lead - 6, lead - 3, lead]
    const lights = [lead + 1]
    for (let x = 0; x < W; x++) if ((x + off) % 13 === 0) lights.push(x)
    for (let x = 0; x < W; x++) {
      const wx = x + off, door = wx % 31
      const d = Math.min(...lights.map(l => Math.abs(l - x)))
      const lit: SpriteColor = d <= 1 ? 'orange' : d <= 3 ? 'tent' : d <= 5 ? 'log' : 'stone'
      if (wx % 13 === 0) put(g, 0, x, rnd(t * 3 + wx) < 0.5 ? '▴' : '▲', 'flame')
      else if (door < 4) put(g, 0, x, '┃▒▒┃'[door]!, d <= 3 ? 'log' : 'stone')
      else put(g, 0, x, '─┴─┬'[wx % 4]!, lit)
      put(g, 1, x, '▁', d <= 2 ? 'log' : 'stone')
    }
    party.forEach((x, i) => { put(g, 0, x, '●', 'orange'); put(g, 1, x, (Math.floor(t / 2) + i) % 2 ? '▙' : '▟', 'orange') })
    put(g, 0, lead + 1, rnd(t * 5) < 0.5 ? '▴' : '▲', 'flame'); put(g, 1, lead + 1, '╿', 'log')
    return g
  } },

  // A knight and a dragon: fire on the shield, a charge, a strike; five pips drain until it falls and another rises.
  boss: { tick: 120, draw(t) {
    const g = blank(), home = 5, dx = 25, blowT = 34, blows = 5, fallT = 10, riseT = 8
    const cycle = blowT * blows + fallT + riseT
    const local = t % cycle, blow = Math.floor(local / blowT), b = local % blowT, felled = local >= blowT * blows
    const reach = dx - 2, run = reach - home
    let x = home, hp = 5 - blow - (b >= 22 ? 1 : 0), dragon: SpriteColor = 'ember', rows = 2
    if (!felled) {
      if (b >= 14 && b < 22) x = home + Math.round((b - 13) * run / 8)
      else if (b >= 22 && b < 25) x = reach
      else if (b >= 25 && b < 33) x = reach - Math.round((b - 24) * run / 8)
    } else {
      const f = local - blowT * blows
      if (f < 3) { hp = 0; dragon = 'muted' }
      else if (f < fallT) { hp = 0; rows = 0 }
      else { const r = f - fallT; hp = Math.ceil((r + 1) * 5 / riseT); rows = r < riseT / 2 ? 1 : 2 }
    }
    const breath = !felled && b >= 4 && b < 14, strike = !felled && b >= 22 && b < 25
    put(g, 0, x, '▲', 'cream'); put(g, 1, x, '█', 'orange')
    if (breath) { put(g, 0, x + 1, '█', 'cream'); put(g, 1, x + 1, '▌', 'cream') }
    else put(g, 1, x + 1, '▐', 'cream')
    if (strike) { put(g, 0, x + 1, '━', 'white'); put(g, 0, x + 2, '╲', 'white') }
    else if (!breath) put(g, 0, x + 1, felled ? '│' : b >= 14 && b < 22 ? '─' : '╱', 'white')
    const k: SpriteColor = strike ? 'white' : dragon
    const wing = Math.floor(t / 4) % 2 ? ['◢', '◤'] : ['▗', '▄']
    if (rows === 0) putText(g, 1, dx, '▁▂▃▃▂▁▁', 'muted')
    if (rows >= 1) [...' ▀▙██▄▂'].forEach((ch, i) => { if (ch !== ' ') put(g, 1, dx + i, ch, k) })
    if (rows >= 2) {
      put(g, 0, dx, '◢', k); put(g, 0, dx + 1, '█', strike ? k : 'flame'); put(g, 0, dx + 2, '▀', k)
      put(g, 0, dx + 4, wing[0]!, k); put(g, 0, dx + 5, wing[1]!, k)
    }
    if (strike) put(g, 1, dx - 1, '✦', 'gold')
    if (breath) {
      const front = Math.max(x + 2, dx - 1 - (b - 4) * 3)
      for (let c = front; c < dx; c++) put(g, 0, c, rnd(t * 7 + c) < 0.5 ? '≈' : '~', c > dx - 5 ? 'flame' : (c + t) % 2 ? 'ember' : 'orange')
      if (front === x + 2) put(g, 0, x + 2, '✦', 'flame')
    }
    for (let i = 0; i < 5; i++) put(g, 0, W - 6 + i, i < hp ? '■' : '□', i < hp ? 'ember' : 'muted')
    return g
  } },

  // A crew drives a ram at a castle gate until it gives way and the guild's flag goes up.
  siege: { tick: 130, draw(t) {
    const g = blank(), gate = 33, rest = 22, blowT = 14, blows = 5, after = 26, cycle = blowT * blows + after
    const local = t % cycle, blow = Math.floor(local / blowT), b = local % blowT, breached = local >= blowT * blows
    const damage = breached ? 5 : blow + (b >= 10 ? 1 : 0), contact = gate - 1
    let hx = contact
    if (!breached) {
      if (b <= 5) hx = contact - Math.round(b * (contact - rest) / 5)
      else if (b <= 7) hx = rest
      else if (b === 8) hx = rest + Math.round((contact - rest) / 2)
    }
    for (let c = gate; c < W; c++) put(g, 0, c, (c - gate) % 2 ? '▄' : '█', 'tent')
    for (let c = gate + 2; c < W; c++) put(g, 1, c, '█', 'tent')
    const gates = ['██', '█▚', '▚▚', '▚▞', '╱╲']
    if (damage < 5) putText(g, 1, gate, gates[damage]!, 'log')
    else { put(g, 1, gate, '▖', 'log'); put(g, 1, gate + 1, '▗', 'log') }
    for (let c = hx - 6; c < hx; c++) put(g, 1, c, '━', 'log')
    put(g, 1, hx, '▶', 'tent')
    for (const c of [hx - 6, hx - 4, hx - 2]) put(g, 0, c, '●', 'orange')
    if (!breached && (b === 10 || b === 11)) { put(g, 0, contact, '✦', 'gold'); put(g, 0, contact - 1, '·', 'muted') }
    if (breached) {
      const a = local - blowT * blows
      if (a >= 4) put(g, 0, gate + 3, '╿', 'cream')
      if (a >= 8) { put(g, 0, gate + 4, '▀', 'orange'); put(g, 0, gate + 5, Math.floor(t / 2) % 2 ? '▘' : '▀', 'orange') }
    }
    return g
  } },

  // A smith draws a blade out on the anvil, blow by blow, the metal glowing and cooling, until a sword lies there.
  forge: { tick: 150, draw(t) {
    const g = blank(), strikeT = 8, strikes = 9, restT = 24, cycle = strikeT * strikes + restT, face = 21
    const local = t % cycle, s = Math.floor(local / strikeT), p = local % strikeT, done = local >= strikeT * strikes
    const len = done ? strikes : s + (p >= 5 ? 1 : 0)
    const since = done ? local - (strikeT * strikes - 3) : p >= 5 ? p - 5 : p + 3
    const heat: SpriteColor = since < 2 ? 'white' : since < 6 ? 'flame' : since < 12 ? 'orange' : since < 20 ? 'deep' : 'cream'
    putText(g, 0, 2, '▟▀▀▙', 'muted')
    put(g, 1, 2, '█', 'muted'); put(g, 1, 5, '█', 'muted')
    for (let i = 0; i < 2; i++) put(g, 1, 3 + i, rnd(t * 5 + i) < 0.5 ? '▒' : '▓', rnd(t * 3 + i + 9) < 0.5 ? 'flame' : 'ember')
    putText(g, 1, face - 4, '▀▀▜██▛▀', 'muted')
    for (let i = 0; i <= len; i++) put(g, 0, face - i, i === 0 && done ? '╸' : '━', heat)
    if (done) { put(g, 0, face - len - 1, '┿', 'log'); put(g, 0, face - len - 2, '▬', 'log') }
    put(g, 0, face + 2, '●', 'orange'); put(g, 1, face + 2, '█', 'orange')
    if (!done && (p === 5 || p === 6)) put(g, 0, face, '▆', 'cream')
    else if (!done && p === 4) put(g, 0, face + 1, '▀', 'cream')
    else put(g, 0, face + 1, done ? '▄' : '▀', 'cream')
    if (!done && p >= 5) {
      for (let i = 0; i < 3; i++) {
        const left = i === 2
        const c = left ? face - len - 1 - (p - 5) : face + 2 + (p - 5) * 2 + i
        put(g, i === 1 ? 1 : 0, c, p === 7 ? '·' : '˙', p === 7 ? 'muted' : 'gold')
      }
    }
    if (done && local % 8 < 2 && since > 6) put(g, 0, face + 1, '✦', 'gold')
    return g
  } },

  // A mason throws bricks onto a wall in running bond, bottom course first, until it is finished and glows.
  wall: { tick: 110, draw(t) {
    const g = blank(), x0 = 14, placeT = 7, flight = 4, glowT = 14, clearT = 6
    const bricks: { row: number; x: number; w: number }[] = []
    for (let k = 0; k < 6; k++) bricks.push({ row: 1, x: x0 + 4 * k, w: 4 })
    bricks.push({ row: 0, x: x0, w: 2 })
    for (let k = 0; k < 5; k++) bricks.push({ row: 0, x: x0 + 2 + 4 * k, w: 4 })
    bricks.push({ row: 0, x: x0 + 22, w: 2 })
    const build = bricks.length * placeT, cycle = build + glowT + clearT, local = t % cycle
    const placed = Math.min(bricks.length, Math.floor(local / placeT)), f = local % placeT
    const glow = local >= build && local < build + glowT, clear = local >= build + glowT
    bricks.slice(0, local >= build ? bricks.length : placed).forEach((br, i) => {
      const k: SpriteColor = clear ? 'muted' : glow ? (Math.floor(t / 2) % 2 ? 'flame' : 'gold') : i === placed - 1 && f < 2 ? 'flame' : 'orange'
      for (let c = 0; c < br.w; c++) put(g, br.row, br.x + c, c === br.w - 1 ? '▌' : '█', k)
    })
    put(g, 1, 1, '▄', 'deep'); put(g, 1, 2, '▄', 'deep')
    put(g, 0, 4, '●', 'orange'); put(g, 1, 4, '█', 'orange')
    const throwing = local < build && f < flight
    put(g, throwing && f < 2 ? 0 : 1, 5, throwing && f < 2 ? '╱' : '▖', 'orange')
    if (throwing) {
      const br = bricks[placed]!, c = 6 + Math.round((f + 1) * (br.x - 6) / flight)
      put(g, f < flight - 1 ? 0 : br.row, c, '▬', 'orange')
    }
    return g
  } },

  // The Guildmaster's quill writes one numbered entry in the ledger, in braille; the entry is sealed and fades.
  quill: { tick: 110, draw(t) {
    const g = blank()
    // Each entry takes as long as its saying, so the entries are found by walking them from the first.
    let entry = 0, from = 0
    for (;;) {
      const span = quillSaying(entry).length * 3 + 22
      if (t < from + span) break
      from += span
      entry++
    }
    const local = t - from, words = toBraille(quillSaying(entry)).slice(0, QUILL_ROOM), len = [...words].length
    const writeTicks = len * 3, end = QUILL_START + len
    putText(g, 1, 0, `№${12 + entry}`.padEnd(5, ' '), 'muted')
    const nib = Math.min(end, QUILL_START + Math.floor(local / 3))
    const sealed = local >= writeTicks + 8, fading = local >= writeTicks + 14
    ;[...words].slice(0, nib - QUILL_START).forEach((ch, i) => put(g, 1, QUILL_START + i, ch, fading ? 'muted' : 'cream'))
    if (sealed) put(g, 1, end + 1, '◆', fading ? 'muted' : 'orange')
    else {
      const flutter = Math.floor(t / 2) % 2
      if (local < writeTicks) put(g, 1, nib, '╱', 'orange')
      put(g, 0, nib + 1, local >= writeTicks ? '╱' : '▗', 'orange')
      put(g, 0, nib + 2, '▟', 'orange')
      put(g, 0, nib + 3, flutter ? '▀' : '▔', 'orange')
      put(g, 0, nib + 4, flutter ? '▘' : '▝', 'deep')
    }
    return g
  } },

  // A tent and a fire at the camp: the flames flicker, the embers glow and sparks drift off.
  campfire: { tick: 120, draw(t) {
    const g = blank(), tent = 9, fire = 21
    put(g, 0, tent + 1, '▗', 'tent'); put(g, 0, tent + 2, '▖', 'tent')
    putText(g, 1, tent, '▟▌▐▙', 'tent')
    put(g, 1, fire - 1, '╺', 'log'); put(g, 1, fire + 3, '╸', 'log')
    const embers = '▂▃▄▅'
    for (let i = 0; i < 3; i++) {
      const h = 1 + Math.floor(rnd(t * 3 + i) * 3) + (i === 1 ? 1 : 0)
      put(g, 1, fire + i, embers[Math.min(3, h)]!, i === 1 ? 'flame' : 'ember')
    }
    const flames = [['⢀', '⣴', '⡀'], ['⠰', '⣿', '⠆'], ['⢠', '⣾', '⡄'], [' ', '⣷', '⠄'], ['⢀', '⣾', '⣦'], ['⠠', '⣿', '⡆']]
    flames[Math.floor(rnd(t + 11) * flames.length)]!.forEach((ch, i) => put(g, 0, fire + i, ch, i === 1 ? 'flame' : 'orange'))
    for (let s = 0; s < 4; s++) {
      const age = (t + s * 5) % 20
      if (age < 9) {
        const side = rnd(Math.floor((t + s * 5) / 20) * 7 + s) < 0.5 ? -1 : 1
        put(g, 0, fire + 1 + side * (2 + Math.floor(age / 1.5)), age < 4 ? '˙' : '·', age < 4 ? 'orange' : 'muted')
      }
    }
    return g
  } },
}

/** How often a sprite moves on, in milliseconds. */
export const spriteTick = (name: SpriteName) => sprites[name].tick

/** A sprite's frame at its tick count `t`. */
export const spriteFrame = (name: SpriteName, t: number): Frame => sprites[name].draw(t)

/** A sprite drawn at random from a list, never the one drawn last when the list holds another: Claude's wording does the same. */
export function pickSprite(from: readonly SpriteName[], last: SpriteName | undefined, roll: number): SpriteName | undefined {
  const pool = from.length > 1 ? from.filter(s => s !== last) : from
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))] : undefined
}

// ---- The meter: the turn's time and tokens, beside the sprite ----

/** The blank columns between the sprite and its meter, and the meter's own width. */
export const METER_GAP = 2
export const METER_COLUMNS = 16

/** A turn's time as Claude Code's working row says it: `12s`, `1m 4s`, `1h 2m`. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

/** A token count as Claude Code's working row says it: `300 tokens`, `1.2k tokens`. */
export function formatTokens(n: number): string {
  const t = Math.max(0, Math.round(n))
  return t < 1000 ? `↓ ${t} tokens` : `↓ ${(t / 1000).toFixed(1).replace(/\.0$/, '')}k tokens`
}

/** A frame with its meter to the right: one line of the meter a row, cut to the meter's width. */
export function withMeter(frame: Frame, lines: readonly [string, string]): Frame {
  return frame.map((row, r) => {
    const text = [...(lines[r] ?? '')].slice(0, METER_COLUMNS)
    const cells: Cell[] = Array.from({ length: METER_GAP + METER_COLUMNS }, (_, i): Cell => {
      const ch = text[i - METER_GAP]
      return i >= METER_GAP && ch !== undefined ? [ch, 'meter'] : [' ', 'plain']
    })
    return [...row, ...cells]
  })
}

// ---- Colour and packing ----

/** `0x01000000` asks the terminal for its default colour. */
const DEFAULT_COLOR = 0x01000000

export type Palette = Readonly<Record<SpriteColor, number>>

/**
 * Claude Code's colours per theme family: its Claude orange, its success green for the slime, and earth tones that
 * keep their contrast on the theme's background, darker on a light one.
 */
export const PALETTES: Readonly<Record<'dark' | 'light', Palette>> = {
  dark: {
    plain: DEFAULT_COLOR, orange: 0xd77757, deep: 0xa9573d, cream: 0xe9dcc0, white: 0xf4f4f4, gold: 0xffd27a,
    flame: 0xffd27a, ember: 0xe0614a, muted: 0x5c5f66, stone: 0x46423d, log: 0x8a7560, tent: 0x9c8f78, slime: 0x4eba65,
    meter: 0x999999,
  },
  light: {
    plain: DEFAULT_COLOR, orange: 0xd77757, deep: 0xa9573d, cream: 0x8a7a5c, white: 0x3a3a3a, gold: 0xb7791f,
    flame: 0xc98a1a, ember: 0xc0392b, muted: 0xa3a6ad, stone: 0xc9c2b8, log: 0x7a6450, tent: 0x8a7d66, slime: 0x2c7a39,
    meter: 0x666666,
  },
}

/** The palette family for Claude Code's `theme` setting: `dark…` themes are dark, everything else reads on light. */
export const paletteFamily = (theme: unknown): 'dark' | 'light' =>
  typeof theme === 'string' && theme.startsWith('dark') ? 'dark' : 'light'

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64, written here since the hooks environment and Node differ on native helpers. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const w = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += BASE64[(w >> 18) & 63]! + BASE64[(w >> 12) & 63]! + BASE64[(w >> 6) & 63]! + BASE64[w & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const w = bytes[i]! << 16
    out += BASE64[(w >> 18) & 63]! + BASE64[(w >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const w = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += BASE64[(w >> 18) & 63]! + BASE64[(w >> 12) & 63]! + BASE64[(w >> 6) & 63]! + '='
  }
  return out
}

/**
 * How many columns a sprite's Raster takes in a row of the given width: the sprite's, and its meter's when it has one,
 * or less on a narrow terminal.
 */
export const rasterColumns = (viewportColumns: number | undefined, meter = false) =>
  Math.max(1, Math.min(SPRITE_COLUMNS + (meter ? METER_GAP + METER_COLUMNS : 0), (viewportColumns ?? 80) - 2))

/** A frame as a Raster's `cells`: `columns * rows` little-endian [codePoint, foreground, background] triplets. */
export function packFrame(frame: Frame, columns: number, palette: Palette): string {
  const words = new Uint32Array(columns * SPRITE_ROWS * 3)
  for (let r = 0; r < SPRITE_ROWS; r++) {
    for (let c = 0; c < columns; c++) {
      const [ch, k] = frame[r]?.[c] ?? [' ', 'plain']
      const o = (r * columns + c) * 3
      words[o] = ch.codePointAt(0) ?? 0x20
      words[o + 1] = palette[k]
      words[o + 2] = DEFAULT_COLOR
    }
  }
  return encodeBase64(new Uint8Array(words.buffer))
}
