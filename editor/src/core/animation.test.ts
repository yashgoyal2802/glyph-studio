import { describe, expect, it } from 'vitest'
import { createDesign, createFrame, serializeDesign } from '../format/design'
import { LED_MASK, MATRIX_CELLS } from '../generated/shared'
import {
  addBlankFrameOp, deleteFrameOp, duplicateFrameOp, moveFrameToIndexOp, selectionAfterDelete, setAllDurationsOps,
} from './frames'
import { idx } from './matrix'
import { pixelsLayerOf, toEditorDesign, type EDesign } from './model'
import { onionPixels } from './onion'
import { AnimationPlayer, type Timers } from './player'
import { EditSession } from './session'

const led = LED_MASK.findIndex((v) => v === 1)

/** A design with [n] frames with ids f1..fn, layer ids l1..ln, and frame k lit at one cell with brightness k*10. */
function make(n: number, durations?: number[]): EditSession {
  const d = createDesign('anim')
  d.frames = Array.from({ length: n }, (_, i) => {
    const f = createFrame(durations?.[i] ?? 100)
    return { ...f, id: `f${i + 1}`, layers: [{ ...f.layers[0], id: `l${i + 1}` }] }
  })
  const s = new EditSession(toEditorDesign(d))
  for (let i = 0; i < n; i++) s.perform('paint', [{ t: 'setPixels', frameId: `f${i + 1}`, layerId: `l${i + 1}`, indices: [led], values: [(i + 1) * 10] }])
  s.history.clear()
  return s
}
const ids = (d: EDesign) => d.frames.map((f) => f.id)
const px = (d: EDesign, id: string) => pixelsLayerOf(d.frames.find((f) => f.id === id)!)!.pixels

describe('frame strip: add', () => {
  it('adds an empty frame after the chosen one, taking its duration', () => {
    const s = make(3, [100, 250, 100])
    const op = addBlankFrameOp(s.design, 'f2')
    expect(s.perform('Add frame', [op])).toBe(true)
    expect(s.design.frames).toHaveLength(4)
    expect(s.design.frames[2].durationMs).toBe(250)
    expect(px(s.design, s.design.frames[2].id).every((v) => v === 0)).toBe(true)
    expect(ids(s.design).slice(0, 2)).toEqual(['f1', 'f2'])
    s.undo()
    expect(ids(s.design)).toEqual(['f1', 'f2', 'f3'])
  })
  it('can add at the very start', () => {
    const s = make(2)
    s.perform('Add', [addBlankFrameOp(s.design, null)])
    expect(s.design.frames[1].id).toBe('f1')
    expect(s.design.frames).toHaveLength(3)
  })
})

describe('frame strip: duplicate', () => {
  it('duplicating frame 2 of 4 inserts an identical frame as frame 3, giving 5 frames', () => {
    const s = make(4)
    expect(s.perform('Duplicate', [duplicateFrameOp(s.design, 'f2')!])).toBe(true)
    expect(s.design.frames).toHaveLength(5)
    expect(s.design.frames[1].id).toBe('f2')
    const copy = s.design.frames[2]
    expect(copy.id).not.toBe('f2')
    expect(copy.durationMs).toBe(s.design.frames[1].durationMs)
    expect(px(s.design, copy.id)).toEqual(px(s.design, 'f2'))
    expect(copy.layers[0].id).not.toBe(s.design.frames[1].layers[0].id) // new layer ids too
    expect(ids(s.design).slice(3)).toEqual(['f3', 'f4'])
  })
  it('the copy is independent of the original', () => {
    const s = make(2)
    s.perform('Duplicate', [duplicateFrameOp(s.design, 'f1')!])
    const copy = s.design.frames[1]
    s.perform('paint', [{ t: 'setPixels', frameId: copy.id, layerId: copy.layers[0].id, indices: [led], values: [200] }])
    expect(px(s.design, copy.id)[led]).toBe(200)
    expect(px(s.design, 'f1')[led]).toBe(10)
  })
  it('is undoable and null for an unknown frame', () => {
    const s = make(3)
    s.perform('Duplicate', [duplicateFrameOp(s.design, 'f3')!])
    s.undo()
    expect(ids(s.design)).toEqual(['f1', 'f2', 'f3'])
    expect(duplicateFrameOp(s.design, 'nope')).toBeNull()
  })
})

