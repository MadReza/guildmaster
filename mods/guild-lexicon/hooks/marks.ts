// What the lexicon marks in a reply, and what it knows without asking the model: the guild's
// terms from TERMINOLOGY.md and the named rules of a charter. Plain functions, no `$`, so the
// tests reach them directly.

/** One of the bold terms of TERMINOLOGY.md, with its definition. */
export type Term = { name: string; definition: string }
/** A rule a charter names: a bullet's lead (`One contract at a time:`) or a heading, with its text. */
export type Rule = { name: string; text: string }
/** What a marked word stands for: the kind decides where its meaning is looked up first. */
export type Mark = { kind: 'term' | 'rule' | 'posting' | 'run' | 'code' | 'phrase'; key: string }

// Every href the lexicon writes starts here. A Markdown link must be https: to be drawn as a link;
// .invalid is reserved, so a ctrl-click that opens one in a browser reaches nobody.
export const HREF = 'https://lexicon.invalid/'

export const hrefOf = (m: Mark) => `${HREF}${m.kind}/${encodeURIComponent(m.key)}`

export function markOf(href: string): Mark | undefined {
  if (!href.startsWith(HREF)) return undefined
  const [kind, ...rest] = href.slice(HREF.length).split('/')
  if (kind === undefined || !['term', 'rule', 'posting', 'run', 'code', 'phrase'].includes(kind)) return undefined
  try {
    return { kind: kind as Mark['kind'], key: decodeURIComponent(rest.join('/')) }
  } catch {
    return undefined
  }
}

const plain = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim()

/** The bold Term column of every table in TERMINOLOGY.md, with its Definition cell. */
export function parseTerminology(md: string): Term[] {
  const terms: Term[] = []
  for (const line of md.split('\n')) {
    const m = /^\|\s*\*\*([^*]+)\*\*\s*\|(.*)$/.exec(line)
    if (!m) continue
    const cells = (m[2] ?? '').split(/\s\|\s?/)
    const definition = plain(cells[0] ?? '').replace(/\s*\|\s*$/, '')
    if (definition) terms.push({ name: (m[1] ?? '').trim(), definition })
  }
  return terms
}

