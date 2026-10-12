import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { drawsImages, thumbCells, thumbSvg } from '../hooks/pictures'
import { PANE } from '../hooks/register'
import { findTags, firstLine, matchesTag, parseSent } from '../hooks/tags'

// What stands for Claude Code beneath the mod: the panes it opens, and what the mod asked for.
function world(on: On) {
  const journal = { opens: [] as string[], toasts: [] as string[], runs: [] as string[][] }
  mock.env(on, { HOME: '/home/p', TERM_PROGRAM: 'herdr' })
  on('ui.open', async (_$, e) => {
    journal.opens.push(e.title ?? e.id)
    return { value: { isPlaced: true as const } }
  })
  // Claude Code's own row: the text it is handed.
  on('ui.render', (_$, e) => {
    const props = (e as { props: { text?: string } }).props
    return { type: 'Text', props: {}, children: [props.text ?? 'the engine row'] }
  })
  on('ui.toast', async (_$, e) => {
    journal.toasts.push(typeof e === 'string' ? e : JSON.stringify(e))
    return { value: undefined }
  })
  return journal
}

const viewport = { columns: 120, rows: 40 }
const userMessage = (text: string, more: Record<string, unknown> = {}) => ({
  plugin: 'paste-viewer',
  surface: 'terminal' as const,
  component: 'UserMessage' as const,
  requestId: 'm-1',
  viewport,
  props: { text, origin: { kind: 'composer' as const }, isExpanded: false, ...more },
})
const pane = {
  plugin: 'paste-viewer',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: PANE,
  viewport,
  props: { title: 'Pasted text #1', isFocused: true, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 36 }, view: {} },
}

const SENT = 'look at this\n<pasted_content id="055d">\nline one\nline two\nline three\n</pasted_content id="055d">\nand [Image #6] too'

describe('tags', () => {
  test('finds each image and pasted-text tag once, in order', async () => {
    const tags = findTags('see [Image #2] and [Pasted text #1 +41 lines] then [Pasted text #3] [Image #2]')
    expect(tags.images).toEqual([2])
    expect(tags.texts).toEqual([{ n: 1, lines: 41 }, { n: 3, lines: null }])
  })

  test('a clipboard matches a tag by its line count', async () => {
    expect(matchesTag('a\nb\nc', 2)).toBe(true)
    expect(matchesTag('a\nb\nc\n', 2)).toBe(true)
    expect(matchesTag('a\nb', 2)).toBe(false)
    expect(matchesTag('   ', null)).toBe(false)
  })

  test('the first non-blank line, cut to width', async () => {
    expect(firstLine('\n\n  hello   world  \nnext', 20)).toBe('hello world')
    expect(firstLine('abcdefghij', 5)).toBe('abcd…')
  })

  test('a sent prompt folds each pasted block back to a tag, numbered in order', async () => {
    const sent = parseSent(`${SENT}\n<pasted_content id="9">\none line\n</pasted_content id="9">`)
    expect(sent.pastes).toEqual([{ n: 1, text: 'line one\nline two\nline three', lines: 2 }, { n: 2, text: 'one line', lines: 0 }])
    expect(sent.shown).toBe('look at this\n[Pasted text #1 +2 lines]\nand [Image #6] too\n[Pasted text #2]')
    expect(sent.images).toEqual([6])
  })

  test('a prompt with no paste is left as it is', async () => {
    expect(parseSent('just words')).toEqual({ shown: 'just words', pastes: [], images: [] })
  })
})

describe('pictures', () => {
  test('kitty graphics: kitty and Ghostty, not iTerm2, not under herdr or tmux', async () => {
    expect(drawsImages({ TERM_PROGRAM: 'ghostty' })).toBe(true)
    expect(drawsImages({ TERM: 'xterm-kitty' })).toBe(true)
    expect(drawsImages({ TERM_PROGRAM: 'iTerm.app' })).toBe(false)
    expect(drawsImages({ TERM_PROGRAM: 'herdr', TERM: 'xterm-256color' })).toBe(false)
    expect(drawsImages({ TERM_PROGRAM: 'ghostty', TMUX: '/tmp/tmux' })).toBe(false)
    expect(drawsImages({ TERM_PROGRAM: 'herdr', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' })).toBe(true)
  })

  test('a terminal thumbnail keeps the shape within 6 rows and 32 columns', async () => {
    expect(thumbCells(483, 371)).toEqual({ columns: 16, rows: 6 })
    expect(thumbCells(3000, 500)).toEqual({ columns: 32, rows: 3 })
  })

  test('an SVG thumbnail wraps the JPEG at 96 pixels tall', async () => {
    const svg = thumbSvg({ width: 200, height: 100, jpeg: 'QUJD' })
    expect(svg).toMatchObject({ width: 192, height: 96 })
    expect(svg.source).toContain('href="data:image/jpeg;base64,QUJD"')
  })
})

describe('a sent prompt', () => {
  test('draws its pastes folded, with a chip that opens the text in the pane', async ($, on) => {
    const journal = world(on)
    const ui = await $.ui.mount(userMessage(SENT))
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').join('\n')
    expect(texts).toContain('look at this\n[Pasted text #1 +2 lines]\nand [Image #6] too')
    expect(texts).not.toContain('line two')
    const chips = (await ui.findAll({ type: 'Button' })).map(b => b.text)
    expect(chips).toEqual(['▤ Pasted text #1 · 3 lines', '▣ Image #6'])

    await ui.press({ key: 'm-1:text-1' })
    expect(journal.opens).toEqual(['Pasted text #1 (sent)'])
    const shown = await $.ui.mount(pane)
    expect((await shown.findAll({ type: 'Text' })).map(t => t.text).join('\n')).toContain('line one\nline two\nline three')
  })

  test('ctrl+o, a prompt with no paste, and another party\'s message are drawn as Claude Code draws them', async ($, on) => {
    world(on)
    for (const one of [
      userMessage(SENT, { isExpanded: true }),
      userMessage('just words'),
      userMessage(SENT, { origin: { kind: 'task-notification' } }),
    ]) {
      const ui = await $.ui.mount(one)
      expect(await ui.findAll({ type: 'Button' })).toEqual([])
      await ui.unmount()
    }
  })
})
