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

// One setting as gm config --json prints it: the words it takes when it takes a set of them, several at once when
// isMulti.
export type SpyglassSetting = {
  key: string
  value: string
  source: string
  default: string
  kind: string
  description: string
  env: string
  choices: string[]
  isMulti: boolean
}

// The settings as the configs tab last read them, or why gm could not.
export type SpyglassSettings = { rows: SpyglassSetting[]; why?: string; isLoaded: boolean }

// The context window as the context tab last read it: the status line's fill, cost and rate limits, and, when it
// was estimated or counted, what fills it.
export type SpyglassContext = {
  isLoaded: boolean
  why?: string
  tokens?: number
  window: number
  percent?: number
  usd?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  breakdown?: {
    counted: 'summary' | 'full'
    totalTokens: number
    maxTokens: number
    autoCompactAt?: number
    categories: { name: string; tokens: number; color: string; kind: string }[]
    servers: { server: string; tokens: number; tools: number }[]
    memory: { path: string; tokens: number }[]
  }
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
      settings: SpyglassSettings
      settingOpen: string
      context: SpyglassContext
    }
  }
}
