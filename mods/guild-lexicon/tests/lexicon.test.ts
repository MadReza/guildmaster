import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { layout } from '../hooks/layout'
import { findRule, findTerm, markSpans, parseCharter, parseTerminology, postingTldr, refOf, runTldr } from '../hooks/marks'
import { AI, ASIDE_LINE, ASK_LINE, asideReason, PANE } from '../hooks/register'

const HOME = '/home/p'
const GM = `${HOME}/.local/bin/gm`
const CLONE = '/clone'

const TERMINOLOGY = `# Terminology

| Term | Definition | Firstmate |
| --- | --- | --- |
| **Posting** | One item of work on the quest board. The durable unit the guild tracks. | backlog item / task |
| **Run** | One adventurer dispatched on one writ, numbered across the guild (\`run 7\`). | crew launch |
| **Veil** | The chat's quiet view: deeds drawn out of the chat while it is on. Hides from the screen only. | Calm |
| **Party Leader** | A persistent supervisor owning one domain. | second mate |
| **The Watch** | The one process that waits for a supervisor's summons and wakes it. | watcher |
`

const CHARTER = `# Party Leader charter

## Adventurers do the work

A posting that changes the project is a contract.

- Start it, then gm dispatch <n> --brief "<what to do>" (several: gm dispatch 12 13).
- One contract at a time: while a run is live, change no file here and keep
  other contracts queued.
- A summons names a finished run.
`

const SHOW = `adventurers#49 start-like-firstmate  [done]
focus adventurers · branch feature/adventurers · phase build

The patron's words, 2026-10-11T10:00:00Z:
Start every Adventurer the way Firstmate starts a crewmate. And more after that.

History:
  2026-10-11T10:00:00Z  received
`

const RUNS = `run 13  contract  adventurers#50 no-veil  done at 2026-10-12 12:40  claude-opus-5-5 · medium effort  · check passed
        /home/p/.guildmaster/runs/13/result.md
`

type Journal = { opens: { id: string; focus?: true; closeOnEscape?: true; holdToasts?: true }[]; runs: string[][]; forks: string[]; store: Map<string, unknown> }

