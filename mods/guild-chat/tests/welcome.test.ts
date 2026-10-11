import type { On } from 'claude-code'
import { describe, expect, mock, test, type Engine } from 'claude-code/testing'

import {
  ART, artCells, cardOf, commandsIn, COMMANDS, commandsFor, foldedOf, isLearned, LEARN_SESSIONS, LEARN_USES, MINI_ART,
  parseArt, phaseRoad, pickArt, rankOf, recordUse, SEAT_ART, welcomeOf, type CardOptions, type GuildmasterData,
  type Line, type PartyLeaderData, type Usage,
} from '../lib/welcome'

// The environment's own timer, which the kit's hooks environment has and its lib does not declare.
declare const setTimeout: (run: () => void, ms: number) => unknown

// What stands for Claude Code and the machine beneath the mod: a Guildhall whose guild.conf the test writes, the
// guild's gm linked at ~/.local/bin/gm answering gm welcome --json, a store, and the engine's own row.
const HOME = '/home/p'
const CONF = `${HOME}/.guildmaster/guild.conf`
const GM = `${HOME}/.local/bin/gm`
const STOCK = 'the engine row'

const text = (line: Line) => line.map(s => s.text).join('')
const lines = (ls: readonly Line[]) => ls.map(text)

const GUILD: GuildmasterData = {
  seat: 'guildmaster',
  patron: 'Reza',
  needs: [{ ref: 'appt-v2#12', question: 'Open the merge request to integration?' }],
  roster: [{ focus: 'appt-v2', phase: 'dev-test', state: 'waiting' }, { focus: 'crm-1234', phase: 'build', state: 'working' }],
  trouble: [],
}
const PHASES = ['intake', 'camp', 'build', 'dev-test', 'merge-request', 'fix-loop', 'sealed', 'closed']
const FOCUS: PartyLeaderData = {
  seat: 'party-leader', focus: 'crm-1234', kind: 'ticket', tickets: ['CRM-1234'], phase: 'build', phases: PHASES,
  branch: 'feature/CRM-1234', upstream: 'origin/main', ahead: 4, counts: { active: 1, queued: 2 }, needs: [],
  active: '#6 retry-on-timeout', next: '#7 owner-empty-after-save', last: { at: '09:12', line: 'crm-1234#5 done' },
}
const opts = (more: Partial<CardOptions> = {}): CardOptions =>
  ({ now: new Date(2026, 9, 11, 9, 30), columns: 70, tutorial: 'auto', usage: {}, unseen: new Set(), ...more })

// Every command of a seat used enough to be learned, but those named.
function learnedAllBut(seat: 'guildmaster' | 'party-leader', ...not: string[]): Usage {
  let u: Usage = {}
  for (const c of commandsFor(seat)) {
    if (not.includes(c.id)) continue
    for (let i = 0; i < LEARN_USES; i++) u = recordUse(u, c.id, `s${i % LEARN_SESSIONS}`)
  }
  return u
}

describe('the welcome as guild.conf sets it', () => {
  test('defaults: on, art rotating for both seats, sized by rank, folded to a rule, tutorial by rank', () => {
    expect(welcomeOf(() => undefined)).toEqual({
      on: true, artGuildmaster: 'rotate', artPartyLeader: 'rotate', artSize: 'auto', fold: 'rule', tutorial: 'auto',
    })
  })

  test('each setting is taken as gm takes it, and a value gm cannot take keeps the default', () => {
    const conf: Record<string, string> = {
      welcome: 'off', 'welcome-art-guildmaster': 'hall', 'welcome-art-party-leader': '~/.guildmaster/art/dragon.txt',
      'welcome-art-size': 'huge', 'welcome-fold': 'disappear', tutorial: 'yes',
    }
    expect(welcomeOf(k => conf[k])).toEqual({
      on: false, artGuildmaster: 'hall', artPartyLeader: { file: '~/.guildmaster/art/dragon.txt' }, artSize: 'auto',
      fold: 'vanish', tutorial: 'on',
    })
    expect(welcomeOf(k => ({ 'welcome-art-guildmaster': 'dragon' } as Record<string, string>)[k]).artGuildmaster).toBe('rotate')
  })
})

