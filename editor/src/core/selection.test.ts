import { describe, expect, it } from 'vitest'
import { createDesign, createFrame } from '../format/design'
import { LED_MASK, MATRIX_CELLS } from '../generated/shared'
import { idx } from './matrix'
import { toEditorDesign } from './model'
import type { Op } from './ops'
import {
  SelectionState, copyFloating, emptyMask, flipFloating, lassoMask, maskSize, moveFloating, rectMask, rotateFloating,
} from './selection'
import { EditSession } from './session'

const blank = () => new Uint8Array(MATRIX_CELLS)
const at = (p: Uint8Array, x: number, y: number) => p[idx(x, y)]
function lit(cells: [number, number, number][]): Uint8Array {
  const p = blank()
  for (const [x, y, v] of cells) p[idx(x, y)] = v
  return p
}
const litCells = (p: Uint8Array) => [...p.keys()].filter((i) => p[i] > 0)

// A small shape near the middle of the matrix, where every cell has an LED:
//   . X .
//   X X X       (cells (10..12, 10..11))
const SHAPE: [number, number, number][] = [[11, 10, 200], [10, 11, 100], [11, 11, 150], [12, 11, 250]]

describe('selecting', () => {
  it('a rectangle selects the cells inside it, whichever corners come first', () => {
    const a = rectMask({ x: 12, y: 11 }, { x: 10, y: 10 })
    expect(maskSize(a)).toBe(6)
    expect(a[idx(10, 10)] && a[idx(12, 11)]).toBe(1)
    expect(a[idx(13, 10)]).toBe(0)
  })

  it('a rectangle only ever contains cells that have an LED', () => {
    const m = rectMask({ x: 0, y: 0 }, { x: 24, y: 24 })
    expect(maskSize(m)).toBe(LED_MASK.reduce<number>((n, v) => n + v, 0))
    for (let i = 0; i < MATRIX_CELLS; i++) if (m[i]) expect(LED_MASK[i]).toBe(1)
  })

  it('a freehand outline selects the cells it encloses as well as the line itself', () => {
    const m = lassoMask([{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }])
    expect(maskSize(m)).toBe(25) // the full 5 x 5 square
    expect(m[idx(12, 12)]).toBe(1)
    expect(m[idx(15, 12)]).toBe(0)
  })

  it('a freehand line that does not enclose anything selects just the line', () => {
    expect(maskSize(lassoMask([{ x: 10, y: 10 }, { x: 13, y: 10 }]))).toBe(4)
    expect(maskSize(lassoMask([]))).toBe(0)
  })
})

describe('lifting, flipping and rotating pixels', () => {
  it('copies the selected cells into a box that remembers where they were', () => {
    const f = copyFloating(lit(SHAPE), rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))!
    expect(f).toMatchObject({ x: 10, y: 10, w: 3, h: 2 })
    expect([...f.values]).toEqual([0, 200, 0, 100, 150, 250])
    expect(copyFloating(lit(SHAPE), emptyMask())).toBeNull()
  })

  it('flips left to right and top to bottom', () => {
    const f = copyFloating(lit(SHAPE), rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))!
    expect([...flipFloating(f, 'horizontal').values]).toEqual([0, 200, 0, 250, 150, 100])
    expect([...flipFloating(f, 'vertical').values]).toEqual([100, 150, 250, 0, 200, 0])
  })

  it('rotates clockwise: the top becomes the right, the left becomes the top', () => {
    const f = copyFloating(lit(SHAPE), rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))!
    const r = rotateFloating(f, 'clockwise')
    expect(r).toMatchObject({ w: 2, h: 3 })
    // Rows of the 2-wide, 3-tall result: the old bottom row (100, 150, 250) now runs top to bottom on the left.
    expect([...r.values]).toEqual([100, 0, 150, 200, 250, 0])
  })

  it('four turns, or a turn and its opposite, give the original back', () => {
    const f = copyFloating(lit(SHAPE), rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))!
    let r = f
    for (let i = 0; i < 4; i++) r = rotateFloating(r, 'counterclockwise')
    expect([...r.values]).toEqual([...f.values])
    const back = rotateFloating(rotateFloating(f, 'clockwise'), 'counterclockwise')
    expect(back).toMatchObject({ x: f.x, y: f.y, w: f.w, h: f.h })
    expect([...back.values]).toEqual([...f.values])
  })

  it('a rotation stays about the middle of the box', () => {
    const square = copyFloating(lit([[10, 10, 255]]), rectMask({ x: 8, y: 8 }, { x: 12, y: 12 }))! // 5 x 5
    const r = rotateFloating(square, 'clockwise')
    expect(r).toMatchObject({ x: 8, y: 8, w: 5, h: 5 })
  })

  it('moves by whole cells', () => {
    const f = copyFloating(lit(SHAPE), rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))!
    expect(moveFloating(f, 3, -2)).toMatchObject({ x: 13, y: 8 })
  })
})

