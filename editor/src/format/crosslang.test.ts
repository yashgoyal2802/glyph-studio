/// <reference types="node" />
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LED_MASK, MATRIX_CELLS } from '../generated/shared'
import { createDesign, parseDesign, serializeDesign } from './design'
import { encodePixels } from './pixels'
import type { Design } from './types'

/**
 * Cross-language contract (task 3.4): TypeScript writes shared/fixtures/ts, Kotlin reads them and writes
 * shared/fixtures/kt (see CrossLanguageTest.kt), TypeScript reads those back. Files are committed.
 * Regenerate with:  UPDATE_FIXTURES=1 npm test -- crosslang   then
 *                   UPDATE_FIXTURES=1 gradlew :app:testDebugUnitTest --tests "*CrossLanguageTest*"
 */
const fixturesDir = resolve(__dirname, '../../../shared/fixtures')
const update = process.env.UPDATE_FIXTURES === '1'

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

function pattern(seed: number): string {
  const px = new Uint8Array(MATRIX_CELLS)
  for (let i = 0; i < MATRIX_CELLS; i++) px[i] = LED_MASK[i] ? (i * 7 + seed) % 256 : 0
  return encodePixels(px)
}

function fixtures(): Record<string, Design> {
  const basic = createDesign('basic', 1000)
  basic.id = '00000000-0000-4000-8000-000000000001'
  basic.frames[0].id = 'f1'
  basic.frames[0].layers[0].id = 'l1'

  const animation = createDesign('animation', 2000)
  animation.id = '00000000-0000-4000-8000-000000000002'
  animation.anim.loop = 'bounce'
  animation.frames = [50, 100, 16].map((durationMs, i) => ({
    id: `f${i + 1}`,
    durationMs,
    layers: [{ id: `l${i + 1}`, type: 'pixels' as const, data: pattern(i * 40) }],
  }))

  const unknown = createDesign('unknown layer', 3000)
  unknown.id = '00000000-0000-4000-8000-000000000003'
  unknown.anim.loop = 'once'
  unknown.frames[0].id = 'f1'
  unknown.frames[0].layers[0].id = 'l1'
  unknown.frames[0].layers.push({ id: 'l2', type: 'text', font: 'tiny', string: 'HI', pos: { x: 3, y: 4 }, tags: ['a', 'b'] })

  return { 'basic.glyph.json': basic, 'animation.glyph.json': animation, 'unknown-layer.glyph.json': unknown }
}

const text = (d: Design) => JSON.stringify(serializeDesign(d), null, 2) + '\n'

describe('cross-language fixtures', () => {
  if (update) {
    it('writes the TypeScript fixtures', () => {
      mkdirSync(resolve(fixturesDir, 'ts'), { recursive: true })
      for (const [name, d] of Object.entries(fixtures())) writeFileSync(resolve(fixturesDir, 'ts', name), text(d))
    })
  }

  it('committed TypeScript fixtures match what TypeScript writes now', () => {
    for (const [name, d] of Object.entries(fixtures())) {
      const file = resolve(fixturesDir, 'ts', name)
      expect(existsSync(file), `${name} missing; run with UPDATE_FIXTURES=1`).toBe(true)
      expect(readFileSync(file, 'utf8')).toBe(text(d))
    }
  })

  it('reads every Kotlin-written fixture and gets the same design back', () => {
    const ktDir = resolve(fixturesDir, 'kt')
    expect(existsSync(ktDir), 'kt fixtures missing; run the Kotlin test with UPDATE_FIXTURES=1').toBe(true)
    const names = readdirSync(ktDir).filter((n) => n.endsWith('.glyph.json')).sort()
    expect(names).toEqual(Object.keys(fixtures()).sort())
    for (const name of names) {
      const fromKt = JSON.parse(readFileSync(resolve(ktDir, name), 'utf8'))
      const parsed = parseDesign(fromKt)
      expect(parsed.ok, `${name}: ${parsed.ok ? '' : parsed.error}`).toBe(true)
      if (!parsed.ok) continue
      const original = JSON.parse(readFileSync(resolve(fixturesDir, 'ts', name), 'utf8'))
      expect(canon(serializeDesign(parsed.design))).toBe(canon(original))
      expect(canon(fromKt)).toBe(canon(original))
    }
  })
})
