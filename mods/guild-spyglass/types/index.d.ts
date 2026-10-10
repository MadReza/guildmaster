// The name of the tab last chosen in the pane; empty until one is.
export type SpyglassTab = string

// One posting as gm list --json prints it.
export type SpyglassPosting = {
  ref: string
  focus: string
  num: number
  slug: string
  state: string
  updated: string
  summary: string
  why: string | null
  until: string | null
  last: string | null
}

// The quest board as the postings tab last read it, or why gm could not list it.
export type SpyglassPostings = { rows: SpyglassPosting[]; why?: string; isLoaded: boolean }

// One file the party changed in one working tree: its path in that tree and its lines added and deleted.
export type SpyglassChangedFile = { path: string; added: number; deleted: number; isBinary: boolean; isNew: boolean }

// One working tree's changes: the camp's own, or an adventurer's worktree; why, when git could not read it.
export type SpyglassFileGroup = { root: string; label: string; isCamp: boolean; files: SpyglassChangedFile[]; why?: string }

// The files tab as it last read the trees.
export type SpyglassFiles = { groups: SpyglassFileGroup[]; isLoaded: boolean }

// A working tree an adventurer changed files in, apart from the camp, and the adventurer's name.
export type SpyglassTree = { root: string; label: string }

// What one activity row is: a deed (a tool call), an MCP server's tool, an adventurer sent or returned, a gm notice.
export type SpyglassDeedKind = 'deed' | 'mcp' | 'adventurer' | 'notice'

// One row of the activity tab: when, what, who did it (empty for this session itself), and how it ended.
export type SpyglassDeed = {
  id: string
  at: number
  kind: SpyglassDeedKind
  who: string
  title: string
  detail: string
  status: 'running' | 'ok' | 'error'
}

declare module 'claude-code' {
  interface PluginState {
    'guild-spyglass': {
      tab: SpyglassTab
      postings: SpyglassPostings
      postingsAll: boolean
      postingOpen: string
      files: SpyglassFiles
      trees: SpyglassTree[]
      deeds: SpyglassDeed[]
      activityFilter: string
    }
  }
}
