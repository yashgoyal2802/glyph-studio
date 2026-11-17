import { afterEach, describe, expect, it } from 'vitest'
import { isInApp } from './host'

describe('isInApp', () => {
  afterEach(() => { delete (globalThis as { GlyphAndroid?: unknown }).GlyphAndroid })
  it('is false in a normal browser', () => expect(isInApp()).toBe(false))
  it('is true when the phone provides its bridge', () => {
    ;(globalThis as { GlyphAndroid?: unknown }).GlyphAndroid = {}
    expect(isInApp()).toBe(true)
  })
})
