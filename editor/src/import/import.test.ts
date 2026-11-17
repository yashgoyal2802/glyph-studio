import { describe, expect, it } from 'vitest'
import { SWATCHES } from '../core/brightness'
import { idx } from '../core/matrix'
import { pixelsLayerOf, toEditorDesign } from '../core/model'
import { EditSession } from '../core/session'
import { createDesign, createFrame, parseDesign, serializeDesign } from '../format/design'
import { decodePixels } from '../format/pixels'
import { LED_MASK, MATRIX_CELLS, MATRIX_SIZE } from '../generated/shared'
import { designFromFrames, insertFramesOps } from './build'
import { detectImageFormat, nameFromFile, unsupportedFileMessage } from './format'
import { MAX_GIF_FRAMES, decodeGif, durationsForPlan, gifDelayToMs, planGifFrames } from './gif'
import {
  DEFAULT_ADJUST, DEFAULT_CROP, cropBox, downscale, luminanceGrid, pictureToFrame, toBrightness, type Adjust, type Rgba,
} from './pixelmath'

// ---------------------------------------------------------------------------------------------- helpers
const solid = (w: number, h: number, r: number, g: number, b: number, a = 255): Rgba => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([r, g, b, a], i * 4)
  return { data, width: w, height: h }
}
/** Paint a rectangle of one colour into an image. */
function rect(img: Rgba, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number], a = 255) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) (img.data as Uint8ClampedArray).set([...rgb, a], (y * img.width + x) * 4)
}
const at = (g: ArrayLike<number>, x: number, y: number) => g[idx(x, y)]
const ledCells = [...LED_MASK].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)