describe('SelectionState', () => {
  const sel = () => {
    const s = new SelectionState()
    s.select(rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))
    return s
  }

  it('moving three cells right shows the shape there and leaves its old place empty', () => {
    const base = lit(SHAPE)
    const s = sel()
    s.moveBy(base, 3, 0)
    const shown = s.preview(base)
    expect(litCells(shown)).toEqual([idx(14, 10), idx(13, 11), idx(14, 11), idx(15, 11)].sort((a, b) => a - b))
    expect(at(shown, 14, 10)).toBe(200)
    expect(litCells(base).length).toBe(4) // the frame itself is untouched until commit
  })

  it('committing gives one change with exactly the cells that differ', () => {
    const base = lit(SHAPE)
    const s = sel()
    s.moveBy(base, 3, 0)
    const change = s.commit(base)!
    expect(change.indices.length).toBe(8) // 4 cleared and 4 set
    const after = base.slice()
    change.indices.forEach((i, k) => { after[i] = change.after[k] })
    expect(litCells(after).length).toBe(4)
    expect(at(after, 14, 10)).toBe(200)
    expect(s.isFloating).toBe(false)
    expect(s.outline()[idx(14, 10)]).toBe(1) // the selection follows the moved pixels
    expect(s.outline()[idx(11, 10)]).toBe(0)
  })

  it('pixels moved off the matrix, or onto cells without an LED, are dropped', () => {
    const base = lit(SHAPE)
    const s = sel()
    s.moveBy(base, 40, 0)
    const change = s.commit(base)!
    const after = base.slice()
    change.indices.forEach((i, k) => { after[i] = change.after[k] })
    expect(litCells(after).length).toBe(0)
  })

  it('moving there and back changes nothing', () => {
    const base = lit(SHAPE)
    const s = sel()
    s.moveBy(base, 2, 1)
    s.moveBy(base, -2, -1)
    expect(s.commit(base)).toBeNull()
  })

  it('pixels that are off do not wipe what they are dropped on', () => {
    const base = lit([...SHAPE, [13, 11, 90]])
    const s = new SelectionState()
    s.select(rectMask({ x: 10, y: 10 }, { x: 12, y: 11 })) // includes dark cells such as (10, 10)
    s.moveBy(base, 3, 0) // lands on (13, 10..11); (13, 11) holds 90 and the shape puts (13, 11) = 100's neighbour there
    const shown = s.preview(base)
    expect(at(shown, 13, 11)).toBe(100) // the lit pixel from the shape overwrites it
    expect(at(shown, 15, 10)).toBe(0) // a dark corner of the selection leaves the rest alone
  })

  it('flipping a selection commits at once as one change', () => {
    const base = lit(SHAPE)
    const s = sel()
    const change = s.flip(base, 'horizontal')!
    const after = base.slice()
    change.indices.forEach((i, k) => { after[i] = change.after[k] })
    expect(at(after, 10, 11)).toBe(250)
    expect(at(after, 12, 11)).toBe(100)
  })

  it('rotating a selection commits at once and keeps the result selected', () => {
    const base = lit(SHAPE)
    const s = sel()
    const change = s.rotate(base, 'clockwise')!
    expect(change).not.toBeNull()
    expect(s.hasSelection).toBe(true)
    expect(s.isFloating).toBe(false)
  })

  it('delete switches off only the selected cells', () => {
    const base = lit([...SHAPE, [5, 12, 77]])
    const s = sel()
    const change = s.delete(base)!
    expect(change.indices.length).toBe(4)
    expect(change.after.every((v) => v === 0)).toBe(true)
    expect(s.hasSelection).toBe(false)
  })

  it('deleting with nothing selected does nothing', () => {
    expect(new SelectionState().delete(lit(SHAPE))).toBeNull()
  })

  it('a paste stays loose while it is flipped, rotated and positioned, and commits as one change', () => {
    const base = lit([[3, 12, 60]])
    const clip = copyFloating(lit(SHAPE), rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))!
    const s = new SelectionState()
    s.pastePixels(clip, 8, 8)
    expect(s.isPasting).toBe(true)
    expect(s.flip(base, 'horizontal')).toBeNull() // still loose
    s.moveBy(base, 4, 4)
    expect(litCells(s.preview(base)).length).toBe(5) // the pasted 4 + the existing pixel
    const change = s.commit(base)!
    expect(change.indices.length).toBe(4) // only additions; nothing is cleared when pasting
    expect(s.isPasting).toBe(false)
  })

  it('a paste does not clear the cells it covers beyond writing its own lit pixels', () => {
    const base = lit([[12, 12, 90], [13, 12, 90]])
    const clip = copyFloating(lit([[11, 10, 255]]), rectMask({ x: 10, y: 10 }, { x: 12, y: 10 }))!
    const s = new SelectionState()
    s.pastePixels(clip, 11, 12) // the clip's lit pixel lands on (12, 12); its dark ones on (11, 12) and (13, 12)
    const shown = s.preview(base)
    expect(at(shown, 12, 12)).toBe(255)
    expect(at(shown, 13, 12)).toBe(90)
  })

  it('copying gives the selected pixels without changing the frame or the selection', () => {
    const base = lit(SHAPE)
    const s = sel()
    const clip = s.copy(base)!
    expect([...clip.values]).toEqual([0, 200, 0, 100, 150, 250])
    expect(s.isFloating).toBe(false)
  })

  it('clearing the selection forgets it', () => {
    const s = sel()
    s.clear()
    expect(s.hasSelection).toBe(false)
  })
})

