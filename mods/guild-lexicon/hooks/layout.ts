// How a marked reply is laid out. A link in Claude Code's Markdown is drawn, in a terminal
// without hyperlinks, as its text then its URL, so the lexicon writes no links: every stretch of
// the reply with nothing marked stays markdown, drawn by Claude Code, and each paragraph, list
// or heading that holds a mark is laid out here as words, its inline markdown (bold, italic,
// code, links) read into styles, so each mark can be drawn as the word alone and pressed.
// Plain functions, no `$`, so the tests reach them directly.

import type { Mark, Span } from './marks'

/** How a piece of text is drawn: its inline markdown, read. */
export type Style = { bold?: true; italic?: true; strike?: true; code?: true; href?: string }
/** A stretch of one style; `mark` set when it is (part of) a marked thing. */
export type Piece = Style & { text: string; mark?: Mark }
/** What wraps as one: its pieces, drawn side by side with no space between. */
export type Word = Piece[]
/**
 * A stretch of the reply: markdown drawn as Claude Code draws it, or one line of a marked block
 * (a paragraph, a list item, a heading, a quote) as words. `gap` is a blank line above it.
 */
export type Block =
  | { kind: 'markdown'; text: string; gap: boolean }
  | { kind: 'words'; indent: number; prefix: string; heading: boolean; quote: boolean; words: Word[]; gap: boolean }

type Line = { text: string; start: number }

