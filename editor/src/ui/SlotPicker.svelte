<script lang="ts">
  import { onMount } from 'svelte'
  import { isInApp } from './host'
  import { assignSlot, listSlots, openToyManager, type SlotInfo } from '../api/client'
  import Dialog from './Dialog.svelte'

  let { designId, designName, onClose }: { designId: string; designName: string; onClose: () => void } = $props()

  let slots = $state<SlotInfo[]>([])
  let error = $state('')
  let busy = $state(false)
  let justAssigned = $state<number | null>(null)
  let managerFailed = $state(false)

  async function load() {
    try {
      slots = await listSlots()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function put(slot: number, id: string | null) {
    busy = true
    error = ''
    try {
      slots = await assignSlot(slot, id)
      justAssigned = id ? slot : null
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  async function openSettings() {
    managerFailed = false
    try {
      managerFailed = !(await openToyManager()).ok
    } catch {
      managerFailed = true
    }
  }

  onMount(load)
</script>

<Dialog title={`Play “${designName}” as a Glyph Toy`} onClose={onClose}>
  <p class="muted">Pick a slot. The design then plays whenever that toy is selected with the Glyph Button.</p>

  <ul>
    {#each slots as s (s.slot)}
      {@const mine = s.designId === designId}
      <li>
        <button class="slot" class:mine class:fresh={justAssigned === s.slot} onclick={() => put(s.slot, designId)} disabled={busy || mine} aria-pressed={mine}>
          <span class="n">Toy {s.slot}</span>
          <span class="who">{mine ? 'This design ✓' : (s.designName ?? 'Empty')}</span>
        </button>
        {#if s.designId}
          <button class="clear" onclick={() => put(s.slot, null)} disabled={busy} aria-label={`Empty Toy ${s.slot}`}>Empty</button>
        {/if}
      </li>
    {/each}
  </ul>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if justAssigned}
    <div class="next" role="status">
      <strong>Saved to Toy {justAssigned}.</strong>
      <ol>
        <li>{isInApp() ? 'Open Glyph Toys settings' : 'On the phone, open Settings → Glyph Toys'} and switch on “Toy {justAssigned}”.</li>
        <li>Press the Glyph Button on the back until that toy shows.</li>
      </ol>
      {#if isInApp()}<button class="primary" onclick={openSettings}>Open Glyph Toys settings</button>{/if}
      {#if managerFailed}<p class="error">Could not open it. Look for Glyph Toys in your phone’s Settings.</p>{/if}
    </div>
  {/if}

  <p class="muted small">Heads-up: Nothing OS switches every toy off after a short time (15 seconds on your phone, a setting on your phone). The “Show on Glyph Matrix” button in the editor stays on as long as you like.</p>

  <button onclick={onClose}>Done</button>
</Dialog>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
  li { display: flex; gap: 0.4rem; }
  .slot {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    text-align: left;
    border-radius: 12px;
  }
  .slot.mine { border-color: var(--accent); }
  /* Setting a toy: the chosen slot lights up (a quick red bloom), so the change is felt as well as read. */
  .slot.mine.fresh { animation: lit 0.6s var(--ease); }
  @keyframes lit { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 70%, transparent); background: color-mix(in srgb, var(--accent) 25%, var(--surface)); } to { box-shadow: 0 0 0 14px transparent; background: var(--surface); } }
  @media (prefers-reduced-motion: reduce) { .slot.mine.fresh { animation: none; } }
  .n { font-weight: 600; }
  .who { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clear { border-radius: 12px; padding: 0 0.8rem; font-size: 0.85rem; }
  .muted { color: var(--muted); font-size: 0.9rem; margin: 0; }
  .small { font-size: 0.8rem; }
  .error { color: var(--accent); margin: 0; }
  .next { border: 1px solid var(--line); border-radius: 12px; padding: 0.7rem 0.9rem; display: grid; gap: 0.4rem; }
  .next ol { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.2rem; font-size: 0.9rem; }
</style>
