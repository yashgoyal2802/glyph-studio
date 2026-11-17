<script lang="ts">
  import { onDestroy, onMount, type Snippet } from 'svelte'
  import { pushBack } from './backStack'

  let { title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: Snippet } = $props()
  let el: HTMLDialogElement
  // The control that opened the dialog gets the focus back when it goes away (a dialog removed from the page does not do this itself).
  const opener = document.activeElement as HTMLElement | null
  onDestroy(() => { if (opener?.isConnected) opener.focus() })
  onMount(() => pushBack(() => onClose())) // the Android Back button closes the dialog first

  $effect(() => {
    if (!el.open) el.showModal() // native modal: focus is trapped, Escape closes, the page behind is inert
  })
</script>

<dialog bind:this={el} class:wide onclose={onClose} onclick={(e) => { if (e.target === el) onClose() }} aria-labelledby="dlg-title">
  <div class="body">
    <h3 id="dlg-title">{title}</h3>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    width: min(92vw, 24rem);
    border: 0;
    border-radius: 28px;
    background: linear-gradient(170deg, var(--surface), var(--bg));
    color: var(--text);
    padding: 0;
    max-height: 92dvh;
    overflow-y: auto;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px var(--line), 0 30px 60px -20px rgb(0 0 0 / 0.8);
  }
  dialog.wide { width: min(94vw, 34rem); }
  dialog::backdrop { background: rgb(0 0 0 / 0.7); }
  .body { padding: 1.2rem; display: grid; gap: 0.8rem; }
  h3 { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; line-height: 1.1; overflow-wrap: anywhere; }
  /* Buttons in dialogs are the same raised keys as the rest of the app. */
  .body :global(button:not(.primary):not(.solid)) {
    background: linear-gradient(var(--key-top), var(--key-bottom));
    border-color: transparent;
    box-shadow: 0 2px 0 var(--key-edge), inset 0 1px 0 rgb(255 255 255 / 0.08);
  }
  .body :global(button:not(:disabled):active) { transform: translateY(1px); }
  @media (prefers-reduced-motion: no-preference) { dialog[open] { animation: pop var(--dur) var(--ease); } }
  @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
</style>
