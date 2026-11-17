import { createFrame } from '../format/design'
import { uuid } from '../format/uuid'
import { toWireFrame, type EDesign } from './model'
import type { Op } from './ops'

/**
 * Builders for the frame operations. They only describe the change (an Op); the EditSession applies it, records it for
 * undo and sends it to the phone. Each returns null when the action is not possible, so buttons can be disabled.
 */

/** A new empty frame after [afterFrameId] (null = at the start). It takes the duration of the frame it follows. */
export function addBlankFrameOp(design: EDesign, afterFrameId: string | null): Op {
  const after = design.frames.find((f) => f.id === afterFrameId)
  return { t: 'addFrame', frame: createFrame(after?.durationMs), afterFrameId }
}

/** A copy of a frame, with new ids, placed right after the original. */
export function duplicateFrameOp(design: EDesign, frameId: string): Op | null {
  const source = design.frames.find((f) => f.id === frameId)
  if (!source) return null
  const wire = toWireFrame(source)
  const copy = { ...wire, id: uuid(), layers: wire.layers.map((l) => ({ ...l, id: uuid() })) }
  return { t: 'addFrame', frame: copy, afterFrameId: frameId }
}

/** Null for unknown frames and for the only remaining frame (a design always keeps at least one). */
export function deleteFrameOp(design: EDesign, frameId: string): Op | null {
  if (design.frames.length <= 1 || !design.frames.some((f) => f.id === frameId)) return null
  return { t: 'deleteFrame', frameId }
}

/** Move a frame so it ends up at [toIndex] (0-based, clamped). Null when that would not change anything. */
export function moveFrameToIndexOp(design: EDesign, frameId: string, toIndex: number): Op | null {
  const from = design.frames.findIndex((f) => f.id === frameId)
  if (from < 0) return null
  const to = Math.min(design.frames.length - 1, Math.max(0, Math.round(toIndex)))
  if (to === from) return null
  const others = design.frames.filter((f) => f.id !== frameId)
  return { t: 'moveFrame', frameId, afterFrameId: to === 0 ? null : others[to - 1].id }
}

/** One setDuration per frame that does not already have [ms]; empty when every frame already does. */
export function setAllDurationsOps(design: EDesign, ms: number): Op[] {
  return design.frames.filter((f) => f.durationMs !== ms).map((f) => ({ t: 'setDuration' as const, frameId: f.id, durationMs: ms }))
}

/** Which frame to select after deleting [frameId]: the one that takes its place, else the one before. */
export function selectionAfterDelete(design: EDesign, frameId: string): string | null {
  const i = design.frames.findIndex((f) => f.id === frameId)
  if (i < 0 || design.frames.length <= 1) return null
  return (design.frames[i + 1] ?? design.frames[i - 1]).id
}
