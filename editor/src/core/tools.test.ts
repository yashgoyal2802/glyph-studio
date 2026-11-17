import { describe, expect, it } from 'vitest'
import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { SWATCHES, clampBrightness, nearestSwatch } from './brightness'
import { idx, isLed, type Point } from './matrix'
import { ellipsePoints, floodFillPoints, linePoints, rectPoints, withSymmetry } from './raster'
import { Stroke, diffPixels } from './stroke'
import { createTool, TOOL_IDS } from './tools'

const blank = () => new Uint8Array(MATRIX_CELLS)
const at = (px: Uint8Array, x: number, y: number) => px[idx(x, y)]
const keys = (ps: Point[]) => new Set(ps.map((p) => `${p.x},${p.y}`))
const noLedCell = (() => { const i = LED_MASK.findIndex((v) => v === 0); return { x: i % MATRIX_SIZE, y: Math.floor(i / MATRIX_SIZE) } })()

function draw(tool: Parameters<typeof createTool>[0], path: Point[], opts: { brightness?: number; base?: Uint8Array; symmetry?: { x: boolean; y: boolean } } = {}) {
  const s = new Stroke(tool, opts.base ?? blank(), { brightness: opts.brightness ?? 255, symmetry: opts.symmetry })
  s.begin(path[0])
  for (const p of path.slice(1, -1)) s.move(p)
  s.end(path[path.length - 1])
  return s
}

describe('raster: line', () => {
  it('includes both ends and is gap-free', () => {
    const pts = linePoints({ x: 2, y: 3 }, { x: 14, y: 9 })
    expect(pts[0]).toEqual({ x: 2, y: 3 })
    expect(pts[pts.length - 1]).toEqual({ x: 14, y: 9 })
    for (let i = 1; i < pts.length; i++) {
      expect(Math.max(Math.abs(pts[i].x - pts[i - 1].x), Math.abs(pts[i].y - pts[i - 1].y))).toBe(1)
    }
  })
  it('handles single points, horizontal, vertical and reversed lines', () => {
    expect(linePoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }])
    expect(linePoints({ x: 3, y: 7 }, { x: 8, y: 7 })).toHaveLength(6)
    expect(linePoints({ x: 4, y: 9 }, { x: 4, y: 2 })).toHaveLength(8)
    // Reversing a line may shift a pixel by rounding, but it must still join the same ends without gaps.
    const rev = linePoints({ x: 9, y: 4 }, { x: 1, y: 1 })
    expect(rev[0]).toEqual({ x: 9, y: 4 })
    expect(rev[rev.length - 1]).toEqual({ x: 1, y: 1 })
    for (let i = 1; i < rev.length; i++) expect(Math.max(Math.abs(rev[i].x - rev[i - 1].x), Math.abs(rev[i].y - rev[i - 1].y))).toBe(1)
  })
})

describe('raster: rectangle and ellipse', () => {
  it('rectangle outline vs filled', () => {
    expect(rectPoints({ x: 2, y: 2 }, { x: 6, y: 5 }, true)).toHaveLength(5 * 4)
    const outline = rectPoints({ x: 2, y: 2 }, { x: 6, y: 5 }, false)
    expect(outline).toHaveLength(5 * 4 - 3 * 2)
    expect(keys(outline).has('4,3')).toBe(false) // hollow middle
    expect(keys(rectPoints({ x: 6, y: 5 }, { x: 2, y: 2 }, false))).toEqual(keys(outline)) // corner order does not matter
  })
  it('ellipse fits its box and the outline is a subset of the fill', () => {
    const a = { x: 4, y: 4 }, b = { x: 18, y: 12 }
    const fill = keys(ellipsePoints(a, b, true))
    const ring = ellipsePoints(a, b, false)
    for (const p of ring) {
      expect(p.x).toBeGreaterThanOrEqual(4); expect(p.x).toBeLessThanOrEqual(18)
      expect(p.y).toBeGreaterThanOrEqual(4); expect(p.y).toBeLessThanOrEqual(12)
      expect(fill.has(`${p.x},${p.y}`)).toBe(true)
    }
    expect(ring.length).toBeLessThan(fill.size)
    expect(fill.has('11,8')).toBe(true) // centre filled
    expect(keys(ring).has('11,8')).toBe(false) // centre hollow in the outline
  })
  it('a circle is symmetric left-right and top-bottom', () => {
    const ring = keys(ellipsePoints({ x: 6, y: 6 }, { x: 18, y: 18 }, false))
    for (const k of ring) {
      const [x, y] = k.split(',').map(Number)
      expect(ring.has(`${24 - x},${y}`)).toBe(true)
      expect(ring.has(`${x},${24 - y}`)).toBe(true)
    }
  })
  it('tiny ellipses degrade to a filled box', () => {
    expect(ellipsePoints({ x: 3, y: 3 }, { x: 4, y: 4 }, false)).toHaveLength(4)
    expect(ellipsePoints({ x: 3, y: 3 }, { x: 3, y: 3 }, false)).toHaveLength(1)
  })
})

