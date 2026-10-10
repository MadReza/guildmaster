import type { RenderChildren } from 'claude-code'

import type { SpyglassDeed, SpyglassDeedKind } from '../../types'
import type { Els } from './postings'

// The activity tab: what this session has done, newest first. Every deed (a tool call) as it runs and how it ended,
// an MCP server's tools marked apart, each adventurer sent and its return, a deed an adventurer did under its name, and
// the notice lines gm printed. Kept for the session only: the guild's tracing holds the longer record. What hooks
// the events is in register.tsx; this file only names and draws.

export const KEEP = 300

export type Filter = 'all' | SpyglassDeedKind
export const FILTERS: readonly { id: Filter; title: string }[] = [
  { id: 'all', title: 'All' },
  { id: 'mcp', title: 'MCP' },
  { id: 'adventurer', title: 'Adventurers' },
  { id: 'notice', title: 'Notices' },
]

const cut = (text: string, n = 160) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

// A tool call as the tab names it: an MCP tool by its server and tool, an Agent call as an adventurer sent, any
// other deed by the tool and the one input that says what it was about.
export function describeCall(tool: string, input: Record<string, unknown>): { kind: SpyglassDeedKind; title: string; detail: string } {
  const text = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
  if (mcp) return { kind: 'mcp', title: `${mcp[1]} · ${mcp[2]}`, detail: cut(JSON.stringify(input)) }
  if (tool === 'Agent' || tool === 'Task') {
    return { kind: 'adventurer', title: `sent ${text('description') || text('subagent_type') || 'an adventurer'}`, detail: cut(text('prompt')) }
  }
  const about = ['command', 'file_path', 'notebook_path', 'pattern', 'url', 'query', 'skill', 'description', 'prompt']
    .map(text).find(Boolean) ?? ''
  return { kind: 'deed', title: tool, detail: cut(about || (Object.keys(input).length ? JSON.stringify(input) : '')) }
}

// gm commands whose output is notice lines, one event each.
export const isNoticeCommand = (command: string) => /(^|[\s;&|(])gm\s+(notice|park|post|phase)\b/.test(command)

export const noticeLines = (stdout: string) => stdout.split('\n').map(l => l.trim()).filter(Boolean)

export const clock = (at: number) => new Date(at).toTimeString().slice(0, 8)

const MARK: Record<SpyglassDeedKind, { glyph: string; color?: string }> = {
  deed: { glyph: '⚒', color: '#8a9199' },
  mcp: { glyph: '✦', color: '#9b59b6' },
  adventurer: { glyph: '⛨', color: '#3fa34d' },
  notice: { glyph: '✎', color: '#d4a017' },
}

export const shownDeeds = (deeds: readonly SpyglassDeed[], filter: Filter) =>
  [...deeds].reverse().filter(d => filter === 'all' || d.kind === filter)

export type ActivityActions = { filter: (f: Filter) => void; clear: () => void }

export function activityTab({ Box, Text, Button }: Els, deeds: readonly SpyglassDeed[], filter: Filter, act: ActivityActions): RenderChildren {
  const rows = shownDeeds(deeds, filter)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {FILTERS.map(f => (
          <Button key={`activity:${f.id}`} label={f.title} dimColor={f.id !== filter} variant={f.id === filter ? 'primary' : undefined}
            onPress={() => act.filter(f.id)} />
        ))}
        <Button key="activity:clear" label="Clear" dimColor onPress={() => act.clear()} />
      </Box>
      {rows.length === 0 && <Text dimColor>Nothing done yet.</Text>}
      {rows.map(d => {
        const mark = MARK[d.kind]
        return (
          <Box key={`deed:${d.id}`} flexDirection="column">
            <Text wrap="truncate-end">
              <Text dimColor>{clock(d.at)} </Text>
              <Text color={mark.color}>{mark.glyph}</Text>{' '}
              {d.who && <Text color="#3fa34d">{d.who} › </Text>}
              <Text bold={d.kind !== 'deed'}>{d.title}</Text>
              {d.status === 'running' && <Text dimColor> …</Text>}
              {d.status === 'error' && <Text color="#c0392b"> ✗</Text>}
            </Text>
            {d.detail && <Box paddingLeft={9}><Text dimColor wrap="truncate-end">{d.detail}</Text></Box>}
          </Box>
        )
      })}
    </Box>
  )
}
