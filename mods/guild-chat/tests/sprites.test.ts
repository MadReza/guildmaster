import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { SPRITE_DEFAULTS, spritesOf } from '../hooks/register'
import {
  formatElapsed, formatTokens, fromBraille, packFrame, PALETTES, pickSprite, QUILL_ROOM, QUILL_SAYINGS, quillSaying, SPRITE_COLUMNS, SPRITE_NAMES,
  SPRITE_ROWS, spriteFrame, toBraille,
} from '../lib/sprites'

// What stands for Claude Code and the machine beneath the mod: the environment gm starts a session with, a Guildhall
// whose guild.conf the test writes (none when it is undefined), a clock, and the engine's own row. The journal records the
// repaints the mod asks for.
const HOME = '/home/p'
const CONF = `${HOME}/.guildmaster/guild.conf`
const STOCK = 'the engine row'
const viewport = { columns: 60, rows: 20 }

function world(on: On, conf: string | undefined, env: Record<string, string> = { HOME, GM_CHAT: 'banners' }) {
  const blits: string[] = []
  const clock = mock.clock(on)
  mock.env(on, env)
  on('fs.exists', async (_$, e) => ({ value: e.path === CONF && conf !== undefined }))
  on('fs.read', async (_$, e) => (e.path === CONF && conf !== undefined ? { value: conf } : { deny: `ENOENT: ${e.path}` }))
  on('fs.stat', async (_$, e) =>
    e.path === CONF && conf !== undefined
      ? { value: { kind: 'file' as const, size: conf.length, mtimeMs: 1000, isLink: false } }
      : { deny: `ENOENT: ${e.path}` })
  on('ui.blit', async (_$, e) => {
    blits.push(e.requestId)
    return { value: {} }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: [STOCK] }))
  return { blits, clock }
}

const spinner = { component: 'Spinner', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } } as const
const band = (isWorking: boolean) => ({
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking, maxRows: 10, bodyColumns: 55, scroll: { offset: 0, bodyRows: 9 }, view: {} },
}) as const

// The glyphs of a Raster's cells, row by row: every third little-endian u32 is a code point.
function glyphs(cells: string, columns: number): string[] {
  const bin = atob(cells)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  const rows: string[] = []
  for (let r = 0; r < words.length / 3 / columns; r++) {
    let row = ''
    for (let c = 0; c < columns; c++) row += String.fromCodePoint(words[(r * columns + c) * 3]!)
    rows.push(row)
  }
  return rows
}

