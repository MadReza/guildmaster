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

declare module 'claude-code' {
  interface PluginState {
    'guild-spyglass': {
      tab: SpyglassTab
      postings: SpyglassPostings
      postingsAll: boolean
      postingOpen: string
    }
  }
}
