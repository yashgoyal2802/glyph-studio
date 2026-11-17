<script lang="ts">
  import { DARK_THEME, MatrixRenderer, type Ctx2D } from '../core/renderer'

  let { pixels, size = 52 }: { pixels: Uint8Array; size?: number } = $props()
  let canvas: HTMLCanvasElement

  $effect(() => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const renderer = new MatrixRenderer(ctx as unknown as Ctx2D, DARK_THEME) // the display is hardware: dark in both themes
    renderer.resize({ w: size, h: size }, dpr)
    renderer.draw(pixels)
  })
</script>

<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px" aria-hidden="true"></canvas>

<style>
  canvas { display: block; border-radius: 50%; }
</style>
