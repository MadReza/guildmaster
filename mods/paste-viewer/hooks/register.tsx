import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PastedImage, PastedText, Thumb } from '../types'
import { drawsImages, thumbCells, thumbSvg } from './pictures'
import { findTags, firstLine, lineBreaks, matchesTag, parseSent } from './tags'
import type { TextTag } from './tags'

// Guildmaster's paste viewer. Claude Code folds a long paste into `[Pasted text #n +L lines]`
// and a pasted picture into `[Image #n]`; this mod makes both clickable. In the draft, a band
// above the prompt lists them, one row each; under a sent prompt, a row of chips does. A
// text opens whole in a pane beside the chat, an image in macOS Quick Look.
//
// A paste raises no prompt.edit, and a folded text reaches no hook before it is sent, so the
// draft is read on a timer and a new text tag is matched against the clipboard as it
// appears. A sent prompt carries its pasted texts whole, so its chips need no clipboard.

export const PANE = 'paste-viewer'
const POLL_MS = 250
// The JPEG behind an SVG thumbnail has its longer side JPEG_PX pixels: an Svg's markup is
// at most 128K characters, and a screenshot's PNG is not.
const JPEG_PX = 320

const texts = atom({ plugin: 'paste-viewer', key: 'texts' } as const, [] as PastedText[])
const images = atom({ plugin: 'paste-viewer', key: 'images' } as const, [] as PastedImage[])
// Image sizes and SVG thumbnails by image path; null where sips could not read the image.
const thumbs = atom({ plugin: 'paste-viewer', key: 'thumbs' } as const, {} as Record<string, Thumb | null>)
const viewing = atom({ plugin: 'paste-viewer', key: 'viewing' } as const, null as { title: string; text: string } | null)

let cwd = ''
let root = ''
let imagesDir: string | undefined
// Whether the terminal draws the Image element (kitty graphics), from session.start.
let hasGraphics = false
// Pasted texts by tag number, each read once, when its tag first shows up in the draft.
const pastes = new Map<number, string | null>()
let lastSignature: string | undefined
let isRefreshing = false
const thumbsInFlight = new Set<string>()

// ---- where Claude Code keeps a paste --------------------------------------------------

async function tmpRoot($: EngineInterface): Promise<string> {
  const configured = await $.env.get('CLAUDE_CODE_TMPDIR')
  if (configured !== undefined) return configured
  const { stdout } = await $.process.run(['id', '-u'])
  return `/tmp/claude-${stdout.trim()}`
}

// Pasted images land in <tmp>/<project>/<session>/images/<n>.<ext>, <project> being the
// working directory with every character but letters and digits turned into '-'. That is
// Claude Code's own layout, not an API: the session id alone finds the folder otherwise.
async function findImagesDir($: EngineInterface): Promise<string | undefined> {
  if (imagesDir !== undefined) return imagesDir
  const session = await $.session.id()
  const projects = await $.fs.list(root).catch(() => [])
  const candidates = [cwd.replace(/[^a-zA-Z0-9]/g, '-'), ...projects.filter(p => p.kind === 'dir').map(p => p.name)]
  for (const project of candidates) {
    const path = `${root}/${project}/${session}/images`
    if (await $.fs.exists(path)) return (imagesDir = path)
  }
  return undefined
}

async function findImage($: EngineInterface, n: number): Promise<string | null> {
  const dir = await findImagesDir($)
  if (dir === undefined) return null
  const entries = await $.fs.list(dir).catch(() => [])
  const file = entries.find(entry => entry.kind === 'file' && entry.name.startsWith(`${n}.`))
  return file === undefined ? null : `${dir}/${file.name}`
}

async function readClipboard($: EngineInterface): Promise<string | null> {
  // pbpaste decodes by the locale, which a bare child process may lack.
  const ran = await $.process.run(['pbpaste'], { env: { LANG: 'en_US.UTF-8' }, timeoutMs: 1000 }).catch(() => undefined)
  return ran?.exitCode === 0 && !ran.isStdoutTruncated ? ran.stdout : null
}

async function capturePastes($: EngineInterface, tags: readonly TextTag[]) {
  for (const n of pastes.keys()) if (!tags.some(tag => tag.n === n)) pastes.delete(n)
  const fresh = tags.filter(tag => !pastes.has(tag.n))
  if (fresh.length === 0) return
  // One clipboard stands for one paste: tags arriving together (a draft brought back from
  // history) are left without a preview rather than guessed.
  const clipboard = fresh.length === 1 ? await readClipboard($) : null
  for (const tag of fresh) pastes.set(tag.n, clipboard !== null && matchesTag(clipboard, tag.lines) ? clipboard : null)
}