describe('selection and the edit session', () => {
  function session() {
    const d = createDesign('t')
    d.frames = [{ ...createFrame(), id: 'f1' }]
    d.frames[0].layers[0].id = 'l1'
    const sent: Op[][] = []
    const s = new EditSession(toEditorDesign(d), (ops) => sent.push(ops))
    s.perform('Setup', [{ t: 'setPixels', frameId: 'f1', layerId: 'l1', indices: SHAPE.map(([x, y]) => idx(x, y)), values: SHAPE.map(([, , v]) => v) }])
    sent.length = 0
    return { s, sent }
  }

  it('nothing is sent to the phone while the selection is being dragged', () => {
    const { s, sent } = session()
    const sel = new SelectionState()
    sel.select(rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))
    const base = s.pixelsOf('f1')!.pixels
    for (let i = 0; i < 5; i++) sel.moveBy(base, 1, 0)
    expect(sent.length).toBe(0)
    expect(litCells(s.pixelsOf('f1')!.pixels).length).toBe(4)
    expect(at(s.pixelsOf('f1')!.pixels, 11, 10)).toBe(200) // the frame has not moved
  })

  it('committing sends one action, and one undo restores the frame', () => {
    const { s, sent } = session()
    const before = s.pixelsOf('f1')!.pixels.slice()
    const sel = new SelectionState()
    sel.select(rectMask({ x: 10, y: 10 }, { x: 12, y: 11 }))
    sel.moveBy(s.pixelsOf('f1')!.pixels, 3, 0)
    expect(s.commitPixels('Move', 'f1', 'l1', sel.commit(s.pixelsOf('f1')!.pixels))).toBe(true)
    expect(sent.length).toBe(1)
    expect(at(s.pixelsOf('f1')!.pixels, 14, 10)).toBe(200)
    expect(s.undo()).toBe(true)
    expect([...s.pixelsOf('f1')!.pixels]).toEqual([...before])
  })
})