function world(on: On, env: Record<string, string> = { HOME, GM_CHAT_FOCUS: 'adventurers' }, answer = 'The veil-hides setting lists what the veil hides.') {
  const journal: Journal = { opens: [], runs: [], forks: [], store: new Map() }
  mock.env(on, env)
  // $.store, kept where the test reads it.
  on('store.get', async (_$, e) => ({ value: journal.store.get(e.key) }))
  on('store.set', async (_$, e) => {
    journal.store.set(e.key, e.value)
    return { value: undefined }
  })
  const files: Record<string, string> = { [`${CLONE}/TERMINOLOGY.md`]: TERMINOLOGY, [`${HOME}/.guildmaster/charter.md`]: CHARTER }
  on('fs.read', async (_$, e) => (files[e.path] !== undefined ? { value: files[e.path]! } : { deny: `ENOENT: ${e.path}` }))
  on('fs.stat', async (_$, e) => ({ value: { kind: 'dir' as const, size: 1, mtimeMs: 0, isLink: false, realPath: `${CLONE}/mods/guild-lexicon` } }))
  on('fs.exists', async (_$, e) => ({ value: e.path === GM }))
  const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('process.run', async (_$, e) => {
    journal.runs.push([...e.argv])
    if (e.argv[1] === 'show' && e.argv[2] === 'adventurers#49') return ok(SHOW)
    if (e.argv[1] === 'runs') return ok(RUNS)
    return { value: { exitCode: 1, stdout: '', stderr: 'gm: nothing matches', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.fork', async (_$, e) => {
    journal.forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: answer, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }
  })
  on('ui.open', async (_$, e) => {
    journal.opens.push({ id: e.id, focus: e.focus, closeOnEscape: e.closeOnEscape, holdToasts: e.holdToasts })
    return { value: { isPlaced: true as const } }
  })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  // Claude Code's own row, as the hooks beneath every plugin answer it.
  on('ui.render', async () => ({ type: 'engine', ref: 1 }) as never)
  return journal
}

const viewport = { columns: 120, rows: 40 }
const reply = (text: string, more: Record<string, unknown> = {}) => ({
  plugin: 'guild-lexicon',
  surface: 'terminal' as const,
  component: 'AssistantMessage' as const,
  requestId: 'a-1',
  viewport,
  props: { text, isFirstOfReply: true, ...more },
})
const pane = {
  plugin: 'guild-lexicon',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: PANE,
  viewport,
  props: { title: 'Lexicon', isFocused: true, bodyColumns: 60, placement: 'inline' as const, scroll: { offset: 0, bodyRows: 7 }, view: {} },
}

type Mounter = { ui: { mount: (target: typeof pane) => Promise<{ findAll: (q: { type: 'Text' }) => Promise<readonly { text?: string }[]>; unmount: () => Promise<void> }> } }
// What the popup shows now.
async function popupText($: Mounter) {
  const ui = await $.ui.mount(pane)
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await ui.unmount()
  return text
}

const terms = parseTerminology(TERMINOLOGY)
const rules = parseCharter(CHARTER)

// A reply's marks written into it, `[shown](kind/key)`, to read them at a glance.
function marked(text: string) {
  let out = ''
  let last = 0
  for (const s of markSpans(text, terms, rules)) {
    out += `${text.slice(last, s.start)}[${text.slice(s.start, s.end)}](${s.mark.kind}/${s.mark.key})`
    last = s.end
  }
  return out + text.slice(last)
}

type Drawn = { find: (q: { type: 'Button'; text: string }) => Promise<{ key?: string } | undefined>; press: (t: { key: string }) => Promise<unknown> }
// A click on the mark drawn as `text`.
async function click(ui: Drawn, text: string) {
  const mark = await ui.find({ type: 'Button', text })
  expect(mark).toBeDefined()
  await ui.press({ key: mark!.key! })
}

describe('marking', () => {
  test('reads the bold Term column and the charter\'s named rules', async () => {
    expect(terms.map(t => t.name)).toEqual(['Posting', 'Run', 'Veil', 'Party Leader', 'The Watch'])
    expect(findTerm(terms, 'party leaders')?.name).toBe('Party Leader')
    expect(findRule(rules, 'one-contract-at-a-time rule')?.text).toBe('while a run is live, change no file here and keep other contracts queued.')
    expect(findRule(rules, 'Adventurers do the work')?.text).toContain('A posting that changes the project')
  })

  test('marks terms, rules, postings, runs and code names, each once', async () => {
    const text = 'Not on main: #49 and adventurers#50. Runs 11, 12 and 13 passed; run 7 too. The veil stays, as `guild.conf` and `GM_VEIL=off` say; the veil again. Party Leaders keep the one-contract-at-a-time rule.'
    expect(marked(text)).toBe(
      'Not on main: [#49](posting/#49) and [adventurers#50](posting/adventurers#50). ' +
      'Runs [11](run/11), [12](run/12) and [13](run/13) passed; [run 7](run/7) too. ' +
      'The [veil](term/Veil) stays, as [`guild.conf`](code/guild.conf) and [`GM_VEIL=off`](code/GM_VEIL=off) say; the veil again. ' +
      '[Party Leaders](term/Party Leader) keep the [one-contract-at-a-time rule](rule/One contract at a time).')
  })

  test('leaves fences, tables, links, URLs, common words in lower case and code that names nothing alone', async () => {
    const text = 'Every run here. A [link #3](https://x.y/#4) and https://h.io/a#5 and `ls -la /tmp`.\n```\n#7 veil\n```\n| #8 | the veil |\n'
    expect(markSpans(text, terms, rules)).toEqual([])
    expect(marked('One Run went well.')).toBe('One [Run](term/Run) went well.')
    expect(marked('Keep one contract at a time, then the One contract at a time rule.'))
      .toBe('Keep one contract at a time, then the [One contract at a time rule](rule/One contract at a time).')
  })

  test('a typed reference, and gm\'s answers as TL;DRs', async () => {
    expect(refOf('#49')).toEqual({ kind: 'posting', key: '#49' })
    expect(refOf('posting context-bar#1')).toEqual({ kind: 'posting', key: 'context-bar#1' })
    expect(refOf('Run 13')).toEqual({ kind: 'run', key: '13' })
    expect(refOf('the veil')).toBeUndefined()
    expect(postingTldr(SHOW)).toBe('adventurers#49 start-like-firstmate  [done]\n“Start every Adventurer the way Firstmate starts a crewmate.”')
    expect(runTldr(RUNS, '13')).toBe('contract · adventurers#50 no-veil · done at 2026-10-12 12:40 · claude-opus-5-5 · medium effort · · check passed')
    expect(runTldr(RUNS, '9')).toBeUndefined()
  })
})

describe('a reply', () => {
  test('is drawn with each mark the word alone, and a click on it opens the popup', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('The veil is **drawn**.'))
    expect((await ui.findAll({ type: 'Button' })).map(b => b.text)).toEqual(['veil'])
    expect(await ui.find({ type: 'Text', text: 'drawn' })).toMatchObject({ props: { bold: true } })
    await click(ui, 'veil')
    expect(journal.opens).toEqual([{ id: PANE, focus: true, closeOnEscape: true, holdToasts: true }])
    const popup = await $.ui.mount(pane)
    const texts = (await popup.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(texts).toContain('The chat\'s quiet view')
    expect(texts).toContain('from TERMINOLOGY.md')
  })

  test('never shows a lexicon address: no mark is a link, the rest stays markdown', async ($, on) => {
    world(on)
    const text = [
      '## The Party Leader',
      '',
      'Posting #49 is **done**; run 13 kept the one-contract-at-a-time rule, and `GM_VEIL=off` lifts the veil.',
      '',
      '- the [docs](https://example.com/docs) say so',
      '- adventurers#50 is next, then Run 7',
      '',
      '| Term | Meaning |',
      '| --- | --- |',
      '| Posting | one item |',
      '',
      '```',
      'gm show #49',
      '```',
      '',
      'Nothing to mark here.',
    ].join('\n')
    const ui = await $.ui.mount(reply(text))
    const shown = (await ui.findAll({})).map(el => el.text)
    for (const t of shown) expect(t).not.toContain('lexicon.invalid')
    expect((await ui.findAll({ type: 'Button' })).map(b => b.text))
      .toEqual(['Party Leader', 'Posting', '#49', 'run 13', 'one-contract-at-a-time rule', 'GM_VEIL=off', 'veil', 'adventurers#50', 'Run 7'])
    const md = (await ui.findAll({ type: 'Markdown' })).map(m => m.text)
    expect(md).toEqual(['| Term | Meaning |\n| --- | --- |\n| Posting | one item |\n\n```\ngm show #49\n```\n\nNothing to mark here.'])
    expect(await ui.find({ type: 'Link' })).toMatchObject({ props: { href: 'https://example.com/docs' }, children: ['docs'] })
  })

  test('a summary, and a reply with nothing to mark, are drawn as Claude Code draws them', async ($, on) => {
    world(on)
    for (const one of [reply('The veil is drawn.', { isSummary: true }), reply('Nothing here.')]) {
      const ui = await $.ui.mount(one)
      expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
      expect(await ui.find({ type: 'Button' })).toBeUndefined()
      await ui.unmount()
    }
  })
})

