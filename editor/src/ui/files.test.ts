import { describe, expect, it } from 'vitest'
import { createDesign, parseDesign, serializeDesign } from '../format/design'
import { PACK_EXT, exportFileName, readDesignFile } from './files'

describe('exportFileName', () => {
  it('keeps normal names and adds the extension', () => {
    expect(exportFileName('Pacman')).toBe('Pacman.glyph.json')
    expect(exportFileName('My design 2')).toBe('My design 2.glyph.json')
  })
  it('removes path characters and leading dots', () => {
    expect(exportFileName('../../etc/passwd')).toBe('_.._etc_passwd.glyph.json')
    expect(exportFileName('a\\b:c*d')).toBe('a_b_c_d.glyph.json')
  })
  it('never returns an empty name', () => {
    expect(exportFileName('   ')).toBe('design.glyph.json')
    expect(exportFileName('...')).toBe('design.glyph.json')
  })
  it('uses the pack extension for packs and caps the length', () => {
    expect(exportFileName('glyph-designs', PACK_EXT)).toBe('glyph-designs.glyphpack.json')
    expect(exportFileName('x'.repeat(200)).length).toBe(60 + '.glyph.json'.length)
  })
})

describe('readDesignFile', () => {
  const sample = (name: string) => serializeDesign(createDesign(name, 1))

  it('accepts what export produces: a single design and a pack, and they re-validate', () => {
    const single = JSON.stringify(sample('One'))
    const r = readDesignFile(single)
    expect(r.ok && r.designs.length).toBe(1)
    const pack = JSON.stringify([sample('A'), sample('B')])
    const p = readDesignFile(pack)
    expect(p.ok && p.designs.length).toBe(2)
    if (p.ok) for (const d of p.designs) expect(parseDesign(d).ok).toBe(true)
  })
  it('accepts a file with a byte-order mark', () => {
    expect(readDesignFile('﻿' + JSON.stringify(sample('Bom'))).ok).toBe(true)
  })
  it('rejects text that is not JSON', () => {
    const r = readDesignFile('hello')
    expect(r.ok).toBe(false)
  })
  it('rejects JSON that is not a design, and an empty pack', () => {
    expect(readDesignFile('{"a":1}').ok).toBe(false)
    expect(readDesignFile('42').ok).toBe(false)
    const empty = readDesignFile('[]')
    expect(!empty.ok && empty.error).toMatch(/no designs/)
  })
  it('rejects the whole pack when one design is bad and names which one', () => {
    const r = readDesignFile(JSON.stringify([sample('Good'), { nope: true }]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/^Design 2:/)
  })
})
