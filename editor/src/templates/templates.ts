import { MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { idx, isLed, type Point } from '../core/matrix'
import { ellipsePoints, linePoints, rectPoints } from '../core/raster'
import type { ImportedFrame } from '../import/build'

/**
 * Ready-made starting points for "New design". Each is drawn in code from a few shapes, so there are no assets to ship,
 * and every pixel is checked against the LED mask while building (a template that strays off the matrix fails loudly in
 * the tests rather than quietly losing pixels).
 */
export interface Template {
  id: string
  name: string
  blurb: string
  frames: ImportedFrame[]
}

const C = 12 // the matrix centre cell

const blank = () => new Uint8Array(MATRIX_CELLS)

function put(p: Uint8Array, x: number, y: number, v = 255) {
  if (!isLed(x, y)) throw new Error(`Template pixel off the matrix at ${x},${y}`)
  p[idx(x, y)] = v
}
function putAll(p: Uint8Array, pts: Point[], v = 255) {
  for (const q of pts) put(p, q.x, q.y, v)
}

/** A picture from text rows ("#" full brightness, "+" half), centred on the matrix. */
function art(rows: string[], v = 255): Uint8Array {
  const p = blank()
  const w = Math.max(...rows.map((r) => r.length))
  const ox = Math.floor((MATRIX_SIZE - w) / 2)
  const oy = Math.floor((MATRIX_SIZE - rows.length) / 2)
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') put(p, ox + x, oy + y, v); else if (ch === '+') put(p, ox + x, oy + y, v >> 1) }))
  return p
}

const frame = (pixels: Uint8Array, durationMs: number): ImportedFrame => ({ pixels, durationMs })

const HEART_BIG = [
  '..###...###..', '.#####.#####.', '#############', '#############', '#############', '.###########.',
  '..#########..', '...#######...', '....#####....', '.....###.....', '......#......',
]
const HEART_SMALL = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']

function clock(): Uint8Array {
  const p = blank()
  putAll(p, ellipsePoints({ x: 2, y: 2 }, { x: 22, y: 22 }, false), 150)
  for (const [a, b] of [[[12, 4], [12, 5]], [[19, 12], [20, 12]], [[12, 19], [12, 20]], [[4, 12], [5, 12]]] as const) {
    putAll(p, linePoints({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }), 110)
  }
  putAll(p, linePoints({ x: C, y: C }, { x: 8, y: 9 })) // hour hand towards 10
  putAll(p, linePoints({ x: C, y: C }, { x: 17, y: 6 })) // minute hand towards 2
  put(p, C, C)
  return p
}

function battery(bars: number): Uint8Array {
  const p = blank()
  putAll(p, rectPoints({ x: 4, y: 8 }, { x: 19, y: 16 }, false))
  putAll(p, rectPoints({ x: 20, y: 10 }, { x: 21, y: 14 }, true))
  for (let b = 0; b < bars; b++) putAll(p, rectPoints({ x: 6 + b * 3, y: 10 }, { x: 8 + b * 3, y: 14 }, true))
  return p
}

function arrow(): Uint8Array {
  const p = blank()
  putAll(p, rectPoints({ x: 4, y: 11 }, { x: 13, y: 13 }, true))
  for (let i = 0; i <= 6; i++) putAll(p, linePoints({ x: 14 + i, y: C - (6 - i) }, { x: 14 + i, y: C + (6 - i) }))
  return p
}

function smiley(blink: boolean): Uint8Array {
  const p = blank()
  putAll(p, ellipsePoints({ x: 3, y: 3 }, { x: 21, y: 21 }, false))
  if (blink) {
    putAll(p, linePoints({ x: 8, y: 9 }, { x: 9, y: 9 }))
    putAll(p, linePoints({ x: 15, y: 9 }, { x: 16, y: 9 }))
  } else {
    putAll(p, rectPoints({ x: 8, y: 8 }, { x: 9, y: 10 }, true))
    putAll(p, rectPoints({ x: 15, y: 8 }, { x: 16, y: 10 }, true))
  }
  putAll(p, ellipsePoints({ x: 7, y: 9 }, { x: 17, y: 18 }, false).filter((q) => q.y >= 15))
  return p
}

const RING_DOTS = 12
function ring(head: number): Uint8Array {
  const p = blank()
  const at = (k: number) => {
    const a = ((((k % RING_DOTS) + RING_DOTS) % RING_DOTS) / RING_DOTS) * Math.PI * 2
    return { x: Math.round(11.5 + 9 * Math.sin(a)), y: Math.round(11.5 - 9 * Math.cos(a)) }
  }
  const block = (k: number, v: number) => {
    const { x, y } = at(k)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(p, x + dx, y + dy, Math.max(p[idx(x + dx, y + dy)], v))
  }
  for (let k = 0; k < RING_DOTS; k++) block(k, 35)
  ;[255, 170, 100, 60].forEach((v, back) => block(head - back, v))
  return p
}

export const TEMPLATES: readonly Template[] = [
  { id: 'heart', name: 'Heart', blurb: 'A beating heart', frames: [frame(art(HEART_BIG), 500), frame(art(HEART_SMALL), 500)] },
  { id: 'clock', name: 'Clock face', blurb: 'Ten past ten', frames: [frame(clock(), 1000)] },
  { id: 'battery', name: 'Battery', blurb: 'Charging, one bar at a time', frames: [0, 1, 2, 3, 4].map((n) => frame(battery(n), 450)) },
  { id: 'arrow', name: 'Arrow', blurb: 'Points right', frames: [frame(arrow(), 1000)] },
  { id: 'smiley', name: 'Smiley', blurb: 'Blinks now and then', frames: [frame(smiley(false), 1500), frame(smiley(true), 150)] },
  { id: 'loading', name: 'Loading ring', blurb: 'A spinner', frames: Array.from({ length: RING_DOTS }, (_, i) => frame(ring(i), 80)) },
]
