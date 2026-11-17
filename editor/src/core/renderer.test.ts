import { describe, expect, it } from 'vitest'
import { LED_COUNT, LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { idx } from './matrix'
import { DARK_THEME, MatrixRenderer, type Ctx2D } from './renderer'
import { baseCellSize, cellAt, cellSize, clampView, gridOrigin, nearestCell, panBy, zoomAt } from './viewport'

class FakeCtx implements Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern = ''
  rects: { x: number; y: number; w: number; h: number; style: unknown }[] = []
  arcs: { x: number; y: number; r: number; style: unknown }[] = []
  transforms: number[][] = []
  fillRect(x: number, y: number, w: number, h: number) { this.rects.push({ x, y, w, h, style: this.fillStyle }) }
  beginPath() {}
  arc(x: number, y: number, r: number) { this.arcs.push({ x, y, r, style: this.fillStyle }) }
  fill() {}
  setTransform(...a: number[]) { this.transforms.push(a) }
  reset() { this.rects = []; this.arcs = [] }
}

const SIZE = { w: 400, h: 600 }
const blank = () => new Uint8Array(MATRIX_CELLS)
const led = LED_MASK.findIndex((v) => v === 1)
const noLed = LED_MASK.findIndex((v) => v === 0)

function setup() {
  const ctx = new FakeCtx()
  const r = new MatrixRenderer(ctx, { ...DARK_THEME, glow: null }) // no halo: these tests count the LED discs themselves
  r.resize(SIZE, 2)
  return { ctx, r }
}

describe('MatrixRenderer', () => {
  it('tints selected cells and repaints only the cells whose selection changed', () => {
    const { ctx, r } = setup()
    r.draw(blank())
    const sel = blank()
    sel[led] = 1
    ctx.reset()
    expect(r.draw(blank(), undefined, sel)).toBe(1)
    expect(ctx.rects).toHaveLength(1)
    const tint = ctx.rects[0].style
    expect(r.draw(blank(), undefined, sel)).toBe(0) // unchanged: nothing redrawn
    ctx.reset()
    expect(r.draw(blank())).toBe(1) // selection removed: that one cell goes back
    expect(ctx.rects[0].style).not.toBe(tint)
  })

  it('draws exactly the 489 LED cells on the first paint and never a cell without an LED', () => {
    const { ctx, r } = setup()
    expect(r.draw(blank())).toBe(LED_COUNT)
    expect(ctx.arcs).toHaveLength(LED_COUNT)
    // Compare every drawn circle centre with the cells that have no LED: none may coincide.
    const cell = cellSize(SIZE, { zoom: 1, panX: 0, panY: 0 })
    const o = gridOrigin(SIZE, { zoom: 1, panX: 0, panY: 0 })
    const drawnCells = new Set(ctx.arcs.map((a) => Math.floor((a.y - o.y) / cell) * MATRIX_SIZE + Math.floor((a.x - o.x) / cell)))
    expect(drawnCells.size).toBe(LED_COUNT)
    for (const c of drawnCells) expect(LED_MASK[c]).toBe(1)
    expect(drawnCells.has(noLed)).toBe(false)
  })

  it('applies the device pixel ratio and paints a background first', () => {
    const { ctx, r } = setup()
    r.draw(blank())
    expect(ctx.transforms[0]).toEqual([2, 0, 0, 2, 0, 0])
    expect(ctx.rects[0]).toMatchObject({ x: 0, y: 0, w: 400, h: 600 })
  })

  it('redraws only the changed cell afterwards', () => {
    const { ctx, r } = setup()
    const px = blank()
    r.draw(px)
    ctx.reset()
    px[led] = 255
    expect(r.draw(px)).toBe(1)
    expect(ctx.arcs).toHaveLength(1)
    expect(ctx.rects).toHaveLength(1) // one background clear for that cell only
  })

  it('does nothing when nothing changed', () => {
    const { ctx, r } = setup()
    const px = blank()
    r.draw(px)
    ctx.reset()
    expect(r.draw(px)).toBe(0)
    expect(ctx.arcs).toHaveLength(0)
    expect(ctx.rects).toHaveLength(0)
  })

  it('repaints everything after a resize, a view change or invalidate()', () => {
    const { r } = setup()
    const px = blank()
    r.draw(px)
    r.resize({ w: 300, h: 300 }, 1)
    expect(r.draw(px)).toBe(LED_COUNT)
    r.setView({ zoom: 2, panX: 10, panY: 0 })
    expect(r.draw(px)).toBe(LED_COUNT)
    expect(r.draw(px)).toBe(0)
    r.invalidate()
    expect(r.draw(px)).toBe(LED_COUNT)
  })

  it('draws brighter values in a different shade than dim ones and than off', () => {
    const { ctx, r } = setup()
    const px = blank()
    px[led] = 40
    px[led + 1] = 255
    r.draw(px)
    const styleOf = (cellIndex: number) => {
      const cell = cellSize(SIZE, { zoom: 1, panX: 0, panY: 0 })
      const o = gridOrigin(SIZE, { zoom: 1, panX: 0, panY: 0 })
      const x = o.x + (cellIndex % MATRIX_SIZE) * cell + cell / 2
      const y = o.y + Math.floor(cellIndex / MATRIX_SIZE) * cell + cell / 2
      return ctx.arcs.find((a) => Math.abs(a.x - x) < 0.01 && Math.abs(a.y - y) < 0.01)!.style
    }
    const styles = new Set([styleOf(led), styleOf(led + 1), styleOf(idx(12, 12))])
    expect(styles.size).toBe(3)
    expect(styleOf(led + 1)).toBe('rgb(255,255,255)')
  })

  it('shows a faint ghost only on unlit LEDs', () => {
    const { ctx, r } = setup()
    const px = blank()
    const ghost = blank()
    px[led] = 200
    ghost[led] = 255
    ghost[led + 1] = 255
    r.draw(px, ghost)
    const off = ctx.arcs.find((a) => a.style === 'rgb(38,38,42)')
    expect(off).toBeDefined()
    const styles = new Set(ctx.arcs.map((a) => a.style))
    expect(styles.has('rgb(255,255,255)')).toBe(false) // value 200 is not full white
    // led (value 200) ignores the ghost; led+1 (unlit, ghost 255) gets a tinted style that is not the plain off colour.
    expect([...styles].some((s) => s !== 'rgb(38,38,42)' && typeof s === 'string' && s.startsWith('rgb(') )).toBe(true)
  })

  it('draws lit LEDs on the dark theme as a soft body with a brighter core', () => {
    const lit = blank()
    lit[led] = 255
    const soft = new FakeCtx()
    const a = new MatrixRenderer(soft, DARK_THEME)
    a.resize(SIZE, 1)
    a.draw(lit)
    const plain = new FakeCtx()
    const b = new MatrixRenderer(plain, { ...DARK_THEME, glow: null })
    b.resize(SIZE, 1)
    b.draw(lit)
    expect(soft.arcs.length).toBe(plain.arcs.length + 1) // one extra disc: the core
    const core = soft.arcs.find((x) => x.style === 'rgb(255,255,255)')!
    const body = soft.arcs.find((x) => x.x === core.x && x.y === core.y && x.r > core.r)!
    expect(body.style).not.toBe(core.style)
  })

  it('ignores zero-sized canvases', () => {
    const ctx = new FakeCtx()
    const r = new MatrixRenderer(ctx)
    expect(r.draw(blank())).toBe(0)
    expect(ctx.arcs).toHaveLength(0)
  })
})

