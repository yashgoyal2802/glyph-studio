import { describe, expect, it } from 'vitest'
import { History, type HistoryEntry } from './history'

const entry = (label: string, pad = 0): HistoryEntry => ({
  label,
  redo: [{ t: 'rename', name: label + 'x'.repeat(pad) }],
  undo: [{ t: 'rename', name: 'old' }],
})

describe('History snapshot and restore', () => {
  it('round-trips both stacks through JSON', () => {
    const h = new History()
    h.push(entry('a'))
    h.push(entry('b'))
    h.keepForRedo(h.takeUndo()!)
    const copy = new History()
    copy.restore(JSON.parse(JSON.stringify(h.snapshot())))
    expect(copy.undoLabel).toBe('a')
    expect(copy.redoLabel).toBe('b')
    expect(copy.canUndo && copy.canRedo).toBe(true)
  })

  it('leaves out the oldest undo steps first when too large, keeping the newest', () => {
    const h = new History()
    for (let i = 0; i < 40; i++) h.push(entry(`e${i}`, 200))
    const small = h.snapshot(5000)
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(5000)
    expect(small.undo.length).toBeGreaterThan(0)
    expect(small.undo[small.undo.length - 1].label).toBe('e39')
  })

  it('ignores things that are not history entries and respects the cap', () => {
    const h = new History(2)
    h.restore({ undo: [entry('a'), { nope: 1 }, entry('b'), entry('c')], redo: 'x' })
    expect(h.undoDepth).toBe(2)
    expect(h.undoLabel).toBe('c')
    expect(h.canRedo).toBe(false)
    h.restore(null)
    expect(h.canUndo).toBe(false)
  })
})