describe('raster: flood fill', () => {
  it('fills an enclosed region and nothing outside it', () => {
    const base = blank()
    for (const p of rectPoints({ x: 6, y: 6 }, { x: 18, y: 18 }, false)) base[idx(p.x, p.y)] = 255 // wall
    const s = draw('fill', [{ x: 12, y: 12 }], { brightness: 180, base })
    const out = s.preview()
    expect(at(out, 12, 12)).toBe(180)
    expect(at(out, 7, 7)).toBe(180)
    expect(at(out, 17, 17)).toBe(180)
    expect(at(out, 6, 6)).toBe(255) // wall untouched
    expect(at(out, 12, 3)).toBe(0) // outside untouched
  })
  it('fills everything connected on an empty frame, only on LED cells', () => {
    const out = draw('fill', [{ x: 12, y: 12 }], { brightness: 255 }).preview()
    let lit = 0
    for (let i = 0; i < MATRIX_CELLS; i++) { if (out[i] === 255) { lit++; expect(LED_MASK[i]).toBe(1) } }
    expect(lit).toBe(489)
  })
  it('does nothing when the cell already has the colour, or has no LED', () => {
    const base = blank(); base[idx(12, 12)] = 90
    expect(floodFillPoints(base, { x: 12, y: 12 }, 90)).toEqual([])
    expect(floodFillPoints(blank(), noLedCell, 255)).toEqual([])
    expect(draw('fill', [{ x: 12, y: 12 }], { brightness: 90, base }).change()).toBeNull()
  })
  it('does not leak diagonally through a one-cell wall', () => {
    const base = blank()
    for (let i = 0; i < 25; i++) if (isLed(i, 12 - 0)) base[idx(i, 12)] = 255 // full horizontal wall
    const out = draw('fill', [{ x: 12, y: 5 }], { brightness: 100, base }).preview()
    expect(at(out, 12, 5)).toBe(100)
    expect(at(out, 12, 19)).toBe(0) // other side untouched
  })
  it('works on a gradient region (only the exact value connects)', () => {
    const base = blank(); base[idx(10, 10)] = 50; base[idx(11, 10)] = 50; base[idx(12, 10)] = 60
    const out = draw('fill', [{ x: 10, y: 10 }], { brightness: 200, base }).preview()
    expect(at(out, 10, 10)).toBe(200); expect(at(out, 11, 10)).toBe(200); expect(at(out, 12, 10)).toBe(60)
  })
})

