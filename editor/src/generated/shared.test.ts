/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LED_COUNT, LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from './shared'

const repoRoot = resolve(__dirname, '../../..')
const generator = resolve(repoRoot, 'shared/generate.mjs')
const outputs = [
  resolve(repoRoot, 'editor/src/generated/shared.ts'),
  resolve(repoRoot, 'android/app/src/main/kotlin/com/yash/glyphstudio/generated/SharedConstants.kt'),
]
const hashes = () => outputs.map((p) => createHash('sha256').update(readFileSync(p)).digest('hex'))

describe('shared constants generator', () => {
  it('produces byte-identical files on repeated runs', () => {
    execFileSync('node', [generator])
    const first = hashes()
    execFileSync('node', [generator])
    expect(hashes()).toEqual(first)
  })

  it('reports no stale generated files', () => {
    expect(() => execFileSync('node', [generator, '--check'])).not.toThrow()
  })

  it('mask matches the verified hardware mask file', () => {
    const rows = readFileSync(resolve(repoRoot, 'shared/mask/matrix-mask.txt'), 'utf8').trim().split(/\r?\n/)
    expect(LED_MASK).toHaveLength(MATRIX_CELLS)
    for (let y = 0; y < MATRIX_SIZE; y++) {
      for (let x = 0; x < MATRIX_SIZE; x++) {
        expect(LED_MASK[y * MATRIX_SIZE + x]).toBe(rows[y][x] === '#' ? 1 : 0)
      }
    }
    expect(LED_MASK.reduce<number>((a, b) => a + b, 0)).toBe(LED_COUNT)
    expect(LED_COUNT).toBe(489)
  })
})
