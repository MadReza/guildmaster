/** What the lexicon's popup shows: one phrase, its TL;DR (null while it is looked up) and where it came from. */
export type Shown = { phrase: string; tldr: string | null; source: string } | null

declare module 'claude-code' {
  interface PluginState {
    'guild-lexicon': {
      shown: Shown
    }
  }
}