describe('frame strip: delete', () => {
  it('removes a frame, can be undone with its pixels, and tells where to select next', () => {
    const s = make(3)
    expect(selectionAfterDelete(s.design, 'f2')).toBe('f3')
    expect(selectionAfterDelete(s.design, 'f3')).toBe('f2')
    expect(selectionAfterDelete(s.design, 'f1')).toBe('f2')
    s.perform('Delete', [deleteFrameOp(s.design, 'f2')!])
    expect(ids(s.design)).toEqual(['f1', 'f3'])
    s.undo()
    expect(ids(s.design)).toEqual(['f1', 'f2', 'f3'])
    expect(px(s.design, 'f2')[led]).toBe(20)
  })
  it('is unavailable when only one frame remains', () => {
    const s = make(1)
    expect(deleteFrameOp(s.design, 'f1')).toBeNull()
    expect(selectionAfterDelete(s.design, 'f1')).toBeNull()
    expect(deleteFrameOp(make(2).design, 'nope')).toBeNull()
  })
})

describe('frame strip: reorder', () => {
  const order = (s: EditSession, frameId: string, to: number) => {
    const op = moveFrameToIndexOp(s.design, frameId, to)
    if (op) s.perform('Move', [op])
    return ids(s.design)
  }
  it('moves a frame to any position', () => {
    expect(order(make(4), 'f1', 2)).toEqual(['f2', 'f3', 'f1', 'f4'])
    expect(order(make(4), 'f4', 0)).toEqual(['f4', 'f1', 'f2', 'f3'])
    expect(order(make(4), 'f2', 3)).toEqual(['f1', 'f3', 'f4', 'f2'])
    expect(order(make(4), 'f3', 1)).toEqual(['f1', 'f3', 'f2', 'f4'])
  })
  it('does nothing for the same position, clamps, and undoes', () => {
    const s = make(4)
    expect(moveFrameToIndexOp(s.design, 'f2', 1)).toBeNull()
    expect(moveFrameToIndexOp(s.design, 'nope', 1)).toBeNull()
    expect(order(s, 'f1', 99)).toEqual(['f2', 'f3', 'f4', 'f1']) // clamped to the end
    s.undo()
    expect(ids(s.design)).toEqual(['f1', 'f2', 'f3', 'f4'])
  })
})

describe('timing', () => {
  it('apply to all sets every frame to the same duration, as one undoable action', () => {
    const s = make(3, [100, 300, 50])
    const ops = setAllDurationsOps(s.design, 125)
    expect(ops).toHaveLength(3)
    s.perform('Set all', ops)
    expect(s.design.frames.map((f) => f.durationMs)).toEqual([125, 125, 125])
    expect(s.history.undoDepth).toBe(1)
    s.undo()
    expect(s.design.frames.map((f) => f.durationMs)).toEqual([100, 300, 50])
  })
  it('skips frames that already match and gives no action when all do', () => {
    expect(setAllDurationsOps(make(3, [100, 200, 100]).design, 100)).toHaveLength(1)
    expect(setAllDurationsOps(make(2).design, 100)).toEqual([])
  })
  it('one frame can be changed alone and is clamped', () => {
    const s = make(2)
    s.perform('Duration', [{ t: 'setDuration', frameId: 'f2', durationMs: 4 }])
    expect(s.design.frames.map((f) => f.durationMs)).toEqual([100, 16])
  })
  it('the loop mode can be changed and undone', () => {
    const s = make(2)
    s.perform('Loop', [{ t: 'setLoop', loop: 'once' }])
    expect(s.design.loop).toBe('once')
    s.undo()
    expect(s.design.loop).toBe('loop')
  })
})

describe('onion skin', () => {
  it('shows the previous frame faintly and never changes any frame', () => {
    const s = make(3)
    const before = s.design.frames.map((f) => px(s.design, f.id).slice())
    const ghost = onionPixels(s.design, 'f2', 'previous')!
    expect(ghost[led]).toBe(10) // frame 1's brightness
    expect(ghost).not.toBe(px(s.design, 'f1')) // a copy, not the frame's own array
    // saving the current frame with onion skin on stores only what was drawn on it
    const saved = serializeDesign({ ...createDesign(), frames: s.design.frames.map((f) => ({ id: f.id, durationMs: f.durationMs, layers: [{ id: f.layers[0].id, type: 'pixels' as const, data: btoa(String.fromCharCode(...(f.layers[0] as { pixels: Uint8Array }).pixels)) }] })) })
    const cur = atob((saved.frames[1].layers[0] as { data: string }).data)
    expect(cur.charCodeAt(led)).toBe(20)
    expect(s.design.frames.map((f) => px(s.design, f.id))).toEqual(before)
  })
  it('previous + next combines both neighbours by brightest value', () => {
    const s = make(3)
    expect(onionPixels(s.design, 'f2', 'both')![led]).toBe(30)
    expect(onionPixels(s.design, 'f1', 'both')![led]).toBe(20) // no previous frame
    expect(onionPixels(s.design, 'f3', 'previous')![led]).toBe(20)
  })
  it('is off, or empty, when there is nothing to show', () => {
    const s = make(3)
    expect(onionPixels(s.design, 'f2', 'off')).toBeUndefined()
    expect(onionPixels(s.design, 'f1', 'previous')).toBeUndefined()
    expect(onionPixels(make(1).design, 'f1', 'both')).toBeUndefined()
    expect(onionPixels(s.design, 'nope', 'previous')).toBeUndefined()
    expect(onionPixels(s.design, 'f2', 'previous')!.length).toBe(MATRIX_CELLS)
    expect(idx(0, 0)).toBe(0)
  })
})

