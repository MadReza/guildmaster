import type { RenderChildren, SessionContextBreakdown, SessionUsage } from 'claude-code'

import type { SpyglassContext } from '../../types'
import { CRIMSON, foot, GOLD, head, row, type Els } from './ui'

// The context tab, on trial: how full this session's context window is, when it compacts, and what fills it, by
// category as /context counts it, with the MCP servers and memory files that weigh most. The fill and the cost are the
// status line's figures and cost nothing to read; the breakdown is estimated on this machine, at the open, after each
// turn and on Refresh, or counted exactly with the token-count API on Count exactly. What asks the engine is in
// register.tsx.

const TOP = 5

// The engine's usage as the tab holds it: plain figures, the breakdown's grid left out.
export function contextOf(usage: SessionUsage, counted?: 'summary' | 'full'): SpyglassContext {
  const c = usage.context
  const b: SessionContextBreakdown | undefined = c.breakdown
  // Each server's tools in the context now (loaded) and the ones it would add when they are fetched (deferred).
  const servers = new Map<string, { tokens: number; tools: number; deferred: number }>()
  for (const t of b?.mcpTools ?? []) {
    const s = servers.get(t.serverName) ?? { tokens: 0, tools: 0, deferred: 0 }
    servers.set(t.serverName, t.isLoaded ? { ...s, tokens: s.tokens + t.tokens, tools: s.tools + 1 } : { ...s, deferred: s.deferred + t.tokens })
  }
  return {
    isLoaded: true,
    tokens: c.tokens,
    window: c.window,
    percent: c.percent,
    usd: usage.cost?.usd,
    limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    breakdown: b && counted ? {
      counted,
      totalTokens: b.totalTokens,
      maxTokens: b.rawMaxTokens,
      autoCompactAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
      categories: b.categories.filter(k => k.tokens > 0).map(k => ({ name: k.name, tokens: k.tokens, color: k.color, kind: k.kind })),
      servers: [...servers].map(([server, s]) => ({ server, ...s })).sort((x, y) => y.tokens - x.tokens || y.deferred - x.deferred).slice(0, TOP),
      memory: [...b.memoryFiles].sort((x, y) => y.tokens - x.tokens).slice(0, TOP).map(m => ({ path: m.path, tokens: m.tokens })),
    } : undefined,
  }
}

const short = (n: number, unit: number, suffix: string) => `${(n / unit).toFixed(n >= unit * 100 ? 0 : 1).replace(/\.0$/, '')}${suffix}`

export const kTokens = (n: number) => (n >= 1_000_000 ? short(n, 1_000_000, 'M') : n >= 1000 ? short(n, 1000, 'k') : String(n))

