import { decodeGif } from './gif'
import { detectImageFormat, unsupportedFileMessage } from './format'
import type { Rgba } from './pixelmath'

export interface MediaFrame {
  rgba: Rgba
  durationMs: number
}

/** A picture or GIF that has been read and is ready to be turned into frames. */
export interface Media {
  kind: 'still' | 'gif'
  name: string
  frames: MediaFrame[]
}

/** Still pictures are shrunk to this longest side: plenty for a 25x25 result, and quick to re-process while you adjust. */
const MAX_STILL_SIDE = 512

async function decodeStill(file: Blob): Promise<Rgba> {
  const bitmap = await createImageBitmap(file) // honours the photo's rotation information
  const scale = Math.min(1, MAX_STILL_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('This browser cannot read pictures.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const px = ctx.getImageData(0, 0, width, height)
  return { data: px.data, width, height }
}

/**
 * Read a file chosen by the user. The type is decided by the file's contents, not its name. Throws an Error with a
 * message fit to show the user when the file is not a supported picture or cannot be read.
 */
export async function loadMedia(file: File): Promise<Media> {
  const buffer = await file.arrayBuffer()
  const format = detectImageFormat(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16)))
  if (!format) throw new Error(unsupportedFileMessage(file.name))
  try {
    if (format === 'gif') {
      const gif = decodeGif(buffer)
      if (gif.frames.length > 1) return { kind: 'gif', name: file.name, frames: gif.frames }
      if (gif.frames.length === 1) return { kind: 'still', name: file.name, frames: [{ rgba: gif.frames[0].rgba, durationMs: 100 }] }
      throw new Error('empty')
    }
    return { kind: 'still', name: file.name, frames: [{ rgba: await decodeStill(file), durationMs: 100 }] }
  } catch {
    throw new Error(`Could not read “${file.name}”. The file may be damaged.`)
  }
}
