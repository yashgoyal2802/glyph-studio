import type { Point } from './matrix'
import { ellipsePoints, floodFillPoints, linePoints, rectPoints } from './raster'

/** The selection tools are not drawing tools: they pick pixels instead of painting them (see selection.ts). */
export type SelectToolId = 'select' | 'lasso'
export type EditorToolId = ToolId | SelectToolId | 'text'
export const isDrawTool = (id: EditorToolId): id is ToolId => id !== 'select' && id !== 'lasso' && id !== 'text'

export type ToolId = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'rectFill' | 'ellipse' | 'ellipseFill'

/**
 * A drawing tool turns pointer positions into the cells it wants to set. Tools never touch pixels themselves: the
 * Stroke applies the cells (with symmetry and the LED mask) to a copy, so a tool can be freely previewed or abandoned.
 */
export interface Tool {
  readonly id: ToolId
  /** True for the eraser: it always paints 0 regardless of the selected brightness. */
  readonly erase: boolean
  /** [base] is the frame as it was before the stroke (the fill tool needs it). [value] is what the cells will become. */
  begin(p: Point, base: Uint8Array, value: number): void
  move(p: Point): void
  end(p: Point): void
  /** Every cell this stroke wants to set so far (cumulative; shapes recompute it as the drag changes). */
  points(): Point[]
}

const key = (p: Point) => p.y * 4096 + p.x

/** Freehand drawing. Fast drags are joined with straight lines so no gaps are left between pointer samples. */
class FreehandTool implements Tool {
  private last: Point | null = null
  private seen = new Map<number, Point>()
  constructor(readonly id: 'pen' | 'eraser', readonly erase: boolean) {}

  begin(p: Point) {
    this.last = p
    this.seen.clear()
    this.add([p])
  }
  move(p: Point) {
    if (!this.last) return
    this.add(linePoints(this.last, p))
    this.last = p
  }
  end(p: Point) {
    // The finger can lift at a different spot than the last move sample: include that final segment.
    if (this.last) this.add(linePoints(this.last, p))
    this.last = null
  }
  points() {
    return [...this.seen.values()]
  }
  private add(ps: Point[]) {
    for (const p of ps) this.seen.set(key(p), p)
  }
}

/** Shapes are defined by the cell where the drag started and the cell where it is now. */
class ShapeTool implements Tool {
  readonly erase = false
  private start: Point | null = null
  private current: Point | null = null
  constructor(readonly id: ToolId, private readonly shape: (a: Point, b: Point) => Point[]) {}

  begin(p: Point) {
    this.start = p
    this.current = p
  }
  move(p: Point) {
    this.current = p
  }
  end(p: Point) {
    this.current = p
  }
  points() {
    return this.start && this.current ? this.shape(this.start, this.current) : []
  }
}

class FillTool implements Tool {
  readonly id = 'fill'
  readonly erase = false
  private cells: Point[] = []
  begin(p: Point, base: Uint8Array, value: number) {
    this.cells = floodFillPoints(base, p, value)
  }
  move() {}
  end() {}
  points() {
    return this.cells
  }
}

/** A fresh tool instance for one stroke. */
export function createTool(id: ToolId): Tool {
  switch (id) {
    case 'pen':
      return new FreehandTool('pen', false)
    case 'eraser':
      return new FreehandTool('eraser', true)
    case 'fill':
      return new FillTool()
    case 'line':
      return new ShapeTool('line', linePoints)
    case 'rect':
      return new ShapeTool('rect', (a, b) => rectPoints(a, b, false))
    case 'rectFill':
      return new ShapeTool('rectFill', (a, b) => rectPoints(a, b, true))
    case 'ellipse':
      return new ShapeTool('ellipse', (a, b) => ellipsePoints(a, b, false))
    case 'ellipseFill':
      return new ShapeTool('ellipseFill', (a, b) => ellipsePoints(a, b, true))
  }
}

export const TOOL_IDS: readonly ToolId[] = ['pen', 'eraser', 'fill', 'line', 'rect', 'rectFill', 'ellipse', 'ellipseFill']