// How long until a rate-limit window resets, from now: in 3h 43m, in 2d 19h; the stamp itself when it is no time.
export function resetsIn(at: string, now: number): string {
  const ms = Date.parse(at) - now
  if (Number.isNaN(ms)) return at
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const [d, h] = [Math.floor(m / 1440), Math.floor((m % 1440) / 60)]
  return d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m % 60}m` : `in ${m}m`
}

export type ContextActions = { refresh: () => void; count: () => void }

// The banner over the lantern, as the chat's banners are drawn: a heavy rule, the words, the figure, the rule again.
export function banner(words: string, figure: string, width: number): { lead: string; label: string; tail: string } {
  const label = ` ${words} `
  const end = ` ${figure} ━━`
  return { lead: '━━', label, tail: `${'━'.repeat(Math.max(2, width - 2 - [...label].length - [...end].length))}${end}` }
}

// One stacked bar across `width` cells: each used category its share of the window in its own colour, then the free
// room dim. A category too small for a cell still shows as one while there is room.
export function stack(cats: readonly { name: string; tokens: number; color: string; kind: string }[], window: number, width: number) {
  const used = cats.filter(c => c.kind === 'used' && c.tokens > 0)
  const cells = used.map(c => ({ name: c.name, color: c.color, n: window > 0 ? Math.max(1, Math.round((c.tokens / window) * width)) : 0 }))
  let over = cells.reduce((t, c) => t + c.n, 0) - width
  for (const c of [...cells].sort((x, y) => y.n - x.n)) {
    if (over <= 0) break
    const take = Math.min(over, c.n - 1)
    c.n -= take
    over -= take
  }
  const filled = cells.reduce((t, c) => t + c.n, 0)
  return { cells, free: Math.max(0, width - filled) }
}

export function contextTab(els: Els, ctx: SpyglassContext, width: number, now: number, act: ContextActions): RenderChildren {
  const { Box, Text } = els
  const actions = foot(els, [
    { key: 'context:refresh', hotkey: 'r', label: 'refresh', run: act.refresh },
    { key: 'context:count', hotkey: 'x', label: 'count exactly', run: act.count },
  ])
  if (!ctx.isLoaded) return <Box flexDirection="column"><Text dimColor>Reading the context…</Text>{actions}</Box>
  if (ctx.why) return <Box flexDirection="column"><Text color={CRIMSON}>The context cannot be read: {ctx.why}</Text>{actions}</Box>
  const room = Math.max(20, width)
  const hot = (ctx.percent ?? 0) >= 80
  const tone = hot ? CRIMSON : GOLD
  const top = banner(hot ? 'THE LANTERN BURNS LOW' : 'THE LANTERN BURNS', ctx.percent === undefined ? '–' : `${ctx.percent}%`, room)
  const b = ctx.breakdown
  const bar = b ? stack(b.categories, b.maxTokens, room) : undefined
  const plain = bar ? undefined : { n: ctx.window ? Math.round(((ctx.tokens ?? 0) / ctx.window) * room) : 0 }
  const deferred = b?.categories.filter(k => k.kind === 'deferred') ?? []
  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end"><Text color={tone}>{top.lead}</Text><Text color={tone} bold>{top.label}</Text><Text color={tone}>{top.tail}</Text></Text>
      <Text wrap="truncate-end">
        {bar ? bar.cells.map(c => <Text key={`seg:${c.name}`} color={c.color}>{'█'.repeat(c.n)}</Text>) : <Text color={tone}>{'█'.repeat(plain?.n ?? 0)}</Text>}
        <Text dimColor>{'░'.repeat(bar ? bar.free : room - (plain?.n ?? 0))}</Text>
      </Text>
      {row(els, 'fill', <Text>{ctx.tokens === undefined ? 'no reply yet' : `${kTokens(ctx.tokens)} of ${kTokens(ctx.window)} tokens`}</Text>,
        ctx.usd !== undefined ? <Text dimColor>${ctx.usd.toFixed(2)}</Text> : undefined)}
      {b?.autoCompactAt !== undefined && row(els, 'compact', <Text dimColor>compacts at {kTokens(b.autoCompactAt)}</Text>,
        <Text dimColor>{kTokens(Math.max(0, b.autoCompactAt - b.totalTokens))} to go</Text>)}
      {ctx.limits.map(l => row(els, `limit:${l.kind}`, <Text dimColor>{l.kind.replace('_', ' ')} limit {l.percentUsed}%</Text>,
        l.resetsAt ? <Text dimColor>resets {resetsIn(l.resetsAt, now)}</Text> : undefined))}
      {b && (
        <Box flexDirection="column">
          {head(els, 'feeds', `what feeds it`, b.counted === 'full' ? 'counted' : 'estimated')}
          {b.categories.filter(k => k.kind === 'used').map(k => row(els, `cat:${k.name}`,
            <Text wrap="truncate-end"><Text color={k.color}>■</Text> {k.name}</Text>, <Text>{kTokens(k.tokens)}</Text>))}
          {b.categories.filter(k => k.kind === 'free' || k.kind === 'buffer').map(k => row(els, `cat:${k.name}`,
            <Text dimColor wrap="truncate-end">□ {k.name}</Text>, <Text dimColor>{kTokens(k.tokens)}</Text>))}
          {deferred.length > 0 && (
            <Text dimColor wrap="wrap">deferred, not burning: {deferred.map(k => `${k.name.replace(' (deferred)', '')} ${kTokens(k.tokens)}`).join(' · ')}</Text>
          )}
          {b.servers.length > 0 && head(els, 'mcp', 'mcp servers', 'loaded · deferred')}
          {b.servers.map(s => row(els, `mcp:${s.server}`, <Text wrap="truncate-end">{s.server}</Text>,
            <Text>{kTokens(s.tokens)}<Text dimColor> · {kTokens(s.deferred)}</Text></Text>))}
          {b.memory.length > 0 && head(els, 'memory', 'memory files', '')}
          {b.memory.map(m => row(els, `mem:${m.path}`, <Text wrap="truncate-start">{m.path}</Text>, <Text>{kTokens(m.tokens)}</Text>))}
        </Box>
      )}
      {actions}
    </Box>
  )
}
