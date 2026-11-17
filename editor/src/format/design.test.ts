import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, LED_MASK, MATRIX_CELLS } from '../generated/shared'
import { clampDuration, createDesign, createFrame, migrateDocument, parseDesign, serializeDesign } from './design'
import { decodePixels, encodePixels } from './pixels'
import { frameIndexAt, isFinished } from './playback'
import { isPixelsLayer } from './types'
import { uuid } from './uuid'

const cornerIndex = LED_MASK.findIndex((v) => v === 0) // a position with no LED
const ledIndex = LED_MASK.findIndex((v) => v === 1)

describe('design-format: versioned design document', () => {
  it('new design has defaults', () => {
    const d = createDesign('Pacman')
    expect(d.format).toBe(FORMAT_VERSION)
    expect(d.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(d.matrix).toEqual({ w: 25, h: 25 })
    expect(d.anim.loop).toBe('loop')
    expect(d.frames).toHaveLength(1)
    expect(createDesign().id).not.toBe(d.id)
  })

  it('rejects a design without frames', () => {
    const doc = { ...createDesign(), frames: [] }
    const r = parseDesign(doc)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/at least one frame/)
  })

  it('round-trips a valid design', () => {
    const d = createDesign('x')
    const r = parseDesign(JSON.parse(JSON.stringify(serializeDesign(d))))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.design).toEqual(d)
  })

  it('rejects malformed input', () => {
    expect(parseDesign(null).ok).toBe(false)
    expect(parseDesign({}).ok).toBe(false)
    expect(parseDesign({ ...createDesign(), anim: { loop: 'sideways' } }).ok).toBe(false)
    expect(parseDesign({ ...createDesign(), matrix: { w: 13, h: 13 } }).ok).toBe(false)
  })
})

describe('design-format: frames contain typed layers', () => {
  it('a new frame has exactly one all-zero pixels layer', () => {
    const f = createFrame()
    expect(f.layers).toHaveLength(1)
    const l = f.layers[0]
    expect(l.type).toBe('pixels')
    expect(isPixelsLayer(l)).toBe(true)
    if (isPixelsLayer(l)) {
      const px = decodePixels(l.data)!
      expect(px).toHaveLength(MATRIX_CELLS)
      expect(px.every((v) => v === 0)).toBe(true)
    }
  })

  it('preserves an unknown layer type when loading and saving', () => {
    const d = createDesign()
    const unknown = { id: 'u1', type: 'text', font: 'tiny', string: 'HI', extra: { a: 1 } }
    d.frames[0].layers.push(unknown)
    const loaded = parseDesign(JSON.parse(JSON.stringify(d)))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const saved = serializeDesign(loaded.design)
    expect(saved.frames[0].layers[1]).toEqual(unknown)
  })

  it('rejects invalid pixel data', () => {
    const d = createDesign()
    ;(d.frames[0].layers[0] as { data: string }).data = 'not-base64!!'
    expect(parseDesign(d).ok).toBe(false)
    ;(d.frames[0].layers[0] as { data: string }).data = btoa('short')
    expect(parseDesign(d).ok).toBe(false)
  })
})

describe('design-format: circular matrix mask', () => {
  it('stores 0 at positions outside the mask on save', () => {
    const d = createDesign()
    const px = new Uint8Array(MATRIX_CELLS)
    px[cornerIndex] = 200
    px[ledIndex] = 77
    ;(d.frames[0].layers[0] as { data: string }).data = encodePixels(px)
    const saved = serializeDesign(d)
    const out = decodePixels((saved.frames[0].layers[0] as { data: string }).data)!
    expect(out[cornerIndex]).toBe(0)
    expect(out[ledIndex]).toBe(77)
  })

  it('also zeroes masked values when loading', () => {
    const d = createDesign()
    const px = new Uint8Array(MATRIX_CELLS)
    px[cornerIndex] = 255
    ;(d.frames[0].layers[0] as { data: string }).data = encodePixels(px)
    const r = parseDesign(d)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const out = decodePixels((r.design.frames[0].layers[0] as { data: string }).data)!
      expect(out[cornerIndex]).toBe(0)
    }
  })
})

describe('design-format: frame duration bounds', () => {
  it('clamps below the minimum to 16 ms', () => {
    expect(clampDuration(5)).toBe(16)
    const d = createDesign()
    d.frames[0].durationMs = 5
    expect(serializeDesign(d).frames[0].durationMs).toBe(16)
    const doc = JSON.parse(JSON.stringify(d))
    const r = parseDesign(doc)
    expect(r.ok && r.design.frames[0].durationMs).toBe(16)
  })

  it('clamps above the maximum and handles junk', () => {
    expect(clampDuration(999_999)).toBe(60000)
    expect(clampDuration(16)).toBe(16)
    expect(clampDuration(60000)).toBe(60000)
    expect(clampDuration(Number.NaN)).toBe(100)
  })
})

describe('design-format: loop modes', () => {
  const seq = (mode: 'loop' | 'bounce' | 'once', count: number, n: number) =>
    Array.from({ length: n }, (_, s) => frameIndexAt(s, count, mode) + 1)

  it('bounce plays 1,2,3,2,1,2,3,...', () => {
    expect(seq('bounce', 3, 7)).toEqual([1, 2, 3, 2, 1, 2, 3])
  })
  it('loop restarts after the last frame', () => {
    expect(seq('loop', 3, 7)).toEqual([1, 2, 3, 1, 2, 3, 1])
  })
  it('once stops on the last frame', () => {
    expect(seq('once', 3, 6)).toEqual([1, 2, 3, 3, 3, 3])
    expect(isFinished(1, 3, 'once')).toBe(false)
    expect(isFinished(2, 3, 'once')).toBe(true)
    expect(isFinished(99, 3, 'loop')).toBe(false)
  })
  it('single-frame designs are stable in every mode', () => {
    for (const m of ['loop', 'bounce', 'once'] as const) expect(seq(m, 1, 4)).toEqual([1, 1, 1, 1])
  })
})

describe('design-format: forward migration', () => {
  it('rejects a newer major version with a clear message', () => {
    const r = parseDesign({ ...createDesign(), format: FORMAT_VERSION + 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/newer format.*Update the app/)
  })

  it('rejects documents with no version', () => {
    const { format: _omit, ...rest } = createDesign()
    expect(parseDesign(rest).ok).toBe(false)
  })

  it('migrates an older version up without losing data', () => {
    const v1 = createDesign('old')
    const v0 = { ...v1, format: 0, title: 'old', name: undefined }
    const migrations = { 0: (doc: { title: string }) => ({ ...doc, name: doc.title }) }
    const r = parseDesign(v0, migrations)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.design.name).toBe('old')
      expect(r.design.format).toBe(FORMAT_VERSION)
      expect(r.design.frames).toHaveLength(1)
    }
  })

  it('fails clearly when a migration step is missing', () => {
    const r = migrateDocument({ ...createDesign(), format: 0 }, {})
    expect(r.ok).toBe(false)
  })
})

describe('uuid', () => {
  it('generates distinct v4 ids without crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uuid()))
    expect(ids.size).toBe(500)
  })
})
