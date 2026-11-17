import { describe, expect, it } from 'vitest'
import { GestureController, type GestureHost, type PtrEvent } from './input'
import { shortcutFor, SHORTCUT_HELP, type KeyLike } from './shortcuts'
import { cellSize, cellAt, DEFAULT_VIEW, gridOrigin, type View } from './viewport'

const CANVAS = { w: 400, h: 600 }

function setup() {
  const calls: string[] = []
  let view: View = DEFAULT_VIEW
  const host: GestureHost = {
    canvasSize: () => CANVAS,
    getView: () => view,
    setView: (v) => { view = v; calls.push('view') },
    strokeBegin: (c) => calls.push(`begin ${c.x},${c.y}`),
    strokeMove: (c) => calls.push(`move ${c.x},${c.y}`),
    strokeEnd: (c) => calls.push(`end ${c.x},${c.y}`),
    strokeCancel: () => calls.push('cancel'),
  }
  const g = new GestureController(host)
  const o = () => gridOrigin(CANVAS, view)
  const cs = () => cellSize(CANVAS, view)
  /** canvas position of the centre of a cell at the current view */
  const at = (cx: number, cy: number) => ({ x: o().x + (cx + 0.5) * cs(), y: o().y + (cy + 0.5) * cs() })
  return { g, calls, getView: () => view, setView: (v: View) => { view = v }, at }
}

const touch = (id: number, x: number, y: number): PtrEvent => ({ id, x, y, pointerType: 'touch', button: 0 })
const mouse = (x: number, y: number, button = 0): PtrEvent => ({ id: 1, x, y, pointerType: 'mouse', button })

describe('touch: one finger draws', () => {
  it('begin on press, move while dragging, end on release', () => {
    const { g, calls, at } = setup()
    const a = at(5, 12), b = at(9, 12), c = at(14, 12)
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerMove(touch(1, b.x, b.y))
    g.pointerUp(touch(1, c.x, c.y))
    expect(calls).toEqual(['begin 5,12', 'move 9,12', 'end 14,12'])
    expect(g.currentMode).toBe('idle')
  })

  it('a press outside the grid starts nothing and ends nothing', () => {
    const { g, calls } = setup()
    g.pointerDown(touch(1, 2, 2))
    g.pointerMove(touch(1, 100, 100))
    g.pointerUp(touch(1, 100, 100))
    expect(calls).toEqual([])
  })

  it('dragging out of the grid keeps the end point on the nearest edge cell', () => {
    const { g, calls, at } = setup()
    const a = at(20, 12)
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerUp(touch(1, 5000, a.y))
    expect(calls).toEqual(['begin 20,12', 'end 24,12'])
  })

  it('a cancelled gesture discards the stroke', () => {
    const { g, calls, at } = setup()
    const a = at(5, 12)
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerCancel(touch(1, a.x, a.y))
    expect(calls).toEqual(['begin 5,12', 'cancel'])
    expect(g.currentMode).toBe('idle')
  })
})

describe('touch: two fingers pinch and pan, and never draw', () => {
  it('a second finger cancels the stroke the first one started and changes no pixel', () => {
    const { g, calls, at } = setup()
    const a = at(8, 12), b = at(16, 12)
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerDown(touch(2, b.x, b.y))
    expect(calls).toEqual(['begin 8,12', 'cancel'])
    // spreading the fingers zooms in and must not produce any further stroke events
    g.pointerMove(touch(2, b.x + 80, b.y))
    g.pointerMove(touch(1, a.x - 80, a.y))
    g.pointerUp(touch(2, b.x + 80, b.y))
    g.pointerUp(touch(1, a.x - 80, a.y))
    expect(calls.filter((c) => c.startsWith('begin') || c.startsWith('move') || c.startsWith('end'))).toEqual(['begin 8,12'])
  })

  it('spreading the fingers zooms in; pinching them zooms out; the point between them stays put', () => {
    const { g, getView, at } = setup()
    const a = at(8, 12), b = at(16, 12)
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const cellUnderMid = cellAt(mid.x, mid.y, CANVAS, getView())
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerDown(touch(2, b.x, b.y))
    g.pointerMove(touch(1, a.x - 40, a.y))
    g.pointerMove(touch(2, b.x + 40, b.y))
    expect(getView().zoom).toBeGreaterThan(1.5)
    expect(cellAt(mid.x, mid.y, CANVAS, getView())).toEqual(cellUnderMid)
    const zoomedIn = getView().zoom
    g.pointerMove(touch(1, a.x, a.y))
    g.pointerMove(touch(2, b.x, b.y))
    expect(getView().zoom).toBeLessThan(zoomedIn)
  })

  it('moving both fingers together pans', () => {
    const { g, getView, setView, at } = setup()
    setView({ zoom: 3, panX: 0, panY: 0 })
    const a = at(8, 12), b = at(12, 12)
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerDown(touch(2, b.x, b.y))
    g.pointerMove(touch(1, a.x + 30, a.y + 10))
    g.pointerMove(touch(2, b.x + 30, b.y + 10))
    expect(getView().panX).toBeGreaterThan(10)
    expect(getView().panY).toBeGreaterThan(0)
    expect(getView().zoom).toBeCloseTo(3, 1)
  })

  it('the finger left after a pinch does not start drawing', () => {
    const { g, calls, at } = setup()
    const a = at(8, 12), b = at(16, 12), c = at(10, 6)
    g.pointerDown(touch(1, a.x, a.y))
    g.pointerDown(touch(2, b.x, b.y))
    g.pointerUp(touch(2, b.x, b.y))
    g.pointerMove(touch(1, c.x, c.y))
    g.pointerUp(touch(1, c.x, c.y))
    expect(calls.filter((x) => x.startsWith('move') || x.startsWith('end'))).toEqual([])
    // a fresh touch afterwards draws normally again
    g.pointerDown(touch(3, a.x, a.y))
    expect(calls[calls.length - 1]).toMatch(/^begin/)
  })

  it('a third finger does not break the pinch', () => {
    const { g, getView, at } = setup()
    const a = at(8, 12), b = at(16, 12), c = at(12, 4)
    g.pointerDown(touch(1, a.x, a.y)); g.pointerDown(touch(2, b.x, b.y)); g.pointerDown(touch(3, c.x, c.y))
    g.pointerMove(touch(2, b.x + 60, b.y))
    expect(getView().zoom).toBeGreaterThan(1)
    expect(g.currentMode).toBe('pinch')
  })
})