describe('the sprites as drawn', () => {
  test('every sprite is two rows of one-column glyphs, at every tick of a long turn', () => {
    const wrong: string[] = []
    for (const name of SPRITE_NAMES) {
      for (let t = 0; t < 1500; t++) {
        const frame = spriteFrame(name, t)
        if (frame.length !== SPRITE_ROWS) wrong.push(`${name}@${t}: ${frame.length} rows`)
        for (const row of frame) {
          if (row.length !== SPRITE_COLUMNS) wrong.push(`${name}@${t}: a row of ${row.length}`)
          for (const [ch] of row) {
            const cp = ch.codePointAt(0)!
            if ([...ch].length !== 1 || cp < 0x20 || cp > 0xffff) wrong.push(`${name}@${t}: ${JSON.stringify(ch)}`)
          }
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([])
  })

  test('a frame packs to the cells a Raster takes', () => {
    const cells = packFrame(spriteFrame('campfire', 3), SPRITE_COLUMNS, PALETTES.dark)
    const rows = glyphs(cells, SPRITE_COLUMNS)
    expect(rows.length).toBe(SPRITE_ROWS)
    expect(rows[1]).toContain('▟▌▐▙')
  })
})

describe("the quill's braille", () => {
  test('every saying fits the line and reads back as written', () => {
    for (const saying of QUILL_SAYINGS) {
      expect([...toBraille(saying)].length).toBeLessThanOrEqual(QUILL_ROOM)
      expect(fromBraille(toBraille(saying))).toBe(saying)
    }
  })

  test('each round of entries writes every saying once', () => {
    const n = QUILL_SAYINGS.length
    for (const round of [0, 1, 7]) {
      const seen = new Set(Array.from({ length: n }, (_, i) => quillSaying(round * n + i)))
      expect(seen.size).toBe(n)
    }
  })

  test("the first entry, once written, is its saying in braille", () => {
    const saying = quillSaying(0)
    const written = spriteFrame('quill', saying.length * 3 + 2)[1]!.slice(6, 6 + saying.length).map(([ch]) => ch).join('')
    expect(fromBraille(written)).toBe(saying)
  })
})

describe('the meter', () => {
  test('says the time and the tokens as Claude Code does', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(12_400)).toBe('12s')
    expect(formatElapsed(64_000)).toBe('1m 4s')
    expect(formatElapsed(3_720_000)).toBe('1h 2m')
    expect(formatTokens(300)).toBe('↓ 300 tokens')
    expect(formatTokens(1200)).toBe('↓ 1.2k tokens')
    expect(formatTokens(2000)).toBe('↓ 2k tokens')
  })
})

describe('drawing one at random', () => {
  test('never the one drawn last while the list holds another', () => {
    const from = ['skirmish', 'forge'] as const
    for (const roll of [0, 0.3, 0.6, 0.99]) expect(pickSprite(from, 'skirmish', roll)).toBe('forge')
    expect(pickSprite(['quill'], 'quill', 0.5)).toBe('quill')
    expect(pickSprite([], undefined, 0.5)).toBeUndefined()
  })

  test('every roll lands on one of the list', () => {
    const from = ['skirmish', 'delve', 'boss', 'siege', 'forge', 'wall'] as const
    const drawn = new Set([0, 0.17, 0.34, 0.5, 0.67, 0.84, 0.999].map(r => pickSprite(from, undefined, r)))
    expect(drawn.size).toBe(6)
  })
})

describe('the settings, read as gm reads them', () => {
  test('on by default, with the patron\'s defaults for each role', () => {
    const s = spritesOf('')
    expect(s.on).toBe(true)
    expect(s.guildmaster).toEqual(['quill'])
    expect(s.partyLeader).toEqual(['skirmish', 'delve', 'boss', 'siege', 'forge', 'wall'])
    expect(s.idleGuildmaster).toEqual(['campfire'])
    expect(s.idlePartyLeader).toEqual([])
    expect(SPRITE_DEFAULTS['idle-party-leader']).toBe('none')
  })

  test('off, a list, none, and a list gm cannot take', () => {
    expect(spritesOf('sprites: off\n').on).toBe(false)
    expect(spritesOf('sprites: yes\n').on).toBe(true)
    expect(spritesOf('sprites-party-leader: forge wall forge\n').partyLeader).toEqual(['forge', 'wall'])
    expect(spritesOf('idle-guildmaster: none\n').idleGuildmaster).toEqual([])
    expect(spritesOf('idle-party-leader: campfire\n').idlePartyLeader).toEqual(['campfire'])
    expect(spritesOf('sprites-guildmaster: quill dragon\n').guildmaster).toEqual(['quill'])
  })
})

describe('while a turn runs', () => {
  test('the Guildmaster writes with the quill, in place of Claude Code\'s words, the time and tokens beside it', async ($, on) => {
    world(on, '')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...spinner })
    const raster = await ui.find({ type: 'Raster' })
    expect(raster).toBeDefined()
    const rows = glyphs(raster!.props.cells as string, raster!.props.columns as number)
    expect(rows[1]).toContain('№12')
    expect(rows[0]!.slice(SPRITE_COLUMNS)).toContain('0s')
    expect(rows[1]!.slice(SPRITE_COLUMNS)).toContain('↓ 0 tokens')
    expect(await ui.find({ type: 'Text', text: STOCK })).toBeUndefined()
  })

  test('while a state overrides the word, Claude Code\'s row stays beneath the sprite', async ($, on) => {
    world(on, '')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, component: 'Spinner',
      props: { ...spinner.props, message: 'Compacting conversation' } })
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: STOCK })).toBeDefined()
  })

  test('a Party Leader draws one of the dungeon and the builders', async ($, on) => {
    world(on, '', { HOME, GM_CHAT: 'banners', GM_CHAT_FOCUS: 'crm-1234' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...spinner })
    const raster = await ui.find({ type: 'Raster' })
    expect(raster).toBeDefined()
    expect(glyphs(raster!.props.cells as string, raster!.props.columns as number)[1]).not.toContain('№')
  })

  test('the sprite moves on its own clock', async ($, on) => {
    const { blits, clock } = world(on, '')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...spinner })
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    await clock.advance(1000)
    expect(blits.length).toBeGreaterThan(3)
  })

  test('sprites: off leaves Claude Code\'s row as it is', async ($, on) => {
    world(on, 'sprites: off\n')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...spinner })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: STOCK })).toBeDefined()
  })

  test('without a Guildhall nothing is drawn', async ($, on) => {
    world(on, undefined, { HOME })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...spinner })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('the desktop keeps its own row', async ($, on) => {
    world(on, '')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'desktop', viewport, ...spinner })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })
})

describe('while the session waits', () => {
  test('the Guildmaster sits by the campfire above the prompt', async ($, on) => {
    world(on, '')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...band(false) })
    const raster = await ui.find({ type: 'Raster' })
    expect(raster).toBeDefined()
    expect(glyphs(raster!.props.cells as string, raster!.props.columns as number)[1]).toContain('▟▌▐▙')
  })

  test('the campfire is out while a turn runs', async ($, on) => {
    world(on, '')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...band(true) })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('a Party Leader waits with nothing drawn, unless guild.conf names one', async ($, on) => {
    world(on, '', { HOME, GM_CHAT: 'banners', GM_CHAT_FOCUS: 'crm-1234' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...band(false) })
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('idle-party-leader: campfire gives a Party Leader the fire too', async ($, on) => {
    world(on, 'idle-party-leader: campfire\n', { HOME, GM_CHAT: 'banners', GM_CHAT_FOCUS: 'crm-1234' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...band(false) })
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
  })
})
