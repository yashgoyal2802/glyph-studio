import { describe, expect, it } from 'vitest'
import { createDesign, createFrame } from '../format/design'
import { fadeFactor, fadeOps, fadeValue } from './fades'
import { idx } from './matrix'
import { pixelsLayerOf, toEditorDesign } from './model'
import { EditSession } from './session'

function sessionWith(n: number, value = 200) {
  const d = createDesign('t')
  d.frames = Array.from({ length: n }, (_, i) => {
    const f = createFrame()
    f.id = `f${i}`
    f.layers[0].id = `l${i}`
    return f
  })
  const s = new EditSession(toEditorDesign(d), () => {})
  for (let i = 0; i < n; i++) {
    s.perform('Setup', [{ t: 'setPixels', frameId: `f${i}`, layerId: `l${i}`, indices: [idx(12, 12), idx(11, 12)], values: [value, 5] }])
  }
  return s
}
const px = (s: EditSession, i: number, x = 12) => pixelsLayerOf(s.design.frames[i])!.pixels[idx(x, 12)]

describe('fade maths', () => {
  it('changes evenly from frame to frame', () => {
    expect([0, 1, 2, 3, 4].map((j) => fadeFactor('out', j, 5))).toEqual([1, 0.75, 0.5, 0.25, 0])
    expect([0, 1, 2, 3, 4].map((j) => fadeFactor('in', j, 5))).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect([0, 1, 2, 3, 4].map((j) => fadeFactor('inOut', j, 5))).toEqual([0, 0.5, 1, 0.5, 0])
  })

  it('keeps off pixels off and lit pixels at least 1 until the factor is 0', () => {
    expect(fadeValue(0, 0.9)).toBe(0)
    expect(fadeValue(3, 0.1)).toBe(1)
    expect(fadeValue(200, 0)).toBe(0)
    expect(fadeValue(255, 1)).toBe(255)
  })
})

describe('fadeOps', () => {
  it('fade out over 5 frames: first keeps its brightness, later ones dimmer, last off', () => {
    const s = sessionWith(5)
    const r = fadeOps(s.design, 'out', 'all', 'f0')
    expect(r.error).toBeUndefined()
    expect(s.perform('Fade out', r.ops!)).toBe(true)
    expect([0, 1, 2, 3, 4].map((i) => px(s, i))).toEqual([200, 150, 100, 50, 0])
    expect(px(s, 1, 11)).toBe(4) // the dim pixel scaled too, still lit
    expect(px(s, 0, 11)).toBe(5) // the first frame is untouched
  })

  it('one undo restores every frame', () => {
    const s = sessionWith(4)
    s.perform('Fade out', fadeOps(s.design, 'out', 'all', 'f0').ops!)
    expect(s.undo()).toBe(true)
    expect([0, 1, 2, 3].map((i) => px(s, i))).toEqual([200, 200, 200, 200])
    expect(s.redo()).toBe(true)
    expect(px(s, 3)).toBe(0)
  })

  it('refuses a single frame', () => {
    const s = sessionWith(1)
    const r = fadeOps(s.design, 'out', 'all', 'f0')
    expect(r.ops).toBeUndefined()
    expect(r.error).toMatch(/at least two/)
    expect(fadeOps(sessionWith(2).design, 'inOut', 'all', 'f0').error).toMatch(/three/)
  })

  it('limits the range to this frame on, or up to this frame', () => {
    const s = sessionWith(5)
    s.perform('Fade', fadeOps(s.design, 'out', 'fromHere', 'f2').ops!)
    expect([0, 1, 2, 3, 4].map((i) => px(s, i))).toEqual([200, 200, 200, 100, 0])
    const t = sessionWith(5)
    t.perform('Fade', fadeOps(t.design, 'in', 'toHere', 'f2').ops!)
    expect([0, 1, 2, 3, 4].map((i) => px(t, i))).toEqual([0, 100, 200, 200, 200])
  })
})