describe('the layout', () => {
  const blocks = (text: string) => layout(text, markSpans(text, terms, rules)).map(b =>
    b.kind === 'markdown' ? { md: b.text, gap: b.gap } : { prefix: b.prefix, indent: b.indent, heading: b.heading, gap: b.gap, words: b.words.map(w => w.map(p => (p.mark ? `[${p.text}]` : p.text)).join('')) })

  test('marked lines become words, the unmarked stay one markdown run', async () => {
    expect(blocks('Intro line.\n\nOne Run here,\nsplit over lines.\n  - nested #49 item\n\n# The veil\n\nPlain\n\nand more.')).toEqual([
      { md: 'Intro line.', gap: false },
      { prefix: '', indent: 0, heading: false, gap: true, words: ['One', '[Run]', 'here,', 'split', 'over', 'lines.'] },
      { prefix: '- ', indent: 2, heading: false, gap: false, words: ['nested', '[#49]', 'item'] },
      { prefix: '', indent: 0, heading: true, gap: true, words: ['The', '[veil]'] },
      { md: 'Plain\n\nand more.', gap: true },
    ])
  })

  test('inline markdown is read into styles; a mark of several words stays one word', async () => {
    const text = '**Party Leaders** keep `guild.conf` and snake_case, *not* \\*this\\*.'
    const all = layout(text, markSpans(text, terms, rules))
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ kind: 'words', words: [
      [{ text: 'Party Leaders', bold: true, mark: { kind: 'term', key: 'Party Leader' } }],
      [{ text: 'keep' }],
      [{ text: 'guild.conf', code: true, mark: { kind: 'code', key: 'guild.conf' } }],
      [{ text: 'and' }],
      [{ text: 'snake_case,' }],
      [{ text: 'not', italic: true }],
      [{ text: '*this*.' }],
    ] })
  })
})


