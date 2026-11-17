import type { Point } from './matrix'
import { cellAt, nearestCell, panBy, zoomAt, type Size, type View } from './viewport'

/** A pointer event in canvas CSS pixels, independent of the DOM so the gesture rules can be tested. */
export interface PtrEvent {
  id: number
  x: number
  y: number
  pointerType: 'touch' | 'mouse' | 'pen'
  /** 0 = primary (left / touch), 1 = middle, 2 = secondary. */
  button: number
}

/** What the gesture controller drives. */
export interface GestureHost {
  canvasSize(): Size
  getView(): View
  setView(view: View): void
  strokeBegin(cell: Point): void
  strokeMove(cell: Point): void
  strokeEnd(cell: Point): void
  /** Throw the stroke away without committing anything. */
  strokeCancel(): void
}

type Mode = 'idle' | 'draw' | 'pan' | 'pinch'

/**
 * Turns raw pointer events into drawing, panning and zooming.
 *  - One finger (or the left mouse button) draws.
 *  - A second finger landing turns the gesture into pinch-zoom + pan and CANCELS any stroke already started,
 *    so a pinch can never leave a mark.
 *  - Middle mouse button, or left button while Space is held, pans. The wheel zooms around the cursor.
 *  - After a pinch, the finger that stays down does nothing until everything is lifted.
 */
export class GestureController {
  private pointers = new Map<number, { x: number; y: number }>()
  private mode: Mode = 'idle'
  private drawId = -1
  private panId = -1
  private lastCentroid = { x: 0, y: 0 }
  private lastDistance = 1
  private spaceHeld = false

  constructor(private readonly host: GestureHost) {}

  setSpaceHeld(held: boolean) {
    this.spaceHeld = held
  }

  get currentMode(): Mode {
    return this.mode
  }

  pointerDown(e: PtrEvent) {
    if (e.pointerType === 'mouse' && e.button === 2) return // right button: leave it to the browser
    this.pointers.set(e.id, { x: e.x, y: e.y })

    if (this.pointers.size >= 2) {
      if (this.mode === 'draw') this.host.strokeCancel()
      this.mode = 'pinch'
      this.drawId = -1
      this.panId = -1
      this.resetPinchBaseline()
      return
    }

    if (e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && this.spaceHeld))) {
      this.mode = 'pan'
      this.panId = e.id
      return
    }
    if (e.button !== 0) return

    const cell = cellAt(e.x, e.y, this.host.canvasSize(), this.host.getView())
    if (!cell) return // pressed outside the grid: nothing to draw, and no stroke to end later
    this.mode = 'draw'
    this.drawId = e.id
    this.host.strokeBegin(cell)
  }

  pointerMove(e: PtrEvent) {
    const prev = this.pointers.get(e.id)
    if (!prev) return
    this.pointers.set(e.id, { x: e.x, y: e.y })

    if (this.mode === 'draw' && e.id === this.drawId) {
      this.host.strokeMove(nearestCell(e.x, e.y, this.host.canvasSize(), this.host.getView()))
    } else if (this.mode === 'pan' && e.id === this.panId) {
      this.host.setView(panBy(this.host.getView(), e.x - prev.x, e.y - prev.y, this.host.canvasSize()))
    } else if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const { centroid, distance } = this.measure()
      const size = this.host.canvasSize()
      let view = panBy(this.host.getView(), centroid.x - this.lastCentroid.x, centroid.y - this.lastCentroid.y, size)
      if (this.lastDistance > 0 && distance > 0) view = zoomAt(view, distance / this.lastDistance, centroid.x, centroid.y, size)
      this.host.setView(view)
      this.lastCentroid = centroid
      this.lastDistance = distance
    }
  }

  pointerUp(e: PtrEvent) {
    if (!this.pointers.has(e.id)) return
    this.pointers.delete(e.id)
    if (this.mode === 'draw' && e.id === this.drawId) {
      this.host.strokeEnd(nearestCell(e.x, e.y, this.host.canvasSize(), this.host.getView()))
      this.mode = 'idle'
      this.drawId = -1
    } else if (this.mode === 'pan' && e.id === this.panId) {
      this.mode = 'idle'
      this.panId = -1
    } else if (this.mode === 'pinch') {
      if (this.pointers.size < 2) this.mode = 'idle' // the remaining finger must not start drawing
      else this.resetPinchBaseline()
    }
  }

  pointerCancel(e: PtrEvent) {
    if (!this.pointers.has(e.id)) return
    this.pointers.delete(e.id)
    if (this.mode === 'draw' && e.id === this.drawId) {
      this.host.strokeCancel() // the system took the gesture away (e.g. a palm or an edge swipe): keep nothing
      this.mode = 'idle'
      this.drawId = -1
    } else if (this.mode === 'pan' && e.id === this.panId) {
      this.mode = 'idle'
      this.panId = -1
    } else if (this.mode === 'pinch') {
      if (this.pointers.size < 2) this.mode = 'idle'
      else this.resetPinchBaseline()
    }
  }

  /** Mouse wheel / trackpad: zoom around the cursor. Pinch gestures on trackpads arrive with ctrlKey and are stronger. */
  wheel(x: number, y: number, deltaY: number, ctrlKey = false) {
    const factor = Math.exp(-deltaY * (ctrlKey ? 0.01 : 0.0015))
    this.host.setView(zoomAt(this.host.getView(), factor, x, y, this.host.canvasSize()))
  }

  private measure() {
    const pts = [...this.pointers.values()].slice(0, 2)
    return {
      centroid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
    }
  }

  private resetPinchBaseline() {
    if (this.pointers.size < 2) return
    const { centroid, distance } = this.measure()
    this.lastCentroid = centroid
    this.lastDistance = distance
  }
}
