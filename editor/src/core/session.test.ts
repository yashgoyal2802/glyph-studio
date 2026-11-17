import { describe, expect, it } from 'vitest'
import { createDesign, createFrame } from '../format/design'
import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE, MAX_HISTORY } from '../generated/shared'
import { idx } from './matrix'
import { toEditorDesign, toWireFrame, type EDesign } from './model'
import { applyOp, inverseOp, OpError, type Op } from './ops'
import { EditSession } from './session'
import { Stroke } from './stroke'
import { clearPixels, flipHorizontal, flipVertical, shiftPixels } from './transforms'
import { diffPixels } from './stroke'

function newSession(frames = 1) {
  const d = createDesign('t')
  d.frames = Array.from({ length: frames }, (_, i) => ({ ...createFrame(), id: `f${i + 1}` }))
  d.frames.forEach((f, i) => { f.layers[0].id = `l${i + 1}` })
  const sent: Op[][] = []
  const s = new EditSession(toEditorDesign(d), (ops) => sent.push(ops))
  return { s, sent }
}

const px = (s: EditSession, frame = 'f1') => s.pixelsOf(frame)!.pixels
const layer = (s: EditSession, frame = 'f1') => s.pixelsOf(frame)!.layerId
const at = (p: Uint8Array, x: number, y: number) => p[idx(x, y)]

function stroke(s: EditSession, path: [number, number][], opts: { frame?: string; brightness?: number; tool?: 'pen' | 'line' } = {}) {
  const frame = opts.frame ?? 'f1'
  const st = new Stroke(opts.tool ?? 'pen', px(s, frame), { brightness: opts.brightness ?? 255 })
  st.begin({ x: path[0][0], y: path[0][1] })
  for (const [x, y] of path.slice(1)) st.move({ x, y })
  const last = path[path.length - 1]
  st.end({ x: last[0], y: last[1] })
  return s.commitPixels('Draw', frame, layer(s, frame), st.change())
}

describe('undo / redo of strokes', () => {
  it('undo returns the canvas exactly to its state before the stroke, redo reapplies it', () => {
    const { s } = newSession()
    const before = px(s).slice()
    expect(stroke(s, [[5, 12], [15, 12]])).toBe(true)
    const after = px(s).slice()
    expect(after).not.toEqual(before)
    expect(s.undo()).toBe(true)
    expect(px(s)).toEqual(before)
    expect(s.redo()).toBe(true)
    expect(px(s)).toEqual(after)
  })

  it('one stroke is one action even when it touches many cells', () => {
    const { s } = newSession()
    stroke(s, [[3, 12], [20, 12]])
    expect(s.history.undoDepth).toBe(1)
    s.undo()
    expect(px(s).every((v) => v === 0)).toBe(true)
  })

  it('undoes several strokes in reverse order', () => {
    const { s } = newSession()
    stroke(s, [[5, 5], [8, 5]])
    stroke(s, [[5, 9], [8, 9]])
    stroke(s, [[5, 13], [8, 13]])
    s.undo(); expect(at(px(s), 5, 13)).toBe(0); expect(at(px(s), 5, 9)).toBe(255)
    s.undo(); expect(at(px(s), 5, 9)).toBe(0); expect(at(px(s), 5, 5)).toBe(255)
    s.undo(); expect(px(s).every((v) => v === 0)).toBe(true)
    expect(s.undo()).toBe(false)
  })

  it('a new action after an undo discards the redo history', () => {
    const { s } = newSession()
    stroke(s, [[5, 5], [8, 5]])
    s.undo()
    expect(s.history.canRedo).toBe(true)
    stroke(s, [[5, 9], [8, 9]])
    expect(s.history.canRedo).toBe(false)
    expect(s.redo()).toBe(false)
  })

  it('keeps at least the last 100 actions and forgets older ones', () => {
    expect(MAX_HISTORY).toBe(100)
    const { s } = newSession()
    // Every stroke gives the same cell a new value, so each one really changes something and counts as an action.
    for (let i = 0; i < 120; i++) expect(stroke(s, [[12, 12]], { brightness: i + 1 })).toBe(true)
    let undone = 0
    while (s.undo()) undone++
    expect(undone).toBe(100)
  })

  it('does nothing when there is nothing to undo or redo, and empty changes are not actions', () => {
    const { s } = newSession()
    expect(s.undo()).toBe(false)
    expect(s.redo()).toBe(false)
    expect(s.commitPixels('x', 'f1', 'l1', null)).toBe(false)
    expect(s.history.undoDepth).toBe(0)
  })

  it('sends the operation on do, the inverse on undo and the original again on redo', () => {
    const { s, sent } = newSession()
    stroke(s, [[5, 12], [7, 12]])
    s.undo()
    s.redo()
    expect(sent).toHaveLength(3)
    const [doOps, undoOps, redoOps] = sent
    expect(doOps[0]).toMatchObject({ t: 'setPixels', values: [255, 255, 255] })
    expect(undoOps[0]).toMatchObject({ t: 'setPixels', values: [0, 0, 0] })
    expect(redoOps).toEqual(doOps)
  })

  it('notifies subscribers on every change', () => {
    const { s } = newSession()
    let n = 0
    const off = s.subscribe(() => n++)
    stroke(s, [[5, 12], [7, 12]]); s.undo(); s.redo()
    expect(n).toBe(3)
    off()
    s.undo()
    expect(n).toBe(3)
  })
})

