/** Height of the tray while a finger drags it. Dragging up (negative dy) opens it, down closes it; clamped to its range. */
export function draggedHeight(startHeight: number, dy: number, contentHeight: number): number {
  return Math.min(contentHeight, Math.max(0, startHeight - dy))
}

/** A drag shorter than this is a tap, not a drag. */
export const DRAG_THRESHOLD_PX = 8

/** Faster than this (px per ms) counts as a flick and decides the direction on its own. */
export const FLICK_SPEED = 0.4

/**
 * Where the tray settles when the finger lifts: the way you flicked if you flicked, otherwise whichever end is nearer.
 * [velocity] is px per ms, negative = upward.
 */
export function settlesOpen(velocity: number, currentHeight: number, contentHeight: number): boolean {
  if (Math.abs(velocity) > FLICK_SPEED) return velocity < 0
  return currentHeight > contentHeight / 2
}
