<script lang="ts">
  import { onMount } from 'svelte'
  import { deleteDesign, duplicateDesign, exportAllText, getPcStatus, getSettings, listSlots, type SlotInfo, putSettings, exportDesignText, exportManyText, importDesigns, listDesigns, renameDesign, type DesignSummary } from '../api/client'
  import { serializeDesign } from '../format/design'
  import { designFromFrames, type ImportedFrame } from '../import/build'
  import Dialog from './Dialog.svelte'
  import ImportDialog from './ImportDialog.svelte'
  import PcEditingDialog from './PcEditingDialog.svelte'
  import SlotPicker from './SlotPicker.svelte'
  import Thumbnail from './Thumbnail.svelte'
  import PixelThumb from './PixelThumb.svelte'
  import Intro from './Intro.svelte'
  import SettingsDialog from './SettingsDialog.svelte'
  import DotCount from './DotCount.svelte'
  import { libraryState } from './libraryState'
  import { pushBack } from './backStack'
  import Icon from './Icon.svelte'
  import { TEMPLATES, type Template } from '../templates/templates'
  import { MAX_IMPORT_BYTES, PACK_EXT, deliverFile, exportFileName, readDesignFile } from './files'
  import { timeAgo } from './time'
  import { isInApp } from './host'

  let { onOpen, onCreate, busy = false, notice = '' }: {
    onOpen: (id: string) => void
    onCreate: () => void
    busy?: boolean
    notice?: string
  } = $props()

  let designs = $state<DesignSummary[]>([])
  let loading = $state(true)
  let error = $state('')
  let working = $state(false)
  // At most one of these is set: the action sheet, the rename box or the delete confirmation.
  let menuFor = $state<DesignSummary | null>(null)
  let renameFor = $state<DesignSummary | null>(null)
  let deleteFor = $state<DesignSummary | null>(null)
  let toyFor = $state<DesignSummary | null>(null)
  // Picking several designs to delete together.
  let showSettings = $state(false)
  let showIntro = $state(false)
  let picking = $state(false)
  let picked = $state<string[]>([])
  let deleteMany = $state(false)
  let importing = $state(false)
  let importChoice = $state(false)
  let topMenu = $state(false)
  let pcDialog = $state(false)
  // PC editing is switched on from the phone only; in a PC browser the server answers 404 and the entry stays hidden.
  let pcAvailable = $state(false)
  let fileInput = $state<HTMLInputElement>()
  let info = $state('')
  let tab = $state<'designs' | 'templates'>(libraryState.tab)
  let slideFrom = $state<'left' | 'right' | ''>('')
  const TABS = ['designs', 'templates'] as const
  function goTab(next: 'designs' | 'templates') {
    if (next === tab) return
    slideFrom = TABS.indexOf(next) > TABS.indexOf(tab) ? 'right' : 'left'
    tab = next
    libraryState.tab = next
  }
  // Swipe sideways to switch tabs. Starts near the screen edge are left to the system's Back gesture.
  let swipe: { x: number; y: number; t: number } | null = null
  let swiped = false
  const edge = 28
  function swipeStart(e: TouchEvent) {
    const t = e.touches[0]
    swipe = t.clientX < edge || t.clientX > window.innerWidth - edge ? null : { x: t.clientX, y: t.clientY, t: Date.now() }
    swiped = false
  }
  function swipeEnd(e: TouchEvent) {
    if (!swipe || picking) { swipe = null; return }
    const t = e.changedTouches[0]
    const dx = t.clientX - swipe.x
    const dy = t.clientY - swipe.y
    const fast = Date.now() - swipe.t < 700
    swipe = null
    if (fast && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      swiped = true
      goTab(dx < 0 ? 'templates' : 'designs')
    }
  }
  const swallowSwipeClick = (e: MouseEvent) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false } }
  let slots = $state<SlotInfo[]>([])
  /** Slots that play a design, lowest first; the panel shows the first and counts the rest. */
  const playing = $derived(slots.filter((x) => x.designId))
  const playingFirst = $derived(playing.length ? designs.find((d) => d.id === playing[0].designId) ?? null : null)
  const playingIds = $derived(new Set(playing.map((x) => x.designId)))
  const slotOf = (id: string) => playing.find((x) => x.designId === id)?.slot
  let nameText = $state('')
  // In a PC browser the phone can disappear (Wi-Fi lost, PC editing turned off). The list is checked every few seconds
  // so the page says so instead of silently showing stale designs.
  let lost = $state(false)

    async function refresh() {
    try {
      designs = (await listDesigns()).filter((d) => !libraryState.hidden.has(d.id))
      listSlots().then((x) => (slots = x), () => (slots = []))
      error = ''
      console.log(`[glyph-studio] library loaded: ${designs.length} design(s)`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  /** Run a library action, then reload the list. Errors are shown instead of thrown. */
  async function act(fn: () => Promise<unknown>) {
    working = true
    try {
      await fn()
      error = ''
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      working = false
      menuFor = renameFor = deleteFor = null
      await refresh()
    }
  }

  // Takes the design as an argument (read before the menu closes), because the menu's own copy goes away with it.
  const startToy = (d: DesignSummary) => { toyFor = d; menuFor = null }
  const startRename = (d: DesignSummary) => { menuFor = null; nameText = d.name; renameFor = d }
  const confirmRename = () => {
    const target = renameFor
    const name = nameText.trim()
    if (!target || !name) return
    return act(() => renameDesign(target.id, name))
  }
  // Selecting: press and hold a design (or right-click it) to start, tap more to add or remove, then act on the group.
  // The Android Back button leaves selection first, instead of leaving the library.
  let offBack: (() => void) | null = null
  const startPicking = (first?: DesignSummary) => {
    topMenu = false
    menuFor = null
    picking = true
    picked = first ? [first.id] : []
    if (!offBack) offBack = pushBack(() => { offBack = null; picking = false; picked = []; deleteMany = false })
  }
  const stopPicking = () => {
    picking = false
    picked = []
    deleteMany = false
    offBack?.()
    offBack = null
  }
  const togglePick = (id: string) => {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
    if (picked.length === 0) stopPicking()
  }
  // Long press on a row: touch needs a steady finger for a moment; a drag is a scroll and cancels it.
  const LONG_PRESS_MS = 450
  let lp: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null
  let lpFired = false
  function rowDown(e: PointerEvent, d: DesignSummary) {
    lpFired = false // every new touch starts clean; a leftover flag must never swallow a real tap
    if (picking || e.button !== 0 || e.pointerType === 'mouse') return
    lp = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { lpFired = true; lp = null; navigator.vibrate?.(15); startPicking(d) }, LONG_PRESS_MS) }
  }
  function rowMove(e: PointerEvent) { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) rowCancel() }
  function rowCancel() { if (lp) { clearTimeout(lp.timer); lp = null } }
  function rowClick(d: DesignSummary) {
    if (lpFired) { lpFired = false; return } // the press that started selecting must not also open or toggle the design
    if (picking) togglePick(d.id)
    else onOpen(d.id)
  }
  const pickedDesigns = $derived(designs.filter((d) => picked.includes(d.id)))
  async function shareSelected() {
    const list = pickedDesigns
    if (list.length === 0) return
    try {
      const how = list.length === 1
        ? deliverFile(exportFileName(list[0].name), await exportDesignText(list[0].id))
        : deliverFile(exportFileName('glyph-designs', PACK_EXT), await exportManyText(list.map((d) => d.id)))
      error = ''
      info = how === 'downloaded' ? `Saved ${list.length} ${list.length === 1 ? 'design' : 'designs'} to your downloads.` : ''
      stopPicking()
    } catch (e) {
      info = ''
      error = e instanceof Error ? e.message : String(e)
    }
  }
  const onlyPicked = (fn: (d: DesignSummary) => unknown) => { const d = pickedDesigns[0]; if (pickedDesigns.length === 1 && d) { stopPicking(); fn(d) } }
  const pickAll = () => { picked = picked.length === designs.length ? [] : designs.map((d) => d.id) }
  async function confirmDeleteMany() {
    const ids = picked.slice()
    working = true
    const failed: string[] = []
    for (const id of ids) {
      try { await deleteDesign(id) } catch { failed.push(id) }
    }
    working = false
    const n = ids.length - failed.length
    info = n > 0 ? `Deleted ${n} ${n === 1 ? 'design' : 'designs'}.` : ''
    error = failed.length ? `Could not delete ${failed.length} ${failed.length === 1 ? 'design' : 'designs'}.` : ''
    stopPicking()
    await refresh()
  }
  const askDelete = (d: DesignSummary) => { menuFor = null; deleteFor = d }
  const confirmDelete = () => { const t = deleteFor; if (t) return act(() => deleteDesign(t.id)) }
  const duplicate = (d: DesignSummary) => act(() => duplicateDesign(d.id))

  /** Turn the imported frames into a new design and open it. */
  async function importAsNew(frames: ImportedFrame[], name: string, draft = false) {
    const created = await importDesigns([serializeDesign(designFromFrames(name, frames))])
    if (draft) libraryState.draftId = created[0].id // a look at a template: removed again if you leave it untouched
    onOpen(created[0].id)
  }

  async function fromTemplate(t: Template) {
    if (working || busy) return
    working = true
    try {
      await importAsNew(t.frames, t.name, true)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      working = false
    }
  }

  async function exportOne(d: DesignSummary) {
    menuFor = null
    try {
      const how = deliverFile(exportFileName(d.name), await exportDesignText(d.id))
      error = ''
      info = how === 'downloaded' ? `Saved “${d.name}” to your downloads.` : ''
    } catch (e) {
      info = ''
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function exportAll() {
    try {
      const how = deliverFile(exportFileName('glyph-designs', PACK_EXT), await exportAllText())
      error = ''
      info = how === 'downloaded' ? `Saved all ${designs.length} designs to your downloads.` : ''
    } catch (e) {
      info = ''
      error = e instanceof Error ? e.message : String(e)
    }
  }

  /** Read a chosen design file; if every design in it is valid, add them all (each gets a new id), otherwise add nothing. */
  async function importFile(file: File | undefined | null) {
    if (!file) return
    importChoice = false
    info = ''
    if (file.size > MAX_IMPORT_BYTES) { error = 'That file is too large to be a design file.'; return }
    const result = readDesignFile(await file.text())
    if (!result.ok) { error = `Nothing was imported. ${result.error}`; return }
    try {
      const created = await importDesigns(result.designs)
      error = ''
      info = `Imported ${created.length} ${created.length === 1 ? 'design' : 'designs'}.`
    } catch (e) {
      error = `Nothing was imported. ${e instanceof Error ? e.message : String(e)}`
    }
    await refresh()
  }

  async function checkLink() {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 4000)
    try {
      const r = await fetch('/api/designs', { signal: ctl.signal, cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      if (lost) await refresh()
      lost = false
    } catch {
      lost = true
    } finally {
      clearTimeout(timer)
    }
  }

  /** First launch in the app: one sample design so the library is not empty, then the introduction. */
  async function firstRun() {
    await refresh()
    if (designs.length === 0) {
      const heart = TEMPLATES.find((t) => t.id === 'heart')!
      try { await importDesigns([serializeDesign(designFromFrames('Sample heart', heart.frames))]) } catch { /* the library just stays empty */ }
      await refresh()
    }
    showIntro = true
  }
  const closeIntro = () => { putSettings({ firstRunDone: true }).catch(() => {}); showIntro = false }

  onMount(() => {
    refresh()
    // First launch (in the app only): the phone remembers whether the introduction has been shown.
    if (isInApp()) getSettings().then((s) => { if (!s.firstRunDone) firstRun() }, () => {})
    getPcStatus().then(() => (pcAvailable = true), () => {})
    const timer = isInApp() ? null : setInterval(checkLink, 4000)
    return () => { offBack?.(); if (timer) clearInterval(timer) }
  })
</script>

<main>
  {#if picking}
    <header class="pickbar">
      <button onclick={stopPicking}>Cancel</button>
      <span class="count" role="status">{picked.length} selected</span>
      <button onclick={pickAll}>{picked.length === designs.length ? 'None' : 'All'}</button>
    </header>
  {:else}
  <header class="top">
    <h1><span>GLYPH</span><span>STUDIO<i class="stop" aria-hidden="true"></i></span></h1>
    <button class="chip" onclick={() => (topMenu = true)} aria-label="More options" title="Import, export and settings"><Icon name="more" size={24} /></button>
  </header>

  {#if playingFirst}
    <section class="live" aria-label="Playing on your phone">
      <Thumbnail thumb={playingFirst.thumb} size={56} design={playingFirst} />
      <div class="livetext">
        <span class="lamp">LIVE · TOY {playing[0].slot}{playing.length > 1 ? ` +${playing.length - 1}` : ''}</span>
        <b>{playingFirst.name}</b>
        <small>Playing on the back</small>
      </div>
      <button class="change" onclick={() => (toyFor = playingFirst)}>Change</button>
    </section>
  {:else if designs.length > 0 && isInApp()}
    <section class="live empty" aria-label="Glyph Toys">
      <span class="lamp off">NO TOY SET</span>
      <small>Open a design’s ⋯ menu and choose “Play as Glyph Toy…” to see it on the back of your phone.</small>
    </section>
  {/if}

  <hr class="dotline" />
  <div class="tabs" role="tablist" aria-label="Library">
    <button role="tab" class:on={tab === 'designs'} aria-selected={tab === 'designs'} onclick={() => goTab('designs')}>Designs</button>
    <button role="tab" class:on={tab === 'templates'} aria-selected={tab === 'templates'} onclick={() => goTab('templates')}>Templates</button>
  </div>
  <hr class="dotline" />
  {/if}

  {#if lost}
    <p class="error" role="alert">
      Disconnected from the phone. Everything already saved is safe on the phone. Check that it is on the same Wi-Fi and
      PC editing is still on, then reload this page.
    </p>
  {:else if error || notice}<p class="error" role="alert">{error || notice}</p>{:else if info}<p class="info" role="status">{info}</p>{/if}

  <div class="content" ontouchstart={swipeStart} ontouchend={swipeEnd} onclickcapture={swallowSwipeClick} role="presentation">
  {#key tab}
  <div class="pane" class:from-right={slideFrom === 'right'} class:from-left={slideFrom === 'left'}>
  {#if tab === 'templates' && !picking}
    <div class="tpl-grid">
      {#each TEMPLATES as t (t.id)}
        <button class="tpl" onclick={() => fromTemplate(t)} disabled={working || busy} title={t.blurb}>
          <span class="well"><PixelThumb pixels={t.frames[0].pixels} size={72} /></span>
          <b>{t.name}</b>
          <small>{t.blurb}</small>
        </button>
      {/each}
    </div>
  {:else if loading}
    <p class="muted pad">Loading…</p>
  {:else if designs.length === 0 && !error}
    <div class="emptystate">
      <p>No designs yet.</p>
      <small>Start from a template, or make a blank one and draw your own.</small>
    </div>
  {:else}
    <ul>
      {#each designs as d, i (d.id)}
        <li class:current={playingIds.has(d.id)}>
          <button class="row" class:picked={picking && picked.includes(d.id)} onclick={() => rowClick(d)} onpointerdown={(e) => rowDown(e, d)} onpointermove={rowMove} onpointerup={rowCancel} onpointercancel={rowCancel} oncontextmenu={(e) => { e.preventDefault(); if (!picking) startPicking(d) }} role={picking ? 'checkbox' : undefined} aria-checked={picking ? picked.includes(d.id) : undefined}>
            {#if picking}<span class="check" aria-hidden="true">{picked.includes(d.id) ? '✓' : ''}</span>{:else}<span class="idx">{String(i + 1).padStart(2, '0')}</span>{/if}
            <Thumbnail thumb={d.thumb} size={48} design={d} />
            <span class="meta">
              <span class="name">{d.name}</span>
              <span class="sub"><DotCount count={d.frameCount} max={6} /><span class="muted">{timeAgo(d.modified)}{slotOf(d.id) ? ` · Toy ${slotOf(d.id)}` : ''}</span></span>
            </span>
          </button>
          {#if !picking}<button class="more" onclick={() => (menuFor = d)} aria-label={`Actions for ${d.name}`} title="Actions"><Icon name="more" size={24} /></button>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  </div>
  {/key}
  </div>

  {#if picking}
    <div class="addbar actionbar" role="toolbar" aria-label="Actions for the selected designs">
      {#if pickedDesigns.length === 1}
        <button onclick={() => onlyPicked(startToy)}><Icon name="matrix" size={24} /><span>Toy</span></button>
        <button onclick={() => onlyPicked(startRename)}><Icon name="pen" size={24} /><span>Rename</span></button>
        <button onclick={() => onlyPicked(duplicate)} disabled={working}><Icon name="copy" size={24} /><span>Duplicate</span></button>
      {/if}
      <button onclick={shareSelected} disabled={pickedDesigns.length === 0}><Icon name="share" size={24} /><span>Share</span></button>
      <button class="danger" onclick={() => (deleteMany = true)} disabled={pickedDesigns.length === 0 || working}><Icon name="clear" size={24} /><span>Delete</span></button>
    </div>
  {:else}
    {#if tab === 'designs' && designs.length > 1}<p class="tip">Press and hold a design to select it.</p>{/if}
    <div class="addbar"><button class="add" onclick={onCreate} disabled={busy}>+ New design</button></div>
  {/if}
</main>


{#if menuFor}
  {@const d = menuFor}
  <Dialog title={d.name} onClose={() => (menuFor = null)}>
    <div class="actions">
      <button onclick={() => startToy(d)}>Play as Glyph Toy…</button>
      <button onclick={() => startRename(d)}>Rename</button>
      <button onclick={() => exportOne(d)}>Export file…</button>
      <button onclick={() => duplicate(d)} disabled={working}>Duplicate</button>
      <button class="danger" onclick={() => askDelete(d)}>Delete…</button>
      <button onclick={() => (menuFor = null)}>Cancel</button>
    </div>
  </Dialog>
{/if}

{#if deleteFor}
  {@const d = deleteFor}
  <Dialog title={`Delete “${d.name}”?`} onClose={() => (deleteFor = null)}>
    <p class="muted">This can’t be undone.</p>
    <div class="actions row2">
      <button onclick={() => (deleteFor = null)}>Cancel</button>
      <button class="danger solid" onclick={confirmDelete} disabled={working}>Delete</button>
    </div>
  </Dialog>
{/if}

{#if topMenu}
  <Dialog title="Designs" onClose={() => (topMenu = false)}>
    <div class="actions">
      <button onclick={() => { topMenu = false; importChoice = true }}>Import…</button>
      <button onclick={() => { topMenu = false; showSettings = true }}>Settings…</button>
      <button onclick={() => { topMenu = false; showIntro = true }}>How it works</button>
      <button onclick={() => { topMenu = false; exportAll() }} disabled={designs.length === 0}>Export all designs</button>
      {#if pcAvailable}<button onclick={() => { topMenu = false; pcDialog = true }}>Edit from a computer…</button>{/if}
      <button onclick={() => (topMenu = false)}>Cancel</button>
    </div>
  </Dialog>
{/if}

{#if showIntro}
  <Intro onClose={closeIntro} />
{/if}

{#if showSettings}
  <SettingsDialog onClose={() => (showSettings = false)} />
{/if}

{#if pcDialog}
  <PcEditingDialog onClose={() => (pcDialog = false)} />
{/if}

{#if importChoice}
  <Dialog title="Import" onClose={() => (importChoice = false)}>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={(e) => { importFile(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
    <div class="actions">
      <button onclick={() => { importChoice = false; importing = true }}>Picture or GIF…</button>
      <button onclick={() => fileInput?.click()}>Design file (.glyph.json)…</button>
      <button onclick={() => (importChoice = false)}>Cancel</button>
    </div>
  </Dialog>
{/if}

{#if importing}
  <ImportDialog canInsert={false} onClose={() => (importing = false)} onImport={(f, n) => importAsNew(f, n)} />
{/if}

{#if toyFor}
  <SlotPicker designId={toyFor.id} designName={toyFor.name} onClose={() => (toyFor = null)} />
{/if}

{#if renameFor}
  <Dialog title="Rename design" onClose={() => (renameFor = null)}>
    <form onsubmit={(e) => { e.preventDefault(); confirmRename() }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input type="text" bind:value={nameText} maxlength="60" aria-label="Design name" autofocus />
      <div class="actions row2">
        <button type="button" onclick={() => (renameFor = null)}>Cancel</button>
        <button type="submit" class="primary" disabled={working || !nameText.trim()}>Save</button>
      </div>
    </form>
  </Dialog>
{/if}

{#if deleteMany}
  <Dialog title={`Delete ${picked.length} ${picked.length === 1 ? 'design' : 'designs'}?`} onClose={() => (deleteMany = false)}>
    <p class="muted">This can’t be undone.</p>
    <div class="actions row2">
      <button onclick={() => (deleteMany = false)}>Cancel</button>
      <button class="danger solid" onclick={confirmDeleteMany} disabled={working}>Delete</button>
    </div>
  </Dialog>
{/if}

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    padding: calc(env(safe-area-inset-top, 0px) + 0.75rem) 1rem 0;
  }
  header.top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 0.8rem; }
  h1 { margin: 0; display: grid; font-family: var(--font-display); font-weight: 900; font-size: 2.6rem; line-height: 0.88; letter-spacing: 0; }
  h1 .stop { display: inline-block; width: 0.2em; height: 0.2em; margin-left: 0.12em; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 60%, transparent); }
  button.chip { width: 48px; height: 48px; padding: 0; border-radius: 999px; background: var(--surface-2); border-color: transparent; display: grid; place-items: center; color: var(--muted); }
  .actionbar { display: flex; gap: 0.4rem; }
  .actionbar button { flex: 1; min-height: 56px; display: grid; justify-items: center; align-content: center; gap: 0.15rem; padding: 0.2rem; border-radius: var(--radius-m); font-size: 0.7rem; background: linear-gradient(var(--key-top), var(--key-bottom)); border-color: transparent; box-shadow: 0 2px 0 var(--key-edge), inset 0 1px 0 rgb(255 255 255 / 0.08); }
  .actionbar button:not(:disabled):active { transform: translateY(1px); }
  .actionbar button.danger { color: var(--accent); }
  .tip { margin: 0.6rem 0 0; text-align: center; color: var(--muted); font-size: 0.78rem; }
  .pickbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  .pickbar .count { flex: 1; text-align: center; font-weight: 600; }

  /* The playing-now panel: a display well, a red lamp, what is on the back of the phone. */
  .live { display: flex; align-items: center; gap: 0.8rem; padding: 0.6rem 0.7rem; margin-bottom: 0.8rem; border-radius: var(--radius-l); background: linear-gradient(160deg, var(--surface), var(--surface-2)); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 0 0 1px var(--line); }
  .live.empty { display: grid; gap: 0.3rem; }
  .livetext { display: grid; min-width: 0; gap: 0.05rem; }
  .livetext b { font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .livetext small, .live.empty small { color: var(--muted); font-size: 0.78rem; line-height: 1.35; }
  .lamp { display: inline-flex; align-items: center; gap: 0.4rem; font-family: var(--font-mono); font-size: 0.65rem; letter-spacing: 0.08em; color: var(--accent); }
  .lamp::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: blink 1.6s ease-in-out infinite; }
  .lamp.off { color: var(--muted); }
  .lamp.off::before { background: var(--dot); box-shadow: none; animation: none; }
  @keyframes blink { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .lamp::before { animation: none; } }
  button.change { margin-left: auto; flex: none; border-radius: 999px; font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; background: transparent; color: var(--muted); }

  .tabs { display: flex; gap: 0.4rem; padding: 0.15rem 0; }
  .tabs button { border: 0; background: transparent; border-radius: 999px; padding: 0 0.9rem; font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .tabs button.on { color: var(--text); }
  .tabs button.on::before { content: '● '; color: var(--accent); }

  .content { flex: 1; min-height: 40vh; touch-action: pan-y; overflow-x: clip; }
  .pane.from-right { animation: slide-in-right var(--dur) var(--ease); }
  .pane.from-left { animation: slide-in-left var(--dur) var(--ease); }
  @keyframes slide-in-right { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
  @keyframes slide-in-left { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .pane.from-right, .pane.from-left { animation: none; } }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  li { position: relative; display: flex; align-items: stretch; border-bottom: 1px dotted var(--dot); }
  li.current::before { content: ''; position: absolute; left: -0.6rem; top: 0.8rem; bottom: 0.8rem; width: 3px; border-radius: 3px; background: var(--accent); }
  .row { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.8rem; padding: 0.7rem 0; text-align: left; background: transparent; border: 0; border-radius: var(--radius-m); box-shadow: none; }
  @media (hover: hover) { button.row:not(:disabled):hover { background: var(--surface-2); border-color: transparent; } }
  .idx { width: 1.7rem; flex: none; font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; color: var(--text); }
  .meta { display: grid; min-width: 0; gap: 0.2rem; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { display: flex; align-items: center; gap: 0.6rem; }
  .sub .muted { font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.04em; text-transform: uppercase; }
  .more { flex: none; width: 48px; padding: 0; background: transparent; border: 0; box-shadow: none; border-radius: 999px; color: var(--muted); display: grid; place-items: center; }
  .check { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; border-radius: 6px; border: 2px solid var(--line); display: inline-grid; place-items: center; font-size: 1rem; line-height: 1; }
  .row.picked .check { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

  .tpl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; padding-top: 0.6rem; }
  button.tpl { display: grid; justify-items: start; gap: 0.3rem; padding: 0.7rem; border-radius: var(--radius-l); text-align: left; background: linear-gradient(var(--key-top), var(--key-bottom)); border-color: transparent; box-shadow: 0 2px 0 var(--key-edge), inset 0 1px 0 rgb(255 255 255 / 0.08); }
  button.tpl:not(:disabled):active { transform: translateY(1px); }
  button.tpl b { font-size: 0.9rem; }
  button.tpl small { color: var(--muted); font-size: 0.72rem; line-height: 1.3; }
  .well { background: var(--well); border-radius: 50%; padding: 4px; box-shadow: inset 0 3px 8px rgb(0 0 0 / 0.7); justify-self: center; }

  .emptystate { padding: 2rem 0.5rem; display: grid; gap: 0.3rem; text-align: center; }
  .emptystate p { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 1.4rem; }
  .emptystate small { color: var(--muted); }

  /* The main action sits at the bottom, where the thumb is. */
  .addbar { position: sticky; bottom: 0; margin-top: auto; padding: 0.8rem 0 calc(env(safe-area-inset-bottom, 0px) + 0.8rem); background: linear-gradient(transparent, var(--bg) 35%); }
  button.add { width: 100%; min-height: 52px; border-radius: 999px; background: var(--text); color: var(--bg); border-color: var(--text); font-family: var(--font-mono); font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }

  .muted { color: var(--muted); font-size: 0.85rem; margin: 0; font-variant-numeric: tabular-nums; }
  .muted.pad { padding: 1rem 0; }
  .error { color: var(--accent); }
  .info { color: var(--muted); }
  .actions { display: grid; gap: 0.5rem; }
  .actions.row2 { grid-template-columns: 1fr 1fr; }
  .danger { color: var(--accent); }
  .danger.solid { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  input[type='text'] {
    width: 100%;
    padding: 0.7rem 0.8rem;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    min-height: 44px;
    margin-bottom: 0.75rem;
  }
</style>
