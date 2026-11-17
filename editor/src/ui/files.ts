import { parseDesign } from '../format/design'

export const DESIGN_EXT = '.glyph.json'
export const PACK_EXT = '.glyphpack.json'
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024

/** A file name that is safe on every system: no slashes or odd characters, never empty. */
export function exportFileName(name: string, ext: string = DESIGN_EXT): string {
  const base = name.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^[. ]+/, '').trim().slice(0, 60).trim()
  return (base || 'design') + ext
}

interface AndroidBridge {
  shareFile(fileName: string, mimeType: string, text: string): boolean
}

/**
 * Hand a text file to the user. On the phone this opens the Android share sheet; in a PC browser it downloads.
 * Returns how it was delivered, so the screen can say the right thing.
 */
export function deliverFile(fileName: string, text: string): 'shared' | 'downloaded' {
  const bridge = (window as unknown as { GlyphAndroid?: AndroidBridge }).GlyphAndroid
  if (bridge && typeof bridge.shareFile === 'function') {
    if (!bridge.shareFile(fileName, 'application/json', text)) throw new Error('Could not share the file.')
    return 'shared'
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export type DesignFileResult = { ok: true; designs: unknown[] } | { ok: false; error: string }

/**
 * Check the text of a chosen file before anything is sent: one design (an object) or a pack (an array of designs).
 * Nothing is added unless every design in the file is valid.
 */
export function readDesignFile(text: string): DesignFileResult {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, error: 'This is not a design file (it is not valid JSON).' }
  }
  const docs = Array.isArray(data) ? data : [data]
  if (docs.length === 0) return { ok: false, error: 'The file contains no designs.' }
  for (let i = 0; i < docs.length; i++) {
    const r = parseDesign(docs[i])
    if (!r.ok) return { ok: false, error: docs.length > 1 ? `Design ${i + 1}: ${r.error}` : r.error }
  }
  return { ok: true, designs: docs }
}
