import { createDesign, createFrame } from '../format/design'
import { encodePixels } from '../format/pixels'
import type { Design, Frame } from '../format/types'
import type { Op } from '../core/ops'

/** Where imported frames go: into the open design after the selected frame, or into a brand-new design. */
export type ImportTarget = 'insert' | 'new'

/** One finished frame ready to become part of a design. */
export interface ImportedFrame {
  pixels: Uint8Array
  durationMs: number
}

function wireFrame(f: ImportedFrame): Frame {
  const frame = createFrame(f.durationMs)
  ;(frame.layers[0] as { data: string }).data = encodePixels(f.pixels)
  return frame
}

/** A brand-new design made of the imported frames. */
export function designFromFrames(name: string, frames: ImportedFrame[], now = Date.now()): Design {
  if (frames.length === 0) throw new Error('Nothing to import')
  const design = createDesign(name, now)
  design.frames = frames.map(wireFrame)
  return design
}

/**
 * Operations that insert the imported frames, in order, right after [afterFrameId]. Applied together they form one
 * undoable action.
 */
export function insertFramesOps(afterFrameId: string, frames: ImportedFrame[]): Op[] {
  let after = afterFrameId
  return frames.map((f) => {
    const frame = wireFrame(f)
    const op: Op = { t: 'addFrame', frame, afterFrameId: after }
    after = frame.id
    return op
  })
}
