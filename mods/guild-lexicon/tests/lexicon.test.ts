import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { HREF, findRule, findTerm, markOf, markText, parseCharter, parseTerminology, postingTldr, refOf, runTldr } from '../hooks/marks'
import { AI, PANE } from '../hooks/register'

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

describe('marking', () => {
  test('reads the bold Term column and the charter\'s named rules', async () => {
    expect(terms.map(t => t.name)).toEqual(['Posting', 'Run', 'Veil', 'Party Leader', 'The Watch'])
    expect(findTerm(terms, 'party leaders')?.name).toBe('Party Leader')
    expect(findRule(rules, 'one-contract-at-a-time rule')?.text).toBe('while a run is live, change no file here and keep other contracts queued.')
    expect(findRule(rules, 'Adventurers do the work')?.text).toContain('A posting that changes the project')
  })

  test('marks terms, rules, postings, runs and code names, each once, as lexicon links', async () => {
    const text = 'Not on main: #49 and adventurers#50. Runs 11, 12 and 13 passed; run 7 too. The veil stays, as `guild.conf` and `GM_VEIL=off` say; the veil again. Party Leaders keep the one-contract-at-a-time rule.'
    const marked = markText(text, terms, rules)
    expect(marked.text).toBe(
      `Not on main: [#49](${HREF}posting/%2349) and [adventurers#50](${HREF}posting/adventurers%2350). ` +
      `Runs [11](${HREF}run/11), [12](${HREF}run/12) and [13](${HREF}run/13) passed; [run 7](${HREF}run/7) too. ` +
      `The [veil](${HREF}term/Veil) stays, as [\`guild.conf\`](${HREF}code/guild.conf) and [\`GM_VEIL=off\`](${HREF}code/GM_VEIL%3Doff) say; the veil again. ` +
      `[Party Leaders](${HREF}term/Party%20Leader) keep the [one-contract-at-a-time rule](${HREF}rule/One%20contract%20at%20a%20time).`)
    expect(marked.hrefs.map(h => markOf(h)?.key)).toEqual(['#49', 'adventurers#50', '11', '12', '13', '7', 'Veil', 'guild.conf', 'GM_VEIL=off', 'Party Leader', 'One contract at a time'])
  })

  test('leaves fences, links, URLs, common words in lower case and code that names nothing alone', async () => {
    const text = 'Every run here. A [link #3](https://x.y/#4) and https://h.io/a#5 and `ls -la /tmp`.\n```\n#7 veil\n```\n'
    expect(markText(text, terms, rules)).toEqual({ text, hrefs: [] })
    expect(markText('One Run went well.', terms, rules).text).toBe(`One [Run](${HREF}term/Run) went well.`)
    expect(markText('Keep one contract at a time, then the One contract at a time rule.', terms, rules).text)
      .toBe(`Keep one contract at a time, then the [One contract at a time rule](${HREF}rule/One%20contract%20at%20a%20time).`)
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
  test('is drawn as markdown whose marks the lexicon answers; a click opens the popup', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('The veil is drawn.'))
    const md = await ui.find({ type: 'Markdown' })
    expect(md?.text).toBe(`The [veil](${HREF}term/Veil) is drawn.`)
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}term/Veil` } })
    expect(journal.opens).toEqual([{ id: PANE, focus: true, closeOnEscape: true, holdToasts: true }])
    const popup = await $.ui.mount(pane)
    const texts = (await popup.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    expect(texts).toContain('The chat\'s quiet view')
    expect(texts).toContain('from TERMINOLOGY.md')
  })

  test('a summary, and a reply with nothing to mark, are drawn as Claude Code draws them', async ($, on) => {
    world(on)
    for (const one of [reply('The veil is drawn.', { isSummary: true }), reply('Nothing here.')]) {
      const ui = await $.ui.mount(one)
      expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
      await ui.unmount()
    }
  })
})


describe('the lookup order', () => {
  test('a posting comes from gm show, in the session\'s focus', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('Not on main yet: #49.'))
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}posting/%2349` } })
    expect(journal.runs).toContainEqual([GM, 'show', 'adventurers#49'])
    expect(await popupText($)).toContain('from posting adventurers#49')
    expect(journal.forks).toEqual([])
  })

  test('a run comes from gm runs, a charter rule from the charter', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('Run 13 kept the one contract at a time rule.'))
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}run/13` } })
    expect(await popupText($)).toContain('from run 13, gm runs')
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}rule/One%20contract%20at%20a%20time` } })
    const shown = await popupText($)
    expect(shown).toContain('while a run is live')
    expect(shown).toContain('from the charter')
    expect(journal.forks).toEqual([])
  })

  test('a code name the records know is theirs; one they do not goes to the model', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('See `veil-hides` and `#49`.'))
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}code/veil-hides` } })
    const shown = await popupText($)
    expect(shown).toContain('The veil-hides setting lists what the veil hides.')
    expect(shown).toContain(`from ${AI}`)
    expect(journal.forks).toHaveLength(1)
    expect(journal.forks[0]).toContain('"veil-hides"')
  })

  test('a posting gm does not know goes to the model', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('See #77.'))
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}posting/%2377` } })
    expect(journal.forks).toHaveLength(1)
    expect(await popupText($)).toContain(`from ${AI}`)
  })
})

describe('the cache', () => {
  test('the model\'s answer is kept by focus and phrase, so the next click asks nothing', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(reply('See `veil-hides`.'))
    const press = () => ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}code/veil-hides` } })
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
    await ui.press({ key: 'lexicon:a-1', link: { href: `${HREF}code/veil-hides` } })
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
