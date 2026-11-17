import { describe, expect, it } from 'vitest'
import { MATRIX_CELLS } from '../generated/shared'
import { REVEAL_RANK, frameIndexAt, revealed } from './matrixClock'

describe('frameIndexAt', () => {
  const frames = [{ durationMs: 100 }, { durationMs: 300 }, { durationMs: 100 }]
  it('walks the frames by their own durations and loops', () => {
    expect(frameIndexAt(frames, 0)).toBe(0)
    expect(frameIndexAt(frames, 99)).toBe(0)
    expect(frameIndexAt(frames, 100)).toBe(1)
    expect(frameIndexAt(frames, 399)).toBe(1)
    expect(frameIndexAt(frames, 400)).toBe(2)
    expect(frameIndexAt(frames, 500)).toBe(0) // back to the start
    expect(frameIndexAt(frames, 1650)).toBe(1)
  })
  it('copes with nothing to show', () => {
    expect(frameIndexAt([], 1234)).toBe(0)
  })
})

describe('revealed', () => {
  const lit = new Uint8Array(MATRIX_CELLS).fill(200)
  it('shows nothing at the start, everything at the end and a growing share between', () => {
    const count = (p: number) => revealed(lit, p).filter((v) => v > 0).length
    expect(count(0)).toBeLessThan(5)
    expect(count(1)).toBe(MATRIX_CELLS)
    expect(count(0.25)).toBeLessThan(count(0.5))
    expect(count(0.5)).toBeLessThan(count(0.75))
  })
  it('sweeps clockwise from the top: the top-right is lit before the bottom-left', () => {
    const top = 12 * 1 + 14 // row 0..., x=14 (right of centre), y=1
    const topRight = 1 * 25 + 14
    const bottomLeft = 23 * 25 + 10
    expect(REVEAL_RANK[topRight]).toBeLessThan(REVEAL_RANK[bottomLeft])
    expect(top).toBeGreaterThan(0)
  })
})
