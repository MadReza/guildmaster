import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Shown } from '../types'
import { findRule, findTerm, forkPrompt, markOf, markText, norm, parseCharter, parseTerminology, postingTldr, refOf, runTldr, tldr } from './marks'
import type { Mark, Rule, Term } from './marks'

// Guildmaster's lexicon. A reply from a Party Leader or the Guildmaster is drawn with each thing
// it can explain marked as a link: the terms of TERMINOLOGY.md, posting references (#49,
// context-bar#1), run references (run 13), and code spans that name something (GM_VEIL,
// guild.conf). A click on one, or /what over a phrase selected with the mouse, opens a small
// popup with a TL;DR of it and where the meaning came from. What the guild already knows
// answers first and costs nothing: TERMINOLOGY.md, the charter's named rules, gm show for a
// posting, gm runs for a run. Anything else is asked of the model over this session's own
// transcript ($.model.fork), and the answer is kept in $.store, by focus and phrase, so the
// next click on it costs nothing.

export const PANE = 'guild-lexicon'
export const AI = 'AI, from this session'

const shown = atom({ plugin: 'guild-lexicon', key: 'shown' } as const, null as Shown)

// The guild's terms and the session's charter rules, read once a session (again after a reload).
let terms: Term[] = []
let rules: Rule[] = []
let reading: Promise<void> | undefined
// Which lookup the popup shows: a click on another phrase while the model answers wins.
let asking = 0

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? ''
}

async function focusOf($: EngineInterface) {
  return (await $.env.get('GM_CHAT_FOCUS')) || (await $.env.get('GM_FOCUS')) || undefined
}

async function readFile($: EngineInterface, path: string) {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}

// TERMINOLOGY.md is at the clone's root, two folders above the mod, whether the mod was loaded
// from mods/guild-lexicon or through the clone's .claude/skills link to it.
function knowledge($: EngineInterface) {
  return (reading ??= readKnowledge($))
}

async function readKnowledge($: EngineInterface) {
  try {
    const real = (await $.fs.stat($.plugin.root, { resolve: true })).realPath ?? $.plugin.root
    const md = await readFile($, `${real.replace(/\/[^/]+\/[^/]+\/?$/, '')}/TERMINOLOGY.md`)
    if (md) terms = parseTerminology(md)
  } catch {
    // Loaded away from a Guildmaster clone: no terms, the rest still explains.
  }
  const hall = (await $.env.get('GM_HALL')) || `${await home($)}/.guildmaster`
  const charter = await readFile($, (await focusOf($)) ? `${hall}/charter.md` : `${hall}/front-desk/CLAUDE.md`)
  rules = charter ? parseCharter(charter) : []
}

// The guild's one gm, linked at ~/.local/bin/gm, never a camp's draft of it.
async function gm($: EngineInterface, args: string[]): Promise<string | undefined> {
  const path = `${await home($)}/.local/bin/gm`
  if (!(await $.fs.exists(path))) return undefined
  const focus = await focusOf($)
  try {
    const r = await $.process.run([path, ...args], { env: focus ? { GM_FOCUS: focus } : {}, timeoutMs: 10_000 })
    return r.exitCode === 0 ? r.stdout : undefined
  } catch {
    return undefined
  }
}

type Known = { tldr: string; source: string }

/** What the guild's own records say of a mark, the model not asked; undefined when they say nothing. */
export async function known($: EngineInterface, mark: Mark): Promise<Known | undefined> {
  await knowledge($)
  const ref = mark.kind === 'phrase' || mark.kind === 'code' ? (refOf(mark.key) ?? mark) : mark
  if (ref.kind === 'posting') {
    const focus = await focusOf($)
    const key = ref.key.startsWith('#') && focus ? `${focus}${ref.key}` : ref.key
    const said = await gm($, ['show', key])
    const t = said && postingTldr(said)
    return t ? { tldr: t, source: `posting ${key}` } : undefined
  }
  if (ref.kind === 'run') {
    const said = await gm($, ['runs', '--all'])
    const t = said && runTldr(said, ref.key)
    return t ? { tldr: t, source: `run ${ref.key}, gm runs` } : undefined
  }
  const phrase = ref.kind === 'code' ? ref.key.replace(/=.*$/, '') : ref.key
  const term = ref.kind === 'rule' ? undefined : findTerm(terms, phrase)
  if (term) return { tldr: tldr(term.definition), source: 'TERMINOLOGY.md' }
  const rule = ref.kind === 'term' ? undefined : findRule(rules, phrase)
  if (rule) return { tldr: tldr(`${rule.name}: ${rule.text}`), source: 'the charter' }
  return undefined
}

/** The store key of the model's answer for one phrase, in this focus (the front desk's own otherwise). */
export async function cacheKey($: EngineInterface, phrase: string) {
  return `ai:${(await focusOf($)) ?? 'front-desk'}:${norm(phrase)}`
}

