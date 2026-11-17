<script lang="ts">
  import { SHORTCUT_HELP } from '../core/shortcuts'
  import Dialog from './Dialog.svelte'

  let { onClose }: { onClose: () => void } = $props()
</script>

<Dialog title="Keyboard shortcuts" wide {onClose}>
  <dl>
    {#each SHORTCUT_HELP as s (s.keys)}
      <div class="row"><dt>{s.keys}</dt><dd>{s.does}</dd></div>
    {/each}
  </dl>
  <button class="primary" onclick={onClose}>Close</button>
</Dialog>

<style>
  dl { margin: 0 0 0.9rem; display: grid; gap: 0.1rem; }
  .row { display: grid; grid-template-columns: minmax(9rem, 40%) 1fr; gap: 0.8rem; padding: 0.35rem 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
  dt { font-family: ui-monospace, 'Cascadia Mono', monospace; font-weight: 600; }
  dd { margin: 0; color: var(--muted); }
  button { width: 100%; }
</style>