describe('viewport', () => {
  const v1 = { zoom: 1, panX: 0, panY: 0 }

  it('fits the whole grid at zoom 1', () => {
    const cell = cellSize(SIZE, v1)
    expect(cell * MATRIX_SIZE).toBeLessThanOrEqual(Math.min(SIZE.w, SIZE.h))
    const o = gridOrigin(SIZE, v1)
    expect(o.x).toBeGreaterThanOrEqual(0)
    expect(o.x + cell * MATRIX_SIZE).toBeLessThanOrEqual(SIZE.w)
  })

  it('maps pointer positions to cells and back', () => {
    const cell = cellSize(SIZE, v1)
    const o = gridOrigin(SIZE, v1)
    expect(cellAt(o.x + cell * 0.5, o.y + cell * 0.5, SIZE, v1)).toEqual({ x: 0, y: 0 })
    expect(cellAt(o.x + cell * 12.5, o.y + cell * 7.5, SIZE, v1)).toEqual({ x: 12, y: 7 })
    expect(cellAt(o.x + cell * 24.99, o.y + cell * 24.99, SIZE, v1)).toEqual({ x: 24, y: 24 })
    expect(cellAt(o.x - 1, o.y + 10, SIZE, v1)).toBeNull()
    expect(cellAt(o.x + cell * 25 + 1, o.y + 10, SIZE, v1)).toBeNull()
  })

  it('nearestCell clamps positions outside the grid', () => {
    expect(nearestCell(-500, -500, SIZE, v1)).toEqual({ x: 0, y: 0 })
    expect(nearestCell(5000, 5000, SIZE, v1)).toEqual({ x: 24, y: 24 })
  })

  it('zooming keeps the point under the fingers fixed', () => {
    const fx = 150, fy = 220
    const before = cellAt(fx, fy, SIZE, v1)!
    const z = zoomAt(v1, 3, fx, fy, SIZE)
    expect(z.zoom).toBe(3)
    expect(cellAt(fx, fy, SIZE, z)).toEqual(before)
    const z2 = zoomAt(z, 0.5, fx, fy, SIZE)
    expect(cellAt(fx, fy, SIZE, z2)).toEqual(before)
  })

  it('limits zoom to 1x-8x and keeps part of the grid reachable', () => {
    expect(zoomAt(v1, 100, 200, 300, SIZE).zoom).toBe(8)
    expect(zoomAt(v1, 0.01, 200, 300, SIZE)).toBe(v1)
    const far = panBy({ zoom: 4, panX: 0, panY: 0 }, 1e6, -1e6, SIZE)
    const o = gridOrigin(SIZE, far)
    const total = baseCellSize(SIZE) * 4 * MATRIX_SIZE
    expect(o.x).toBeLessThan(SIZE.w) // grid not fully off the right edge
    expect(o.y + total).toBeGreaterThan(0) // nor off the top
    expect(clampView({ zoom: 99, panX: 0, panY: 0 }, SIZE).zoom).toBe(8)
  })
})
