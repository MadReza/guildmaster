import { describe, expect, mock, test } from 'claude-code/testing'

import { bannerLine, chatIsOn } from '../hooks/register'

// What stands for Claude Code beneath the mod: the environment gm starts a session with, and the engine's own row.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], env: Record<string, string> = { GM_CHAT: 'banners' }) {
  mock.env(on, env)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['the engine row'] }))
}

const SURFACES = ['terminal', 'desktop'] as const
const viewport = { columns: 60, rows: 20 }

const reply = { component: 'AssistantMessage', props: { text: 'The three modules are small.', isFirstOfReply: true } } as const
const prompt = { component: 'UserMessage', props: { text: 'Read the files.', origin: { kind: 'composer' }, isExpanded: false } } as const

describe('heraldic banners', () => {
  test('the patron speaks under a gold banner hung on the right', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'guild-chat', surface, viewport, ...prompt })
      expect(await ui.find({ type: 'Text', text: / ⚜ PATRON $/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('the front desk answers as the Guildmaster', async ($, on) => {
    engine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: 'guild-chat', surface, viewport, ...reply })
      expect(await ui.find({ type: 'Text', text: / ⚔ GUILDMASTER $/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a Party Leader answers under its focus', async ($, on) => {
    engine(on, { GM_CHAT: 'banners', GM_CHAT_FOCUS: 'guild-chat' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...reply })
    expect(await ui.find({ type: 'Text', text: / ⚔ PARTY LEADER · guild-chat $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /GUILDMASTER/ })).toBeUndefined()
  })

  test('only the first block of a reply carries the banner', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, component: 'AssistantMessage',
      props: { text: 'and then', isFirstOfReply: false } })
    expect(await ui.find({ type: 'Text', text: /GUILDMASTER/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'the engine row' })).toBeDefined()
  })

  test('tool calls are deeds, and an Agent call is an adventurer', async ($, on) => {
    engine(on)
    const base = { tool_use_id: 't1', isRunning: false, isErrored: false, isInterrupted: false }
    const bash = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, component: 'ToolUse',
      props: { ...base, tool: 'Bash', input: { command: 'ls' } } })
    expect(await bash.find({ type: 'Text', text: / ⚒ DEEDS $/ })).toBeDefined()
    const agent = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, component: 'ToolUse',
      props: { ...base, tool_use_id: 't2', tool: 'Agent', input: { description: 'scout-auth', prompt: 'map it' } } })
    expect(await agent.find({ type: 'Text', text: / ⛨ ADVENTURER · scout-auth $/ })).toBeDefined()
  })

  test('chat: off leaves every row as Claude Code draws it', async ($, on) => {
    engine(on, { GM_CHAT: 'off' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...reply })
    expect(await ui.find({ type: 'Text', text: /GUILDMASTER/ })).toBeUndefined()
  })

  test('a banner fills the width, the patron on the right and the rest on the left', () => {
    const right = bannerLine({ sigil: '⚜', name: 'PATRON', color: '', heavy: true, right: true }, 40)
    expect(right.before + right.label + right.after).toHaveLength(40)
    expect(right.after).toBe('━━')
    const left = bannerLine({ sigil: '⚒', name: 'DEEDS', color: '', heavy: false }, 40)
    expect(left.before).toBe('──')
    expect(left.before + left.label + left.after).toHaveLength(40)
  })
})

// A claude started by hand in a checkout of Guildmaster: no GM_CHAT, so the mod reads guild.conf from the Guildhall.
function byHand(on: Parameters<Parameters<typeof test>[1]>[1], conf: string | undefined, env: Record<string, string> = { HOME: '/home/p' }) {
  const read: string[] = []
  mock.env(on, env)
  on('fs.read', ($, e) => {
    read.push(e.path)
    if (conf === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: conf }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['the engine row'] }))
  return read
}

describe('a claude started by hand', () => {
  test('draws the banners when the Guildhall leaves the chat on', async ($, on) => {
    const read = byHand(on, 'initialized: 2026-10-04T14:57:05Z\nfront-desk: clone\n')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...reply })
    expect(await ui.find({ type: 'Text', text: / ⚔ GUILDMASTER $/ })).toBeDefined()
    expect(read).toEqual(['/home/p/.guildmaster/guild.conf'])
  })

  test('in a camp answers as the Party Leader its settings name', async ($, on) => {
    byHand(on, 'chat: banners\n', { HOME: '/home/p', GM_FOCUS: 'appt-v2' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...reply })
    expect(await ui.find({ type: 'Text', text: / ⚔ PARTY LEADER · appt-v2 $/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /GUILDMASTER/ })).toBeUndefined()
  })

  test('keeps Claude Code\'s own chat when guild.conf says chat: off', async ($, on) => {
    byHand(on, '# chat: off | banners\nchat: off\n')
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...reply })
    expect(await ui.find({ type: 'Text', text: /GUILDMASTER/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'the engine row' })).toBeDefined()
  })

  test('keeps it for someone with no Guildhall', async ($, on) => {
    byHand(on, undefined)
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...prompt })
    expect(await ui.find({ type: 'Text', text: /PATRON/ })).toBeUndefined()
  })

  test('reads the Guildhall GM_HALL names', async ($, on) => {
    const read = byHand(on, 'chat: banners\n', { HOME: '/home/p', GM_HALL: '/srv/hall' })
    const ui = await $.ui.mount({ plugin: 'guild-chat', surface: 'terminal', viewport, ...prompt })
    expect(await ui.find({ type: 'Text', text: / ⚜ PATRON $/ })).toBeDefined()
    expect(read).toEqual(['/srv/hall/guild.conf'])
  })

  test('chat: reads as gm reads it', () => {
    expect(chatIsOn('')).toBe(true)
    expect(chatIsOn('chat: banners')).toBe(true)
    expect(chatIsOn('chat: on')).toBe(true)
    for (const off of ['chat: off', 'chat: no', 'chat:false', '# x\nchat:  off  \n']) expect(chatIsOn(off)).toBe(false)
    expect(chatIsOn('# chat: off')).toBe(true)
    expect(chatIsOn('chat:\nchat: off')).toBe(false)
  })
})
