<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import qrcode from 'qrcode-generator'
  import { disconnectPcs, getPcStatus, startPcEditing, stopPcEditing, type PcStatus } from '../api/client'
  import Dialog from './Dialog.svelte'

  let { onClose }: { onClose: () => void } = $props()

  let status = $state<PcStatus | null>(null)
  let error = $state('')
  let working = $state(false)
  let timer: ReturnType<typeof setInterval> | undefined

  const qr = $derived.by(() => {
    if (!status?.url) return ''
    const code = qrcode(0, 'M')
    code.addData(status.url)
    code.make()
    return code.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
  })
  // Digits grouped as "123 456" so they are easy to read and type.
  const spacedCode = $derived(status?.code ? `${status.code.slice(0, 3)} ${status.code.slice(3)}` : '')

  async function refresh() {
    try {
      status = await getPcStatus()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function run(fn: () => Promise<PcStatus>) {
    working = true
    error = ''
    try {
      status = await fn()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      working = false
    }
  }

  function turnOn() {
    // Android 13+ needs a one-time permission to show the "PC editing is on" notification.
    ;(window as unknown as { GlyphAndroid?: { requestNotificationPermission?: () => void } }).GlyphAndroid?.requestNotificationPermission?.()
    return run(startPcEditing)
  }

  onMount(() => {
    refresh()
    timer = setInterval(refresh, 2500) // the code changes after wrong guesses and the connected count changes
  })
  onDestroy(() => clearInterval(timer))
</script>

<Dialog title="Edit from a computer" {onClose}>
  {#if !status}
    <p class="muted">{error || 'Loading…'}</p>
  {:else if !status.on}
    <p class="muted">Design on a bigger screen with a mouse and keyboard. Your phone and the computer must be on the same Wi-Fi.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="buttons">
      <button onclick={onClose}>Close</button>
      <button class="primary" onclick={turnOn} disabled={working}>{working ? 'Starting…' : 'Turn on'}</button>
    </div>
  {:else}
    <p class="muted">On the computer, open this address in a browser, then enter the code:</p>
    <p class="url">{status.url}</p>
    <div class="qr" aria-label="QR code for the address">{@html qr}</div>
    <p class="label">Pairing code</p>
    <p class="code" aria-label={`Pairing code ${status.code?.split('').join(' ')}`}>{spacedCode}</p>
    <p class="muted">
      {status.paired === 0 ? 'No computer connected yet.' : `${status.paired} ${status.paired === 1 ? 'computer' : 'computers'} connected.`}
      It turns off by itself after 30 minutes without use.
    </p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="stack">
      <button onclick={() => run(disconnectPcs)} disabled={working || status.paired === 0}>Disconnect all computers</button>
      <button class="primary" onclick={() => run(stopPcEditing)} disabled={working}>Turn off</button>
      <button onclick={onClose}>Close</button>
    </div>
  {/if}
</Dialog>

<style>
  p { margin: 0 0 0.6rem; }
  .muted { color: var(--muted); font-size: 0.9rem; }
  .error { color: var(--accent); }
  .label { color: var(--muted); font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.1rem; }
  .url { font-family: ui-monospace, monospace; font-size: 1.05rem; font-weight: 600; word-break: break-all; }
  .qr { width: 9.5rem; margin: 0 auto 0.8rem; padding: 0.6rem; background: #fff; border-radius: 12px; line-height: 0; }
  .code { font-size: 2.2rem; font-weight: 700; letter-spacing: 0.12em; font-variant-numeric: tabular-nums; margin-bottom: 0.8rem; }
  .buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .stack { display: grid; gap: 0.5rem; }
</style>
