import type { Elements, RenderChildren } from 'claude-code'

import type { SpyglassSetting, SpyglassSettings } from '../../types'
import { CRIMSON, foot, GOLD, row } from './ui'

// The configs tab: every setting in guild.conf as gm config --json gives it, with its value and where it came from.
// A press on a setting opens it to its description and its controls: a button for each value a switch or a choice
// takes, a button for each word a list of words takes (pressed to add or take one away), a field for anything else,
// and Default to take the line out of guild.conf. Every change goes through the guild's gm (gm config set), which
// checks it, acts on it and says what it did. The guild's mods have no options of their own: guild.conf is where
// they are set. What runs gm is in register.tsx.

// A surface without a text field (the mobile app) shows a free value without one.
export type ConfigEls = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & Partial<Pick<Elements['terminal'], 'Input'>>

export function parseSettings(json: string): SpyglassSetting[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(value)) return []
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  return value.flatMap((v: unknown) => {
    const o = (v ?? {}) as Record<string, unknown>
    if (typeof o.key !== 'string') return []
    return [{
      key: o.key, value: text(o.value), source: text(o.source), default: text(o.default), kind: text(o.kind),
      description: text(o.description), env: text(o.env),
      choices: Array.isArray(o.choices) ? o.choices.filter((c): c is string => typeof c === 'string') : [],
      isMulti: o.isMulti === true,
    }]
  })
}

// The words a list setting holds after one is pressed: added or taken away. none stands alone, as gm takes it.
export function toggledWords(current: string, word: string): string[] {
  const words = current.split(/\s+/).filter(Boolean)
  if (word === 'none') return ['none']
  const rest = words.filter(w => w !== 'none')
  return rest.includes(word) ? rest.filter(w => w !== word) : [...rest, word]
}

export const fromFile = (s: SpyglassSetting) => s.source !== 'default' && !s.source.startsWith('environment')

export type ConfigsActions = {
  toggle: (key: string) => void
  set: (key: string, words: string[]) => void
  unset: (key: string) => void
  refresh: () => void
}

function controls(els: ConfigEls, s: SpyglassSetting, act: ConfigsActions): RenderChildren {
  const { Box, Text, Button, Input } = els
  const reset = fromFile(s) && (
    <Button key={`unset:${s.key}`} plain onPress={() => act.unset(s.key)}><Text dimColor>default</Text></Button>
  )
  if (s.choices.length) {
    const held = s.value.split(/\s+/)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap">
          {s.choices.map((c, i) => {
            const isHeld = s.isMulti ? held.includes(c) : s.value === c
            return (
              <Button key={`set:${s.key}:${c}`} plain onPress={() => (s.isMulti ? act.set(s.key, toggledWords(s.value, c)) : act.set(s.key, [c]))}>
                {i > 0 ? <Text dimColor> · </Text> : ''}{isHeld ? <Text color={GOLD} bold>{c}</Text> : <Text dimColor>{c}</Text>}
              </Button>
            )
          })}
        </Box>
        {s.isMulti && <Text dimColor>a press adds a word or takes it away</Text>}
        {reset}
      </Box>
    )
  }
  if (!Input) return <Text dimColor>{`gm config set ${s.key} <value> changes it.`}</Text>
  return (
    <Box flexDirection="column">
      <Input key={`input:${s.key}`} value={s.value} placeholder={s.default || 'a value'} submitLabel="set"
        onSubmit={value => act.set(s.key, value.trim().split(/\s+/).filter(Boolean))} />
      {reset}
    </Box>
  )
}

// Where a value came from, in a word: the file, the environment, or nothing for the default.
export const sourceWord = (s: SpyglassSetting) => (s.source === 'default' ? '' : s.source.startsWith('environment') ? 'env' : s.source.startsWith('ignored') ? 'ignored' : 'file')

export function configsTab(els: ConfigEls, settings: SpyglassSettings, open: string, act: ConfigsActions): RenderChildren {
  const { Box, Text, Button } = els
  const actions = foot(els, [{ key: 'configs:refresh', label: 'refresh', run: act.refresh }], 'click a setting to change it')
  if (!settings.isLoaded) return <Box flexDirection="column"><Text dimColor>Reading guild.conf…</Text>{actions}</Box>
  if (settings.why) return <Box flexDirection="column"><Text color={CRIMSON}>gm cannot read the settings: {settings.why}</Text>{actions}</Box>
  return (
    <Box flexDirection="column">
      {settings.rows.map(s => {
        const isOpen = open === s.key
        const from = sourceWord(s)
        return (
          <Box key={`setting:${s.key}`} flexDirection="column" marginBottom={isOpen ? 1 : 0}>
            {row(els, `line:${s.key}`,
              <Button key={`setting-key:${s.key}`} plain onPress={() => act.toggle(s.key)}>
                {isOpen ? <Text color={GOLD} bold>{s.key}</Text> : <Text>{s.key}</Text>}
              </Button>,
              <Text wrap="truncate-end">{s.value ? <Text bold={from === 'file'}>{s.value}</Text> : <Text dimColor>none</Text>}{from && <Text dimColor> · {from}</Text>}</Text>)}
            {isOpen && (
              <Box flexDirection="column" paddingLeft={2}>
                <Text dimColor>{s.description}</Text>
                {s.default && <Text dimColor>default {s.default}</Text>}
                {s.source.startsWith('environment') && (
                  <Text color={GOLD}>{s.env} overrides it in this session; a change to guild.conf counts where {s.env} is not set.</Text>
                )}
                {controls(els, s, act)}
              </Box>
            )}
          </Box>
        )
      })}
      {actions}
    </Box>
  )
}