describe('mouse', () => {
  it('left button draws', () => {
    const { g, calls, at } = setup()
    const a = at(5, 5), b = at(9, 5)
    g.pointerDown(mouse(a.x, a.y)); g.pointerMove(mouse(b.x, b.y)); g.pointerUp(mouse(b.x, b.y))
    expect(calls).toEqual(['begin 5,5', 'move 9,5', 'end 9,5'])
  })

  it('right button is ignored', () => {
    const { g, calls, at } = setup()
    const a = at(5, 5)
    g.pointerDown(mouse(a.x, a.y, 2)); g.pointerUp(mouse(a.x, a.y, 2))
    expect(calls).toEqual([])
  })

  it('middle button drags the view and does not draw', () => {
    const { g, calls, getView, setView, at } = setup()
    setView({ zoom: 3, panX: 0, panY: 0 })
    const a = at(12, 12)
    g.pointerDown(mouse(a.x, a.y, 1))
    g.pointerMove(mouse(a.x + 25, a.y - 15, 1))
    g.pointerUp(mouse(a.x + 25, a.y - 15, 1))
    expect(getView().panX).toBe(25)
    expect(getView().panY).toBe(-15)
    expect(calls.filter((c) => c !== 'view')).toEqual([])
  })

  it('left button pans while Space is held, and draws again after it is released', () => {
    const { g, calls, getView, setView, at } = setup()
    setView({ zoom: 3, panX: 0, panY: 0 })
    const a = at(12, 12)
    g.setSpaceHeld(true)
    g.pointerDown(mouse(a.x, a.y)); g.pointerMove(mouse(a.x + 10, a.y)); g.pointerUp(mouse(a.x + 10, a.y))
    expect(getView().panX).toBe(10)
    expect(calls.some((c) => c.startsWith('begin'))).toBe(false)
    g.setSpaceHeld(false)
    const b = at(12, 12)
    g.pointerDown(mouse(b.x, b.y))
    expect(calls[calls.length - 1]).toMatch(/^begin/)
  })

  it('the wheel zooms around the cursor, keeping the cell under it fixed', () => {
    const { g, getView } = setup()
    const px = 210, py = 250
    const before = cellAt(px, py, CANVAS, getView())
    g.wheel(px, py, -300)
    expect(getView().zoom).toBeGreaterThan(1)
    expect(cellAt(px, py, CANVAS, getView())).toEqual(before)
    const z = getView().zoom
    g.wheel(px, py, 300)
    expect(getView().zoom).toBeLessThan(z)
    g.wheel(px, py, 1e9)
    expect(getView().zoom).toBe(1) // limited at 1x
  })
})

