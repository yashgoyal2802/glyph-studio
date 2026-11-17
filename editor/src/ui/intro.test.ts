import { describe, expect, it } from 'vitest'
import { INTRO_STEPS } from './intro'
import { TEMPLATES } from '../templates/templates'

describe('introduction', () => {
  it('has at most four screens, each with text and a picture that exists', () => {
    expect(INTRO_STEPS.length).toBeGreaterThan(0)
    expect(INTRO_STEPS.length).toBeLessThanOrEqual(4)
    for (const s of INTRO_STEPS) {
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.body.length).toBeGreaterThan(0)
      expect(TEMPLATES.some((t) => t.id === s.art), s.art).toBe(true)
    }
  })

  it('covers drawing, toys, the Glyph Button and the computer', () => {
    const all = INTRO_STEPS.map((s) => s.title + ' ' + s.body).join(' ').toLowerCase()
    for (const word of ['draw', 'toy', 'glyph button', 'computer']) expect(all).toContain(word)
  })
})
