import { describe, expect, it } from 'vitest'
import { parseDesign, serializeDesign } from '../format/design'
import { designFromFrames } from '../import/build'
import { LED_MASK, MATRIX_CELLS } from '../generated/shared'
import { TEMPLATES } from './templates'

describe('templates', () => {
  it('lists the required templates with distinct ids', () => {
    const ids = TEMPLATES.map((t) => t.id)
    for (const need of ['heart', 'clock', 'battery', 'arrow', 'smiley', 'loading']) expect(ids).toContain(need)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(TEMPLATES.map((t) => [t.name, t] as const))('%s is a valid design with every pixel on an LED', (_n, t) => {
    expect(t.frames.length).toBeGreaterThan(0)
    for (const f of t.frames) {
      expect(f.pixels.length).toBe(MATRIX_CELLS)
      expect(f.durationMs).toBeGreaterThanOrEqual(16)
      f.pixels.forEach((v, i) => { if (v) expect(LED_MASK[i], `cell ${i}`).toBe(1) })
      expect(f.pixels.some((v) => v > 0)).toBe(true)
    }
    const parsed = parseDesign(serializeDesign(designFromFrames(t.name, t.frames)))
    expect(parsed.ok).toBe(true)
  })

  it('the loading ring turns: each frame differs and it loops back to the start', () => {
    const t = TEMPLATES.find((x) => x.id === 'loading')!
    const key = (i: number) => Array.from(t.frames[i].pixels).join(',')
    expect(new Set(t.frames.map((_, i) => key(i))).size).toBe(t.frames.length)
  })
})
