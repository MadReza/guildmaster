import type { RenderChildren } from 'claude-code'

import type { SpyglassChangedFile, SpyglassFileGroup, SpyglassFiles } from '../../types'
import { CRIMSON, delta, foot, head, path, row, type Els } from './ui'

// The files tab: every file the party changed, one group for each working tree it changed them in. The camp's own is
// its branch against where it left the base (git merge-base HEAD origin/HEAD), committed or not, untracked files
// included. A focus of several repositories has no camp worktree but a folder holding projects/<name>, one worktree
// each: each is a group of its own, against where it left its origin's default branch. An adventurer working in a worktree of its own (Claude Code's Agent tool, isolation: worktree) adds its
// worktree as a group the first time it edits a file there. A press on a file opens it in the patron's editor
// (editor: in guild.conf); the tab never shows a diff. What runs git and the editor is in register.tsx.

// git diff --numstat -z --no-renames: "added\tdeleted\tpath\0" for each file, "-\t-\tpath" for a binary one.
export function parseNumstat(z: string): SpyglassChangedFile[] {
  return z.split('\0').filter(Boolean).flatMap(entry => {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/s.exec(entry)
    if (!m) return []
    const [, a = '-', d = '-', path = ''] = m
    return [{ path, added: a === '-' ? 0 : Number(a), deleted: d === '-' ? 0 : Number(d), isBinary: a === '-', isNew: false }]
  })
}

// git ls-files --others --exclude-standard -z, each new file with the lines it holds.
export function untracked(z: string, linesOf: (path: string) => number): SpyglassChangedFile[] {
  return z.split('\0').filter(Boolean).map(path => ({ path, added: linesOf(path), deleted: 0, isBinary: false, isNew: true }))
}

export const lineCount = (text: string) => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0))

// The tracked changes and the new files of one tree, each path once, in path order.
export function merged(tracked: readonly SpyglassChangedFile[], fresh: readonly SpyglassChangedFile[]): SpyglassChangedFile[] {
  const seen = new Set(tracked.map(f => f.path))
  return [...tracked, ...fresh.filter(f => !seen.has(f.path))].sort((a, b) => a.path.localeCompare(b.path))
}

// The command that opens one file: editor: in guild.conf, the file's path given after it as one argument whatever
// it holds.
export const openArgv = (editor: string, path: string) => ['/bin/sh', '-c', `${editor} "$1"`, 'spyglass', path]

export function totals(files: readonly SpyglassChangedFile[]): { added: number; deleted: number } {
  return files.reduce((t, f) => ({ added: t.added + f.added, deleted: t.deleted + f.deleted }), { added: 0, deleted: 0 })
}

export type FilesActions = { open: (group: SpyglassFileGroup, file: SpyglassChangedFile) => void; refresh: () => void }

export function filesTab(els: Els, files: SpyglassFiles, act: FilesActions): RenderChildren {
  const { Box, Text, Button } = els
  const actions = foot(els, [{ key: 'files:refresh', label: 'refresh', run: act.refresh }], 'click a file to open it in the editor')
  if (!files.isLoaded) return <Box flexDirection="column"><Text dimColor>Reading the changes…</Text>{actions}</Box>
  const pad = Math.max(3, ...files.groups.flatMap(g => g.files.map(f => String(f.added).length + 1)))
  return (
    <Box flexDirection="column">
      {files.groups.map((g, i) => {
        const t = totals(g.files)
        const count = `${g.files.length} ${g.files.length === 1 ? 'file' : 'files'} `
        return (
          <Box key={`group:${g.root}`} flexDirection="column">
            {head(els, `head:${g.root}`, g.label, g.why ? '' : <Text><Text dimColor>{count}</Text>{delta(els, t.added, t.deleted, 0)}</Text>, i > 0)}
            {g.why && <Text color={CRIMSON} wrap="truncate-end">{g.why}</Text>}
            {!g.why && g.files.length === 0 && <Text dimColor>No changes.</Text>}
            {g.files.map(f => row(els, `line:${g.root}:${f.path}`,
              <Button key={`file:${g.root}:${f.path}`} plain onPress={() => act.open(g, f)}>{path(els, f.path)}</Button>,
              f.isBinary ? <Text dimColor>binary</Text>
                : f.isNew ? <Text>{delta(els, f.added, 0, pad)}<Text dimColor>new</Text></Text>
                : delta(els, f.added, f.deleted, pad)))}
          </Box>
        )
      })}
      {actions}
    </Box>
  )
}
