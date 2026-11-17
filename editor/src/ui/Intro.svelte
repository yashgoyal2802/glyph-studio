<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import MatrixPlayer from './MatrixPlayer.svelte'
  import { TEMPLATES } from '../templates/templates'
  import { INTRO_STEPS } from './intro'
  import type { TimedFrame } from './matrixClock'
  import { pushBack } from './backStack'

  let { onClose }: { onClose: () => void } = $props()
  let step = $state(0)
  let nextBtn: HTMLButtonElement
  const last = $derived(step === INTRO_STEPS.length - 1)
  const art = (id: string): TimedFrame[] => TEMPLATES.find((t) => t.id === id)!.frames.map((f) => ({ pixels: f.pixels, durationMs: f.durationMs }))
  const frames = $derived(art(INTRO_STEPS[step].art))

  let el: HTMLDialogElement
  const opener = document.activeElement as HTMLElement | null
  onMount(() => { el.showModal(); nextBtn?.focus(); return pushBack(() => onClose()) }) // native modal: focus stays inside and Escape closes it
  onDestroy(() => { if (opener?.isConnected) opener.focus() })

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight' && !last) step++
    else if (e.key === 'ArrowLeft' && step > 0) step--
  }
</script>

<svelte:window onkeydown={onKey} />

<dialog class="intro" bind:this={el} onclose={onClose} aria-labelledby="intro-title">
  <div class="card">
    <button class="skip" onclick={onClose}>Skip</button>
    <div class="display" aria-hidden="true">
      <!-- Keyed on the step so every screen lights its dots in sequence, then plays. -->
      {#key step}<MatrixPlayer {frames} still={frames[0].pixels} size={176} reveal />{/key}
    </div>
    <h2 id="intro-title">{INTRO_STEPS[step].title}</h2>
    <p>{INTRO_STEPS[step].body}</p>
    <div class="pager" role="img" aria-label={`Step ${step + 1} of ${INTRO_STEPS.length}`}>
      {#each INTRO_STEPS as _, i}<span class:on={i === step}></span>{/each}
    </div>
    <div class="nav">
      <button class="back" onclick={() => step--} disabled={step === 0}>Back</button>
      <button class="next" bind:this={nextBtn} onclick={() => (last ? onClose() : step++)}>{last ? 'Start' : 'Next'}</button>
    </div>
  </div>
</dialog>

<style>
  .intro { border: 0; padding: 1rem; background: transparent; max-width: 100vw; max-height: 100dvh; width: 100%; box-sizing: border-box; }
  .intro[open] { display: grid; place-items: center; }
  .intro::backdrop { background: rgb(0 0 0 / 0.82); }
  .card { position: relative; width: min(100%, 26rem); max-height: 100%; overflow-y: auto; display: grid; gap: 0.9rem; justify-items: center; text-align: center; padding: 1.6rem 1.2rem 1.2rem; background: linear-gradient(170deg, var(--surface), var(--bg)); color: var(--text); border-radius: 28px; box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px var(--line), 0 30px 60px -20px rgb(0 0 0 / 0.8); }
  .skip { position: absolute; top: 0.5rem; right: 0.5rem; min-height: 44px; min-width: 44px; border-radius: 999px; background: transparent; border-color: transparent; color: var(--muted); font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; }
  .display { margin-top: 0.6rem; padding: 10px; border-radius: 50%; background: linear-gradient(145deg, var(--bezel-top), var(--bezel-bottom) 62%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.2), 0 18px 30px -16px rgb(0 0 0 / 0.85); line-height: 0; }
  .display :global(canvas) { background: var(--well); box-shadow: inset 0 3px 12px rgb(0 0 0 / 0.75); }
  h2 { margin: 0.3rem 0 0; font-family: var(--font-display); font-weight: 900; font-size: 1.75rem; line-height: 1.05; text-wrap: balance; }
  p { margin: 0; line-height: 1.5; max-width: 22rem; color: var(--muted); }
  .pager { display: flex; gap: 0.45rem; }
  .pager span { width: 8px; height: 8px; border-radius: 50%; background: var(--dot); transition: background var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
  .pager span.on { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  .nav { display: flex; gap: 0.5rem; width: 100%; }
  .nav button { flex: 1; min-height: 52px; border-radius: 999px; font-family: var(--font-mono); font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; }
  .nav .next { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 500; }
</style>