describe('the lookup order', () => {
  test('a posting comes from gm show, in the session\'s focus', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('Not on main yet: #49.'))
    await click(ui, '#49')
    expect(journal.runs).toContainEqual([GM, 'show', 'adventurers#49'])
    expect(await popupText($)).toContain('from posting adventurers#49')
    expect(journal.forks).toEqual([])
  })

  test('a run comes from gm runs, a charter rule from the charter', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('Run 13 kept the one contract at a time rule.'))
    await click(ui, 'Run 13')
    expect(await popupText($)).toContain('from run 13, gm runs')
    await click(ui, 'one contract at a time rule')
    const shown = await popupText($)
    expect(shown).toContain('while a run is live')
    expect(shown).toContain('from the charter')
    expect(journal.forks).toEqual([])
  })

  test('a code name the records know is theirs; one they do not goes to the model', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('See `veil-hides` and `#49`.'))
    await click(ui, 'veil-hides')
    const shown = await popupText($)
    expect(shown).toContain('The veil-hides setting lists what the veil hides.')
    expect(shown).toContain(`from ${AI}`)
    expect(journal.forks).toHaveLength(1)
    expect(journal.forks[0]).toContain('"veil-hides"')
  })

  test('a posting gm does not know goes to the model', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('See #77.'))
    await click(ui, '#77')
    expect(journal.forks).toHaveLength(1)
    expect(await popupText($)).toContain(`from ${AI}`)
  })
})

describe('the cache', () => {
  test('the model\'s answer is kept by focus and phrase, so the next click asks nothing', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('See `veil-hides`.'))
    const press = () => click(ui, 'veil-hides')
    await press()
    await press()
    expect(journal.forks).toHaveLength(1)
    expect(journal.store.get('ai:adventurers:veil hides')).toBe('The veil-hides setting lists what the veil hides.')
    expect(await popupText($)).toContain('The veil-hides setting lists what the veil hides.')
  })

  test('another focus does not read it', async ($, on) => {
    const journal = world(on, { HOME })
    journal.store.set('ai:adventurers:veil hides', 'kept elsewhere')
    const ui = await $.ui.mount(reply('See `veil-hides`.'))
    await click(ui, 'veil-hides')
    expect(journal.forks).toHaveLength(1)
    expect(journal.store.get('ai:front-desk:veil hides')).toBe('The veil-hides setting lists what the veil hides.')
  })
})

