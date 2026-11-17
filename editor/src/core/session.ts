import { History } from './history'
import { pixelsLayerOf, type EDesign } from './model'
import { applyOp, inverseOp, type Op } from './ops'
import type { PixelChange } from './stroke'

/** Where finished edits go (the connection to the phone). Receives the ops to send, in order. */
export type OpSink = (ops: Op[]) => void

/**
 * The editor's working copy of one design. Local edits are applied at once ("optimistic") and passed to the sink so
 * the phone gets them; edits made on the other device arrive through applyRemote. Undo and redo work by sending the
 * inverse operations, so the phone and every other screen follow along.
 */
export class EditSession {
  design: EDesign
  readonly history = new History()
  private listeners = new Set<() => void>()

  constructor(design: EDesign, private sink: OpSink = () => {}) {
    this.design = design
  }

  setSink(sink: OpSink) { this.sink = sink }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() { this.listeners.forEach((fn) => fn()) }

  /** Apply [ops] as ONE undoable action. All-or-nothing: if any op is invalid nothing changes and false is returned. */
  perform(label: string, ops: Op[]): boolean {
    if (ops.length === 0) return false
    let cur = this.design
    const inverses: Op[] = []
    try {
      for (const op of ops) {
        inverses.push(inverseOp(cur, op))
        cur = applyOp(cur, op)
      }
    } catch {
      return false
    }
    this.design = cur
    this.history.push({ label, redo: ops, undo: inverses.reverse() })
    this.sink(ops)
    this.notify()
    return true
  }

  /** Commit a finished pixel change (from a stroke or a transform) as one action. */
  commitPixels(label: string, frameId: string, layerId: string, change: PixelChange | null): boolean {
    if (!change) return false
    return this.perform(label, [{ t: 'setPixels', frameId, layerId, indices: change.indices, values: change.after }])
  }

  undo(): boolean { return this.replay(this.history.takeUndo(), 'undo') }
  redo(): boolean { return this.replay(this.history.takeRedo(), 'redo') }

  private replay(entry: ReturnType<History['takeUndo']>, dir: 'undo' | 'redo'): boolean {
    if (!entry) return false
    const ops = dir === 'undo' ? entry.undo : entry.redo
    let cur = this.design
    try {
      for (const op of ops) cur = applyOp(cur, op)
    } catch {
      // The other device changed something this action depends on (e.g. deleted the frame): forget the action.
      return false
    }
    this.design = cur
    if (dir === 'undo') this.history.keepForRedo(entry)
    else this.history.keepForUndo(entry)
    this.sink(ops)
    this.notify()
    return true
  }

  /** An edit made elsewhere (the phone or another browser). Not undoable here and never echoed back. */
  applyRemote(op: Op): boolean {
    try {
      this.design = applyOp(this.design, op)
    } catch {
      return false
    }
    this.notify()
    return true
  }

  /** Replace the whole design (a fresh snapshot from the phone). The old undo history no longer applies. */
  replace(design: EDesign) {
    this.design = design
    this.history.clear()
    this.notify()
  }

  frame(frameId: string) { return this.design.frames.find((f) => f.id === frameId) }

  /** Current pixels of a frame's first pixels layer, plus the ids needed to edit them. */
  pixelsOf(frameId: string): { pixels: Uint8Array; layerId: string } | null {
    const f = this.frame(frameId)
    const l = f && pixelsLayerOf(f)
    return l ? { pixels: l.pixels, layerId: l.id } : null
  }
}