async function refresh($: EngineInterface, draft: string) {
  const tags = findTags(draft)
  await capturePastes($, tags.texts)
  const signature = JSON.stringify([tags.images, tags.texts.map(tag => [tag.n, pastes.get(tag.n) != null])])
  if (signature === lastSignature) return

  const imageList = await Promise.all(tags.images.map(async n => ({ n, path: await findImage($, n) })))
  // An image whose file has not landed yet is looked for again on the next poll.
  lastSignature = imageList.some(image => image.path === null) ? undefined : signature
  await update($, images, () => imageList)
  for (const image of imageList) if (image.path !== null) void makeThumb($, image.path)
  await update($, texts, () => tags.texts.map(tag => ({ ...tag, text: pastes.get(tag.n) ?? null })))
}

async function poll($: EngineInterface) {
  if (isRefreshing) return
  isRefreshing = true
  try {
    await refresh($, (await $.prompt.read()).text)
  } finally {
    isRefreshing = false
  }
}

// sips (macOS) reads the image's size and writes the small JPEG an SVG thumbnail carries.
async function makeThumb($: EngineInterface, path: string) {
  if (thumbsInFlight.has(path) || (await read($, thumbs))[path] !== undefined) return
  thumbsInFlight.add(path)
  let thumb: Thumb | null = null
  try {
    const sized = await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path], { timeoutMs: 5000 })
    const width = Number(/pixelWidth: (\d+)/.exec(sized.stdout)?.[1])
    const height = Number(/pixelHeight: (\d+)/.exec(sized.stdout)?.[1])
    if (width > 0 && height > 0) {
      thumb = { width, height, jpeg: null }
      const out = `${root}/paste-viewer/${path.replace(/[^a-zA-Z0-9]/g, '-')}.jpg`
      await $.process.run(['mkdir', '-p', `${root}/paste-viewer`])
      const ran = await $.process.run(
        ['sips', '-Z', String(JPEG_PX), '-s', 'format', 'jpeg', '-s', 'formatOptions', '70', path, '--out', out],
        { timeoutMs: 10000 },
      )
      if (ran.exitCode === 0) {
        const { base64 } = await $.fs.read(out, { as: 'bytes' })
        if (base64.length < 120_000) thumb = { ...thumb, jpeg: base64 }
      }
    }
  } catch {
    // No size and no thumbnail: the image keeps its plain row.
  } finally {
    thumbsInFlight.delete(path)
  }
  await update($, thumbs, all => ({ ...all, [path]: thumb }))
}

// ---- what a press opens ---------------------------------------------------------------

async function showText($: EngineInterface, title: string, text: string) {
  await update($, viewing, () => ({ title, text }))
  const opened = await $.ui.open({ id: PANE, title, focus: true, closeOnEscape: true })
  if (!opened.isPlaced) $.ui.toast(`paste-viewer: the pane cannot open here: ${opened.reason}`)
}

// Quick Look opens behind the terminal: once qlmanage is up, System Events brings it to the
// front, looking for it for up to three seconds.
const BRING_FORWARD = `tell application "System Events"
  repeat 30 times
    if exists (process "qlmanage") then
      set frontmost of process "qlmanage" to true
      return
    end if
    delay 0.1
  end repeat
end tell`

// One Quick Look at a time: qlmanage runs while its window is open, and a new one ends the last.
let quickLook: AsyncIterator<unknown> | undefined

function openQuickLook($: EngineInterface, path: string) {
  void quickLook?.return?.()
  const iterator = $.process.spawn({ argv: ['qlmanage', '-p', path] })[Symbol.asyncIterator]()
  quickLook = iterator
  void $.process.run(['osascript', '-e', BRING_FORWARD], { timeoutMs: 5000 }).catch(() => undefined)
  void (async () => {
    try {
      while (!(await iterator.next()).done);
    } catch {
      $.ui.toast("paste-viewer: Quick Look couldn't open the image")
    } finally {
      if (quickLook === iterator) quickLook = undefined
    }
  })()
}

