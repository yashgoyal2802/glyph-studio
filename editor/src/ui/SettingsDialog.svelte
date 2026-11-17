<script lang="ts">
  import { onMount } from 'svelte'
  import { getSettings, putSettings } from '../api/client'
  import Dialog from './Dialog.svelte'

  let { onClose }: { onClose: () => void } = $props()
  let autoClose = $state(false)
  let loaded = $state(false)

  onMount(() => { getSettings().then((s) => { autoClose = s.autoClose; loaded = true }, () => { loaded = true }) })
  const setAutoClose = (on: boolean) => { autoClose = on; putSettings({ autoClose: on }).catch(() => {}) }
</script>

<Dialog title="Settings" {onClose}>
  <label class="row">
    <input type="checkbox" checked={autoClose} disabled={!loaded} onchange={(e) => setAutoClose(e.currentTarget.checked)} />
    <span><strong>Close the tool tray after I choose</strong><small>When on, picking a tool or a brightness slides the tray away so the board gets the whole screen.</small></span>
  </label>
  <div class="actions"><button class="primary" onclick={onClose}>Done</button></div>
</Dialog>

<style>
  .row { display: flex; gap: 0.8rem; align-items: flex-start; padding: 0.4rem 0 1rem; min-height: 44px; }
  input[type='checkbox'] { width: 24px; height: 24px; margin-top: 0.1rem; flex: none; accent-color: var(--accent); }
  span { display: grid; gap: 0.2rem; }
  small { color: var(--muted); line-height: 1.35; }
  .actions { display: grid; }
</style>
