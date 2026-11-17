<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte'
  import { AnimationPlayer } from '../core/player'
  import { DARK_THEME, MatrixRenderer, type Ctx2D } from '../core/renderer'
  import { MAX_GIF_FRAMES, durationsForPlan, planGifFrames } from '../import/gif'
  import { loadMedia, type Media } from '../import/media'
  import { nameFromFile } from '../import/format'
  import type { ImportedFrame, ImportTarget } from '../import/build'
  import { DEFAULT_ADJUST, DEFAULT_CROP, MAX_ZOOM, MIN_ZOOM, pictureToFrame, type Adjust, type Crop, type Levels } from '../import/pixelmath'
  import Dialog from './Dialog.svelte'

  let { canInsert, insertLabel = '', onClose, onImport }: {
    /** True when opened from the editor, where the frames can also be added to the open design. */
    canInsert: boolean
    insertLabel?: string
    onClose: () => void
    onImport: (frames: ImportedFrame[], name: string, target: ImportTarget) => Promise<void>
  } = $props()

  const PREVIEW = 240
  let media = $state.raw<Media | null>(null)
  let error = $state('')
  let loading = $state(false)
  let importing = $state(false)
  let crop = $state<Crop>({ ...DEFAULT_CROP })
  let adj = $state<Adjust>({ ...DEFAULT_ADJUST })
  let skipOther = $state(false)
  // Chosen once when the dialog opens (the props do not change while it is open).
  let target = $state<ImportTarget>(untrack(() => (canInsert ? 'insert' : 'new')))
  let previewIndex = $state(0)
  let canvas: HTMLCanvasElement
  // Tracked on purpose: the preview effect must re-run once the renderer exists, and again for every picture and setting.
  let renderer = $state.raw<MatrixRenderer | null>(null)
  let photoInput = $state<HTMLInputElement>()
  let fileInput = $state<HTMLInputElement>()
  // On a phone the photo picker and the file browser are different places, so offer both. A PC has one file dialog.
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  let dragging = $state(false)

  const plan = $derived(media?.kind === 'gif' ? planGifFrames(media.frames.length, skipOther) : null)
  const frameCount = $derived(plan ? plan.indices.length : media ? 1 : 0)
  const player = new AnimationPlayer((i) => { previewIndex = i }, () => {})

  async function choose(file: File | undefined | null) {
    if (!file) return
    error = ''
    loading = true
    player.stop()
    try {
      media = await loadMedia(file)
      crop = { ...DEFAULT_CROP }
      adj = { ...DEFAULT_ADJUST }
      skipOther = false
      previewIndex = 0
    } catch (e) {
      media = null
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  // The preview animates a GIF with its own timing; for a still it just shows the one picture.
  $effect(() => {
    player.stop()
    if (media && plan && plan.indices.length > 1) {
      player.start(durationsForPlan(media.frames.map((f) => f.durationMs), plan, skipOther), 'loop')
    } else {
      previewIndex = 0
    }
  })

  // Draw the live preview: the exact picture that will be imported, on the round matrix.
  $effect(() => {
    if (!renderer || !media) return
    const source = media.frames[plan ? plan.indices[Math.min(previewIndex, plan.indices.length - 1)] : 0]
    renderer.draw(pictureToFrame(source.rgba, crop, adj))
  })

  // Dragging the preview moves the picture, once the crop is "Custom".
  let panning: { x: number; y: number } | null = null
  function panStart(e: PointerEvent) {
    if (crop.mode !== 'manual') return
    panning = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId)
  }
  function panMove(e: PointerEvent) {
    if (!panning) return
    // The window moves the opposite way to the picture you are dragging.
    crop = { ...crop, panX: clampPan(crop.panX - (e.clientX - panning.x) / PREVIEW), panY: clampPan(crop.panY - (e.clientY - panning.y) / PREVIEW) }
    panning = { x: e.clientX, y: e.clientY }
  }
  const clampPan = (v: number) => Math.max(-2, Math.min(2, v))

  function setCrop(mode: Crop['mode']) {
    crop = mode === 'manual' ? { ...crop, mode, zoom: 1, panX: 0, panY: 0 } : { ...DEFAULT_CROP, mode }
  }

  async function doImport() {
    if (!media || importing) return
    importing = true
    error = ''
    try {
      const sources = plan ? plan.indices : [0]
      const durations = plan ? durationsForPlan(media.frames.map((f) => f.durationMs), plan, skipOther) : [media.frames[0].durationMs]
      const frames: ImportedFrame[] = sources.map((i, k) => ({ pixels: pictureToFrame(media!.frames[i].rgba, crop, adj), durationMs: durations[k] }))
      await onImport(frames, nameFromFile(media.name), canInsert ? target : 'new')
      onClose()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      importing = false
    }
  }

  const LEVELS: { id: Levels; label: string }[] = [
    { id: 'full', label: 'Smooth' },
    { id: 'eight', label: '8 levels' },
    { id: 'bw', label: 'Black & white' },
  ]

  onMount(() => {
    renderer = new MatrixRenderer(canvas.getContext('2d') as unknown as Ctx2D, DARK_THEME)
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(PREVIEW * dpr)
    canvas.height = Math.round(PREVIEW * dpr)
    renderer.resize({ w: PREVIEW, h: PREVIEW }, dpr)
  })
  onDestroy(() => player.stop())
</script>

<Dialog title="Import a picture or GIF" wide {onClose}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="drop"
    class:over={dragging}
    ondragover={(e) => { e.preventDefault(); dragging = true }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => { e.preventDefault(); dragging = false; choose(e.dataTransfer?.files?.[0]) }}
  >
    {#if touch}
      <input bind:this={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={(e) => { choose(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
      <input bind:this={fileInput} type="file" accept="image/gif" hidden onchange={(e) => { choose(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
      <div class="pick-row">
        <button class="primary" onclick={() => photoInput?.click()} disabled={loading}>From photos…</button>
        <button onclick={() => fileInput?.click()} disabled={loading}>Browse files / GIFs…</button>
      </div>
    {:else}
      <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onchange={(e) => { choose(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
      <button class="primary" onclick={() => fileInput?.click()} disabled={loading}>{media ? 'Choose another…' : 'Choose a picture or GIF…'}</button>
    {/if}
    <span class="muted">{loading ? 'Reading…' : media ? media.name : touch ? 'Use “Browse files” for GIFs and anything saved in Downloads.' : 'PNG, JPEG, WebP or GIF. You can also drop a file here.'}</span>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="preview" hidden={!media}>
    <canvas
      bind:this={canvas}
      class:grab={crop.mode === 'manual'}
      style:width="{PREVIEW}px"
      style:height="{PREVIEW}px"
      aria-label="Preview on the Glyph Matrix"
      onpointerdown={panStart}
      onpointermove={panMove}
      onpointerup={() => (panning = null)}
      onpointercancel={() => (panning = null)}
    ></canvas>
    {#if media?.kind === 'gif' && plan}
      <p class="muted center">{media.frames.length} frames{plan.truncated ? ` — only ${MAX_GIF_FRAMES} will be imported` : ''}</p>
    {/if}
  </div>

  {#if media}
    <section class="controls">
      <h4>Crop</h4>
      <div class="seg" role="radiogroup" aria-label="Crop">
        <button role="radio" aria-checked={crop.mode === 'fit'} class:active={crop.mode === 'fit'} onclick={() => setCrop('fit')}>Fit all</button>
        <button role="radio" aria-checked={crop.mode === 'fill'} class:active={crop.mode === 'fill'} onclick={() => setCrop('fill')}>Fill circle</button>
        <button role="radio" aria-checked={crop.mode === 'manual'} class:active={crop.mode === 'manual'} onclick={() => setCrop('manual')}>Custom</button>
      </div>
      {#if crop.mode === 'manual'}
        <label class="slider">Zoom
          <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step="0.05" bind:value={crop.zoom} />
          <span>{crop.zoom.toFixed(2)}×</span>
        </label>
        <p class="muted small">Drag the preview to move the picture.</p>
      {/if}

      <h4>Brightness</h4>
      <label class="slider">Brightness <input type="range" min="-100" max="100" step="1" bind:value={adj.brightness} /><span>{adj.brightness}</span></label>
      <label class="slider">Contrast <input type="range" min="-100" max="100" step="1" bind:value={adj.contrast} /><span>{adj.contrast}</span></label>
      <div class="seg" role="radiogroup" aria-label="Levels">
        {#each LEVELS as l (l.id)}
          <button role="radio" aria-checked={adj.levels === l.id} class:active={adj.levels === l.id} onclick={() => (adj.levels = l.id)}>{l.label}</button>
        {/each}
      </div>
      {#if adj.levels === 'bw'}
        <label class="slider">Cut-off <input type="range" min="1" max="254" step="1" bind:value={adj.threshold} /><span>{adj.threshold}</span></label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={adj.invert} /> Invert (swap bright and dark)</label>

      {#if media.kind === 'gif'}
        <h4>Animation</h4>
        <label class="check"><input type="checkbox" bind:checked={skipOther} /> Skip every other frame (smaller, same speed)</label>
      {/if}

      {#if canInsert}
        <h4>Where to put it</h4>
        <div class="seg" role="radiogroup" aria-label="Where to put it">
          <button role="radio" aria-checked={target === 'insert'} class:active={target === 'insert'} onclick={() => (target = 'insert')}>{insertLabel || 'Add to this design'}</button>
          <button role="radio" aria-checked={target === 'new'} class:active={target === 'new'} onclick={() => (target = 'new')}>New design</button>
        </div>
      {/if}
    </section>
  {/if}

  <div class="buttons">
    <button onclick={onClose}>Cancel</button>
    <button class="primary" onclick={doImport} disabled={!media || importing}>
      {importing ? 'Importing…' : media ? `Import ${frameCount} ${frameCount === 1 ? 'frame' : 'frames'}` : 'Import'}
    </button>
  </div>
</Dialog>

<style>
  .drop { display: grid; gap: 0.4rem; justify-items: start; padding: 0.7rem; border: 1px dashed var(--line); border-radius: 14px; }
  .drop.over { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .pick-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .preview { display: grid; justify-items: center; gap: 0.3rem; }
  .preview[hidden] { display: none; } /* nothing to preview until a picture is chosen */
  canvas { background: var(--bg); border-radius: 18px; touch-action: none; max-width: 100%; }
  canvas.grab { cursor: grab; }
  .controls { display: grid; gap: 0.5rem; }
  h4 { margin: 0.4rem 0 0; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0.3rem; }
  .seg button { border-radius: 12px; min-height: 44px; padding: 0 0.3rem; font-size: 0.8rem; }
  .seg button.active { background: var(--text); color: var(--bg); border-color: var(--text); }
  .slider { display: grid; grid-template-columns: 5.5rem 1fr 3.2rem; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
  .slider input { min-height: 44px; accent-color: var(--text); }
  .slider span { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
  .check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; min-height: 44px; }
  .check input { width: 20px; height: 20px; accent-color: var(--accent); flex: none; }
  .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .muted { color: var(--muted); font-size: 0.85rem; margin: 0; }
  .small { font-size: 0.78rem; }
  .center { text-align: center; }
  .error { color: var(--accent); margin: 0; }
</style>
