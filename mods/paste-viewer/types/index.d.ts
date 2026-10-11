/** A `[Pasted text #n +L lines]` tag in the draft, and the text it stands for when it was caught. */
export type PastedText = { n: number; lines: number | null; text: string | null }
/** An `[Image #n]` tag in the draft, and the file Claude Code saved it to once found. */
export type PastedImage = { n: number; path: string | null }
/** A pasted image's size in pixels, and a small JPEG of it (base64) for surfaces that draw SVG. */
export type Thumb = { width: number; height: number; jpeg: string | null }
/** What the pane shows: one pasted text, under its title. */
export type Viewing = { title: string; text: string } | null

declare module 'claude-code' {
  interface PluginState {
    'paste-viewer': {
      texts: PastedText[]
      images: PastedImage[]
      thumbs: Record<string, Thumb | null>
      viewing: Viewing
    }
  }
}
