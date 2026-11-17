/** The eight paint swatches, from off (0) to full (255), evenly spaced. */
export const SWATCHES: readonly number[] = Array.from({ length: 8 }, (_, i) => Math.round((255 * i) / 7))

export const clampBrightness = (v: number): number => {
  if (!Number.isFinite(v)) return 0
  return Math.min(255, Math.max(0, Math.round(v)))
}

/** Index of the swatch closest to [v], so an exact value can still highlight a nearby swatch. */
export function nearestSwatch(v: number): number {
  let best = 0
  for (let i = 1; i < SWATCHES.length; i++) {
    if (Math.abs(SWATCHES[i] - v) < Math.abs(SWATCHES[best] - v)) best = i
  }
  return best
}