describe('the art', () => {
  test('every piece is 16 by 16 pixels, drawn in 16 columns by 8 rows; the small ones in 10 by 3', () => {
    for (const grid of Object.values(ART)) {
      expect(grid.length).toBe(16)
      expect(grid.every(r => r.length === 16)).toBe(true)
      const cells = artCells(grid, 'dark')
      expect([cells.columns, cells.rows]).toEqual([16, 8])
    }
    for (const grid of Object.values(MINI_ART)) expect([artCells(grid, 'light').columns, artCells(grid, 'light').rows]).toEqual([10, 3])
  })

  test('two pixels to a cell: a top pixel is the glyph, a bottom one its background; a lone bottom pixel is a lower half', () => {
    const words = (cells: string) => new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const both = words(artCells(['R', 'G'], 'dark').cells)
    expect([...both]).toEqual([0x2580, 0xc0392b, 0xd4a017])
    const lower = words(artCells(['.', 'G'], 'dark').cells)
    expect([...lower]).toEqual([0x2584, 0xd4a017, 0x01000000])
    const empty = words(artCells(['.'], 'dark').cells)
    expect(empty[0]).toBe(0x20)
  })

  test("the patron's own piece: comments skipped, rows padded, refused when too large or unpaintable", () => {
    expect(parseArt('# a dragon\n..EE\n.EeeE\n')).toEqual(['..EE.', '.EeeE'])
    expect(parseArt('X\n')).toBeUndefined()
    expect(parseArt('E'.repeat(17))).toBeUndefined()
    expect(parseArt(Array(17).fill('E').join('\n'))).toBeUndefined()
    expect(parseArt('# nothing\n')).toBeUndefined()
  })

  test('rotation never draws the piece shown last', () => {
    for (const seat of ['guildmaster', 'party-leader'] as const) {
      const pool = SEAT_ART[seat]
      for (const last of pool) for (const roll of [0, 0.4, 0.99]) expect(pickArt(pool, last, roll)).not.toBe(last)
    }
    expect(pickArt(['crest'], 'crest', 0.5)).toBe('crest')
  })
})

describe('the tutorial', () => {
  test("a message's words name the commands it used", () => {
    expect(commandsIn('#12 yes, open it')).toEqual(['ref'])
    expect(commandsIn('appt-v2#4 go ahead')).toEqual(['ref'])
    expect(commandsIn('open CRM-1234 in ~/src/crm')).toEqual(['open'])
    expect(commandsIn("who's working?")).toEqual(['roster'])
    expect(commandsIn("what's on the board?")).toEqual(['board'])
    expect(commandsIn('park #3 until Monday')).toEqual(['park'])
    expect(commandsIn('turn the tutorial off')).toEqual(['tutorial'])
    expect(commandsIn('use the guildhall art')).toEqual(['art'])
    expect(commandsIn('turn the sprites off')).toEqual(['config'])
    expect(commandsIn('close appt-v2')).toEqual(['close'])
    expect(commandsIn('Read the three modules and tell me what they do.')).toEqual([])
  })

  test(`a command is learned at ${LEARN_USES} uses in ${LEARN_SESSIONS} separate sessions, not before`, () => {
    let u: Usage = {}
    for (let i = 0; i < 9; i++) u = recordUse(u, 'veil', 'one busy afternoon')
    expect(isLearned(u.veil)).toBe(false)
    u = recordUse(recordUse(u, 'veil', 'tuesday'), 'veil', 'wednesday')
    expect(isLearned(u.veil)).toBe(true)
    expect(u.veil!.sessions.length).toBe(LEARN_SESSIONS)
  })

  test('the rank: a novice below four learned, a master with all of them, a journeyman between', () => {
    expect(rankOf({}, 'guildmaster')).toBe('novice')
    const all = commandsFor('party-leader').map(c => c.id)
    expect(rankOf(learnedAllBut('party-leader', ...all.slice(3)), 'party-leader')).toBe('novice')
    expect(rankOf(learnedAllBut('party-leader', ...all.slice(4)), 'party-leader')).toBe('journeyman')
    expect(rankOf(learnedAllBut('party-leader'), 'party-leader')).toBe('master')
  })
})

