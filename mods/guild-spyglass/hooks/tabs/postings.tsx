import type { RenderChildren } from 'claude-code'

import type { SpyglassPosting, SpyglassPostings } from '../../types'
import { CRIMSON, foot, GOLD, GREEN, head, ROYAL, row, when, type Els } from './ui'

export type { Els } from './ui'

// The postings tab: the quest board as gm list --json gives it. A Party Leader sees its own focus's postings, the
// Guildmaster every focus's, grouped by focus. Finished ones (done, closed) show only while asked for. A press on a
// posting opens it to its words' summary, its last notice line and, when parked, why. What runs gm and holds the
// board is in register.tsx; this file only reads and draws.


// What gm list --json printed, as the tab holds it: anything that is not an array of postings is no postings.
export function parsePostings(json: string): SpyglassPosting[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const text = (v: unknown) => (typeof v === 'string' ? v : null)
  return value.flatMap((v: unknown) => {
    const o = (v ?? {}) as Record<string, unknown>
    if (typeof o.ref !== 'string' || typeof o.num !== 'number' || typeof o.state !== 'string') return []
    return [{
      ref: o.ref, focus: text(o.focus) ?? '', num: o.num, slug: text(o.slug) ?? '', state: o.state,
      updated: text(o.updated) ?? '', summary: text(o.summary) ?? '', why: text(o.why), until: text(o.until), last: text(o.last),
    }]
  })
}

// The gm list arguments for a seat: its own focus for a Party Leader, every focus at the front desk. Finished postings
// are always read, so the board can count them while it folds them away.
export const listArgs = (focus: string | undefined) => ['list', '--json', '--all', ...(focus ? [focus] : [])]

// The board's groups, in the order they are drawn: what needs the patron first, what is finished last.
export const GROUPS: readonly { title: string; states: readonly string[]; isFinished?: true; isTold?: true }[] = [
  { title: 'needs you', states: ['needs-you'], isTold: true },
  { title: 'active', states: ['active'], isTold: true },
  { title: 'received', states: ['received'] },
  { title: 'queued', states: ['queued'] },
  { title: 'parked', states: ['parked'] },
  { title: 'failed', states: ['failed'] },
  { title: 'done', states: ['done', 'closed'], isFinished: true },
]

// The colour and mark of each state: what needs the patron stands out, what is finished recedes.
export function stateMark(state: string): { glyph: string; color?: string; isDim: boolean } {
  switch (state) {
    case 'needs-you': return { glyph: '!', color: CRIMSON, isDim: false }
    case 'active': return { glyph: '▶', color: GOLD, isDim: false }
    case 'received': return { glyph: '✉', color: ROYAL, isDim: false }
    case 'queued': return { glyph: '·', isDim: false }
    case 'parked': return { glyph: '⏸', isDim: true }
    case 'done': return { glyph: '✓', color: GREEN, isDim: true }
    case 'failed': return { glyph: '✗', color: CRIMSON, isDim: true }
    default: return { glyph: ' ', isDim: true }
  }
}

export type PostingsView = { board: SpyglassPostings; focus: string | undefined; all: boolean; open: string; now: number }
export type PostingsActions = { toggleAll: () => void; refresh: () => void; toggle: (ref: string) => void }

export function postingsTab(els: Els, v: PostingsView, act: PostingsActions): RenderChildren {
  const { Box, Text, Button } = els
  const actions = foot(els, [
    { key: 'postings:refresh', hotkey: 'r', label: 'refresh', run: act.refresh },
    { key: 'postings:all', hotkey: 'f', label: v.all ? 'hide done' : 'show done', run: act.toggleAll },
  ], '⏎ open a posting')
  if (!v.board.isLoaded) return <Box flexDirection="column"><Text dimColor>Reading the quest board…</Text>{actions}</Box>
  if (v.board.why) return <Box flexDirection="column"><Text color={CRIMSON}>gm cannot list the postings: {v.board.why}</Text>{actions}</Box>
  const rows = v.board.rows
  const drawn = GROUPS.map((g, i) => {
    const mine = rows.filter(r => g.states.includes(r.state))
    if (mine.length === 0) return null
    if (g.isFinished && !v.all) return head(els, `group:${g.title}`, g.title, `${mine.length} · hidden`, i > 0)
    return (
      <Box key={`group:${g.title}`} flexDirection="column">
        {head(els, `head:${g.title}`, g.title, String(mine.length))}
        {mine.map(r => {
          const mark = stateMark(r.state)
          const isOpen = v.open === r.ref
          const name = v.focus ? `#${r.num} ${r.slug}` : `${r.ref} ${r.slug}`
          return (
            <Box key={`row:${r.ref}`} flexDirection="column">
              {row(els, `line:${r.ref}`,
                <Button key={`posting:${r.ref}`} plain onPress={() => act.toggle(r.ref)}>
                  <Text color={mark.color} bold={!mark.isDim}>{mark.glyph}</Text> <Text bold={!mark.isDim} dimColor={mark.isDim}>{name}</Text>
                </Button>,
                <Text dimColor>{when(r.updated, v.now)}</Text>)}
              {(isOpen || g.isTold) && r.summary && <Box paddingLeft={2}><Text dimColor wrap={isOpen ? 'wrap' : 'truncate-end'}>{r.summary}</Text></Box>}
              {isOpen && r.why && <Box paddingLeft={2}><Text dimColor>parked: {r.why}{r.until ? `, until ${r.until}` : ''}</Text></Box>}
              {isOpen && r.last && <Box paddingLeft={2}><Text dimColor>{r.last}</Text></Box>}
            </Box>
          )
        })}
      </Box>
    )
  })
  return (
    <Box flexDirection="column">
      {rows.length === 0 ? <Text dimColor>The board is empty.</Text> : drawn}
      {actions}
    </Box>
  )
}