describe('clear, shift and flip frame', () => {
  function litFrame() {
    const ctx = newSession()
    stroke(ctx.s, [[3, 10], [12, 10]])
    stroke(ctx.s, [[12, 4], [12, 9]])
    return ctx
  }
  const run = (s: EditSession, label: string, next: Uint8Array) => s.commitPixels(label, 'f1', 'l1', diffPixels(px(s), next))

  it('shift left moves every lit pixel one column left and discards what leaves the mask', () => {
    const { s } = newSession()
    stroke(s, [[2, 12], [8, 12]])
    const edge = idx(0, 12)
    expect(LED_MASK[edge]).toBe(1)
    // light the left-most LED of the row so it has to be discarded by the shift
    stroke(s, [[0, 12]])
    const before = px(s).slice()
    expect(run(s, 'Shift left', shiftPixels(px(s), -1, 0))).toBe(true)
    for (let x = 1; x <= 7; x++) expect(at(px(s), x, 12)).toBe(before[idx(x + 1, 12)])
    expect(at(px(s), 24, 12)).toBe(0)
    // the pixel that was at column 0 is gone, nothing wrapped round to the other side
    expect(px(s).filter((v) => v > 0).length).toBe(before.filter((v) => v > 0).length - 1)
    s.undo()
    expect(px(s)).toEqual(before)
  })

  it('shifts in every direction and is a no-op for (0,0)', () => {
    const { s } = litFrame()
    const base = px(s).slice()
    expect(shiftPixels(base, 0, 0)).toEqual(base)
    expect(at(shiftPixels(base, 1, 0), 13, 10)).toBe(255)
    expect(at(shiftPixels(base, 0, 1), 12, 11)).toBe(255)
    expect(at(shiftPixels(base, 0, -1), 12, 9)).toBe(255)
    const far = shiftPixels(base, 30, 0)
    expect(far.every((v) => v === 0)).toBe(true)
    expect(base).toEqual(px(s)) // input untouched
  })

  it('flip horizontal and vertical mirror the picture and are their own inverse', () => {
    const { s } = litFrame()
    const base = px(s).slice()
    const h = flipHorizontal(base)
    expect(at(h, 24 - 3, 10)).toBe(at(base, 3, 10))
    expect(at(h, 24 - 12, 4)).toBe(at(base, 12, 4))
    expect(flipHorizontal(h)).toEqual(base)
    const v = flipVertical(base)
    expect(at(v, 12, 24 - 4)).toBe(at(base, 12, 4))
    expect(flipVertical(v)).toEqual(base)
    expect(run(s, 'Flip', h)).toBe(true)
    s.undo()
    expect(px(s)).toEqual(base)
  })

  it('transforms never put pixels on cells without an LED', () => {
    const full = new Uint8Array(MATRIX_CELLS)
    for (let i = 0; i < MATRIX_CELLS; i++) if (LED_MASK[i]) full[i] = 255
    for (const out of [shiftPixels(full, 3, 2), shiftPixels(full, -5, 1), flipHorizontal(full), flipVertical(full)]) {
      for (let i = 0; i < MATRIX_CELLS; i++) if (!LED_MASK[i]) expect(out[i]).toBe(0)
    }
  })

  it('clear empties the frame, can be undone, and clearing an empty frame is not an action', () => {
    const { s } = litFrame()
    const base = px(s).slice()
    expect(run(s, 'Clear', clearPixels())).toBe(true)
    expect(px(s).every((v) => v === 0)).toBe(true)
    s.undo()
    expect(px(s)).toEqual(base)
    s.undo(); s.undo()
    expect(run(s, 'Clear', clearPixels())).toBe(false)
  })
})

