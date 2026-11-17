import { beforeEach, describe, expect, it } from 'vitest'
import { getClipboard, hasClipboard, pasteOrigin, setClipboard } from './clipboard'
import type { Floating } from './selection'

const f = (x: number, y: number, w = 2, h = 2): Floating => ({
  x, y, w, h, values: new Uint8Array(w * h).fill(200), covered: new Uint8Array(w * h).fill(1),
})

describe('clipboard', () => {
  beforeEach(() => setClipboard(null))

  it('starts empty and holds a copy', () => {
    expect(hasClipboard()).toBe(false)
    const src = f(3, 4)
    setClipboard(src)
    src.values[0] = 1
    expect(getClipboard()!.values[0]).toBe(200)
    expect(hasClipboard()).toBe(true)
  })

  it('returns an independent copy each time', () => {
    setClipboard(f(1, 1))
    const a = getClipboard()!
    a.values[0] = 9
    expect(getClipboard()!.values[0]).toBe(200)
  })

  it('pastes where it was copied, kept on the grid', () => {
    expect(pasteOrigin(f(5, 6))).toEqual({ x: 5, y: 6 })
    expect(pasteOrigin(f(24, 24, 3, 3))).toEqual({ x: 22, y: 22 })
    expect(pasteOrigin(f(-2, -1))).toEqual({ x: 0, y: 0 })
  })
})
