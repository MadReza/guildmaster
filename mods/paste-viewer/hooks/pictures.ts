import type { Thumb } from '../types'

// A terminal thumbnail is at most THUMB_ROWS cells tall and THUMB_COLUMNS wide; an SVG one
// THUMB_PX pixels tall.
const THUMB_ROWS = 6
const THUMB_COLUMNS = 32
const THUMB_PX = 96

/**
 * Whether the terminal draws Claude Code's Image element, which needs the kitty graphics
 * protocol (kitty, Ghostty). Claude Code itself turns pictures off in background sessions
 * and inside tmux or screen unless CLAUDE_CODE_FORCE_TERMINAL_IMAGES is set; a multiplexer
 * that names itself in TERM_PROGRAM (herdr) hides the terminal beneath it.
 */
export function drawsImages(env: Record<string, string | undefined>): boolean {
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES) return true
  if (env.CLAUDE_CODE_SESSION_KIND === 'bg' || env.TMUX || env.STY) return false
  const term = env.TERM?.toLowerCase() ?? ''
  return (
    env.KITTY_WINDOW_ID !== undefined ||
    env.TERM_PROGRAM?.toLowerCase() === 'ghostty' ||
    term.includes('kitty') ||
    term.includes('ghostty')
  )
}

/** A terminal thumbnail's cells: THUMB_ROWS tall, as wide as the shape asks, a cell being twice as tall as wide. */
export function thumbCells(width: number, height: number): { columns: number; rows: number } {
  const columns = Math.round((THUMB_ROWS * 2 * width) / height)
  if (columns <= THUMB_COLUMNS) return { columns: Math.max(4, columns), rows: THUMB_ROWS }
  return { columns: THUMB_COLUMNS, rows: Math.max(1, Math.round((THUMB_COLUMNS * height) / (2 * width))) }
}

/** An SVG that shows a thumbnail's JPEG, THUMB_PX tall. */
export function thumbSvg(thumb: Thumb & { jpeg: string }): { source: string; width: number; height: number } {
  const height = THUMB_PX
  const width = Math.round((THUMB_PX * thumb.width) / thumb.height)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image href="data:image/jpeg;base64,${thumb.jpeg}" width="${width}" height="${height}"/></svg>`
  return { source, width, height }
}
