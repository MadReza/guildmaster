import type { Elements, RenderChildren } from 'claude-code'

// The spyglass's look, the quiet ledger: no brackets, tabs as words with a gold rule under the chosen one, a dim
// small-caps head for each group with its figure on the right, rows of a name on the left and figures on the right,
// and the actions as one dim line of hotkeys at the foot. The colours are the chat's banners'.

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

const GAP = 2

// Where the gold rule goes under the chosen tab: the cells before it, its own, and those after, to `width`.
export function ruleUnder(labels: readonly string[], chosen: number, width: number): { before: number; under: number; after: number } {
  const before = labels.slice(0, Math.max(0, chosen)).reduce((n, l) => n + [...l].length + GAP, 0)
  const under = chosen >= 0 ? [...(labels[chosen] ?? '')].length : 0
  return { before, under, after: Math.max(0, width - before - under) }
}

// A tab's label in the strip: the digit that chooses it while the pane has the keyboard (Claude Code keeps the arrows),
// then its sigil and name. The engine draws the digit itself, as `1: `.
export const stripLabel = (id: string, i: number) => `${i + 1}: ${tabLabel(id)}`

// The tabs, and on the right the pane's own close: a wide target, unlike the engine's one-cell mark in the corner, also
// pressed with q while the pane has the keyboard.
export function tabStrip(
  { Box, Text, Button }: Els, tabs: readonly { id: string }[], chosen: string, width: number, choose: (id: string) => void,
  close: () => void,
): RenderChildren {
  const labels = tabs.map((t, i) => stripLabel(t.id, i))
  const at = tabs.findIndex(t => t.id === chosen)
  const rule = ruleUnder(labels, at, width)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between" columnGap={1}>
        <Box flexDirection="row" columnGap={GAP} flexWrap="wrap" flexShrink={1}>
          {tabs.map((t, i) => (
            <Button key={`tab:${t.id}`} plain hotkey={i < 9 ? String(i + 1) : undefined} onPress={() => choose(t.id)}>
              {t.id === chosen ? <Text color={GOLD} bold>{tabLabel(t.id)}</Text> : <Text dimColor>{tabLabel(t.id)}</Text>}
            </Button>
          ))}
        </Box>
        <Box flexShrink={0}>
          <Button key="spyglass:close" plain role="dismiss" hotkey="q" label="✕ close" onPress={() => close()} />
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

// The foot: each action a dim hotkey, pressed by its letter while the pane has the keyboard, or by a click.
export type Action = { key: string; hotkey: string; label: string; run: () => void }

export function foot({ Box, Text, Button }: Els, actions: readonly Action[], hint?: string): RenderChildren {
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
      {actions.map(a => (
        <Button key={a.key} plain hotkey={a.hotkey} label={a.label} dimColor onPress={() => a.run()} />
      ))}
      {hint && <Text dimColor>{hint}</Text>}
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