describe('the card', () => {
  test("the Guildmaster's: the greeting, then what needs the patron above all else, then the roster", () => {
    const card = cardOf(GUILD, opts())
    const side = lines(card.side)
    expect(side[0]).toMatch(/^━━ ⚔ GUILDMASTER ━+$/)
    expect(side[1]).toBe('Good morning, Reza · Sun 11 Oct')
    expect(side[2]).toBe(' ⚜ 1 needs you ')
    expect(card.side[2]![0]!.badge).toBe(true)
    expect(side[3]).toBe('  appt-v2#12  Open the merge request to integration?')
    const below = lines(card.below)
    expect(below.some(l => /^⛨ appt-v2 +dev-test +waiting on you$/.test(l))).toBe(true)
    expect(below.some(l => /^⛨ crm-1234 +build +working$/.test(l))).toBe(true)
  })

  test('a first day says what the guild is for; trouble is told in crimson with what to do', () => {
    expect(lines(cardOf({ ...GUILD, needs: [], roster: [] }, opts()).side).join('\n')).toContain('No parties yet.')
    const card = cardOf({ ...GUILD, trouble: [{ what: 'appt-v2 is held after 3 failed starts', fix: 'say "reopen appt-v2"' }] }, opts())
    const trouble = card.side.find(l => text(l).startsWith('⚠ '))!
    expect(text(trouble)).toBe('⚠ appt-v2 is held after 3 failed starts  say "reopen appt-v2"')
    expect(trouble[1]!.hue).toBe('crimson')
  })

  test("a Party Leader's: its ticket, the road through the phases, its branch, the board, now, next and last", () => {
    const card = cardOf(FOCUS, opts())
    const side = lines(card.side)
    expect(side[0]).toMatch(/^━━ ⚔ PARTY LEADER · crm-1234 ━+$/)
    expect(side[1]).toBe('CRM-1234 · ticket')
    expect(side[2]).toBe('●─●─◆─○─○─○─○─○  build 3/8')
    expect(side[3]).toBe('⎇ feature/CRM-1234  4 ahead of origin/main')
    expect(side[4]).toBe('1 active · 2 queued · 0 needs you · 0 parked')
    expect(lines(card.below).slice(1, 4)).toEqual(['now   #6 retry-on-timeout', 'next  #7 owner-empty-after-save', 'last  09:12 crm-1234#5 done'])
  })

  test('a fresh focus asks for work; a question for the patron comes before the counts', () => {
    expect(lines(cardOf({ ...FOCUS, counts: {}, active: null, next: null, last: null }, opts()).side)).toContain('Nothing on the board yet. Tell me what to work on.')
    const side = lines(cardOf({ ...FOCUS, needs: [{ ref: '#12', question: 'Open the merge request?' }] }, opts()).side)
    expect(side.indexOf(' ⚜ 1 needs you ')).toBeLessThan(side.findIndex(l => l.includes('queued')))
    expect(lines([phaseRoad(PHASES, null)])[0]).toBe('○─○─○─○─○─○─○─○  no phase yet')
  })

  test("a novice's panel: every command with its pips, the spyglass's tabs, a sentence to try and the sigils", () => {
    const below = lines(cardOf(GUILD, opts({ usage: recordUse({}, 'veil', 's1') })).below)
    expect(below).toContain('── What you can type ── ▱▱▱▱▱▱▱▱▱ 0/9 learned · novice')
    expect(below.some(l => /^ {2}\/veil +●○○○○ {2}hide the deeds, keep the talk$/.test(l))).toBe(true)
    expect(below.some(l => l.includes('tabs: 1 postings  2 activity  3 configs  4 context'))).toBe(true)
    expect(below).toContain('  try: "appt-v2#12 yes, go ahead"')
    expect(lines(cardOf({ ...GUILD, needs: [] }, opts()).below)).toContain('  try: "appt-v2#12 yes, go ahead"')
    expect(lines(cardOf({ ...GUILD, needs: [{ ref: 'crm-9#2', question: '?' }] }, opts()).below)).toContain('  try: "crm-9#2 yes, go ahead"')
    expect(below.at(-1)).toBe('  ⚜ you  ⚔ guildmaster  ⚔ party leader  ⛨ adventurer')
  })

  test("a journeyman's: one line of what is left to learn; a master's: nothing but a command new to them", () => {
    const journeyman = lines(cardOf(FOCUS, opts({ columns: 130, usage: learnedAllBut('party-leader', 'park', 'art', 'tutorial', 'close') })).below)
    expect(journeyman.at(-1)).toMatch(/^try {2}"park #3 until Monday" · "use the guildhall art" · "turn the tutorial off" · "close this focus" {3}▰+▱{4}$/)
    expect(lines(cardOf(FOCUS, opts({ usage: learnedAllBut('party-leader') })).below).some(l => l.startsWith('try'))).toBe(false)
    const master = cardOf(FOCUS, opts({ usage: learnedAllBut('party-leader'), unseen: new Set(['art']) })).below.at(-1)!
    expect(text(master)).toBe('try  "use the guildhall art" new ')
  })

  test('tutorial: on keeps the full panel at any rank, and off never shows it', () => {
    const master = learnedAllBut('guildmaster')
    expect(lines(cardOf(GUILD, opts({ usage: master, tutorial: 'on' })).below).some(l => l.includes('What you can type'))).toBe(true)
    expect(lines(cardOf(GUILD, opts({ tutorial: 'off' })).below).some(l => l.includes('What you can type') || l.startsWith('try'))).toBe(false)
  })

  test('folded, it is one rule naming the seat and what needs the patron', () => {
    expect(text(foldedOf(GUILD, 60))).toMatch(/^━━ ⚔ GUILDMASTER ━ ⚜ 1 needs you · 2 parties ━+$/)
    expect(text(foldedOf(FOCUS, 70))).toMatch(/^━━ ⚔ PARTY LEADER · crm-1234 ━ build 3\/8 · nothing needs you ━+$/)
    expect(text(foldedOf(GUILD, 60)).length).toBe(60)
  })

  test('a band too short for the panel gets the commands left to learn as one line', () => {
    const below = lines(cardOf(GUILD, opts({ compact: true, columns: 120 })).below)
    expect(below.some(l => l.includes('What you can type'))).toBe(false)
    expect(below.at(-1)).toMatch(/^try {2}appt-v2#12 · "open CRM-1234 in ~\/src\/crm" · \/spyglass · \/veil/)
    const narrow = text(cardOf({ ...GUILD, needs: [] }, opts({ compact: true, columns: 60 })).below.at(-1)!)
    expect(narrow).toBe('try  appt-v2#12 +8 more   ▱▱▱▱▱▱▱▱▱')
    expect(narrow.length).toBeLessThanOrEqual(60)
  })

  test('every command the card teaches belongs to a seat', () => {
    for (const c of COMMANDS) expect(c.seats.length).toBeGreaterThan(0)
  })
})

// ---- The welcome on screen ----

// The store as the engine keeps the plugin's own, held where the test can read it.
function world(on: On, conf: string, said: unknown, { turns = 0, env = {} as Record<string, string>, exit = 0, store = {} as Record<string, unknown> } = {}) {
  const kept = new Map(Object.entries(store))
  on('store.get', async (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', async (_$, e) => {
    kept.set(e.key, e.value)
    return { value: undefined }
  })
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('config.list', async () => ({ value: [] as never }))
  mock.env(on, { HOME, GM_CHAT: 'banners', ...env })
  mock.clock(on)
  on('fs.exists', async (_$, e) => ({ value: e.path === CONF }))
  on('fs.read', async (_$, e) => (e.path === CONF ? { value: conf } : { deny: `ENOENT: ${e.path}` }))
  on('fs.stat', async (_$, e) => {
    if (e.path === GM) return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: true, realPath: '/clone/bin/gm' } }
    return e.path === CONF ? { value: { kind: 'file' as const, size: conf.length, mtimeMs: 1000, isLink: false } } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.list', async (_$, e) => ({ deny: `ENOENT: ${e.path}` }))
  on('process.run', async () => ({
    value: { exitCode: exit, stdout: exit ? '' : JSON.stringify(said), stderr: exit ? "gm: unknown command 'welcome'\n" : '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.turns', async () => ({ value: turns }))
  on('session.id', async () => ({ value: 'session-1' }))
  on('session.messages', async () => ({ value: [] as never }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.invalidate', async () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: [STOCK] }))
  return kept
}

// The card's data arrives after the session's start, as gm answers; the band is drawn again then.
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>(r => setTimeout(r, 5))
}

const sessionStart = { cwd: '/work', surface: 'terminal' as const, isInteractive: true }
const band = (bodyColumns = 100, maxRows = 30) => ({
  surface: 'terminal' as const, viewport: { columns: bodyColumns + 5, rows: 40 }, component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} },
})

// The band as rows of text, the art as one placeholder: what the patron reads.
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string | null | undefined
function screen(node: Node, inText = false): string[] {
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  if (node.type === 'Raster') return [`[art ${node.props?.columns}×${node.props?.rows}]`]
  const kids = (node.children ?? []).flatMap(c => screen(c as Node, inText || node.type === 'Text'))
  return node.type === 'Text' && !inText ? [kids.join('')] : kids
}
const drawn = async ($: Engine, b = band()) => {
  const ui = await $.ui.mount({ plugin: 'guild-chat', ...b })
  const rows = screen((await ui.drawn()) as Node)
  await ui.unmount()
  return rows
}
const submit = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

describe('the welcome on screen', () => {
  test('a new session shows its card above the prompt, art beside it, from what gm welcome --json says', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\n', GUILD)
    await $.session.start(sessionStart)
    await settle()
    const rows = await drawn($)
    expect(rows[0]).toBe('[art 16×8]')
    expect(rows[1]).toMatch(/━━ ⚔ GUILDMASTER ━+/)
    expect(rows).toContain(' ⚜ 1 needs you ')
    expect(rows).toContain('── What you can type ── ▱▱▱▱▱▱▱▱▱ 0/9 learned · novice')
  })

  test("the patron's first message folds it to its rule, and teaches the tutorial what it used", async ($, on) => {
    const kept = world(on, 'chat: banners\nsprites: off\n', FOCUS, { env: { GM_FOCUS: 'crm-1234' } })
    await $.session.start(sessionStart)
    await settle()
    await $.prompt.submit(submit('#7 start on this one'))
    const rows = await drawn($)
    expect(rows).toEqual([expect.stringMatching(/^━━ ⚔ PARTY LEADER · crm-1234 ━ build 3\/8 · nothing needs you ━+$/)])
    expect(kept.get('tutorial-usage')).toEqual({ ref: { uses: 1, sessions: ['session-1'] } })
  })

  test('welcome-fold: vanish gives the band back to the engine, or to the idle sprite', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\nwelcome-fold: vanish\n', GUILD)
    await $.session.start(sessionStart)
    await settle()
    await $.prompt.submit(submit('hello'))
    expect(await drawn($)).toEqual([STOCK])
  })

  test('a session that resumes starts folded', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\n', GUILD, { turns: 3 })
    await $.session.start(sessionStart)
    await settle()
    expect((await drawn($))[0]).toMatch(/^━━ ⚔ GUILDMASTER ━ ⚜ 1 needs you/)
  })

  test('welcome: off draws no card', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\nwelcome: off\n', GUILD)
    await $.session.start(sessionStart)
    await settle()
    expect(await drawn($)).toEqual([STOCK])
  })

  test('a short band takes the commands as one line, then the small piece', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\n', GUILD)
    await $.session.start(sessionStart)
    await settle()
    const tall = await drawn($, band(100, 40))
    expect(tall).toContain('── What you can type ── ▱▱▱▱▱▱▱▱▱ 0/9 learned · novice')
    const short = await drawn($, band(100, 12))
    expect(short[0]).toBe('[art 10×3]')
    expect(short.some(l => l.includes('What you can type'))).toBe(false)
    expect(short.at(-1)).toMatch(/^try {2}appt-v2#12/)
  })

  test('a gm that cannot say still names the seat, and why the board is missing', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\n', undefined, { exit: 1 })
    await $.session.start(sessionStart)
    await settle()
    const rows = await drawn($)
    expect(rows).toContain("The board could not be read: gm: unknown command 'welcome'")
  })

  test('the art rotates: the next start draws another piece', async ($, on) => {
    const kept = world(on, 'chat: banners\nsprites: off\n', GUILD, { store: { 'welcome-art-last': { guildmaster: 'crest' } } })
    await $.session.start(sessionStart)
    await settle()
    const last = (kept.get('welcome-art-last') as Record<string, string>).guildmaster
    expect(SEAT_ART.guildmaster).toContain(last)
    expect(last).not.toBe('crest')
  })

  test('a journeyman sees the small piece; a narrow terminal, none', async ($, on) => {
    world(on, 'chat: banners\nsprites: off\n', GUILD, { store: { 'tutorial-usage': learnedAllBut('guildmaster', 'art', 'tutorial', 'close') } })
    await $.session.start(sessionStart)
    await settle()
    expect((await drawn($))[0]).toBe('[art 10×3]')
    expect((await drawn($, band(40)))[0]).toMatch(/^━━ ⚔ GUILDMASTER/)
  })
})
