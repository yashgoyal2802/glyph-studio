import type { EditorToolId, ToolId } from './tools'

export type Action =
  | { type: 'tool'; tool: EditorToolId }
  | { type: 'swatch'; index: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'mirror'; axis: 'x' | 'y' }
  | { type: 'frame'; dir: -1 | 1 }
  | { type: 'zoom'; dir: -1 | 0 | 1 }
  | { type: 'shift'; dx: number; dy: number }
  | { type: 'play' }
  | { type: 'save' }
  | { type: 'help' }
  | { type: 'delete' }
  | { type: 'deselect' }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }

export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}

const TOOL_KEYS: Record<string, ToolId> = { p: 'pen', e: 'eraser', f: 'fill', l: 'line' }

function isTyping(t: KeyLike['target']): boolean {
  if (!t) return false
  const tag = (t.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true
}

/**
 * The editor action for a key press, or null when the key is not ours. Keys are ignored while typing in a text
 * field, and Ctrl/Cmd combinations other than undo/redo are left alone so browser shortcuts (reload, find...) work.
 */
export function shortcutFor(e: KeyLike): Action | null {
  if (isTyping(e.target)) return null
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  const mod = e.ctrlKey || e.metaKey

  if (mod) {
    if (e.altKey) return null
    if (key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' }
    if (key === 'y' && !e.shiftKey) return { type: 'redo' }
    if (e.shiftKey) return null
    if (key === 'c') return { type: 'copy' }
    if (key === 'x') return { type: 'cut' }
    if (key === 'v') return { type: 'paste' }
    if (key === 's') return { type: 'save' } // we save anyway; this stops the browser's own "save page"
    return null
  }

  if (e.altKey) {
    switch (e.key) {
      case 'ArrowLeft': return { type: 'shift', dx: -1, dy: 0 }
      case 'ArrowRight': return { type: 'shift', dx: 1, dy: 0 }
      case 'ArrowUp': return { type: 'shift', dx: 0, dy: -1 }
      case 'ArrowDown': return { type: 'shift', dx: 0, dy: 1 }
    }
    return null
  }

  if (e.key === '?') return { type: 'help' }

  if (key === 't') return { type: 'tool', tool: 'text' }
  if (key === 's') return { type: 'tool', tool: e.shiftKey ? 'lasso' : 'select' }
  if (key === 'r') return { type: 'tool', tool: e.shiftKey ? 'rectFill' : 'rect' }
  if (key === 'o') return { type: 'tool', tool: e.shiftKey ? 'ellipseFill' : 'ellipse' }
  if (!e.shiftKey && key in TOOL_KEYS) return { type: 'tool', tool: TOOL_KEYS[key] }

  if (/^[1-8]$/.test(key)) return { type: 'swatch', index: Number(key) - 1 }
  if (key === 'x') return { type: 'mirror', axis: 'x' }
  if (key === 'y') return { type: 'mirror', axis: 'y' }

  switch (e.key) {
    case '[':
    case 'ArrowLeft': return { type: 'frame', dir: -1 }
    case ']':
    case 'ArrowRight': return { type: 'frame', dir: 1 }
    case '+':
    case '=': return { type: 'zoom', dir: 1 }
    case '-': return { type: 'zoom', dir: -1 }
    case '0': return { type: 'zoom', dir: 0 }
    case 'Enter': return { type: 'play' }
    case 'Delete':
    case 'Backspace': return { type: 'delete' }
    case 'Escape': return { type: 'deselect' }
  }
  return null
}

/** Human-readable list for the help screen and editor/README.md. Keep in step with shortcutFor. */
export const SHORTCUT_HELP: readonly { keys: string; does: string }[] = [
  { keys: 'P / E / F / L', does: 'Pen / Eraser / Fill / Line' },
  { keys: 'T', does: 'Text: type, drag into place, Add' },
  { keys: 'S / Shift+S', does: 'Select a rectangle / select freehand' },
  { keys: 'Ctrl+C / Ctrl+X / Ctrl+V', does: 'Copy / cut / paste the selection (also between frames and designs)' },
  { keys: 'Delete', does: 'Erase the selected area' },
  { keys: 'Esc', does: 'Clear the selection' },
  { keys: 'R / Shift+R', does: 'Rectangle outline / filled' },
  { keys: 'O / Shift+O', does: 'Ellipse outline / filled' },
  { keys: '1 – 8', does: 'Brightness swatch (1 = off … 8 = full)' },
  { keys: 'X / Y', does: 'Mirror left-right / top-bottom' },
  { keys: 'Ctrl+Z', does: 'Undo' },
  { keys: 'Ctrl+Shift+Z or Ctrl+Y', does: 'Redo' },
  { keys: 'Ctrl+S', does: 'Save now' },
  { keys: '[ or ←  /  ] or →', does: 'Previous / next frame' },
  { keys: 'Alt+arrow keys', does: 'Shift the picture one pixel' },
  { keys: 'Enter', does: 'Play / stop the animation' },
  { keys: '+ / - / 0', does: 'Zoom in / zoom out / reset zoom' },
  { keys: '?', does: 'Show this list' },
  { keys: 'Mouse wheel', does: 'Zoom at the cursor' },
  { keys: 'Hold Space + drag, or middle button', does: 'Pan' },
]