describe('keyboard shortcuts', () => {
  const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, ...mods })

  it('selects tools', () => {
    expect(shortcutFor(key('p'))).toEqual({ type: 'tool', tool: 'pen' })
    expect(shortcutFor(key('E'))).toEqual({ type: 'tool', tool: 'eraser' }) // caps lock does not matter
    expect(shortcutFor(key('f'))).toEqual({ type: 'tool', tool: 'fill' })
    expect(shortcutFor(key('l'))).toEqual({ type: 'tool', tool: 'line' })
    expect(shortcutFor(key('s'))).toEqual({ type: 'tool', tool: 'select' })
    expect(shortcutFor(key('S', { shiftKey: true }))).toEqual({ type: 'tool', tool: 'lasso' })
    expect(shortcutFor(key('t'))).toEqual({ type: 'tool', tool: 'text' })
    expect(shortcutFor(key('Delete'))).toEqual({ type: 'delete' })
    expect(shortcutFor(key('c', { ctrlKey: true }))).toEqual({ type: 'copy' })
    expect(shortcutFor(key('x', { ctrlKey: true }))).toEqual({ type: 'cut' })
    expect(shortcutFor(key('v', { ctrlKey: true }))).toEqual({ type: 'paste' })
    expect(shortcutFor(key('v', { ctrlKey: true, shiftKey: true }))).toBeNull()
    expect(shortcutFor(key('Escape'))).toEqual({ type: 'deselect' })
    expect(shortcutFor(key('r'))).toEqual({ type: 'tool', tool: 'rect' })
    expect(shortcutFor(key('R', { shiftKey: true }))).toEqual({ type: 'tool', tool: 'rectFill' })
    expect(shortcutFor(key('o'))).toEqual({ type: 'tool', tool: 'ellipse' })
    expect(shortcutFor(key('O', { shiftKey: true }))).toEqual({ type: 'tool', tool: 'ellipseFill' })
  })

  it('undo and redo, on Windows/Linux and Mac', () => {
    expect(shortcutFor(key('z', { ctrlKey: true }))).toEqual({ type: 'undo' })
    expect(shortcutFor(key('z', { metaKey: true }))).toEqual({ type: 'undo' })
    expect(shortcutFor(key('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ type: 'redo' })
    expect(shortcutFor(key('y', { ctrlKey: true }))).toEqual({ type: 'redo' })
  })

  it('Ctrl+S saves', () => {
    expect(shortcutFor(key('s', { ctrlKey: true }))).toEqual({ type: 'save' })
    expect(shortcutFor(key('s', { metaKey: true }))).toEqual({ type: 'save' })
    expect(shortcutFor(key('?', { shiftKey: true }))).toEqual({ type: 'help' })
    expect(shortcutFor(key('q'))).toBeNull() // plain keys we do not use stay free
    expect(shortcutFor(key('S', { ctrlKey: true, shiftKey: true }))).toBeNull() // "save as" stays with the browser
  })

  it('brightness swatches 1-8 (1 = off)', () => {
    for (let i = 1; i <= 8; i++) expect(shortcutFor(key(String(i)))).toEqual({ type: 'swatch', index: i - 1 })
    expect(shortcutFor(key('9'))).toBeNull()
  })

  it('frame navigation, mirroring, shifting, zoom and play', () => {
    expect(shortcutFor(key('['))).toEqual({ type: 'frame', dir: -1 })
    expect(shortcutFor(key('ArrowLeft'))).toEqual({ type: 'frame', dir: -1 })
    expect(shortcutFor(key(']'))).toEqual({ type: 'frame', dir: 1 })
    expect(shortcutFor(key('ArrowRight'))).toEqual({ type: 'frame', dir: 1 })
    expect(shortcutFor(key('x'))).toEqual({ type: 'mirror', axis: 'x' })
    expect(shortcutFor(key('y'))).toEqual({ type: 'mirror', axis: 'y' })
    expect(shortcutFor(key('ArrowLeft', { altKey: true }))).toEqual({ type: 'shift', dx: -1, dy: 0 })
    expect(shortcutFor(key('ArrowDown', { altKey: true }))).toEqual({ type: 'shift', dx: 0, dy: 1 })
    expect(shortcutFor(key('+'))).toEqual({ type: 'zoom', dir: 1 })
    expect(shortcutFor(key('='))).toEqual({ type: 'zoom', dir: 1 })
    expect(shortcutFor(key('-'))).toEqual({ type: 'zoom', dir: -1 })
    expect(shortcutFor(key('0'))).toEqual({ type: 'zoom', dir: 0 })
    expect(shortcutFor(key('Enter'))).toEqual({ type: 'play' })
  })

  it('stays out of the way while typing in a field', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) expect(shortcutFor(key('p', { target: { tagName: tag } }))).toBeNull()
    expect(shortcutFor(key('z', { ctrlKey: true, target: { tagName: 'input' } }))).toBeNull()
    expect(shortcutFor(key('p', { target: { isContentEditable: true } }))).toBeNull()
    expect(shortcutFor(key('p', { target: { tagName: 'BUTTON' } }))).toEqual({ type: 'tool', tool: 'pen' })
  })

  it('does not hijack browser shortcuts', () => {
    for (const k of ['r', 'p', 'f', 'l', 'a', 'w', 't']) expect(shortcutFor(key(k, { ctrlKey: true })), `Ctrl+${k}`).toBeNull()
    expect(shortcutFor(key('r', { metaKey: true }))).toBeNull()
    expect(shortcutFor(key('z', { ctrlKey: true, altKey: true }))).toBeNull()
    expect(shortcutFor(key('q'))).toBeNull()
    expect(shortcutFor(key('F5'))).toBeNull()
  })

  it('every documented shortcut exists', () => {
    expect(SHORTCUT_HELP.length).toBeGreaterThan(8)
    for (const h of SHORTCUT_HELP) expect(h.keys.length > 0 && h.does.length > 0).toBe(true)
  })
})
