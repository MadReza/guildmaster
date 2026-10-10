// The name of the tab last chosen in the pane; empty until one is.
export type SpyglassTab = string

declare module 'claude-code' {
  interface PluginState {
    'guild-spyglass': { tab: SpyglassTab }
  }
}