describe('frame operations apply and invert (used by undo of frame edits)', () => {
  const d0 = (frames = 3): EDesign => newSession(frames).s.design
  const ids = (d: EDesign) => d.frames.map((f) => f.id)
  const roundTrip = (d: EDesign, op: Op) => {
    const inv = inverseOp(d, op)
    const after = applyOp(d, op)
    return { after, restored: applyOp(after, inv) }
  }

  it('add frame inserts after the given frame and inverts', () => {
    const d = d0()
    const frame = toWireFrame({ ...d.frames[0], id: 'new' })
    const { after, restored } = roundTrip(d, { t: 'addFrame', frame, afterFrameId: 'f2' })
    expect(ids(after)).toEqual(['f1', 'f2', 'new', 'f3'])
    expect(ids(restored)).toEqual(ids(d))
    expect(ids(applyOp(d, { t: 'addFrame', frame, afterFrameId: null }))).toEqual(['new', 'f1', 'f2', 'f3'])
  })

  it('delete frame inverts back to the same place with the same pixels', () => {
    const { s } = newSession(3)
    stroke(s, [[5, 12], [9, 12]], { frame: 'f2' })
    const d = s.design
    for (const target of ['f1', 'f2', 'f3']) {
      const { after, restored } = roundTrip(d, { t: 'deleteFrame', frameId: target })
      expect(ids(after)).not.toContain(target)
      expect(ids(restored)).toEqual(['f1', 'f2', 'f3'])
      expect(restored.frames.find((f) => f.id === 'f2')!.layers[0]).toEqual(d.frames[1].layers[0])
    }
  })

  it('move frame inverts to the original order', () => {
    const d = d0(4)
    for (const [frameId, afterFrameId] of [['f1', 'f3'], ['f4', null], ['f2', 'f4'], ['f3', 'f1']] as const) {
      const { after, restored } = roundTrip(d, { t: 'moveFrame', frameId, afterFrameId })
      expect(ids(after)).not.toEqual(ids(d))
      expect(ids(restored)).toEqual(['f1', 'f2', 'f3', 'f4'])
    }
    expect(ids(applyOp(d, { t: 'moveFrame', frameId: 'f1', afterFrameId: 'f3' }))).toEqual(['f2', 'f3', 'f1', 'f4'])
    expect(applyOp(d, { t: 'moveFrame', frameId: 'f2', afterFrameId: 'f2' })).toBe(d)
  })

  it('duration, loop and rename invert', () => {
    const d = d0()
    expect(roundTrip(d, { t: 'setDuration', frameId: 'f1', durationMs: 250 }).restored.frames[0].durationMs).toBe(100)
    expect(roundTrip(d, { t: 'setLoop', loop: 'bounce' }).restored.loop).toBe('loop')
    expect(roundTrip(d, { t: 'rename', name: 'X' }).restored.name).toBe('t')
    expect(applyOp(d, { t: 'setDuration', frameId: 'f1', durationMs: 3 }).frames[0].durationMs).toBe(16)
    expect(applyOp(d, { t: 'setDuration', frameId: 'f1', durationMs: 1e9 }).frames[0].durationMs).toBe(60000)
  })

  it('rejects invalid operations without changing anything', () => {
    const d = d0(1)
    const bad: [Op, string][] = [
      [{ t: 'deleteFrame', frameId: 'f1' }, 'at least one frame'],
      [{ t: 'setPixels', frameId: 'f1', layerId: 'l1', indices: [625], values: [1] }, 'out of range'],
      [{ t: 'setPixels', frameId: 'f1', layerId: 'l1', indices: [200], values: [256] }, 'Brightness'],
      [{ t: 'setPixels', frameId: 'f1', layerId: 'nope', indices: [200], values: [1] }, 'Unknown layer'],
      [{ t: 'setPixels', frameId: 'f1', layerId: 'l1', indices: [200, 201], values: [1] }, 'length'],
      [{ t: 'moveFrame', frameId: 'f1', afterFrameId: 'zz' }, 'Unknown frame'],
      [{ t: 'setLoop', loop: 'sideways' as never }, 'Unknown loop'],
      [{ t: 'addFrame', frame: toWireFrame(d.frames[0]), afterFrameId: null }, 'already exists'],
    ]
    for (const [op, msg] of bad) expect(() => applyOp(d, op), msg).toThrow(OpError)
    for (const [op, msg] of bad) expect(() => applyOp(d, op)).toThrow(new RegExp(msg))
    // With more than one frame, an unknown id is what gets reported.
    expect(() => applyOp(d0(2), { t: 'deleteFrame', frameId: 'zz' })).toThrow(/Unknown frame/)
  })

  it('setPixels ignores cells without an LED and does not mutate the original', () => {
    const d = d0(1)
    const noLed = LED_MASK.findIndex((v) => v === 0)
    const out = applyOp(d, { t: 'setPixels', frameId: 'f1', layerId: 'l1', indices: [noLed, idx(12, 12)], values: [255, 99] })
    expect((out.frames[0].layers[0] as { pixels: Uint8Array }).pixels[noLed]).toBe(0)
    expect((out.frames[0].layers[0] as { pixels: Uint8Array }).pixels[idx(12, 12)]).toBe(99)
    expect((d.frames[0].layers[0] as { pixels: Uint8Array }).pixels[idx(12, 12)]).toBe(0)
  })
})

