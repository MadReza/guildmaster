import type { RenderChildren, SessionContextBreakdown, SessionUsage } from 'claude-code'

import type { SpyglassContext } from '../../types'
import type { Els } from './postings'

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

// A bar of `width` cells, `part` of `whole` filled.
export function bar(part: number, whole: number, width: number): { filled: string; empty: string } {
  const n = whole > 0 ? Math.min(width, Math.max(0, Math.round((part / whole) * width))) : 0
  return { filled: '█'.repeat(n), empty: '░'.repeat(width - n) }
}

export type ContextActions = { refresh: () => void; count: () => void }

export function contextTab({ Box, Text, Button }: Els, ctx: SpyglassContext, width: number, now: number, act: ContextActions): RenderChildren {
  const controls = (
    <Box flexDirection="row" columnGap={1}>
      <Button key="context:refresh" label="Refresh" dimColor onPress={() => act.refresh()} />
      <Button key="context:count" label="Count exactly" dimColor onPress={() => act.count()} />
    </Box>
  )
  if (!ctx.isLoaded) return <Box flexDirection="column">{controls}<Text dimColor>Reading the context…</Text></Box>
  if (ctx.why) return <Box flexDirection="column">{controls}<Text color="#c0392b">The context cannot be read: {ctx.why}</Text></Box>
  const room = Math.max(10, Math.min(40, width - 2))
  const fill = bar(ctx.tokens ?? 0, ctx.window, room)
  const b = ctx.breakdown
  const hot = (ctx.percent ?? 0) >= 80
  return (
    <Box flexDirection="column">
      {controls}
      <Text>
        <Text color={hot ? '#c0392b' : '#d4a017'}>{fill.filled}</Text><Text dimColor>{fill.empty}</Text>
      </Text>
      <Text wrap="truncate-end">
        {ctx.tokens === undefined ? 'no reply yet' : `${kTokens(ctx.tokens)} of ${kTokens(ctx.window)} tokens · ${ctx.percent ?? 0}%`}
        {ctx.usd !== undefined && <Text dimColor> · ${ctx.usd.toFixed(2)}</Text>}
      </Text>
      {b?.autoCompactAt !== undefined && (
        <Text dimColor wrap="truncate-end">compacts at {kTokens(b.autoCompactAt)}, {kTokens(Math.max(0, b.autoCompactAt - b.totalTokens))} from now</Text>
      )}
      {ctx.limits.map(l => (
        <Text key={`limit:${l.kind}`} dimColor wrap="truncate-end">{l.kind}: {l.percentUsed}% used{l.resetsAt ? `, resets ${resetsIn(l.resetsAt, now)}` : ''}</Text>
      ))}
      {b && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>What fills it <Text dimColor>({b.counted === 'full' ? 'counted' : 'estimated'})</Text></Text>
          {b.categories.map(k => {
            const part = bar(k.tokens, b.maxTokens, Math.max(4, Math.min(16, room - 24)))
            return (
              <Text key={`cat:${k.name}`} wrap="truncate-end" dimColor={k.kind !== 'used'}>
                <Text color={k.color}>{part.filled}</Text><Text dimColor>{part.empty}</Text> {kTokens(k.tokens)} {k.name}
              </Text>
            )
          })}
          {b.servers.length > 0 && <Text bold>MCP servers <Text dimColor>(deferred: not in the context until fetched)</Text></Text>}
          {b.servers.map(s => (
            <Text key={`mcp:${s.server}`} wrap="truncate-end">
              {kTokens(s.tokens)} {s.server}{' '}
              <Text dimColor>· {s.tools} {s.tools === 1 ? 'tool' : 'tools'} loaded{s.deferred ? ` · ${kTokens(s.deferred)} deferred` : ''}</Text>
            </Text>
          ))}
          {b.memory.length > 0 && <Text bold>Memory files</Text>}
          {b.memory.map(m => (
            <Text key={`mem:${m.path}`} wrap="truncate-start">{kTokens(m.tokens)} {m.path}</Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
