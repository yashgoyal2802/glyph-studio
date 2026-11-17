import { describe, expect, it } from 'vitest'
import { MATRIX_CELLS } from '../generated/shared'
import { FONTS, glyphFor } from './fonts'
import { idx, isLed } from './matrix'
import { MAX_DESIGN_FRAMES, centredY, drawText, renderText, scrollFrames, textFloating } from './text'

const [small, large] = FONTS
const blank = () => new Uint8Array(MATRIX_CELLS)
const litCount = (p: Uint8Array) => p.reduce<number>((n, v) => n + (v ? 1 : 0), 0)

describe('fonts', () => {
  it.each(FONTS.map((f) => [f.id, f] as const))('%s: every glyph is rectangular and as tall as the font', (_id, font) => {
    for (const [ch, g] of Object.entries(font.glyphs)) {
      const rows = g.split('/')
      expect(rows.length, `height of ${ch}`).toBe(font.height)
      expect(new Set(rows.map((r) => r.length)).size, `width of ${ch}`).toBe(1)
      expect(rows.join('')).toMatch(/^[.#]+$/)
    }
    const ph = font.placeholder.split('/')
    expect(ph.length).toBe(font.height)
  })

  it.each(FONTS.map((f) => [f.id, f] as const))('%s: covers letters, digits and common punctuation', (_id, font) => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-:+\'/()=*_') expect(glyphFor(font, ch).known, ch).toBe(true)
    expect(glyphFor(font, 'a').known).toBe(true)
  })

  it('uses a placeholder for characters it does not have', () => {
    const g = glyphFor(small, '€')
    expect(g.known).toBe(false)
    expect(g.rows).toEqual(small.placeholder.split('/'))
  })
})

describe('renderText', () => {
  it('measures width with gaps and spaces', () => {
    expect(renderText('HI', small).w).toBe(3 + 1 + 3)
    expect(renderText('H I', small).w).toBe(3 + 1 + small.space + 1 + 3)
    expect(renderText('', small).w).toBe(0)
    expect(renderText('A', large).h).toBe(7)
  })

  it('draws the glyph pixels', () => {
    const b = renderText('I', small)
    expect(Array.from(b.lit).join('')).toBe('111' + '010' + '010' + '010' + '111')
  })

  it('counts and draws placeholders for unknown characters', () => {
    const b = renderText('A€', small)
    expect(b.missing).toBe(1)
    expect(b.w).toBe(3 + 1 + 3)
    expect(litCount(b.lit as unknown as Uint8Array)).toBeGreaterThan(litCount(renderText('A', small).lit))
  })
})

describe('placing text', () => {
  it('writes lit cells at the chosen brightness and leaves the rest', () => {
    const base = blank()
    base[idx(12, 12)] = 77
    const out = drawText(base, renderText('I', small), 200, 11, 10)
    expect(out[idx(11, 10)]).toBe(200)
    expect(out[idx(12, 12)]).toBe(200) // middle of the I
    expect(out[idx(11, 12)]).toBe(0)
    expect(base[idx(12, 12)]).toBe(77) // original untouched
  })

  it('drops cells off the grid and outside the LED circle', () => {
    const b = renderText('HELLO WORLD', large)
    const out = drawText(blank(), b, 255, -10, centredY(7))
    for (let i = 0; i < MATRIX_CELLS; i++) {
      if (out[i]) expect(isLed(i % 25, Math.floor(i / 25))).toBe(true)
    }
    expect(litCount(out)).toBeGreaterThan(0)
    expect(drawText(blank(), b, 255, 40, 3)).toEqual(blank())
  })

  it('makes a floating selection for dragging', () => {
    const f = textFloating(renderText('HI', small), 128, 4, 5)!
    expect([f.x, f.y, f.w, f.h]).toEqual([4, 5, 7, 5])
    expect(Math.max(...f.values)).toBe(128)
    expect(textFloating(renderText('', small), 128, 0, 0)).toBeNull()
  })
})

describe('scrollFrames', () => {
  const b = renderText('HELLO', small)

  it('enters from the right and leaves at the left, one pixel per frame', () => {
    const r = scrollFrames(b, 255, 'rtl', 'medium', 1)
    expect(r.error).toBeUndefined()
    expect(r.frames.length).toBe(25 + b.w)
    expect(litCount(r.frames[0])).toBe(0) // text just off the right edge
    const second = r.frames[1]
    // only the first column of H has appeared, at the right edge
    const rightCols = [...Array(25).keys()].some((y) => second[idx(24, y)] > 0)
    expect(rightCols).toBe(true)
    const last = r.frames[r.frames.length - 1]
    expect(litCount(last)).toBeGreaterThan(0) // the last column of O is still at the left edge
    expect([...Array(25).keys()].some((y) => last[idx(0, y)] > 0)).toBe(true)
  })

  it('loops without a jump: the frame after the last is the first (blank)', () => {
    const r = scrollFrames(b, 255, 'rtl', 'fast', 1)
    const last = r.frames[r.frames.length - 1]
    // shifting the last frame one step further left leaves nothing, which is the first frame
    expect(litCount(last)).toBeGreaterThan(0)
    expect(litCount(r.frames[0])).toBe(0)
  })

  it('left to right mirrors the direction', () => {
    const r = scrollFrames(b, 255, 'ltr', 'slow', 1)
    expect(r.durationMs).toBe(160)
    expect(litCount(r.frames[0])).toBe(0)
    expect([...Array(25).keys()].some((y) => r.frames[1][idx(0, y)] > 0)).toBe(true)
  })

  it('fast moves two pixels per frame, so it needs about half the frames', () => {
    const slow = scrollFrames(b, 255, 'rtl', 'medium', 1)
    const fast = scrollFrames(b, 255, 'rtl', 'fast', 1)
    expect(fast.frames.length).toBe(Math.ceil((25 + b.w) / 2))
    expect(fast.durationMs).toBe(slow.durationMs)
    expect(litCount(fast.frames[0])).toBe(0)
    expect(litCount(fast.frames[fast.frames.length - 1])).toBeGreaterThan(0)
  })

  it('refuses when the frame limit would be exceeded, adding nothing', () => {
    const r = scrollFrames(b, 255, 'rtl', 'medium', MAX_DESIGN_FRAMES - 10)
    expect(r.frames).toEqual([])
    expect(r.error).toMatch(/frames/)
    expect(scrollFrames(renderText('', small), 255, 'rtl', 'medium', 1).error).toBeTruthy()
  })
})