describe('Stroke: pen and eraser', () => {
  it('draws with the chosen brightness and counts the whole drag as ONE change', () => {
    const s = draw('pen', [{ x: 5, y: 12 }, { x: 8, y: 12 }, { x: 11, y: 12 }], { brightness: 255 })
    const c = s.change()!
    expect(c.indices.sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10, 11].map((x) => idx(x, 12)))
    expect(c.before.every((v) => v === 0)).toBe(true)
    expect(c.after.every((v) => v === 255)).toBe(true)
  })
  it('joins sparse pointer samples without gaps', () => {
    const out = draw('pen', [{ x: 3, y: 12 }, { x: 21, y: 12 }]).preview()
    for (let x = 3; x <= 21; x++) expect(at(out, x, 12)).toBe(255)
  })
  it('never writes to a cell without an LED, even when dragged across one', () => {
    const c = noLedCell
    const s = draw('pen', [{ x: c.x, y: c.y + 4 }, { x: c.x, y: c.y }, { x: c.x + 3, y: c.y }])
    const out = s.preview()
    expect(at(out, c.x, c.y)).toBe(0)
    for (let i = 0; i < MATRIX_CELLS; i++) if (!LED_MASK[i]) expect(out[i]).toBe(0)
    for (const i of s.change()?.indices ?? []) expect(LED_MASK[i]).toBe(1)
  })
  it('ignores points outside the grid', () => {
    const out = draw('pen', [{ x: 12, y: 12 }, { x: 40, y: 12 }, { x: -5, y: -5 }]).preview()
    expect(out.every((v) => v === 0 || v === 255)).toBe(true)
    expect(out.length).toBe(MATRIX_CELLS)
  })
  it('eraser paints 0 whatever brightness is selected', () => {
    const base = blank(); base[idx(10, 12)] = 200; base[idx(11, 12)] = 200
    const c = draw('eraser', [{ x: 10, y: 12 }, { x: 11, y: 12 }], { base, brightness: 255 }).change()!
    expect(c.after.every((v) => v === 0)).toBe(true)
    expect(c.before).toEqual([200, 200])
  })
  it('a stroke that changes nothing has no change', () => {
    expect(draw('pen', [{ x: 12, y: 12 }, { x: 13, y: 12 }], { brightness: 0 }).change()).toBeNull()
  })
  it('never modifies the frame it started from', () => {
    const base = blank()
    const copy = base.slice()
    draw('pen', [{ x: 5, y: 12 }, { x: 15, y: 12 }], { base })
    expect(base).toEqual(copy)
  })
})

describe('Stroke: shapes preview and commit', () => {
  it('shows a preview while dragging but commits only when the drag ends', () => {
    const base = blank()
    const s = new Stroke('line', base, { brightness: 255 })
    s.begin({ x: 4, y: 4 })
    s.move({ x: 14, y: 4 })
    expect(at(s.preview(), 9, 4)).toBe(255) // preview visible
    expect(s.change()).toBeNull() // not committed yet
    expect(s.finished).toBe(false)
    s.move({ x: 4, y: 14 }) // preview follows the pointer
    expect(at(s.preview(), 9, 4)).toBe(0)
    expect(at(s.preview(), 4, 9)).toBe(255)
    s.end({ x: 4, y: 14 })
    expect(s.finished).toBe(true)
    expect(s.change()!.indices.length).toBe(11)
    s.move({ x: 20, y: 20 }) // ignored after the end
    expect(s.change()!.indices.length).toBe(11)
  })
  it('every shape tool exists and draws something', () => {
    for (const id of TOOL_IDS.filter((t) => t !== 'eraser')) {
      const s = draw(id, [{ x: 8, y: 8 }, { x: 16, y: 14 }])
      expect(s.change(), id).not.toBeNull()
    }
    // The eraser only changes something on lit cells.
    const lit = blank(); lit[idx(8, 8)] = 255
    expect(draw('eraser', [{ x: 8, y: 8 }, { x: 16, y: 14 }], { base: lit }).change()).not.toBeNull()
    expect(draw('eraser', [{ x: 8, y: 8 }, { x: 16, y: 14 }]).change()).toBeNull()
  })
  it('the last pointer position is included even without a final move event', () => {
    const s = new Stroke('pen', blank(), { brightness: 255 })
    s.begin({ x: 5, y: 12 })
    s.end({ x: 9, y: 12 }) // pressed and released far apart with no move in between
    const out = s.preview()
    for (let x = 5; x <= 9; x++) expect(at(out, x, 12)).toBe(255)
  })
  it('rectangle and ellipse commit their outline vs fill', () => {
    const outline = draw('rect', [{ x: 6, y: 6 }, { x: 14, y: 12 }]).change()!
    const filled = draw('rectFill', [{ x: 6, y: 6 }, { x: 14, y: 12 }]).change()!
    expect(filled.indices.length).toBeGreaterThan(outline.indices.length)
    expect(draw('ellipseFill', [{ x: 6, y: 6 }, { x: 18, y: 18 }]).change()!.indices.length)
      .toBeGreaterThan(draw('ellipse', [{ x: 6, y: 6 }, { x: 18, y: 18 }]).change()!.indices.length)
  })
})