/** The model's TL;DR of a phrase the records do not know: a kept answer, else the model's, then kept. */
export async function ask($: EngineInterface, phrase: string): Promise<Known> {
  const key = await cacheKey($, phrase)
  const kept = await $.store.get(key)
  if (typeof kept === 'string' && kept) return { tldr: kept, source: AI }
  const reply = await $.model.fork({ prompt: forkPrompt(phrase) })
  if (!reply.isAnswered) {
    const why = reply.reason === 'nothing-to-fork' ? 'there is no conversation yet to read it from' : `the model gave no answer (${reply.reason})`
    return { tldr: `Not in the guild's records, and ${why}.`, source: 'nowhere yet' }
  }
  const t = tldr(reply.text)
  await $.store.set(key, t)
  return { tldr: t, source: AI }
}

const title = (phrase: string) => (phrase.length > 50 ? `${phrase.slice(0, 49)}…` : phrase)
const failed = (err: unknown) => `The lookup failed: ${err instanceof Error ? err.message : String(err)}`

/**
 * Opens the popup on a mark and fills it. It settles once the popup shows what the records say,
 * or says it is looking the phrase up; the model's answer, when one is asked for, lands after.
 */
export async function explain($: EngineInterface, mark: Mark) {
  const mine = ++asking
  const phrase = mark.key
  const show = async (value: Shown) => {
    if (mine === asking) await update($, shown, () => value)
  }
  await show({ phrase, tldr: null, source: '' })
  const opened = await $.ui.open({ id: PANE, title: `Lexicon · ${title(phrase)}`, focus: true, closeOnEscape: true, holdToasts: true, rows: 7, columns: 64 })
  if (!opened.isPlaced) $.ui.toast(`lexicon: the popup cannot open here: ${opened.reason}`)
  let got: Known | undefined
  try {
    got = await known($, mark)
  } catch (err) {
    return show({ phrase, tldr: failed(err), source: 'nowhere yet' })
  }
  if (got) return show({ phrase, ...got })
  void ask($, phrase).then(a => show({ phrase, ...a }), err => show({ phrase, tldr: failed(err), source: 'nowhere yet' }))
}

// The lexicon's row takes the place of the engine's own (`{ type: 'engine' }`, what the bottom of
// the chain answers) within what the hooks beneath drew, so another mod's banner over the row
// stays, whichever order the mods load in. A tree that holds no engine row (a mod that hid the
// row, as the veil does, or drew its own) is left as it was drawn.
function swapEngine(tree: unknown, mine: unknown): { tree: unknown; swapped: boolean } {
  if (Array.isArray(tree)) {
    let swapped = false
    const out = tree.map(t => {
      const r = swapEngine(t, mine)
      swapped ||= r.swapped
      return r.tree
    })
    return { tree: out, swapped }
  }
  if (tree === null || typeof tree !== 'object') return { tree, swapped: false }
  const node = tree as { type?: unknown; children?: unknown }
  if (node.type === 'engine') return { tree: mine, swapped: true }
  if (node.children === undefined) return { tree, swapped: false }
  const r = swapEngine(node.children, mine)
  return r.swapped ? { tree: { ...node, children: r.tree }, swapped: true } : { tree, swapped: false }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'what',
      description: 'Explain the phrase you selected with the mouse: a short TL;DR, from the guild\'s records or this session',
    })
    reading = undefined
    void knowledge($)
    return next(e)
  })

  on('command.run', { command: 'what' }, async ($, e) => {
    const typed = e.args.trim()
    const selected = typed || (await $.ui.selection())?.text.replace(/\s+/g, ' ').trim()
    if (!selected) {
      return { text: 'Select a word or phrase in the chat with the mouse, then type /what (or /what <phrase>). A marked word in a reply opens the same popup at a click.' }
    }
    await explain($, refOf(selected) ?? { kind: 'phrase', key: selected.length > 200 ? selected.slice(0, 200) : selected })
    return { text: `“${title(selected)}” is in the lexicon popup (esc closes it).` }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // A summary stands for text the patron has not read; ctrl+o draws the stored message, not this.
    if (e.props.isSummary === true) return next(e)
    await knowledge($)
    const marked = markText(e.props.text, terms, rules)
    if (marked.hrefs.length === 0) return next(e)
    const drawn = await next(e)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const mine = (
      <Box flexDirection="row" marginTop={e.props.isFirstOfReply ? 1 : 0}>
        <Box width={2} flexShrink={0}>
          <Text>{e.props.isFirstOfReply ? '⏺' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Markdown
            key={`lexicon:${e.requestId}`}
            text={marked.text}
            pressableLinks={marked.hrefs}
            onLinkPress={link => {
              const mark = markOf(link.href)
              if (mark) void explain($, mark)
            }}
          />
        </Box>
      </Box>
    )
    const r = swapEngine(drawn, mine)
    return (r.swapped ? r.tree : drawn) as typeof drawn
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, shown)
    if (now === null) return <Text dimColor>Click a marked word in a reply, or select a phrase and type /what.</Text>
    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate-end">{now.phrase}</Text>
        {now.tldr === null
          ? <Text dimColor>{`Looking up “${title(now.phrase)}”…`}</Text>
          : <Text>{now.tldr}</Text>}
        {now.tldr !== null && <Text dimColor wrap="truncate-end">{`from ${now.source} · esc closes`}</Text>}
      </Box>
    )
  })
}
