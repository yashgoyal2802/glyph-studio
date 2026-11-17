<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { pixelsLayerOf, type EFrame } from '../core/model'
  import PixelThumb from './PixelThumb.svelte'

  let {
    frames,
    currentId,
    activeIndex = null,
    disabled = false,
    onSelect,
    onMove,
    onAdd,
    onActions,
  }: {
    frames: EFrame[]
    currentId: string
    /** While playing: the frame being shown (highlighted instead of the selected one). */
    activeIndex?: number | null
    disabled?: boolean
    onSelect: (id: string) => void
    onMove: (id: string, toIndex: number) => void
    onAdd: () => void
    /** A tap on the frame that is already selected (and not playing): offer what can be done to it. */
    onActions?: (id: string) => void
  } = $props()

  const EMPTY = new Uint8Array(625)
  const LONG_PRESS_MS = 350
  const MOVE_SLOP = 10

  let stripEl: HTMLDivElement
  // Reordering: press and hold a thumbnail (or drag it with a mouse), slide it to a new place, release.
  let pending: { id: string; x: number; y: number; pointerType: string; timer: ReturnType<typeof setTimeout> | null } | null = null
  let reordering = $state<{ id: string; dropIndex: number } | null>(null)
  let swallowClick = false

  const selectedIndex = $derived(frames.findIndex((f) => f.id === currentId))

  // Keep the selected (or playing) frame in view.
  $effect(() => {
    const idx = activeIndex ?? selectedIndex
    const el = stripEl?.querySelectorAll<HTMLElement>('[data-frame]')[idx]
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  })

  function dropIndexAt(clientX: number): number {
    const items = [...stripEl.querySelectorAll<HTMLElement>('[data-frame]')]
    let best = 0
    let bestDist = Infinity
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const d = Math.abs(clientX - (r.left + r.width / 2))
      if (d < bestDist) { best = i; bestDist = d }
    })
    return best
  }

  function down(e: PointerEvent, id: string) {
    if (disabled || e.button !== 0 || frames.length < 2) return
    clearPending()
    pending = { id, x: e.clientX, y: e.clientY, pointerType: e.pointerType, timer: null }
    if (e.pointerType === 'touch') {
      pending.timer = setTimeout(() => { if (pending) beginReorder(pending.id) }, LONG_PRESS_MS)
    }
  }

  function beginReorder(id: string) {
    reordering = { id, dropIndex: frames.findIndex((f) => f.id === id) }
    if (pending?.timer) clearTimeout(pending.timer)
    navigator.vibrate?.(15)
  }

  function move(e: PointerEvent) {
    if (!pending) return
    const dx = e.clientX - pending.x
    const dy = e.clientY - pending.y
    if (!reordering) {
      if (Math.hypot(dx, dy) < MOVE_SLOP) return
      if (pending.pointerType === 'touch') { clearPending(); return } // the finger is scrolling the strip
      beginReorder(pending.id) // a mouse drag starts straight away
    }
    stripEl.setPointerCapture?.(e.pointerId)
    reordering = { id: reordering!.id, dropIndex: dropIndexAt(e.clientX) }
    const r = stripEl.getBoundingClientRect() // scroll when the finger is near an edge
    if (e.clientX < r.left + 40) stripEl.scrollBy({ left: -12 })
    else if (e.clientX > r.right - 40) stripEl.scrollBy({ left: 12 })
  }

  function up() {
    const r = reordering
    clearPending()
    reordering = null
    if (r) {
      swallowClick = true
      setTimeout(() => (swallowClick = false), 0)
      if (r.dropIndex !== frames.findIndex((f) => f.id === r.id)) onMove(r.id, r.dropIndex)
    }
  }

  function clearPending() {
    if (pending?.timer) clearTimeout(pending.timer)
    pending = null
  }

  function click(id: string) {
    if (swallowClick || disabled) return
    if (id === currentId && activeIndex === null && onActions) { onActions(id); return }
    onSelect(id)
  }

  // Once a long press has started a reorder, stop the strip from also scrolling.
  function blockScrollWhileReordering(e: TouchEvent) { if (reordering) e.preventDefault() }
  onMount(() => stripEl.addEventListener('touchmove', blockScrollWhileReordering, { passive: false }))
  onDestroy(() => { clearPending(); stripEl?.removeEventListener('touchmove', blockScrollWhileReordering) })
</script>

<div class="strip" bind:this={stripEl} role="group" aria-label="Frames" onpointermove={move} onpointerup={up} onpointercancel={() => { clearPending(); reordering = null }}>
  {#each frames as f, i (f.id)}
    {@const shown = activeIndex === null ? f.id === currentId : i === activeIndex}
    <div
      class="slot"
      class:drop-before={reordering && reordering.dropIndex === i && reordering.id !== f.id && i < frames.findIndex((x) => x.id === reordering!.id)}
      class:drop-after={reordering && reordering.dropIndex === i && reordering.id !== f.id && i > frames.findIndex((x) => x.id === reordering!.id)}
      data-frame={f.id}
    >
      <button
        class="thumb"
        class:current={shown}
        class:lifted={reordering?.id === f.id}
        aria-pressed={shown}
        aria-label={`Frame ${i + 1}, ${f.durationMs} milliseconds`}
        onpointerdown={(e) => down(e, f.id)}
        onclick={() => click(f.id)}
        {disabled}
      >
        <PixelThumb pixels={(pixelsLayerOf(f)?.pixels) ?? EMPTY} size={48} />
        <span class="n">{i + 1}</span>
      </button>
    </div>
  {/each}
  <button class="add" onclick={onAdd} {disabled} aria-label="Add a frame after the selected one" title="Add a frame">+</button>
</div>

<style>
  .strip {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding: 4px 2px;
    touch-action: pan-x; /* the finger scrolls the strip; a long press switches to reordering */
    -webkit-user-select: none;
    user-select: none;
  }
  .strip::-webkit-scrollbar { display: none; }
  .slot { position: relative; flex: none; }
  .slot.drop-before::before, .slot.drop-after::after {
    content: '';
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 4px;
    border-radius: 2px;
    background: var(--accent);
  }
  .slot.drop-before::before { left: -5px; }
  .slot.drop-after::after { right: -5px; }
  button.thumb {
    position: relative;
    display: grid;
    place-items: center;
    width: 60px;
    height: 60px;
    min-height: 0;
    padding: 0;
    border-radius: 14px;
  }
  button.thumb { background: var(--well); border-color: var(--key-edge); transition: box-shadow var(--dur) var(--ease), transform var(--dur-fast) var(--ease); }
  @media (prefers-reduced-motion: reduce) { button.thumb { transition: none; } }
  button.thumb.current { border-color: transparent; box-shadow: 0 0 0 2px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 40%, transparent); }
  button.thumb.lifted { opacity: 0.6; transform: scale(1.08); }
  .n {
    position: absolute;
    left: 5px;
    top: 3px;
    font-size: 0.65rem;
    color: #8d8d93;
  }
  button.add {
    flex: none;
    width: 60px;
    height: 60px;
    min-height: 0;
    padding: 0;
    border-radius: 14px;
    font-size: 1.6rem;
    line-height: 1;
    border-style: dashed;
  }
</style>