class FakeTimers implements Timers {
  now = 0
  private next = 1
  private tasks = new Map<number, { at: number; fn: () => void }>()
  setTimeout(fn: () => void, ms: number) { const id = this.next++; this.tasks.set(id, { at: this.now + ms, fn }); return id }
  clearTimeout(id: unknown) { this.tasks.delete(id as number) }
  advance(ms: number) {
    const end = this.now + ms
    for (;;) {
      const due = [...this.tasks.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      this.tasks.delete(due[0])
      this.now = due[1].at
      due[1].fn()
    }
    this.now = end
  }
  get pending() { return this.tasks.size }
}

describe('playback', () => {
  function rig() {
    const timers = new FakeTimers()
    const shown: number[] = []
    let ended = 0
    const player = new AnimationPlayer((i) => shown.push(i), () => { ended++ }, timers)
    return { timers, shown, player, ended: () => ended }
  }

  it('shows each frame for its own duration (100 ms then 300 ms)', () => {
    const { timers, shown, player } = rig()
    player.start([100, 300], 'loop')
    expect(shown).toEqual([0])
    timers.advance(99); expect(shown).toEqual([0])
    timers.advance(1); expect(shown).toEqual([0, 1])
    timers.advance(299); expect(shown).toEqual([0, 1])
    timers.advance(1); expect(shown).toEqual([0, 1, 0])
    timers.advance(400); expect(shown).toEqual([0, 1, 0, 1, 0])
    expect(player.playing).toBe(true)
  })

  it('bounce plays forward then backward', () => {
    const { timers, shown, player } = rig()
    player.start([10, 10, 10], 'bounce')
    timers.advance(60)
    expect(shown).toEqual([0, 1, 2, 1, 0, 1, 2])
  })

  it('once stops on the last frame after its duration and then reports the end', () => {
    const { timers, shown, player, ended } = rig()
    player.start([50, 50, 200], 'once')
    timers.advance(100)
    expect(shown).toEqual([0, 1, 2])
    expect(ended()).toBe(0)
    expect(player.playing).toBe(true) // the last frame is still being shown
    timers.advance(199); expect(ended()).toBe(0)
    timers.advance(1)
    expect(ended()).toBe(1)
    expect(player.playing).toBe(false)
    expect(timers.pending).toBe(0)
    timers.advance(10_000)
    expect(shown).toEqual([0, 1, 2])
  })

  it('stop cancels everything, and start again begins from the first frame', () => {
    const { timers, shown, player } = rig()
    player.start([100, 100], 'loop')
    timers.advance(100)
    player.stop()
    expect(player.playing).toBe(false)
    timers.advance(1000)
    expect(shown).toEqual([0, 1])
    player.start([100, 100], 'loop')
    expect(shown[shown.length - 1]).toBe(0)
  })

  it('starting a new animation replaces the running one', () => {
    const { timers, shown, player } = rig()
    player.start([100, 100], 'loop')
    player.start([30], 'once')
    timers.advance(30)
    expect(player.playing).toBe(false)
    expect(shown).toEqual([0, 0])
    expect(timers.pending).toBe(0)
  })

  it('a single frame in loop mode is just shown, with no timer', () => {
    const { timers, shown, player } = rig()
    player.start([100], 'loop')
    expect(shown).toEqual([0])
    expect(timers.pending).toBe(0)
    expect(player.playing).toBe(true)
  })

  it('an empty animation plays nothing', () => {
    const { shown, player } = rig()
    player.start([], 'loop')
    expect(shown).toEqual([])
    expect(player.playing).toBe(false)
  })
})