// ---------------------------------------------------------------------------------------------- 7.1 formats
describe('format detection', () => {
  const bytes = (...b: number[]) => new Uint8Array(b)
  const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))

  it('recognises PNG, JPEG, GIF and WebP by their first bytes', () => {
    expect(detectImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('png')
    expect(detectImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('jpeg')
    expect(detectImageFormat(ascii('GIF89a\x01\x00'))).toBe('gif')
    expect(detectImageFormat(ascii('GIF87a\x01\x00'))).toBe('gif')
    expect(detectImageFormat(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8 ')]))).toBe('webp')
  })

  it('refuses a PDF with a message that lists what is supported', () => {
    expect(detectImageFormat(ascii('%PDF-1.7\n'))).toBeNull()
    const msg = unsupportedFileMessage('report.pdf')
    expect(msg).toContain('report.pdf')
    for (const f of ['PNG', 'JPEG', 'WebP', 'GIF']) expect(msg).toContain(f)
  })

  it('refuses other files, empty files and files that only pretend (a RIFF that is not WebP)', () => {
    expect(detectImageFormat(new Uint8Array(0))).toBeNull()
    expect(detectImageFormat(bytes(1, 2, 3))).toBeNull()
    expect(detectImageFormat(ascii('PK\x03\x04zipfile'))).toBeNull()
    expect(detectImageFormat(ascii('RIFF....WAVEfmt '))).toBeNull()
    expect(detectImageFormat(ascii('GIF90a'))).toBeNull()
    expect(unsupportedFileMessage()).toContain('That file')
  })

  it('names the design after the file', () => {
    expect(nameFromFile('Cat photo.final.GIF')).toBe('Cat photo.final')
    expect(nameFromFile('C:\\pics\\logo.png')).toBe('logo')
    expect(nameFromFile('/storage/emulated/0/Download/blink.webp')).toBe('blink')
    expect(nameFromFile('.png')).toBe('Imported')
    expect(nameFromFile('x'.repeat(100) + '.png')).toHaveLength(60)
  })
})

// ---------------------------------------------------------------------------------------------- 7.2 crop + shrink
describe('crop', () => {
  it('fit shows the whole picture, fill covers the matrix, manual zooms and pans', () => {
    expect(cropBox(100, 50, { ...DEFAULT_CROP, mode: 'fit' })).toEqual({ cx: 50, cy: 25, size: 100 })
    expect(cropBox(100, 50, { ...DEFAULT_CROP, mode: 'fill' })).toEqual({ cx: 50, cy: 25, size: 50 })
    expect(cropBox(100, 50, { mode: 'manual', zoom: 2, panX: 0, panY: 0 })).toEqual({ cx: 50, cy: 25, size: 25 })
    expect(cropBox(100, 50, { mode: 'manual', zoom: 1, panX: 0.5, panY: -0.5 })).toEqual({ cx: 75, cy: 0, size: 50 })
    expect(cropBox(100, 50, { mode: 'manual', zoom: 999, panX: 0, panY: 0 }).size).toBeCloseTo(50 / 8) // zoom is limited
    expect(cropBox(100, 50, { mode: 'manual', zoom: 0, panX: 0, panY: 0 }).size).toBe(50) // nonsense falls back to 1x
  })

  it('a wide picture in "fit" mode leaves dark margins above and below', () => {
    const img = solid(100, 50, 255, 255, 255)
    const g = luminanceGrid(img, cropBox(100, 50, { ...DEFAULT_CROP, mode: 'fit' }))
    expect(at(g, 12, 12)).toBeCloseTo(255, 0) // the middle row is picture
    expect(at(g, 12, 2)).toBe(0) // the top is margin
    expect(at(g, 12, 22)).toBe(0) // and so is the bottom
  })

  it('"fill" cuts the longer side instead and has no margins', () => {
    const img = solid(100, 50, 255, 255, 255)
    rect(img, 0, 0, 20, 50, [0, 0, 0]) // a black strip that fill will cut off the left
    const g = luminanceGrid(img, cropBox(100, 50, { ...DEFAULT_CROP, mode: 'fill' }))
    expect(at(g, 12, 2)).toBeCloseTo(255, 0)
    expect(at(g, 12, 22)).toBeCloseTo(255, 0)
    expect(at(g, 0, 12)).toBeCloseTo(255, 0) // the black strip (x < 20) lies outside the 25..75 window
  })

  it('shrinks by averaging: half black half white gives a clean split', () => {
    const img = solid(50, 50, 0, 0, 0)
    rect(img, 25, 0, 50, 50, [255, 255, 255])
    const g = luminanceGrid(img, cropBox(50, 50, DEFAULT_CROP))
    expect(at(g, 3, 12)).toBeCloseTo(0, 0)
    expect(at(g, 20, 12)).toBeCloseTo(255, 0)
    expect(at(g, 12, 12)).toBeGreaterThan(0) // the cell on the seam is a blend
    expect(at(g, 12, 12)).toBeLessThan(255)
  })

  it('turns colour into brightness the way the eye sees it (green brighter than blue)', () => {
    const lum = (r: number, gc: number, b: number) => at(luminanceGrid(solid(25, 25, r, gc, b), cropBox(25, 25, DEFAULT_CROP)), 12, 12)
    expect(lum(255, 255, 255)).toBeCloseTo(255, 0)
    expect(lum(0, 0, 0)).toBe(0)
    expect(lum(0, 255, 0)).toBeGreaterThan(lum(255, 0, 0))
    expect(lum(255, 0, 0)).toBeGreaterThan(lum(0, 0, 255))
  })

  it('treats transparent pixels as dark and half-transparent ones as half as bright', () => {
    const lum = (a: number) => at(luminanceGrid(solid(25, 25, 255, 255, 255, a), cropBox(25, 25, DEFAULT_CROP)), 12, 12)
    expect(lum(0)).toBe(0)
    expect(lum(128)).toBeCloseTo(128, 0)
  })

  it('downscale keeps colours and is a no-op for small pictures', () => {
    const img = solid(8, 8, 200, 100, 50)
    const small = downscale(img, 4)
    expect([small.width, small.height]).toEqual([4, 4])
    expect(Array.from(small.data.slice(0, 4))).toEqual([200, 100, 50, 255])
    expect(downscale(img, 8)).toBe(img)
    const wide = downscale(solid(100, 20, 1, 2, 3), 50)
    expect([wide.width, wide.height]).toEqual([50, 10])
  })
})

// ---------------------------------------------------------------------------------------------- 7.3 adjustments
describe('brightness controls', () => {
  const ramp = Float32Array.from({ length: MATRIX_CELLS }, (_, i) => (i / (MATRIX_CELLS - 1)) * 255)
  const led = ledCells[40]
  const one = (v: number, adj: Partial<Adjust> = {}) => {
    const lum = new Float32Array(MATRIX_CELLS); lum[led] = v
    return toBrightness(lum, { ...DEFAULT_ADJUST, ...adj })[led]
  }

  it('leaves values alone with the default settings, and only writes LED cells', () => {
    const out = toBrightness(ramp, DEFAULT_ADJUST)
    for (const i of ledCells) expect(out[i]).toBe(Math.round(ramp[i]))
    for (let i = 0; i < MATRIX_CELLS; i++) if (!LED_MASK[i]) expect(out[i]).toBe(0)
  })

  it('invert turns bright into dark and dark into bright', () => {
    expect(one(0, { invert: true })).toBe(255)
    expect(one(255, { invert: true })).toBe(0)
    expect(one(100, { invert: true })).toBe(155)
  })

  it('brightness lifts or lowers everything and clamps', () => {
    expect(one(100, { brightness: 20 })).toBeCloseTo(151, 0)
    expect(one(100, { brightness: -20 })).toBeCloseTo(49, 0)
    expect(one(250, { brightness: 100 })).toBe(255)
    expect(one(5, { brightness: -100 })).toBe(0)
  })

  it('contrast spreads values away from mid-grey (and squeezes them when negative)', () => {
    expect(one(128, { contrast: 80 })).toBe(128)
    expect(one(180, { contrast: 50 })).toBeGreaterThan(180)
    expect(one(80, { contrast: 50 })).toBeLessThan(80)
    expect(one(200, { contrast: -50 })).toBeLessThan(200)
    expect(one(200, { contrast: -50 })).toBeGreaterThan(128)
  })

  it('"eight levels" snaps to the swatch brightnesses', () => {
    for (const v of [0, 17, 60, 100, 140, 200, 255]) expect(SWATCHES).toContain(one(v, { levels: 'eight' }))
    expect(one(0, { levels: 'eight' })).toBe(0)
    expect(one(255, { levels: 'eight' })).toBe(255)
    expect(one(150, { levels: 'eight' })).toBe(SWATCHES[4]) // 146
  })

  it('black-and-white splits at the threshold', () => {
    expect(one(99, { levels: 'bw', threshold: 100 })).toBe(0)
    expect(one(100, { levels: 'bw', threshold: 100 })).toBe(255)
    expect(one(200, { levels: 'bw', threshold: 220 })).toBe(0)
  })

  it('the whole picture pipeline: dark picture, inverted, becomes a bright one inside the circle only', () => {
    const img = solid(60, 40, 0, 0, 0)
    const out = pictureToFrame(img, { ...DEFAULT_CROP, mode: 'fill' }, { ...DEFAULT_ADJUST, invert: true })
    for (const i of ledCells) expect(out[i]).toBe(255)
    for (let i = 0; i < MATRIX_CELLS; i++) if (!LED_MASK[i]) expect(out[i]).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------- GIF test files
/** A tiny GIF writer for tests: 4-colour palette, uncompressed pixel data. */
const PALETTE: [number, number, number][] = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0]]
interface TestFrame {
  pixels: number[] // palette indexes, row by row for the frame's own rectangle
  rect?: { left: number; top: number; width: number; height: number }
  delayCs?: number
  disposal?: number
  transparent?: number
}
function encodeGif(width: number, height: number, frames: TestFrame[]): ArrayBuffer {
  const out: number[] = []
  const u16 = (n: number) => out.push(n & 255, n >> 8)
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)))
  u16(width); u16(height); out.push(0xf1, 0, 0)
  for (const c of PALETTE) out.push(...c)
  for (const f of frames) {
    const r = f.rect ?? { left: 0, top: 0, width, height }
    out.push(0x21, 0xf9, 4, ((f.disposal ?? 0) << 2) | (f.transparent !== undefined ? 1 : 0))
    u16(f.delayCs ?? 10); out.push(f.transparent ?? 0, 0)
    out.push(0x2c); u16(r.left); u16(r.top); u16(r.width); u16(r.height); out.push(0)
    out.push(2) // minimum code size 2 -> clear = 4, end = 5, codes are 3 bits wide
    // Uncompressed trick: a "clear" before every pixel keeps the code table (and width) from ever growing.
    const codes: number[] = []
    for (const p of f.pixels) codes.push(4, p)
    codes.push(5)
    const bytes: number[] = []
    let acc = 0, bits = 0
    for (const c of codes) { acc |= c << bits; bits += 3; while (bits >= 8) { bytes.push(acc & 255); acc >>= 8; bits -= 8 } }
    if (bits > 0) bytes.push(acc & 255)
    for (let i = 0; i < bytes.length; i += 255) { const chunk = bytes.slice(i, i + 255); out.push(chunk.length, ...chunk) }
    out.push(0)
  }
  out.push(0x3b)
  return new Uint8Array(out).buffer
}
const fill = (n: number, v: number) => Array(n).fill(v) as number[]
const pixelAt = (f: Rgba, x: number, y: number) => Array.from(f.data.slice((y * f.width + x) * 4, (y * f.width + x) * 4 + 4))

// ---------------------------------------------------------------------------------------------- 7.4 GIF
describe('GIF decoding', () => {
  it('reads every frame with the GIF\'s own timing (10 frames of 80 ms)', () => {
    const frames = Array.from({ length: 10 }, (_, i) => ({ pixels: fill(16, 1 + (i % 3)), delayCs: 8 }))
    const gif = decodeGif(encodeGif(4, 4, frames))
    expect(gif.frames).toHaveLength(10)
    expect(gif.frames.every((f) => f.durationMs === 80)).toBe(true)
    expect(gif.width).toBe(4)
    expect(pixelAt(gif.frames[0].rgba, 0, 0)).toEqual([255, 255, 255, 255])
    expect(pixelAt(gif.frames[1].rgba, 3, 3)).toEqual([255, 0, 0, 255])
    expect(pixelAt(gif.frames[2].rgba, 2, 1)).toEqual([0, 255, 0, 255])
  })

  it('a frame that only changes a rectangle keeps the rest of the previous picture', () => {
    const gif = decodeGif(encodeGif(4, 4, [
      { pixels: fill(16, 1) },
      { pixels: fill(4, 2), rect: { left: 1, top: 1, width: 2, height: 2 } },
    ]))
    const f2 = gif.frames[1].rgba
    expect(pixelAt(f2, 0, 0)).toEqual([255, 255, 255, 255]) // still white outside the patch
    expect(pixelAt(f2, 1, 1)).toEqual([255, 0, 0, 255]) // red patch
    expect(pixelAt(f2, 2, 2)).toEqual([255, 0, 0, 255])
    expect(pixelAt(f2, 3, 3)).toEqual([255, 255, 255, 255])
  })

  it('"restore to background" clears the previous frame before drawing the next', () => {
    const gif = decodeGif(encodeGif(4, 4, [
      { pixels: fill(16, 1), disposal: 2 },
      { pixels: fill(4, 2), rect: { left: 1, top: 1, width: 2, height: 2 } },
    ]))
    const f2 = gif.frames[1].rgba
    expect(pixelAt(f2, 0, 0)[3]).toBe(0) // transparent again
    expect(pixelAt(f2, 1, 1)).toEqual([255, 0, 0, 255])
  })

  it('"restore to previous" puts back what was there before the frame', () => {
    const gif = decodeGif(encodeGif(4, 4, [
      { pixels: fill(16, 1) },
      { pixels: fill(16, 2), disposal: 3 }, // draws red, then asks to be undone
      { pixels: fill(4, 3), rect: { left: 0, top: 0, width: 2, height: 2 } },
    ]))
    expect(pixelAt(gif.frames[1].rgba, 3, 3)).toEqual([255, 0, 0, 255])
    const f3 = gif.frames[2].rgba
    expect(pixelAt(f3, 3, 3)).toEqual([255, 255, 255, 255]) // back to frame 1's white, not red
    expect(pixelAt(f3, 0, 0)).toEqual([0, 255, 0, 255])
  })

  it('transparent pixels let the previous frame show through', () => {
    const gif = decodeGif(encodeGif(2, 2, [
      { pixels: fill(4, 1) },
      { pixels: [0, 2, 2, 0], transparent: 0 },
    ]))
    const f2 = gif.frames[1].rgba
    expect(pixelAt(f2, 0, 0)).toEqual([255, 255, 255, 255]) // kept
    expect(pixelAt(f2, 1, 0)).toEqual([255, 0, 0, 255]) // drawn
  })

  it('treats "no delay" as the usual 10 frames per second and clamps absurd delays', () => {
    expect(gifDelayToMs(0)).toBe(100)
    expect(gifDelayToMs(10)).toBe(100)
    expect(gifDelayToMs(20)).toBe(20)
    expect(gifDelayToMs(11)).toBe(16) // clamped to the shortest allowed frame
    expect(gifDelayToMs(1_000_000)).toBe(60000)
    const gif = decodeGif(encodeGif(2, 2, [{ pixels: fill(4, 1), delayCs: 0 }, { pixels: fill(4, 2), delayCs: 1 }]))
    expect(gif.frames.map((f) => f.durationMs)).toEqual([100, 100])
  })

  it('shrinks big frames to save memory', () => {
    const gif = decodeGif(encodeGif(8, 8, [{ pixels: fill(64, 1) }]), 4)
    expect([gif.frames[0].rgba.width, gif.frames[0].rgba.height]).toEqual([4, 4])
  })
})

describe('GIF frame limit', () => {
  it('keeps every frame of a normal GIF', () => {
    expect(planGifFrames(10, false)).toEqual({ indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], dropped: 0, truncated: false })
    expect(planGifFrames(MAX_GIF_FRAMES, false).truncated).toBe(false)
  })

  it('cuts a 500-frame GIF after 300 frames and says so', () => {
    const p = planGifFrames(500, false)
    expect(p.indices).toHaveLength(300)
    expect(p.indices[299]).toBe(299)
    expect(p.truncated).toBe(true)
    expect(p.dropped).toBe(200)
  })

  it('"skip every other frame" takes frames 0, 2, 4... and fits a 500-frame GIF', () => {
    const p = planGifFrames(500, true)
    expect(p.indices).toHaveLength(250)
    expect(p.indices.slice(0, 4)).toEqual([0, 2, 4, 6])
    expect(p.truncated).toBe(false)
    expect(p.dropped).toBe(0)
  })

  it('skipping still cuts a very long GIF at 300', () => {
    const p = planGifFrames(900, true)
    expect(p.indices).toHaveLength(300)
    expect(p.truncated).toBe(true)
    expect(p.dropped).toBe(900 - 600)
  })

  it('skipped frames lend their time to the kept ones, so the speed stays the same', () => {
    const durations = [100, 50, 100, 50, 100]
    const skip = planGifFrames(5, true)
    expect(durationsForPlan(durations, skip, true)).toEqual([150, 150, 100])
    expect(durationsForPlan(durations, planGifFrames(5, false), false)).toEqual(durations)
  })

  it('tiny GIFs and empty input behave', () => {
    expect(planGifFrames(0, false).indices).toEqual([])
    expect(planGifFrames(1, true).indices).toEqual([0])
  })
})