describe('/what', () => {
  test('explains the selected phrase, and says how to use it with none', async ($, on) => {
    const journal = world(on)
    on('ui.selection', async () => ({ value: undefined }))
    const none = await $.command.run({ command: 'what', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(none?.text).toContain('Select a word or phrase')
    const typed = await $.command.run({ command: 'what', args: 'one-contract-at-a-time rule', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(typed?.text).toContain('lexicon popup')
    expect(journal.opens).toHaveLength(1)
    expect(await popupText($)).toContain('from the charter')
  })

  test('reads the mouse selection', async ($, on) => {
    const journal = world(on)
    on('ui.selection', async () => ({ value: { text: 'Party\n  Leader' } }))
    await $.command.run({ command: 'what', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(journal.opens).toHaveLength(1)
    expect(await popupText($)).toContain('A persistent supervisor')
  })
})

const QUESTIONS = [{ question: 'Which fruit?', header: 'Fruit', multiSelect: false, options: [{ label: 'Apple', description: 'crisp' }, { label: 'Pear', description: 'soft' }] }]
const question = (isFullscreen = true, requestId = 'toolu_ask') => ({
  plugin: 'guild-lexicon',
  surface: 'terminal' as const,
  component: 'AskUserQuestion' as const,
  requestId,
  viewport: { ...viewport, isFullscreen },
  props: { tool: 'AskUserQuestion', questions: QUESTIONS },
})

describe('while Claude asks a question', () => {
  test('a click on the line above it opens the popup on the selection, and the question is left as it was', async ($, on) => {
    // What reached Claude Code's own dialog, and anything that would answer it or type into the prompt.
    const dialog: unknown[] = []
    const touched: string[] = []
    on('ui.render', { component: 'AskUserQuestion' }, async (_$, e) => {
      dialog.push(e.props)
      return { type: 'engine', ref: 2 } as never
    })
    const journal = world(on)
    for (const ev of ['prompt.fill', 'prompt.edit', 'prompt.submit', 'session.send', 'turn.abort', 'ui.close'] as const) {
      on(ev, async () => {
        touched.push(ev)
        return { value: undefined } as never
      })
    }
    on('ui.selection', async () => ({ value: { text: 'the\n  veil' } }))
    const ui = await $.ui.mount(question())
    expect((await ui.findAll({ type: 'Button' })).map(b => b.text)).toEqual([ASK_LINE, ASIDE_LINE])
    expect(await ui.findAll({ type: 'engine' } as never)).toHaveLength(1)
    await click(ui, ASK_LINE)
    expect(journal.opens).toEqual([{ id: PANE, focus: true, closeOnEscape: true, holdToasts: true }])
    expect(await popupText($)).toContain('The chat\'s quiet view')
    expect(dialog).toEqual([{ tool: 'AskUserQuestion', questions: QUESTIONS }])
    expect(touched).toEqual([])
    // The dialog holds the keys, so the popup does not: it says the ✕ closes it, never esc, which would cancel the question.
    const popup = await $.ui.mount({ ...pane, props: { ...pane.props, isFocused: false, placement: 'dock' as const } })
    const texts = (await popup.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(texts).toContain('✕ closes')
    expect(texts).not.toContain('esc')
  })

  test('with nothing selected it says so and opens nothing; off the fullscreen layout it draws no line', async ($, on) => {
    const journal = world(on)
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => {
      toasts.push(e.text)
      return { value: undefined } as never
    })
    on('ui.selection', async () => ({ value: undefined }))
    const ui = await $.ui.mount(question())
    await click(ui, ASK_LINE)
    expect(journal.opens).toEqual([])
    expect(toasts.join('\n')).toContain('select a word or phrase with the mouse first')
    await ui.unmount()
    const main = await $.ui.mount(question(false))
    expect(await main.find({ type: 'Button' })).toBeUndefined()
  })
})

// Claude Code's own dialog beneath the lexicon's hook: each AskUserQuestion call it opens stays open, by its tool_use_id.
function dialogs(on: On) {
  const open: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    open.push(e.tool_use_id)
    return new Promise<never>(() => {})
  })
  return open
}
// Whether a call settled in a moment, and how.
const settled = (call: Promise<unknown>) => Promise.race([call, new Promise<'open'>(r => setTimeout(() => r('open'), 50))])
// Claude asks: the call, once its dialog is open (a call still open when the test ends is let go).
async function ask($: { tool: { call: (args: never) => Promise<unknown> } }, open: string[]) {
  const was = open.length
  const call = $.tool.call({ tool: 'AskUserQuestion', questions: QUESTIONS } as never)
  call.catch(() => {})
  for (let i = 0; open.length === was && i < 100; i++) await new Promise(r => setTimeout(r, 5))
  expect(open).toHaveLength(was + 1)
  return { call }
}

describe('setting a question aside', () => {
  test('a click on the second line with words selected settles the question, telling Claude to explain them and ask again', async ($, on) => {
    world(on)
    const open = dialogs(on)
    on('ui.selection', async () => ({ value: { text: 'the\n  veil' } }))
    const { call } = await ask($, open)
    const ui = await $.ui.mount(question(true, open[0]!))
    await click(ui, ASIDE_LINE)
    expect(await settled(call)).toEqual({ deny: asideReason('the veil') })
    expect(asideReason('the veil')).toBe('The user set this question aside to ask what "the veil" means. Explain it briefly, then ask the same question again with AskUserQuestion.')
  })

  test('with nothing selected it says so and the question stays open', async ($, on) => {
    world(on)
    const open = dialogs(on)
    const toasts: string[] = []
    on('ui.toast', async (_$, e) => {
      toasts.push(e.text)
      return { value: undefined } as never
    })
    on('ui.selection', async () => ({ value: undefined }))
    const { call } = await ask($, open)
    const ui = await $.ui.mount(question(true, open[0]!))
    await click(ui, ASIDE_LINE)
    expect(await settled(call)).toBe('open')
    expect(toasts.join('\n')).toContain('select a word or phrase with the mouse first')
  })

  test('a click settles only the question its line was drawn above, never the one Claude asks again in its place', async ($, on) => {
    world(on)
    const open = dialogs(on)
    on('ui.selection', async () => ({ value: { text: 'write-ahead log' } }))
    const { call: first } = await ask($, open)
    const old = await $.ui.mount(question(true, open[0]!))
    await click(old, ASIDE_LINE)
    expect(await settled(first)).not.toBe('open')
    // Claude explains and asks again; a second click lands on the first question's line, still on screen.
    const { call: again } = await ask($, open)
    expect(open[1]).not.toBe(open[0])
    await click(old, ASIDE_LINE)
    expect(await settled(again)).toBe('open')
    // The line drawn above the new question settles it.
    const now = await $.ui.mount(question(true, open[1]!))
    await click(now, ASIDE_LINE)
    expect(await settled(again)).not.toBe('open')
  })
})
