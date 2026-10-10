import type { Elements, RenderChildren } from 'claude-code'

// The spyglass's look, the quiet ledger: no brackets, tabs as words with a gold rule under the chosen one, a dim
// small-caps head for each group with its figure on the right, rows of a name on the left and figures on the right,
// and the actions as one dim line of words at the foot, each pressed by a click. The colours are the chat's banners'.

export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export const GOLD = '#d4a017'
export const CRIMSON = '#c0392b'
export const ROYAL = '#4a7bd9'
export const STEEL = '#8a9199'
export const GREEN = '#3fa34d'
export const PURPLE = '#9b59b6'
const RULE = '#3a3d43'

// The pane's tabs, by the heraldic names: Board (postings), Satchel (files), Deeds (activity), Codex (settings),
// Lantern (context).
export const TAB_LABELS: Record<string, { sigil: string; name: string }> = {
  postings: { sigil: '⚑', name: 'Board' },
  files: { sigil: '✎', name: 'Satchel' },
  activity: { sigil: '⚒', name: 'Deeds' },
  configs: { sigil: '⚙', name: 'Codex' },
  context: { sigil: '◔', name: 'Lantern' },
}

export const tabLabel = (id: string) => {
  const l = TAB_LABELS[id]
  return l ? `${l.sigil} ${l.name}` : id
}

// The tab a /spyglass word names: its heraldic name (board, satchel, deeds, codex, lantern) or its plain one.
export function tabNamed(word: string): string | undefined {
  const w = word.trim().toLowerCase()
  if (!w) return undefined
  return Object.entries(TAB_LABELS).find(([id, l]) => l.name.toLowerCase() === w || id === w)?.[0]
}

const GAP = 2

// Where the gold rule goes under the chosen tab: the cells before it, its own, and those after, to `width`.
export function ruleUnder(labels: readonly string[], chosen: number, width: number): { before: number; under: number; after: number } {
  const before = labels.slice(0, Math.max(0, chosen)).reduce((n, l) => n + [...l].length + GAP, 0)
  const under = chosen >= 0 ? [...(labels[chosen] ?? '')].length : 0
  return { before, under, after: Math.max(0, width - before - under) }
}

// The tabs, and on the right the pane's own close: a wide target for the mouse, unlike the engine's one-cell mark in
// the corner.
export function tabStrip(
  { Box, Text, Button }: Els, tabs: readonly { id: string }[], chosen: string, width: number, choose: (id: string) => void,
  close: () => void,
): RenderChildren {
  const labels = tabs.map(t => tabLabel(t.id))
  const at = tabs.findIndex(t => t.id === chosen)
  const rule = ruleUnder(labels, at, width)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
        <Box flexDirection="row" columnGap={GAP} flexWrap="wrap" flexShrink={1}>
          {tabs.map((t, i) => (
            <Button key={`tab:${t.id}`} plain onPress={() => choose(t.id)}>
              {t.id === chosen ? <Text color={GOLD} bold>{tabLabel(t.id)}</Text> : <Text dimColor>{tabLabel(t.id)}</Text>}
            </Button>
          ))}
        </Box>
        <Box flexShrink={0}>
          <Button key="spyglass:close" plain role="dismiss" label="close the spyglass" onPress={() => close()}>
            <Text backgroundColor={RULE}>{'  ✕ close  '}</Text>
          </Button>
        </Box>
      </Box>
      <Text wrap="truncate-end">
        <Text color={RULE}>{'━'.repeat(rule.before)}</Text>
        <Text color={GOLD}>{'━'.repeat(rule.under)}</Text>
        <Text color={RULE}>{'━'.repeat(rule.after)}</Text>
      </Text>
    </Box>
  )
}

// A group's head: its name dim and in capitals on the left, its figure on the right.
export function head({ Box, Text }: Els, key: string, left: string, right: RenderChildren, gapAbove = true): RenderChildren {
  return (
    <Box key={key} flexDirection="row" justifyContent="space-between" columnGap={1} marginTop={gapAbove ? 1 : 0}>
      <Text dimColor wrap="truncate-end">{left.toUpperCase()}</Text>
      <Box flexShrink={0}>{typeof right === 'string' ? <Text dimColor>{right}</Text> : right}</Box>
    </Box>
  )
}

// One row: what it is on the left, cut to fit, and its figures on the right, never cut.
export function row({ Box }: Els, key: string, left: RenderChildren, right?: RenderChildren): RenderChildren {
  return (
    <Box key={key} flexDirection="row" justifyContent="space-between" columnGap={1}>
      <Box flexShrink={1} minWidth={0}>{left}</Box>
      {right !== undefined && <Box flexShrink={0}>{right}</Box>}
    </Box>
  )
}

// The foot: each action a dim word, pressed by a click, the words apart by a dot.
export type Action = { key: string; label: string; run: () => void }

export function foot({ Box, Text, Button }: Els, actions: readonly Action[], hint?: string): RenderChildren {
  return (
    <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
      {actions.map((a, i) => (
        <Button key={a.key} plain onPress={() => a.run()}>{i > 0 ? <Text dimColor> · </Text> : ''}<Text color={GOLD}>{a.label}</Text></Button>
      ))}
      {hint && <Text dimColor>{actions.length ? '   ' : ''}{hint}</Text>}
    </Box>
  )
}

// The figures of a change: +added in green, −deleted in red, each padded so a column of them lines up.
export function delta({ Text }: Els, added: number, deleted: number, pad = 5): RenderChildren {
  return (
    <Text>
      <Text color={GREEN}>{`+${added}`.padStart(pad)}</Text>
      <Text color={CRIMSON}>{deleted ? ` −${deleted}`.padEnd(pad + 1) : ' '.repeat(pad + 1)}</Text>
    </Text>
  )
}

// A time of today as 14:05, an older one as Oct 9.
export function when(iso: string, now: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const n = new Date(now)
  if (d.toDateString() === n.toDateString()) return d.toTimeString().slice(0, 5)
  return `${d.toLocaleString('en', { month: 'short' })} ${d.getDate()}`
}

// A path drawn with its folder dim and its name plain, so the name is what the eye finds.
export function path({ Text }: Els, p: string): RenderChildren {
  const cut = p.lastIndexOf('/') + 1
  return (
    <Text wrap="truncate-start">
      <Text dimColor>{p.slice(0, cut)}</Text>{p.slice(cut)}
    </Text>
  )
}
