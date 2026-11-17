import { describe, expect, it } from 'vitest'
import { hashFor, parseRoute } from './router'

describe('router', () => {
  it('reads design routes and falls back to the library', () => {
    expect(parseRoute('#/design/abc-123')).toEqual({ name: 'editor', id: 'abc-123' })
    expect(parseRoute('')).toEqual({ name: 'library' })
    expect(parseRoute('#/')).toEqual({ name: 'library' })
    expect(parseRoute('#/design/')).toEqual({ name: 'library' })
    expect(parseRoute('#/design/a/b')).toEqual({ name: 'library' })
    expect(parseRoute('#/design/../../x')).toEqual({ name: 'library' })
    expect(parseRoute('#/design/<script>')).toEqual({ name: 'library' })
  })
  it('round-trips', () => {
    expect(parseRoute(hashFor({ name: 'editor', id: 'x-1' }))).toEqual({ name: 'editor', id: 'x-1' })
    expect(parseRoute(hashFor({ name: 'library' }))).toEqual({ name: 'library' })
  })
})
