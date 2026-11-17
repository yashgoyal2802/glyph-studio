import { LED_MASK, MATRIX_CELLS } from '../generated/shared'

export function emptyPixels(): Uint8Array {
  return new Uint8Array(MATRIX_CELLS)
}

/** Zero every position that has no physical LED. Mutates and returns the array. */
export function applyMask(p: Uint8Array): Uint8Array {
  for (let i = 0; i < MATRIX_CELLS; i++) if (!LED_MASK[i]) p[i] = 0
  return p
}

export function encodePixels(p: Uint8Array): string {
  let s = ''
  for (let i = 0; i < p.length; i++) s += String.fromCharCode(p[i])
  return btoa(s)
}

/** Returns null when the text is not valid base64 of exactly MATRIX_CELLS bytes. */
export function decodePixels(text: string): Uint8Array | null {
  let bin: string
  try {
    bin = atob(text)
  } catch {
    return null
  }
  if (bin.length !== MATRIX_CELLS) return null
  const out = new Uint8Array(MATRIX_CELLS)
  for (let i = 0; i < MATRIX_CELLS; i++) out[i] = bin.charCodeAt(i)
  return out
}