describe('multi-op actions, remote edits and snapshots', () => {
  it('a multi-op action is all-or-nothing and undoes as one', () => {
    const { s } = newSession(2)
    expect(s.perform('Set all', [
      { t: 'setDuration', frameId: 'f1', durationMs: 125 },
      { t: 'setDuration', frameId: 'f2', durationMs: 125 },
    ])).toBe(true)
    expect(s.design.frames.map((f) => f.durationMs)).toEqual([125, 125])
    s.undo()
    expect(s.design.frames.map((f) => f.durationMs)).toEqual([100, 100])
    const before = s.design
    expect(s.perform('Broken', [
      { t: 'setDuration', frameId: 'f1', durationMs: 500 },
      { t: 'setDuration', frameId: 'missing', durationMs: 500 },
    ])).toBe(false)
    expect(s.design).toBe(before)
    expect(s.history.undoDepth).toBe(0)
  })

  it('remote edits show up, are not undoable and are never echoed back', () => {
    const { s, sent } = newSession()
    stroke(s, [[5, 5], [7, 5]])
    sent.length = 0
    expect(s.applyRemote({ t: 'setPixels', frameId: 'f1', layerId: 'l1', indices: [idx(12, 12)], values: [99] })).toBe(true)
    expect(at(px(s), 12, 12)).toBe(99)
    expect(sent).toHaveLength(0)
    expect(s.history.undoDepth).toBe(1)
    s.undo() // undoes only the local stroke
    expect(at(px(s), 5, 5)).toBe(0)
    expect(at(px(s), 12, 12)).toBe(99) // the other device's pixel stays
  })

  it('an invalid remote edit is ignored', () => {
    const { s } = newSession()
    expect(s.applyRemote({ t: 'deleteFrame', frameId: 'nope' })).toBe(false)
  })

  it('undo is dropped (not crashed) when the other device removed the frame it depends on', () => {
    const { s } = newSession(2)
    stroke(s, [[5, 5], [7, 5]], { frame: 'f2' })
    s.applyRemote({ t: 'deleteFrame', frameId: 'f2' })
    expect(s.undo()).toBe(false)
    expect(s.design.frames.map((f) => f.id)).toEqual(['f1'])
    expect(s.history.canUndo).toBe(false)
  })

  it('a fresh snapshot replaces the design and clears history', () => {
    const { s } = newSession()
    stroke(s, [[5, 5], [7, 5]])
    s.replace(toEditorDesign(createDesign('fresh')))
    expect(s.design.name).toBe('fresh')
    expect(s.history.canUndo).toBe(false)
  })

  it('works across the full grid size', () => {
    const { s } = newSession()
    expect(MATRIX_SIZE).toBe(25)
    expect(stroke(s, [[12, 0], [12, 24]])).toBe(true)
    expect(at(px(s), 12, 0)).toBe(255)
    expect(at(px(s), 12, 24)).toBe(255)
  })
})