/** A charter's named rules: each bullet that opens with a short lead and a colon, and each heading. */
export function parseCharter(md: string): Rule[] {
  const rules: Rule[] = []
  const lines = md.split('\n')
  const at = (i: number) => lines[i] ?? ''
  for (let i = 0; i < lines.length; i++) {
    const heading = /^\s*#{2,4}\s+(.+?)\s*$/.exec(at(i))
    if (heading) {
      const body: string[] = []
      for (let j = i + 1; j < lines.length && !/^\s*#/.test(at(j)); j++) if (at(j).trim()) body.push(at(j).trim())
      if (body.length) rules.push({ name: plain(heading[1] ?? ''), text: plain(body.join(' ')) })
      continue
    }
    const bullet = /^\s*(?:[-*•]|\d+\.)\s+([A-Z][^:]{2,60}):\s+(.*)$/.exec(at(i))
    if (!bullet || plain(bullet[1] ?? '').split(/\s+/).length > 8) continue
    const text = [(bullet[2] ?? '').trim()]
    for (let j = i + 1; j < lines.length && at(j).trim() && !/^\s*(?:[-*•#]|\d+\.)\s/.test(at(j)); j++) text.push(at(j).trim())
    rules.push({ name: plain(bullet[1] ?? ''), text: plain(text.join(' ')) })
  }
  return rules
}

/** Spellings compared without case, hyphens, a plural s or a trailing "rule". */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[‐-―-]/g, ' ').replace(/[^a-z0-9_. #]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\s+rule$/, '').replace(/^the\s+/, '')

const unplural = (s: string) => s.replace(/(?:es|s)$/, '')

export function findTerm(terms: readonly Term[], phrase: string): Term | undefined {
  const n = norm(phrase)
  return terms.find(t => norm(t.name) === n) ?? terms.find(t => unplural(norm(t.name)) === unplural(n))
}

export function findRule(rules: readonly Rule[], phrase: string): Rule | undefined {
  const n = norm(phrase)
  return rules.find(r => norm(r.name) === n)
}

// Terms that are ordinary English words in lower case: marked only where a reply capitalises them.
const COMMON = new Set(['run', 'round', 'register', 'archive', 'seal', 'sealing', 'welcome', 'rank', 'quarters', 'ruling', 'proving', 'commission', 'deed', 'contract', 'survey', 'writ'])

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Span = { start: number; end: number; mark: Mark }

/** A posting or run reference typed alone, as `/what` gets it: `#49`, `context-bar#1`, `run 13`. */
export function refOf(phrase: string): Mark | undefined {
  const p = phrase.trim()
  const posting = /^(?:posting\s+)?((?:[a-z][\w-]*)?#\d+)$/i.exec(p)
  if (posting?.[1]) return { kind: 'posting', key: posting[1] }
  const run = /^run\s+(\d+)$/i.exec(p)
  if (run?.[1]) return { kind: 'run', key: run[1] }
  return undefined
}

// Inline code that names something: one word (GM_VEIL, guild.conf, GM_VEIL=off) or a gm command.
const codeName = (s: string) => s.length <= 40 && (/^[\w.$/@-]+(?:=[\w.-]+)?$/.test(s) || /^gm [a-z-]+$/.test(s)) && !/^\d+$/.test(s)

/** Where each mark goes in one stretch of prose (no code, no link), each thing marked once. */
function prose(text: string, offset: number, terms: readonly Term[], rules: readonly Rule[], seen: Set<string>): Span[] {
  const spans: Span[] = []
  const take = (start: number, end: number, mark: Mark) => {
    const id = `${mark.kind}:${norm(mark.key)}`
    if (seen.has(id) || spans.some(s => start < s.end && s.start < end)) return
    seen.add(id)
    spans.push({ start: offset + start, end: offset + end, mark })
  }
  for (const m of text.matchAll(/(?<![\w/#&])((?:[a-z][\w-]*)?#(\d+))\b/gi)) {
    const ref = m[1] ?? ''
    take(m.index, m.index + ref.length, { kind: 'posting', key: ref })
  }
  for (const m of text.matchAll(/\b[Rr]uns?\s+(\d+(?:(?:,\s*|,?\s+and\s+)\d+)*)\b/g)) {
    const list = m[1] ?? ''
    const from = m.index + m[0].indexOf(list)
    const nums = [...list.matchAll(/\d+/g)]
    if (nums.length === 1) take(m.index, m.index + m[0].length, { kind: 'run', key: list })
    else for (const n of nums) take(from + n.index, from + n.index + n[0].length, { kind: 'run', key: n[0] })
  }
  // Longer names first, so "one contract at a time" wins over "contract".
  const named = [...rules.map(r => ({ name: r.name, mark: { kind: 'rule', key: r.name } as Mark, words: r.name.split(/\s+/).length })),
    ...terms.map(t => ({ name: t.name, mark: { kind: 'term', key: t.name } as Mark, words: t.name.split(/\s+/).length }))]
    .filter(n => n.mark.kind === 'term' || n.words >= 3)
    .sort((a, b) => b.name.length - a.name.length)
  for (const n of named) {
    const parts = n.name.replace(/^The\s+/, '').split(/\s+/).map(escape)
    // A rule is marked only where the reply names it as one: "the one contract at a time rule",
    // or hyphenated, "one-contract-at-a-time"; its name alone is too often plain words.
    const words = n.mark.kind === 'rule'
      ? `(?:${parts.join('[\\s‐-―-]+')}[\\s-]+rule|${parts.join('[‐-―-]')}(?:[\\s-]+rule)?)`
      : parts.join('[\\s‐-―-]+')
    // A term followed by a number is a reference ("Runs 11, 12"), marked as one above.
    const tail = n.mark.kind === 'rule' ? '' : '(?:e?s)?(?!\\s+\\d)'
    const flags = n.mark.kind === 'term' && COMMON.has(n.name.toLowerCase()) ? 'g' : 'gi'
    for (const m of text.matchAll(new RegExp(`(?<![\\w-])${words}${tail}(?![\\w-])`, flags))) take(m.index, m.index + m[0].length, n.mark)
  }
  return spans
}

/**
 * The reply's markdown with each thing it can explain made a link to the lexicon, and the hrefs
 * written; `hrefs` is empty when there is nothing to mark. Code fences, links, URLs and code
 * spans that name nothing are left as written.
 */
export function markText(text: string, terms: readonly Term[], rules: readonly Rule[]): { text: string; hrefs: string[] } {
  const spans: Span[] = []
  const seen = new Set<string>()
  // Fences, links, bare URLs, autolinks and code spans are taken out of the prose first.
  const guarded = /(^|\n)(```|~~~)[\s\S]*?(\n\2[^\n]*(?=\n|$)|$)|!?\[[^\]\n]*\]\([^)\n]*\)|<[a-z]+:[^>\s]+>|https?:\/\/[^\s)>\]]+|`([^`\n]+)`/g
  let at = 0
  for (const m of text.matchAll(guarded)) {
    spans.push(...prose(text.slice(at, m.index), at, terms, rules, seen))
    const code = m[4]
    if (code !== undefined && codeName(code)) {
      const id = `code:${norm(code)}`
      if (!seen.has(id)) {
        seen.add(id)
        spans.push({ start: m.index, end: m.index + m[0].length, mark: { kind: 'code', key: code } })
      }
    }
    at = m.index + m[0].length
  }
  spans.push(...prose(text.slice(at), at, terms, rules, seen))
  if (spans.length === 0) return { text, hrefs: [] }
  spans.sort((a, b) => a.start - b.start)
  let out = ''
  let last = 0
  const hrefs: string[] = []
  for (const s of spans) {
    const href = hrefOf(s.mark)
    const shown = text.slice(s.start, s.end).replace(/([[\]])/g, '\\$1')
    out += `${text.slice(last, s.start)}[${shown}](${href})`
    if (!hrefs.includes(href)) hrefs.push(href)
    last = s.end
  }
  return { text: out + text.slice(last), hrefs: hrefs.slice(0, 256) }
}

/** At most `lines` lines of at most `width` characters in all: the popup's TL;DR. */
export function tldr(text: string, lines = 4, width = 400): string {
  const kept = text.trim().split('\n').map(l => l.trim()).filter(Boolean).slice(0, lines).join('\n')
  return kept.length > width ? `${kept.slice(0, width - 1).trimEnd()}…` : kept
}

/** `gm show`'s answer as a TL;DR: the slug and state, then the first line of the patron's words. */
export function postingTldr(shown: string): string | undefined {
  const lines = shown.split('\n')
  const head = lines[0]?.trim()
  if (!head || !/#\d+/.test(head)) return undefined
  const words = lines.findIndex(l => l.startsWith("The patron's words"))
  const first = words >= 0 ? lines.slice(words + 1).find(l => l.trim()) : undefined
  const sentence = first ? (/^(.{20,}?[.?!])\s/.exec(first)?.[1] ?? first) : undefined
  return tldr([head, sentence ? `“${sentence.length > 240 ? `${sentence.slice(0, 239)}…` : sentence}”` : ''].join('\n'))
}

/** `gm runs --all`'s line for run `n`, as a TL;DR. */
export function runTldr(runs: string, n: string): string | undefined {
  const lines = runs.split('\n')
  const i = lines.findIndex(l => l.startsWith(`run ${n} `))
  if (i < 0) return undefined
  return tldr((lines[i] ?? "").replace(/^run \d+\s+/, '').replace(/\s{2,}/g, ' · '), 3)
}

/** The tight question the model is asked, over the session's own transcript. */
export const forkPrompt = (phrase: string) =>
  `The patron clicked "${phrase}" in your last replies and does not know what it means. ` +
  `In 2 to 4 short lines, at most 350 characters, say what "${phrase}" means in this conversation: a TL;DR, ` +
  'plain text, no heading, no preamble, no markdown. If this conversation does not say, give the likeliest meaning and say it is a guess. ' +
  'Answer with the TL;DR alone; do not act on anything.'
