import { LED_MASK, LOOP_MODES, MATRIX_CELLS, MAX_FRAME_DURATION_MS, MIN_FRAME_DURATION_MS, type LoopMode } from '../generated/shared'
import type { Frame } from '../format/types'
import { fromWireFrame, isEPixels, toWireFrame, type EDesign, type EFrame } from './model'

/**
 * Edit operations. The JSON shape is the wire format shared with the phone (see OpJson.kt) and the rules in applyOp
 * mirror Operations.kt, so the editor can apply an edit locally at once and the phone ends up with the same result.
 */
export type Op =
  | { t: 'setPixels'; frameId: string; layerId: string; indices: number[]; values: number[] }
  | { t: 'addFrame'; frame: Frame; afterFrameId: string | null }
  | { t: 'deleteFrame'; frameId: string }
  | { t: 'moveFrame'; frameId: string; afterFrameId: string | null }
  | { t: 'setDuration'; frameId: string; durationMs: number }
  | { t: 'setLoop'; loop: LoopMode }
  | { t: 'rename'; name: string }

export class OpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpError'
  }
}

export const clampDurationMs = (ms: number): number =>
  Number.isFinite(ms) ? Math.min(MAX_FRAME_DURATION_MS, Math.max(MIN_FRAME_DURATION_MS, Math.round(ms))) : 100

function frameIndex(d: EDesign, frameId: string): number {
  const i = d.frames.findIndex((f) => f.id === frameId)
  if (i < 0) throw new OpError(`Unknown frame: ${frameId}`)
  return i
}

const replaceAt = <T>(arr: readonly T[], i: number, item: T): T[] => arr.map((x, k) => (k === i ? item : x))

/** Returns the design with [op] applied (never mutating [d]), or throws OpError and changes nothing. */
export function applyOp(d: EDesign, op: Op): EDesign {
  switch (op.t) {
    case 'setPixels': {
      if (op.indices.length !== op.values.length) throw new OpError('indices and values differ in length')
      const fi = frameIndex(d, op.frameId)
      const frame = d.frames[fi]
      const li = frame.layers.findIndex((l) => l.id === op.layerId)
      if (li < 0) throw new OpError(`Unknown layer: ${op.layerId}`)
      const layer = frame.layers[li]
      if (!isEPixels(layer)) throw new OpError(`Layer ${op.layerId} is not a pixels layer`)
      for (let k = 0; k < op.indices.length; k++) {
        const i = op.indices[k]
        if (!Number.isInteger(i) || i < 0 || i >= MATRIX_CELLS) throw new OpError(`Cell index out of range: ${i}`)
        const v = op.values[k]
        if (!Number.isInteger(v) || v < 0 || v > 255) throw new OpError(`Brightness out of range: ${v}`)
      }
      const pixels = layer.pixels.slice()
      for (let k = 0; k < op.indices.length; k++) if (LED_MASK[op.indices[k]]) pixels[op.indices[k]] = op.values[k]
      const layers = replaceAt(frame.layers, li, { ...layer, pixels })
      return { ...d, frames: replaceAt(d.frames, fi, { ...frame, layers }) }
    }
    case 'addFrame': {
      if (d.frames.some((f) => f.id === op.frame.id)) throw new OpError(`Frame id already exists: ${op.frame.id}`)
      if (op.frame.layers.length === 0) throw new OpError('A frame needs at least one layer')
      let frame: EFrame
      try {
        frame = fromWireFrame(op.frame)
      } catch (e) {
        throw new OpError(e instanceof Error ? e.message : 'Invalid frame')
      }
      frame = { ...frame, durationMs: clampDurationMs(frame.durationMs) }
      const at = op.afterFrameId === null ? 0 : frameIndex(d, op.afterFrameId) + 1
      return { ...d, frames: [...d.frames.slice(0, at), frame, ...d.frames.slice(at)] }
    }
    case 'deleteFrame': {
      if (d.frames.length <= 1) throw new OpError('A design needs at least one frame')
      const i = frameIndex(d, op.frameId)
      return { ...d, frames: d.frames.filter((_, k) => k !== i) }
    }
    case 'moveFrame': {
      const from = frameIndex(d, op.frameId)
      if (op.afterFrameId === op.frameId) return d
      const rest = d.frames.filter((_, k) => k !== from)
      const at = op.afterFrameId === null ? 0 : rest.findIndex((f) => f.id === op.afterFrameId) + 1
      if (op.afterFrameId !== null && at === 0) throw new OpError(`Unknown frame: ${op.afterFrameId}`)
      return { ...d, frames: [...rest.slice(0, at), d.frames[from], ...rest.slice(at)] }
    }
    case 'setDuration': {
      const i = frameIndex(d, op.frameId)
      return { ...d, frames: replaceAt(d.frames, i, { ...d.frames[i], durationMs: clampDurationMs(op.durationMs) }) }
    }
    case 'setLoop':
      if (!(LOOP_MODES as readonly string[]).includes(op.loop)) throw new OpError(`Unknown loop mode: ${op.loop}`)
      return { ...d, loop: op.loop }
    case 'rename':
      return { ...d, name: op.name }
  }
}

/** The operation that undoes [op], worked out from the design as it is BEFORE [op] is applied. */
export function inverseOp(d: EDesign, op: Op): Op {
  switch (op.t) {
    case 'setPixels': {
      const frame = d.frames[frameIndex(d, op.frameId)]
      const layer = frame.layers.find((l) => l.id === op.layerId)
      if (!layer || !isEPixels(layer)) throw new OpError(`Unknown layer: ${op.layerId}`)
      return { t: 'setPixels', frameId: op.frameId, layerId: op.layerId, indices: [...op.indices], values: op.indices.map((i) => layer.pixels[i]) }
    }
    case 'addFrame':
      return { t: 'deleteFrame', frameId: op.frame.id }
    case 'deleteFrame': {
      const i = frameIndex(d, op.frameId)
      return { t: 'addFrame', frame: toWireFrame(d.frames[i]), afterFrameId: i === 0 ? null : d.frames[i - 1].id }
    }
    case 'moveFrame': {
      const i = frameIndex(d, op.frameId)
      return { t: 'moveFrame', frameId: op.frameId, afterFrameId: i === 0 ? null : d.frames[i - 1].id }
    }
    case 'setDuration':
      return { t: 'setDuration', frameId: op.frameId, durationMs: d.frames[frameIndex(d, op.frameId)].durationMs }
    case 'setLoop':
      return { t: 'setLoop', loop: d.loop }
    case 'rename':
      return { t: 'rename', name: d.name }
  }
}
