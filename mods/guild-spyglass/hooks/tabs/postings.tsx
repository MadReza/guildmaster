import type { Elements, RenderChildren } from 'claude-code'

import type { SpyglassPosting, SpyglassPostings } from '../../types'

// The postings tab: the quest board as gm list --json gives it. A Party Leader sees its own focus's postings, the
// Guildmaster every focus's, grouped by focus. Finished ones (done, closed) show only while asked for. A press on a
// posting opens it to its words' summary, its last notice line and, when parked, why. What runs gm and holds the
// board is in register.tsx; this file only reads and draws.

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

const STATES = ['received', 'queued', 'active', 'needs-you', 'parked', 'done', 'failed', 'closed'] as const

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

// The gm list arguments for a seat: its own focus for a Party Leader, every focus at the front desk.
export const listArgs = (focus: string | undefined, all: boolean) =>
  ['list', '--json', ...(all ? ['--all'] : []), ...(focus ? [focus] : [])]

// The colour and mark of each state: what needs the patron stands out, what is finished recedes.
export function stateMark(state: string): { glyph: string; color?: string; isDim: boolean } {
  switch (state) {
    case 'needs-you': return { glyph: '!', color: '#c0392b', isDim: false }
    case 'active': return { glyph: '▶', color: '#d4a017', isDim: false }
    case 'received': return { glyph: '✉', color: '#4a7bd9', isDim: false }
    case 'queued': return { glyph: '·', isDim: false }
    case 'parked': return { glyph: '⏸', isDim: true }
    case 'done': return { glyph: '✓', color: '#3fa34d', isDim: true }
    case 'failed': return { glyph: '✗', color: '#c0392b', isDim: true }
    default: return { glyph: ' ', isDim: true }
  }
}

// One count per state, in the board's order, for the line above the list.
export function tally(rows: readonly SpyglassPosting[]): string {
  const counts = STATES.map(s => [s, rows.filter(r => r.state === s).length] as const).filter(([, n]) => n > 0)
  return counts.length ? counts.map(([s, n]) => `${n} ${s}`).join(' · ') : 'no postings'
}

export type PostingsView = { board: SpyglassPostings; focus: string | undefined; all: boolean; open: string; width: number }
export type PostingsActions = { toggleAll: () => void; refresh: () => void; toggle: (ref: string) => void }

export function postingsTab({ Box, Text, Button }: Els, v: PostingsView, act: PostingsActions): RenderChildren {
  const controls = (
    <Box flexDirection="row" columnGap={1}>
      <Button key="postings:all" label={v.all ? 'Hide finished' : 'Show finished'} dimColor onPress={() => act.toggleAll()} />
      <Button key="postings:refresh" label="Refresh" dimColor onPress={() => act.refresh()} />
    </Box>
  )
  if (!v.board.isLoaded) return <Box flexDirection="column">{controls}<Text dimColor>Reading the quest board…</Text></Box>
  if (v.board.why) {
    return (
      <Box flexDirection="column">
        {controls}
        <Text color="#c0392b">gm cannot list the postings: {v.board.why}</Text>
      </Box>
    )
  }
  const rows = v.board.rows
  const focuses = v.focus ? [v.focus] : [...new Set(rows.map(r => r.focus))]
  return (
    <Box flexDirection="column">
      {controls}
      <Text dimColor wrap="truncate-end">{tally(rows)}</Text>
      {focuses.map(f => (
        <Box key={`focus:${f}`} flexDirection="column" marginTop={1}>
          {!v.focus && <Text bold wrap="truncate-end">⚔ {f}</Text>}
          {rows.filter(r => r.focus === f).map(r => {
            const mark = stateMark(r.state)
            return (
              <Box key={`row:${r.ref}`} flexDirection="column">
                <Button key={`posting:${r.ref}`} plain dimColor={mark.isDim} onPress={() => act.toggle(r.ref)}>
                  <Text color={mark.color}>{mark.glyph}</Text> #{r.num} {r.slug} <Text dimColor>{r.state}</Text>
                </Button>
                {v.open === r.ref ? (
                  <Box flexDirection="column" paddingLeft={2} width={v.width}>
                    <Text>{r.summary}</Text>
                    {r.why && <Text dimColor>parked: {r.why}{r.until ? `, until ${r.until}` : ''}</Text>}
                    {r.last && <Text dimColor>{r.last}</Text>}
                  </Box>
                ) : (
                  <Box paddingLeft={2}><Text dimColor wrap="truncate-end">{r.summary}</Text></Box>
                )}
              </Box>
            )
          })}
        </Box>
      ))}
      {rows.length === 0 && <Text dimColor>The board is empty.</Text>}
    </Box>
  )
}
