import {
  DEFAULT_FRAME_DURATION_MS,
  DEFAULT_LOOP_MODE,
  FORMAT_VERSION,
  LOOP_MODES,
  MATRIX_SIZE,
  MAX_FRAME_DURATION_MS,
  MIN_FRAME_DURATION_MS,
  type LoopMode,
} from '../generated/shared'
import { applyMask, decodePixels, emptyPixels, encodePixels } from './pixels'
import { isPixelsLayer, type Design, type Frame, type Layer } from './types'
import { uuid } from './uuid'

export type ParseResult = { ok: true; design: Design } | { ok: false; error: string }

/** Migrations keyed by the version they upgrade FROM (vN -> vN+1). Empty until the format changes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Migrations = Record<number, (doc: any) => any>
export const MIGRATIONS: Migrations = {}

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_FRAME_DURATION_MS
  return Math.min(MAX_FRAME_DURATION_MS, Math.max(MIN_FRAME_DURATION_MS, Math.round(ms)))
}

export function createFrame(durationMs = DEFAULT_FRAME_DURATION_MS): Frame {
  return {
    id: uuid(),
    durationMs: clampDuration(durationMs),
    layers: [{ id: uuid(), type: 'pixels', data: encodePixels(emptyPixels()) }],
  }
}

export function createDesign(name = 'Untitled', now = Date.now()): Design {
  return {
    format: FORMAT_VERSION,
    id: uuid(),
    name,
    created: now,
    modified: now,
    matrix: { w: MATRIX_SIZE, h: MATRIX_SIZE },
    anim: { loop: DEFAULT_LOOP_MODE },
    frames: [createFrame()],
  }
}

/** Bring an older document up to the current version, or explain why it cannot be opened. */
export function migrateDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  migrations: Migrations = MIGRATIONS,
  target = FORMAT_VERSION,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { ok: true; doc: any } | { ok: false; error: string } {
  let version = doc?.format
  if (!Number.isInteger(version) || version < 0) return { ok: false, error: 'Not a design: missing format version.' }
  if (version > target) {
    return {
      ok: false,
      error: `This design uses a newer format (v${version}) than this app supports (v${target}). Update the app to open it.`,
    }
  }
  let cur = doc
  while (version < target) {
    const step = migrations[version]
    if (!step) return { ok: false, error: `No migration from format v${version}.` }
    cur = { ...step(cur), format: version + 1 }
    version++
  }
  return { ok: true, doc: cur }
}

function fail(error: string): ParseResult {
  return { ok: false, error }
}

/** Validate and normalise an untrusted document (file import, server data). */
export function parseDesign(input: unknown, migrations: Migrations = MIGRATIONS): ParseResult {
  if (typeof input !== 'object' || input === null) return fail('Not a design: expected an object.')
  const mig = migrateDocument(input, migrations)
  if (!mig.ok) return fail(mig.error)
  const d = mig.doc

  if (typeof d.id !== 'string' || !d.id) return fail('Design has no id.')
  if (typeof d.name !== 'string') return fail('Design has no name.')
  if (d.matrix?.w !== MATRIX_SIZE || d.matrix?.h !== MATRIX_SIZE) {
    return fail(`Design matrix must be ${MATRIX_SIZE}x${MATRIX_SIZE}.`)
  }
  const loop = d.anim?.loop
  if (!LOOP_MODES.includes(loop)) return fail(`Unknown loop mode: ${String(loop)}.`)
  if (!Array.isArray(d.frames) || d.frames.length === 0) return fail('Design must contain at least one frame.')

  const frames: Frame[] = []
  for (const [i, f] of d.frames.entries()) {
    if (typeof f !== 'object' || f === null || typeof f.id !== 'string') return fail(`Frame ${i + 1} is invalid.`)
    if (!Array.isArray(f.layers) || f.layers.length === 0) return fail(`Frame ${i + 1} has no layers.`)
    const layers: Layer[] = []
    for (const l of f.layers) {
      if (typeof l !== 'object' || l === null || typeof l.id !== 'string' || typeof l.type !== 'string') {
        return fail(`Frame ${i + 1} has an invalid layer.`)
      }
      if (l.type === 'pixels') {
        const px = typeof l.data === 'string' ? decodePixels(l.data) : null
        if (!px) return fail(`Frame ${i + 1} has invalid pixel data.`)
        layers.push({ id: l.id, type: 'pixels', data: encodePixels(applyMask(px)) })
      } else {
        layers.push(l as Layer) // unknown layer type: preserved untouched
      }
    }
    frames.push({ id: f.id, durationMs: clampDuration(Number(f.durationMs)), layers })
  }

  return {
    ok: true,
    design: {
      format: FORMAT_VERSION,
      id: d.id,
      name: d.name,
      created: Number(d.created) || 0,
      modified: Number(d.modified) || 0,
      matrix: { w: MATRIX_SIZE, h: MATRIX_SIZE },
      anim: { loop: loop as LoopMode },
      frames,
    },
  }
}

/** The JSON-safe document to store/export: masked pixels zeroed, durations clamped, unknown layers untouched. */
export function serializeDesign(design: Design): Design {
  return {
    ...design,
    format: FORMAT_VERSION,
    frames: design.frames.map((f) => ({
      ...f,
      durationMs: clampDuration(f.durationMs),
      layers: f.layers.map((l) => {
        if (!isPixelsLayer(l)) return l
        const px = decodePixels(l.data)
        return px ? { ...l, data: encodePixels(applyMask(px)) } : l
      }),
    })),
  }
}

export { MIN_FRAME_DURATION_MS, MAX_FRAME_DURATION_MS }
