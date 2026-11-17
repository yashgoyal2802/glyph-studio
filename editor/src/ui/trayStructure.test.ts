import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Guards the tray's shape: drawing controls only in Draw, every tool explained, advanced frame actions tucked away. */
const src = readFileSync(join(__dirname, 'Editor.svelte'), 'utf8')
const between = (from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  expect(a, `missing ${from}`).toBeGreaterThan(-1)
  expect(b, `missing ${to}`).toBeGreaterThan(a)
  return src.slice(a, b)
}
const draw = between("{#if trayTab === 'draw'}", "{:else if trayTab === 'edit'}")
const frames = src.slice(src.indexOf('<h3 class="cap">Frame {frameNumber}'), src.indexOf('{/if}', src.indexOf('Pictures</summary>')))

describe('the tray', () => {
  it('has a one-line hint for every tool', () => {
    const tools = [...between('const TOOLS:', 'const TOOL_HINTS').matchAll(/id: '(\w+)'/g)].map((m) => m[1])
    const hints = [...between('const TOOL_HINTS', 'const currentTool').matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1])
    expect(tools.length).toBeGreaterThan(8)
    expect(hints.sort()).toEqual([...tools].sort())
  })

  it('keeps only drawing controls in the Draw tab', () => {
    for (const unwanted of ['Play as toy', 'role="switch"', 'Show on Glyph Matrix', 'Close this tray after', 'autoclose'])
      expect(draw, unwanted).not.toContain(unwanted)
    expect(draw.indexOf('class="tools"')).toBeLessThan(draw.indexOf('Brightness'))
  })

  it('folds outline and solid, rectangle and freehand into press-and-hold keys', () => {
    const tiles = between('const TILES:', 'let lastVariant')
    expect(tiles.match(/key: '/g)?.length).toBe(8)
    for (const pair of ["['rect', 'rectFill']", "['ellipse', 'ellipseFill']", "['select', 'lasso']"]) expect(tiles, pair).toContain(pair)
  })

  it('puts the matrix toggle and the more menu in the top bar', () => {
    const header = between('<header>', '</header>')
    expect(header).toContain('aria-label="Show on Glyph Matrix.')
    expect(header).not.toContain('aria-label="More"') // press and hold the matrix button instead
    expect(header).toContain('aria-label="Undo"')
  })

  it('shows everyday frame actions first and keeps advanced groups collapsible', () => {
    const firstGroup = frames.indexOf('<details class="adv"')
    expect(firstGroup).toBeGreaterThan(0)
    const everyday = frames.slice(0, firstGroup)
    expect(everyday).toContain('How long this frame shows')
    expect(everyday).toContain('Tap the selected frame') // the frame actions live behind a tap on the selected frame
    for (const w of ['Duplicate', 'Move earlier', 'Move later', 'Delete this frame']) expect(src, w).toContain(w)
    expect(frames.match(/<details class="adv"/g)?.length).toBe(4)
    for (const g of ['Fade brightness', 'Loop and onion skin', 'Remove many frames', 'Pictures']) expect(frames, g).toContain(`<summary>${g}</summary>`)
  })
})