// ---------------------------------------------------------------------------------------------- 7.5 creating designs
describe('import targets', () => {
  const frames = [
    { pixels: Uint8Array.from({ length: MATRIX_CELLS }, (_, i) => (LED_MASK[i] ? 200 : 0)), durationMs: 80 },
    { pixels: new Uint8Array(MATRIX_CELLS), durationMs: 120 },
  ]

  it('becomes a new, valid design named after the file', () => {
    const d = designFromFrames('Blink', frames, 5000)
    expect(d.name).toBe('Blink')
    expect(d.frames.map((f) => f.durationMs)).toEqual([80, 120])
    expect(parseDesign(JSON.parse(JSON.stringify(serializeDesign(d)))).ok).toBe(true)
    const px = decodePixels((d.frames[0].layers[0] as { data: string }).data)!
    expect(px[ledCells[0]]).toBe(200)
    expect(new Set(d.frames.map((f) => f.id)).size).toBe(2)
    expect(() => designFromFrames('x', [])).toThrow()
  })

  it('a still image inserted into a 4-frame design after frame 2 becomes frame 3', () => {
    const d = createDesign('four')
    d.frames = Array.from({ length: 4 }, (_, i) => ({ ...createFrame(), id: `f${i + 1}` }))
    const s = new EditSession(toEditorDesign(d))
    const ops = insertFramesOps('f2', [frames[0]])
    expect(s.perform('Import', ops)).toBe(true)
    expect(s.design.frames).toHaveLength(5)
    expect(s.design.frames.map((f) => f.id).slice(0, 2)).toEqual(['f1', 'f2'])
    expect(pixelsLayerOf(s.design.frames[2])!.pixels[ledCells[0]]).toBe(200)
    expect(s.design.frames[3].id).toBe('f3')
  })

  it('several frames go in order after the chosen frame and undo as ONE action', () => {
    const d = createDesign('d')
    d.frames = Array.from({ length: 3 }, (_, i) => ({ ...createFrame(), id: `f${i + 1}` }))
    const s = new EditSession(toEditorDesign(d))
    s.perform('Import', insertFramesOps('f1', frames))
    expect(s.design.frames).toHaveLength(5)
    expect(s.design.frames[1].durationMs).toBe(80)
    expect(s.design.frames[2].durationMs).toBe(120)
    expect(s.design.frames[3].id).toBe('f2')
    expect(s.history.undoDepth).toBe(1)
    s.undo()
    expect(s.design.frames.map((f) => f.id)).toEqual(['f1', 'f2', 'f3'])
  })

  it('imported pictures never light cells without an LED', () => {
    const noLed = LED_MASK.findIndex((v) => !v)
    const dirty = new Uint8Array(MATRIX_CELLS).fill(255)
    const d = designFromFrames('x', [{ pixels: dirty, durationMs: 100 }])
    const px = decodePixels((serializeDesign(d).frames[0].layers[0] as { data: string }).data)!
    expect(px[noLed]).toBe(0)
    expect(MATRIX_SIZE).toBe(25)
  })
})