describe('brightness', () => {
  it('has 8 evenly spaced swatches from off to full', () => {
    expect(SWATCHES).toHaveLength(8)
    expect(SWATCHES[0]).toBe(0)
    expect(SWATCHES[7]).toBe(255)
    for (let i = 1; i < 8; i++) expect(SWATCHES[i]).toBeGreaterThan(SWATCHES[i - 1])
  })
  it('an exact value 37 is stored as 37', () => {
    const out = draw('pen', [{ x: 12, y: 12 }], { brightness: 37 }).preview()
    expect(at(out, 12, 12)).toBe(37)
    expect(SWATCHES).not.toContain(37)
  })
  it('clamps and rounds out-of-range values', () => {
    expect(clampBrightness(-5)).toBe(0)
    expect(clampBrightness(999)).toBe(255)
    expect(clampBrightness(36.6)).toBe(37)
    expect(clampBrightness(NaN)).toBe(0)
    expect(draw('pen', [{ x: 12, y: 12 }], { brightness: 1000 }).preview()[idx(12, 12)]).toBe(255)
  })
  it('finds the nearest swatch for an exact value', () => {
    expect(nearestSwatch(0)).toBe(0)
    expect(nearestSwatch(255)).toBe(7)
    expect(nearestSwatch(130)).toBe(SWATCHES.findIndex((v) => v === 146))
  })
})

describe('symmetry', () => {
  it('vertical mirror: column 3 also draws column 21 on the same row', () => {
    const out = draw('pen', [{ x: 3, y: 10 }], { symmetry: { x: true, y: false } }).preview()
    expect(at(out, 3, 10)).toBe(255)
    expect(at(out, 21, 10)).toBe(255)
    expect(at(out, 3, 14)).toBe(0)
  })
  it('horizontal mirror and both axes', () => {
    const h = draw('pen', [{ x: 10, y: 4 }], { symmetry: { x: false, y: true } }).preview()
    expect(at(h, 10, 4)).toBe(255); expect(at(h, 10, 20)).toBe(255)
    const both = draw('pen', [{ x: 8, y: 6 }], { symmetry: { x: true, y: true } }).preview()
    for (const [x, y] of [[8, 6], [16, 6], [8, 18], [16, 18]]) expect(at(both, x, y)).toBe(255)
    expect(both.filter((v) => v === 255)).toHaveLength(4)
  })
  it('applies to every tool, including shapes and fill', () => {
    const rect = draw('rectFill', [{ x: 2, y: 8 }, { x: 5, y: 10 }], { symmetry: { x: true, y: false } }).preview()
    expect(at(rect, 22, 9)).toBe(255)
    const fill = draw('fill', [{ x: 12, y: 12 }], { symmetry: { x: true, y: true } }).preview()
    expect(fill.filter((v) => v === 255)).toHaveLength(489)
  })
  it('a point on the axis is not drawn twice and mirrors of masked cells are skipped', () => {
    expect(withSymmetry({ x: 12, y: 5 }, { x: true, y: false })).toHaveLength(1)
    expect(withSymmetry({ x: 12, y: 12 }, { x: true, y: true })).toHaveLength(1)
    const out = draw('pen', [{ x: noLedCell.x, y: noLedCell.y + 3 }], { symmetry: { x: true, y: true } }).preview()
    for (let i = 0; i < MATRIX_CELLS; i++) if (!LED_MASK[i]) expect(out[i]).toBe(0)
  })
  it('symmetric strokes still count as one change', () => {
    const c = draw('pen', [{ x: 3, y: 10 }, { x: 6, y: 10 }], { symmetry: { x: true, y: false } }).change()!
    expect(c.indices).toHaveLength(8)
  })
})

describe('diffPixels', () => {
  it('lists exactly the changed cells and null when identical', () => {
    const a = blank(), b = blank()
    expect(diffPixels(a, b)).toBeNull()
    b[7] = 9; b[300] = 255
    expect(diffPixels(a, b)).toEqual({ indices: [7, 300], before: [0, 0], after: [9, 255] })
  })
})
