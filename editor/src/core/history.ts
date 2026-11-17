import { MAX_HISTORY } from '../generated/shared'
import type { Op } from './ops'

/** One user action: what to send to redo it and what to send to undo it. */
export interface HistoryEntry {
  label: string
  redo: Op[]
  undo: Op[]
}

/** Undo/redo stacks holding at most [max] actions (the oldest are forgotten first). */
export class History {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  constructor(private readonly max = MAX_HISTORY) {}

  /** Record a new action. Anything that could have been redone is gone. */
  push(entry: HistoryEntry) {
    this.undoStack.push(entry)
    if (this.undoStack.length > this.max) this.undoStack.shift()
    this.redoStack = []
  }

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }
  get undoLabel() { return this.undoStack[this.undoStack.length - 1]?.label ?? null }
  get redoLabel() { return this.redoStack[this.redoStack.length - 1]?.label ?? null }
  get undoDepth() { return this.undoStack.length }

  takeUndo(): HistoryEntry | null { return this.undoStack.pop() ?? null }
  takeRedo(): HistoryEntry | null { return this.redoStack.pop() ?? null }
  /** After a successful undo the action becomes redoable. */
  keepForRedo(e: HistoryEntry) { this.redoStack.push(e) }
  /** After a successful redo the action becomes undoable again (without clearing the redo stack). */
  keepForUndo(e: HistoryEntry) {
    this.undoStack.push(e)
    if (this.undoStack.length > this.max) this.undoStack.shift()
  }
  clear() { this.undoStack = []; this.redoStack = [] }

  /**
   * The stacks as plain data, for keeping across sessions. If the text would be longer than [maxChars] the oldest undo
   * steps are left out first, then the redo steps, so what is kept always fits.
   */
  snapshot(maxChars = MAX_SAVED_HISTORY_CHARS): SavedHistory {
    let undo = this.undoStack.slice()
    let redo = this.redoStack.slice()
    const size = () => JSON.stringify({ undo, redo }).length
    while (undo.length > 0 && size() > maxChars) undo = undo.slice(Math.ceil(undo.length / 4))
    if (size() > maxChars) redo = []
    return { undo, redo }
  }

  /** Replace the stacks with previously saved ones. Anything that does not look like a history entry is ignored. */
  restore(saved: unknown) {
    const s = saved as Partial<SavedHistory> | null
    const ok = (e: unknown): e is HistoryEntry => {
      const x = e as HistoryEntry
      return !!x && typeof x.label === 'string' && Array.isArray(x.redo) && Array.isArray(x.undo)
    }
    this.undoStack = (Array.isArray(s?.undo) ? s.undo : []).filter(ok).slice(-this.max)
    this.redoStack = (Array.isArray(s?.redo) ? s.redo : []).filter(ok).slice(-this.max)
  }
}

export interface SavedHistory {
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

/** Stay well under the phone's limit (2 million characters). */
export const MAX_SAVED_HISTORY_CHARS = 1_500_000