const fence = /^\s*(```|~~~)/
// Lines that stay markdown even inside a marked block: a table row, a rule, an html line.
const asMarkdown = (l: string) => /^\s*\|/.test(l) || /^\s*(?:[-*_]\s*){3,}$/.test(l) || /^\s*</.test(l)

/** The reply split into markdown runs and the marked blocks' lines, in order. */
export function layout(text: string, spans: readonly Span[]): Block[] {
  const lines: Line[] = []
  let at = 0
  for (const l of text.split('\n')) {
    lines.push({ text: l, start: at })
    at += l.length + 1
  }
  // Groups: a fence whole, else a run of non-blank lines; each says whether a blank line came before.
  const groups: { lines: Line[]; gap: boolean; fenced: boolean }[] = []
  let gap = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!
    if (!l.text.trim()) {
      gap = groups.length > 0
      continue
    }
    const open = fence.exec(l.text)
    if (open) {
      const g = [l]
      for (i++; i < lines.length; i++) {
        g.push(lines[i]!)
        if (lines[i]!.text.trimStart().startsWith(open[1]!)) break
      }
      groups.push({ lines: g, gap, fenced: true })
    } else {
      const g = [l]
      while (i + 1 < lines.length && lines[i + 1]!.text.trim() && !fence.test(lines[i + 1]!.text)) g.push(lines[++i]!)
      groups.push({ lines: g, gap, fenced: false })
    }
    gap = false
  }
  const end = (ls: Line[]) => ls[ls.length - 1]!.start + ls[ls.length - 1]!.text.length
  const marked = (from: number, to: number) => spans.some(s => s.start < to && from < s.end)
  const blocks: Block[] = []
  // Unmarked groups, and the markdown lines of a marked one, join the markdown run before them.
  const markdown = (ls: Line[], gap: boolean) => {
    const last = blocks[blocks.length - 1]
    const from = ls[0]!.start
    if (last?.kind === 'markdown' && run !== undefined) {
      last.text = text.slice(run, end(ls))
      return
    }
    run = from
    blocks.push({ kind: 'markdown', text: text.slice(from, end(ls)), gap })
  }
  let run: number | undefined
  for (const g of groups) {
    if (g.fenced || !marked(g.lines[0]!.start, end(g.lines))) {
      markdown(g.lines, g.gap)
      continue
    }
    let first = true
    for (const item of items(g.lines)) {
      const gapHere = first && g.gap
      first = false
      if (item.kind === 'markdown') {
        markdown(item.lines, gapHere)
        continue
      }
      run = undefined
      blocks.push({ kind: 'words', ...item.head, words: words(text, item.ranges, spans), gap: gapHere })
    }
    run = undefined
  }
  return blocks
}

type Head = { indent: number; prefix: string; heading: boolean; quote: boolean }
type Item = { kind: 'markdown'; lines: Line[] } | { kind: 'words'; head: Head; ranges: [number, number][] }

/** A marked group's lines as items: each list item, heading, quote line or paragraph with its continuation lines. */
function items(lines: Line[]): Item[] {
  const out: Item[] = []
  for (const l of lines) {
    const last = out[out.length - 1]
    if (asMarkdown(l.text)) {
      if (last?.kind === 'markdown') last.lines.push(l)
      else out.push({ kind: 'markdown', lines: [l] })
      continue
    }
    // Each pattern's first group is what comes before the content, its second the content.
    const heading = /^(\s{0,3}#{1,6}\s+)(.*?)(?:\s+#+)?\s*$/.exec(l.text)
    const bullet = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)(.*)$/.exec(l.text)
    const quote = /^(\s*>\s?)(.*)$/.exec(l.text)
    const range = (m: RegExpExecArray): [number, number] => {
      const from = l.start + (m[1] ?? '').length
      return [from, from + (m[2] ?? '').trimEnd().length]
    }
    if (heading) {
      out.push({ kind: 'words', head: { indent: 0, prefix: '', heading: true, quote: false }, ranges: [range(heading)] })
    } else if (bullet) {
      const indent = (bullet[1] ?? '').length - (bullet[1] ?? '').trimStart().length
      const marker = (bullet[1] ?? '').trim()
      out.push({ kind: 'words', head: { indent, prefix: `${/\d/.test(marker) ? marker : '-'} `, heading: false, quote: false }, ranges: [range(bullet)] })
    } else if (quote) {
      if (last?.kind === 'words' && last.head.quote) last.ranges.push(range(quote))
      else out.push({ kind: 'words', head: { indent: 0, prefix: '▎ ', heading: false, quote: true }, ranges: [range(quote)] })
    } else if (last?.kind === 'words' && !last.head.heading) {
      // A continuation line: part of the paragraph or list item above.
      const lead = l.text.length - l.text.trimStart().length
      last.ranges.push([l.start + lead, l.start + l.text.trimEnd().length])
    } else {
      const lead = l.text.length - l.text.trimStart().length
      out.push({ kind: 'words', head: { indent: 0, prefix: '', heading: false, quote: false }, ranges: [[l.start + lead, l.start + l.text.trimEnd().length]] })
    }
  }
  return out
}

// One character of an item's content, or a whole code span or link, with where it began.
type Atom = Style & { text: string; at: number; space: boolean }

const punct = /[!-/:-@[-`{-~]/
const wordChar = /[\p{L}\p{N}_]/u

/** The inline markdown of an item's lines, joined as one paragraph, read into atoms. */
function atoms(text: string, ranges: readonly [number, number][]): Atom[] {
  // The content, the line breaks joined as spaces, with each character's place in the reply.
  let s = ''
  const pos: number[] = []
  ranges.forEach(([from, to], i) => {
    if (i > 0) {
      s += ' '
      pos.push(from - 1)
    }
    for (let p = from; p < to; p++) {
      s += text[p]
      pos.push(p)
    }
  })
  const out: Atom[] = []
  const style: { bold?: true; italic?: true; strike?: true } = {}
  const flip = (k: 'bold' | 'italic' | 'strike') => (style[k] ? delete style[k] : (style[k] = true))
  const push = (t: string, at: number, extra: Style = {}) => out.push({ ...style, ...extra, text: t, at: pos[at] ?? 0, space: false })
  // Whether a closing delimiter follows: else the delimiter is a literal character.
  const closes = (d: string, from: number) => s.indexOf(d, from) > from
  for (let i = 0; i < s.length;) {
    const c = s[i]!
    const rest = s.slice(i)
    if (c === '\\' && punct.test(s[i + 1] ?? '')) {
      push(s[i + 1]!, i + 1)
      i += 2
      continue
    }
    if (c === '`') {
      const ticks = /^`+/.exec(rest)![0]
      const close = s.indexOf(ticks, i + ticks.length)
      if (close > i) {
        let code = s.slice(i + ticks.length, close)
        if (/^ .* $/.test(code) && code.trim()) code = code.slice(1, -1)
        push(code, i, { code: true })
        i = close + ticks.length
        continue
      }
    }
    const link = /^!?\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest)
    if (link) {
      push(link[1] || link[2]!, i, { href: link[2]! })
      i += link[0].length
      continue
    }
    const url = /^<([a-z]+:[^>\s]+)>/.exec(rest) ?? (wordChar.test(s[i - 1] ?? '') ? null : /^(https?:\/\/[^\s)>\]]+)/.exec(rest))
    if (url) {
      push(url[1]!, i)
      i += url[0].length
      continue
    }
    const before = s[i - 1] ?? ' '
    const delim = (['**', '__', '~~', '*', '_'] as const).find(d => rest.startsWith(d))
    if (delim) {
      const k = delim === '~~' ? 'strike' : delim.length === 2 ? 'bold' : 'italic'
      const after = s[i + delim.length] ?? ' '
      // `_` marks only at a word's edge (snake_case stays), and an opener is followed by no space.
      const edge = !delim.startsWith('_') || !wordChar.test(style[k] ? after : before)
      if (edge && (style[k] || (!/\s/.test(after) && closes(delim, i + delim.length)))) {
        flip(k)
        i += delim.length
        continue
      }
    }
    if (/\s/.test(c)) out.push({ ...style, text: ' ', at: pos[i] ?? 0, space: true })
    else push(c, i)
    i++
  }
  return out
}

const sameStyle = (a: Style, b: Style) => a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.code === b.code && a.href === b.href

/** An item's content as words, each mark kept whole in one word with its pieces marked. */
function words(text: string, ranges: readonly [number, number][], spans: readonly Span[]): Word[] {
  const out: Word[] = []
  let word: Word = []
  const spanAt = (p: number) => spans.find(s => s.start <= p && p < s.end)
  for (const a of atoms(text, ranges)) {
    const span = spanAt(a.at)
    if (a.space && !span) {
      if (word.length) out.push(word)
      word = []
      continue
    }
    const last = word[word.length - 1]
    if (last && last.mark === span?.mark && sameStyle(last, a) && !a.code && !a.href && !last.code && !last.href) {
      last.text += a.text
      continue
    }
    const { at: _at, space: _space, ...piece } = a
    word.push(span ? { ...piece, mark: span.mark } : piece)
  }
  if (word.length) out.push(word)
  return out
}