async function openSentImage($: EngineInterface, n: number) {
  const path = await findImage($, n)
  if (path === null) $.ui.toast(`paste-viewer: Image #${n} is no longer on disk`)
  else openQuickLook($, path)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    root = await tmpRoot($)
    hasGraphics = drawsImages({
      CLAUDE_CODE_FORCE_TERMINAL_IMAGES: await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES'),
      CLAUDE_CODE_SESSION_KIND: await $.env.get('CLAUDE_CODE_SESSION_KIND'),
      TMUX: await $.env.get('TMUX'),
      STY: await $.env.get('STY'),
      TERM: await $.env.get('TERM'),
      TERM_PROGRAM: await $.env.get('TERM_PROGRAM'),
      KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'),
    })
    // A reload keeps the state: the texts already read stay matched to their tags.
    for (const paste of await read($, texts)) pastes.set(paste.n, paste.text)
    $.clock.every(POLL_MS, () => poll($))
    return next(e)
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, viewing, () => null)
    return next(e)
  })

  // The draft's pastes, above the prompt. Images are pictures where the surface draws them
  // (kitty graphics on a terminal, SVG on the desktop) and one row each elsewhere.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const imageList = await read($, images)
    const textList = await read($, texts)
    if (imageList.length === 0 && textList.length === 0) return next(e)

    const thumbList = await read($, thumbs)
    const below = await next(e)
    let key = 0
    const hotkey = () => (++key <= 9 ? { hotkey: String(key) } : {})

    let pictures: unknown = null
    let imageRows = imageList
    if (e.surface === 'terminal' && hasGraphics) {
      const { Box, Button, Image } = $.ui.resolve(e)
      const shown = imageList.filter(image => image.path?.endsWith('.png') && thumbList[image.path])
      imageRows = imageList.filter(image => !shown.includes(image))
      if (shown.length > 0) {
        pictures = (
          <Box flexDirection="row" columnGap={2} alignItems="flex-end">
            {shown.map(image => {
              const path = image.path!
              const thumb = thumbList[path]!
              return (
                <Box flexDirection="column" alignItems="center">
                  <Image key={`picture-${image.n}`} source={{ file: path, format: 'png' }} {...thumbCells(thumb.width, thumb.height)} alt={`[Image #${image.n}]`} />
                  <Button key={`image-${image.n}`} plain {...hotkey()} label={`#${image.n}`} onPress={() => openQuickLook($, path)} />
                </Box>
              )
            })}
          </Box>
        )
      }
    } else if (e.surface === 'desktop') {
      const { Box, Button, Svg } = $.ui.resolve(e)
      const shown = imageList.filter(image => image.path !== null && thumbList[image.path]?.jpeg)
      imageRows = imageList.filter(image => !shown.includes(image))
      if (shown.length > 0) {
        pictures = (
          <Box flexDirection="row" columnGap={2} alignItems="flex-end">
            {shown.map(image => {
              const path = image.path!
              const svg = thumbSvg(thumbList[path] as Thumb & { jpeg: string })
              return (
                <Box flexDirection="column" alignItems="center">
                  <Svg source={svg.source} width={svg.width} height={svg.height} alt={`Image #${image.n}`} />
                  <Button key={`image-${image.n}`} {...hotkey()} label={`#${image.n}`} onPress={() => openQuickLook($, path)} />
                </Box>
              )
            })}
          </Box>
        )
      }
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const size = (path: string) => {
      const thumb = thumbList[path]
      return thumb ? ` · ${thumb.width}×${thumb.height}` : ''
    }
    return (
      <Box flexDirection="column">
        {pictures as never}
        {imageRows.map(image => {
          const path = image.path
          return path === null ? (
            <Text dimColor wrap="truncate">{`Image #${image.n} · not found yet`}</Text>
          ) : (
            <Button key={`image-${image.n}`} plain {...hotkey()} label={`Image #${image.n}${size(path)} — Quick Look`} onPress={() => openQuickLook($, path)} />
          )
        })}
        {textList.map(paste => {
          const head = `Pasted text #${paste.n} · ${(paste.lines ?? 0) + 1} lines — `
          const text = paste.text
          return text === null ? (
            <Text dimColor wrap="truncate">{`${head}no preview (clipboard changed)`}</Text>
          ) : (
            <Button
              key={`text-${paste.n}`}
              plain
              {...hotkey()}
              label={`${head}${firstLine(text, width - head.length - 3)}`}
              onPress={() => showText($, `Pasted text #${paste.n}`, text)}
            />
          )
        })}
        <Text dimColor wrap="truncate">click one, or ctrl+x tab then its number: text opens beside the chat, images in Quick Look</Text>
        {below}
      </Box>
    )
  })

  // A sent prompt: its pasted texts folded back to their tags, and a chip for each paste
  // and image under the row Claude Code (or guild-chat) draws. ctrl+o draws it whole.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer' || e.props.isExpanded) return next(e)
    const sent = parseSent(e.props.text)
    if (sent.pastes.length === 0 && sent.images.length === 0) return next(e)
    const drawn = await next(sent.pastes.length > 0 ? { ...e, props: { ...e.props, text: sent.shown } } : e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {drawn}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginLeft={2}>
          {sent.pastes.map(paste => (
            <Button
              key={`${e.requestId}:text-${paste.n}`}
              plain
              dimColor
              label={`▤ Pasted text #${paste.n} · ${paste.lines + 1} lines`}
              onPress={() => showText($, `Pasted text #${paste.n} (sent)`, paste.text)}
            />
          ))}
          {sent.images.map(n => (
            <Button key={`${e.requestId}:image-${n}`} plain dimColor label={`▣ Image #${n}`} onPress={() => openSentImage($, n)} />
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const shown = await read($, viewing)
    if (shown === null) return <Text dimColor>Click a pasted text to see it here.</Text>
    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate">{`${lineBreaks(shown.text.trimEnd()) + 1} lines · ${shown.text.length} chars · ↑↓ scroll · esc close`}</Text>
        <Text>{shown.text}</Text>
      </Box>
    )
  })
}
