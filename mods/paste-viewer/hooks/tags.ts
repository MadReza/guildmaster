export type TextTag = { n: number; lines: number | null }
export type Tags = { images: number[]; texts: TextTag[] }

// `[Image #3]`, `[Pasted text #2 +9 lines]`, or `[Pasted text #2]` for one long line.
const TAG = /\[(?:Image #(\d+)|Pasted text #(\d+)(?: \+(\d+) lines?)?)\]/g

/** The image and pasted-text tags a text holds, each once, in the order they first appear. */
export function findTags(text: string): Tags {
  const images: number[] = []
  const texts: TextTag[] = []
  for (const [, image, pasted, lines] of text.matchAll(TAG)) {
    if (image !== undefined && !images.includes(Number(image))) images.push(Number(image))
    if (pasted !== undefined && !texts.some(tag => tag.n === Number(pasted))) {
      texts.push({ n: Number(pasted), lines: lines === undefined ? null : Number(lines) })
    }
  }
  return { images, texts }
}

/** Line breaks in a text, counted the way Claude Code counts them for a paste's tag. */
export const lineBreaks = (text: string) => text.match(/\r\n|\r|\n/g)?.length ?? 0

/** Whether a clipboard text is the paste a tag stands for: the line count the tag announces. */
export function matchesTag(text: string, lines: number | null): boolean {
  if (text.trim() === '') return false
  const expected = lines ?? 0
  return lineBreaks(text) === expected || lineBreaks(text.trimEnd()) === expected
}

/** The first non-blank line, whitespace collapsed, cut to `width` with an ellipsis. */
export function firstLine(text: string, width: number): string {
  const line = text.split(/\r\n|\r|\n/).find(l => l.trim() !== '')?.replace(/\s+/g, ' ').trim() ?? ''
  if (width < 1) return ''
  return line.length <= width ? line : `${line.slice(0, Math.max(0, width - 1))}…`
}

export type SentPaste = { n: number; text: string; lines: number }
export type Sent = { shown: string; pastes: SentPaste[]; images: number[] }

// A sent prompt carries each pasted text whole, between tags of one id:
// <pasted_content id="055d">…</pasted_content id="055d">.
const PASTED = /<pasted_content id="([^"]*)">\n?([\s\S]*?)\n?<\/pasted_content id="\1">/g

/**
 * A sent prompt's pasted texts, numbered in order, and its text with each one folded back
 * to a `[Pasted text #n +L lines]` tag; and the images its `[Image #n]` tags name.
 */
export function parseSent(text: string): Sent {
  const pastes: SentPaste[] = []
  const shown = text.replace(PASTED, (_whole, _id: string, body: string) => {
    const paste = { n: pastes.length + 1, text: body, lines: lineBreaks(body.trimEnd()) }
    pastes.push(paste)
    return paste.lines > 0 ? `[Pasted text #${paste.n} +${paste.lines} lines]` : `[Pasted text #${paste.n}]`
  })
  return { shown: shown.trim(), pastes, images: findTags(shown).images }
}
