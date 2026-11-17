import type { LoopMode } from '../generated/shared'
import { applyMask, decodePixels, encodePixels } from '../format/pixels'
import { isPixelsLayer, type Design, type Frame, type Layer } from '../format/types'

/** A pixels layer with its brightness values decoded for fast editing. */
export interface EPixelsLayer {
  id: string
  type: 'pixels'
  pixels: Uint8Array
}

/** A layer type this version does not edit; kept as received so it round-trips. */
export interface EOtherLayer {
  id: string
  type: string
  raw: Layer
}

export type ELayer = EPixelsLayer | EOtherLayer

export interface EFrame {
  id: string
  durationMs: number
  layers: ELayer[]
}

/** The editable parts of a design, as the editor holds them in memory. */
export interface EDesign {
  id: string
  name: string
  loop: LoopMode
  frames: EFrame[]
}

export const isEPixels = (l: ELayer): l is EPixelsLayer => l.type === 'pixels' && 'pixels' in l

/** Throws when a pixels layer is malformed (callers treat that as a rejected edit). */
export function fromWireFrame(f: Frame): EFrame {
  return {
    id: f.id,
    durationMs: f.durationMs,
    layers: f.layers.map((l): ELayer => {
      if (!isPixelsLayer(l)) return { id: l.id, type: l.type, raw: l }
      const px = decodePixels(l.data)
      if (!px) throw new Error(`Layer ${l.id} has invalid pixel data`)
      return { id: l.id, type: 'pixels', pixels: applyMask(px) }
    }),
  }
}

export function toWireFrame(f: EFrame): Frame {
  return {
    id: f.id,
    durationMs: f.durationMs,
    layers: f.layers.map((l): Layer => (isEPixels(l) ? { id: l.id, type: 'pixels', data: encodePixels(l.pixels) } : l.raw)),
  }
}

export function toEditorDesign(d: Design): EDesign {
  return { id: d.id, name: d.name, loop: d.anim.loop, frames: d.frames.map(fromWireFrame) }
}

/** The first pixels layer of a frame, which is what the Phase 1 editor draws on. */
export function pixelsLayerOf(frame: EFrame): EPixelsLayer | undefined {
  return frame.layers.find(isEPixels)
}
