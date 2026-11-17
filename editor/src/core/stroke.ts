import { clampBrightness } from './brightness'
import { idx, isLed, type Point } from './matrix'
import { NO_SYMMETRY, withSymmetry, type Symmetry } from './raster'
import { createTool, type ToolId } from './tools'

/** What a finished stroke changed: parallel arrays of cell index, value before and value after. */
export interface PixelChange {
  indices: number[]
  before: number[]
  after: number[]
}

export interface StrokeOptions {
  brightness: number
  symmetry?: Symmetry
}

/**
 * One pointer gesture (press, drag, release) with one tool. The frame it started from is never modified: preview()
 * returns the frame as it would look, and change() gives the finished result, which counts as ONE undoable action.
 */
export class Stroke {
  private readonly tool
  private readonly value: number
  private readonly symmetry: Symmetry
  private done = false

  constructor(toolId: ToolId, private readonly base: Uint8Array, opts: StrokeOptions) {
    this.tool = createTool(toolId)
    this.value = this.tool.erase ? 0 : clampBrightness(opts.brightness)
    this.symmetry = opts.symmetry ?? NO_SYMMETRY
  }

  begin(p: Point) {
    this.tool.begin(p, this.base, this.value)
  }

  move(p: Point) {
    if (!this.done) this.tool.move(p)
  }

  end(p: Point) {
    if (this.done) return
    this.tool.end(p)
    this.done = true
  }

  get finished(): boolean {
    return this.done
  }

  /** The frame with the stroke applied so far. Cells without an LED are never written. */
  preview(): Uint8Array {
    const out = this.base.slice()
    for (const p of this.tool.points()) {
      for (const q of withSymmetry(p, this.symmetry)) {
        if (isLed(q.x, q.y)) out[idx(q.x, q.y)] = this.value
      }
    }
    return out
  }

  /** The finished change, or null while the gesture is still in progress or when it changed nothing. */
  change(): PixelChange | null {
    if (!this.done) return null
    return diffPixels(this.base, this.preview())
  }
}

/** The cells where [after] differs from [before]; null when identical. */
export function diffPixels(before: Uint8Array, after: Uint8Array): PixelChange | null {
  const change: PixelChange = { indices: [], before: [], after: [] }
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      change.indices.push(i)
      change.before.push(before[i])
      change.after.push(after[i])
    }
  }
  return change.indices.length ? change : null
}
