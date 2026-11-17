<script module lang="ts">
  import type { TimedFrame } from './matrixClock'
  // Frames already fetched, keyed by design and its last-modified time, so a list that scrolls back and forth loads each once.
  const cache = new Map<string, TimedFrame[]>()
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { getDesign } from '../api/client'
  import { pixelsLayerOf, toEditorDesign } from '../core/model'
  import { decodePixels } from '../format/pixels'
  import { prefersReducedMotion } from './matrixClock'
  import MatrixPlayer from './MatrixPlayer.svelte'

  /**
   * A design's first frame; when [design] is given and the thumbnail is on screen it also plays the animation
   * (fetched once, and only while visible, so a long library stays smooth).
   */
  let { thumb, size = 56, design }: { thumb: string; size?: number; design?: { id: string; modified: number; frameCount: number } } = $props()

  let host: HTMLSpanElement
  let visible = $state(false)
  let frames = $state.raw<TimedFrame[] | null>(null)
  const still = $derived(decodePixels(thumb) ?? new Uint8Array(625))
  const key = $derived(design ? `${design.id}:${design.modified}` : '')

  onMount(() => {
    if (!design || design.frameCount < 2 || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting) }, { rootMargin: '80px' })
    io.observe(host)
    return () => io.disconnect()
  })

  $effect(() => {
    if (!visible || !design || design.frameCount < 2) return
    const k = key
    const cached = cache.get(k)
    if (cached) { frames = cached; return }
    let cancelled = false
    getDesign(design.id).then(
      (snap) => {
        const list = toEditorDesign(snap.design).frames.map((f) => ({ pixels: pixelsLayerOf(f)?.pixels ?? new Uint8Array(625), durationMs: f.durationMs }))
        cache.set(k, list)
        if (!cancelled) frames = list
      },
      () => {},
    )
    return () => { cancelled = true }
  })
</script>

<span class="thumb" bind:this={host} style:width="{size}px" style:height="{size}px"><MatrixPlayer {frames} {still} {size} active={visible} /></span>

<style>
  .thumb { display: inline-block; flex: none; line-height: 0; }
</style>
