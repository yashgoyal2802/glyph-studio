<script lang="ts">
  // One dot per frame, capped so a long animation stays one tidy row; the count follows after the cap.
  let { count, max = 8 }: { count: number; max?: number } = $props()
  const shown = $derived(Math.min(count, max))
</script>

<span class="dotcount" role="img" aria-label={`${count} ${count === 1 ? 'frame' : 'frames'}`}>
  {#each Array(shown) as _}<i></i>{/each}
  {#if count > max}<small>+{count - max}</small>{/if}
</span>

<style>
  .dotcount { display: inline-flex; align-items: center; gap: 3px; }
  i { width: 5px; height: 5px; border-radius: 50%; background: var(--lit); }
  small { font-family: var(--font-mono); font-size: 0.65rem; color: var(--muted); margin-left: 2px; }
</style>
