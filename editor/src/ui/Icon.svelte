<script lang="ts">
  import { GRID, ICONS, type IconName } from './icons'

  let { name, size = 22 }: { name: IconName; size?: number } = $props()
  const grid = $derived(ICONS[name].grid)
  const pitch = 4
  const dots = $derived(
    grid.flatMap((row, y) => [...row].map((c, x) => ({ x: x * pitch + pitch / 2, y: y * pitch + pitch / 2, on: c === '#' }))),
  )
  const span = GRID * pitch
</script>

<svg viewBox="0 0 {span} {span}" width={size} height={size} aria-hidden="true" class="dot-icon">
  {#each dots as d}<circle cx={d.x} cy={d.y} r={d.on ? 1.45 : 0.75} class:on={d.on} />{/each}
</svg>

<style>
  .dot-icon { flex: none; }
  circle { fill: currentColor; opacity: 0.16; }
  circle.on { opacity: 1; }
</style>
