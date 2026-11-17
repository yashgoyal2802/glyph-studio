import { MATRIX_SIZE } from '../generated/shared'
import type { Floating } from './selection'

/**
 * The copy/paste clipboard. One per editor page: it outlives a single design, so pixels copied in one design can be
 * pasted into another. It is also kept in sessionStorage so it survives a reload, but not closing the tab.
 */
const KEY = 'glyphstudio.clipboard'

let held: Floating | null = null
let loaded = false

const toB64 = (a: Uint8Array) => btoa(String.fromCharCode(...a))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function valid(f: Floating): boolean {
  const n = f.w * f.h
  return (
    Number.isInteger(f.w) && Number.isInteger(f.h) && f.w > 0 && f.h > 0 && f.w <= MATRIX_SIZE && f.h <= MATRIX_SIZE &&
    f.values.length === n && f.covered.length === n
  )
}

function store(f: Floating | null) {
  try {
    if (!f) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify({ w: f.w, h: f.h, x: f.x, y: f.y, v: toB64(f.values), c: toB64(f.covered) }))
  } catch { /* storage may be unavailable; the in-memory copy still works */ }
}

function restore(): Floating | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    const f: Floating = { x: o.x | 0, y: o.y | 0, w: o.w, h: o.h, values: fromB64(o.v), covered: fromB64(o.c) }
    return valid(f) ? f : null
  } catch { return null }
}

export function setClipboard(f: Floating | null) {
  held = f ? { ...f, values: f.values.slice(), covered: f.covered.slice() } : null
  loaded = true
  store(held)
}

export function getClipboard(): Floating | null {
  if (!loaded) { held = restore(); loaded = true }
  return held ? { ...held, values: held.values.slice(), covered: held.covered.slice() } : null
}

export const hasClipboard = (): boolean => getClipboard() !== null

/** Where pasted pixels land: where they were copied from when that is still on the grid, so repeated pastes line up. */
export function pasteOrigin(f: Floating): { x: number; y: number } {
  const clamp = (v: number, size: number) => Math.max(0, Math.min(MATRIX_SIZE - size, v))
  return { x: clamp(f.x, f.w), y: clamp(f.y, f.h) }
}
