<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte'
  import { deleteDesign, getHistory, getPreview, getSettings, putSettings, importDesigns, putHistory, saveDesign, setPreview, type PreviewStatus } from '../api/client'
  import { serializeDesign } from '../format/design'
  import { designFromFrames, insertFramesOps, type ImportedFrame, type ImportTarget } from '../import/build'
  import { SyncClient, isDirty, type SyncState, type SyncStatus } from '../api/sync'
  import { SWATCHES, clampBrightness, nearestSwatch } from '../core/brightness'
  import { GestureController, type GestureHost, type PtrEvent } from '../core/input'
  import type { Point } from '../core/matrix'
  import { pixelsLayerOf, toEditorDesign } from '../core/model'
  import { MatrixRenderer, DARK_THEME, LIGHT_THEME, type Ctx2D } from '../core/renderer'
  import { EditSession } from '../core/session'
  import { addBlankFrameOp, deleteFrameOp, duplicateFrameOp, moveFrameToIndexOp, selectionAfterDelete, setAllDurationsOps } from '../core/frames'
  import { ONION_MODES, onionPixels, type OnionMode } from '../core/onion'
  import { AnimationPlayer } from '../core/player'
  import type { LoopMode } from '../generated/shared'
  import { DRAG_THRESHOLD_PX, draggedHeight, settlesOpen } from '../core/tray'
  import { shortcutFor, type Action } from '../core/shortcuts'
  import { diffPixels, Stroke, type PixelChange } from '../core/stroke'
  import { isDrawTool, type EditorToolId, type ToolId } from '../core/tools'
  import { SelectionState, emptyMask, lassoMask, rectMask, type Mask } from '../core/selection'
  import { idx } from '../core/matrix'
  import { FADE_PRESETS, FADE_RANGES, fadeOps, type FadePreset, type FadeRange } from '../core/fades'
  import { FONTS, fontById } from '../core/fonts'
  import { SCROLL_SPEEDS, centredY, renderText, scrollFrames, textFloating, type ScrollDirection, type ScrollSpeedId } from '../core/text'
  import { getClipboard, hasClipboard, pasteOrigin, setClipboard } from '../core/clipboard'
  import { clearPixels, flipHorizontal, flipVertical, shiftPixels } from '../core/transforms'
  import { DEFAULT_VIEW, MAX_ZOOM, cellAt, zoomAt, type View } from '../core/viewport'
  import FrameStrip from './FrameStrip.svelte'
  import { libraryState } from './libraryState'
  import ImportDialog from './ImportDialog.svelte'
  import Icon from './Icon.svelte'
  import Dialog from './Dialog.svelte'
  import ShortcutsDialog from './ShortcutsDialog.svelte'
  import SlotPicker from './SlotPicker.svelte'
  import { isInApp } from './host'
  import type { IconName } from './icons'

  let { designId, onBack }: { designId: string; onBack: (notice?: string) => void } = $props()

  // ---- state -------------------------------------------------------------------------------------------------
  let session = $state.raw<EditSession | null>(null)
  let version = $state(0) // bumped whenever the session changes, so views derived from it refresh
  let status = $state<SyncStatus>('connecting')
  let problem = $state('')
  let currentFrameId = $state('')
  let tool = $state<EditorToolId>('pen')
  // The selection (rectangle or freehand) for the frame being edited. It is plain data, so a counter tells the view to refresh.
  const sel = new SelectionState()
  let selVersion = $state(0)
  const hasSelection = $derived.by(() => { selVersion; return sel.hasSelection })
  const clipFull = $derived.by(() => { selVersion; return hasClipboard() })
  // Text tool: the typed text is held as a loose (floating) selection so it can be dragged into place before it is added.
  let text = $state('')
  let fontId = $state<'small' | 'large'>('small')
  let scrollOpen = $state(false)
  let scrollDir = $state<ScrollDirection>('rtl')
  let scrollSpeed = $state<ScrollSpeedId>('medium')
  let wasText = false
  const textBitmap = $derived(renderText(text, fontById(fontId)))
  const selecting = $derived(tool === 'select' || tool === 'lasso')
  /** The selection being drawn right now (before it is finished), or the cells being dragged. */
  let selDrag: { kind: 'new'; start: Point; path: Point[] } | { kind: 'move'; last: Point } | null = null
  let selDraft = $state.raw<Mask | null>(null)
  let brightness = $state(255)
  let mirrorX = $state(false)
  let mirrorY = $state(false)
  let view = $state.raw<View>(DEFAULT_VIEW)
  let previewStatus = $state.raw<PreviewStatus | null>(null)
  let previewBusy = $state(false)
  let playing = $state(false)
  let baseRevision = -1
  let keepDraft = false // set when the user does something that means "keep this" (a toy slot)
  let syncState = $state<SyncState>({ pending: 0, revision: -1, savedRevision: -1 })
  let saving = $state(false)
  let playIndex = $state<number | null>(null)
  let onion = $state<OnionMode>('off')
  let trayTab = $state<'draw' | 'edit' | 'frames'>('draw')
  let showSlots = $state(false)
  let showFrameActions = $state(false)
  let showImport = $state(false)
  let showHelp = $state(false)
  const hasKeyboard = !isInApp() // a computer's browser: show the shortcuts button
  let trayOpen = $state(false) // the tool tray starts closed so the canvas gets the screen (except the very first time, see hintOpen)
  let adv = $state({ fade: false, play: false, remove: false, pics: false }) // advanced Frames groups: closed until asked for
  let hintOpen = $state(false) // first-time pointer to the tools; shown once, ever
  let autoClose = $state(false) // set in Settings; off by default so the tray only moves when you move it
  let wide = $state(false) // PC layout: the tools live in a side column and need no tray
  let innerH = $state(0) // natural height of everything in the tray (px)
  let capH = $state(400) // the tray never takes more than this, so the drawing board keeps room
  type Drag = { startY: number; startH: number; h: number; moved: boolean; t: number; viaBar: boolean }
  let drag = $state.raw<Drag | null>(null)
  let innerEl: HTMLDivElement
  let trayResize: ResizeObserver | null = null
  let swallowNextClick = false
  const contentH = $derived(Math.min(innerH, capH))
  const scrollable = $derived(!wide && innerH > capH)
  /** Height of the tray in px: follows the finger while dragging, otherwise fully open or closed. undefined = natural (PC). */
  const trayHeight = $derived(wide ? undefined : drag?.moved ? drag.h : trayOpen ? contentH : 0)
  let wideQuery: MediaQueryList | null = null
  const onWideChange = () => { wide = wideQuery?.matches ?? false }

  const design = $derived.by(() => { version; return session?.design ?? null })
  const frame = $derived.by(() => design?.frames.find((f) => f.id === currentFrameId) ?? design?.frames[0] ?? null)
  const frameNumber = $derived(design && frame ? design.frames.indexOf(frame) + 1 : 0)
  /** The frame on screen: the one being played, otherwise the selected one. */
  const displayFrame = $derived(playing && playIndex !== null ? (design?.frames[playIndex] ?? frame) : frame)
  /** Edits that are not yet safely stored on the phone. (They are saved automatically within a moment anyway.) */
  const dirty = $derived(isDirty(syncState))
  const canEdit = $derived(status === 'open' && session !== null && !playing) // no editing while the animation plays
  const canUndo = $derived.by(() => { version; return canEdit && (session?.history.canUndo ?? false) })
  const canRedo = $derived.by(() => { version; return canEdit && (session?.history.canRedo ?? false) })
  const previewOn = $derived(previewStatus?.active === true && previewStatus.designId === designId)
  const swatch = $derived(nearestSwatch(brightness))
  const exactSwatch = $derived(SWATCHES.includes(brightness))

  // ---- canvas ------------------------------------------------------------------------------------------------
  let wrapEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let renderer: MatrixRenderer | null = null
  let cssSize = { w: 0, h: 0 }
  let stroke: Stroke | null = null
  let rafId = 0
  let sync: SyncClient | null = null
  let resizeObserver: ResizeObserver | null = null
  let colorScheme: MediaQueryList | null = null

  const TOOLS: { id: EditorToolId; icon: IconName; label: string; short: string }[] = [
    { id: 'pen', icon: 'pen', label: 'Pen (P)', short: 'Pen' },
    { id: 'eraser', icon: 'eraser', label: 'Eraser (E)', short: 'Eraser' },
    { id: 'fill', icon: 'fill', label: 'Fill (F)', short: 'Fill' },
    { id: 'line', icon: 'line', label: 'Line (L)', short: 'Line' },
    { id: 'rect', icon: 'rect', label: 'Rectangle outline (R)', short: 'Box' },
    { id: 'rectFill', icon: 'rectFill', label: 'Filled rectangle (Shift+R)', short: 'Solid box' },
    { id: 'ellipse', icon: 'ellipse', label: 'Ellipse outline (O)', short: 'Oval' },
    { id: 'ellipseFill', icon: 'ellipseFill', label: 'Filled ellipse (Shift+O)', short: 'Solid oval' },
    { id: 'select', icon: 'select', label: 'Select a rectangle (S)', short: 'Select' },
    { id: 'lasso', icon: 'lasso', label: 'Select freehand (Shift+S)', short: 'Lasso' },
    { id: 'text', icon: 'text', label: 'Text (T)', short: 'Text' },
  ]
  const scrollPlan = $derived(scrollFrames(textBitmap, brightness || 255, scrollDir, scrollSpeed, design?.frames.length ?? 0))
  /** One line that says what the active tool does with the next touch. */
  const TOOL_HINTS: Record<EditorToolId, string> = {
    pen: 'Tap or drag to light pixels.',
    eraser: 'Tap or drag to turn pixels off.',
    fill: 'Tap to fill a connected area.',
    line: 'Drag from the start to the end.',
    rect: 'Drag to draw a box outline.',
    rectFill: 'Drag to draw a solid box.',
    ellipse: 'Drag to draw an oval outline.',
    ellipseFill: 'Drag to draw a solid oval.',
    select: 'Drag a box around pixels, then move, copy or cut them.',
    lasso: 'Draw around pixels to select them freely.',
    text: 'Type your text, then place it on the board.',
  }
  const currentTool = $derived(TOOLS.find((t) => t.id === tool) ?? TOOLS[0])

  /**
   * Eight keys instead of eleven: Box, Oval and Select each hold two tools (outline or solid, rectangle or freehand).
   * A tap picks the version you used last; pressing and holding the key picks the other one.
   */
  const TILES: { key: string; ids: EditorToolId[] }[] = [
    { key: 'pen', ids: ['pen'] }, { key: 'eraser', ids: ['eraser'] }, { key: 'fill', ids: ['fill'] }, { key: 'line', ids: ['line'] },
    { key: 'box', ids: ['rect', 'rectFill'] }, { key: 'oval', ids: ['ellipse', 'ellipseFill'] }, { key: 'select', ids: ['select', 'lasso'] },
    { key: 'text', ids: ['text'] },
  ]
  let lastVariant = $state<Record<string, EditorToolId>>({ box: 'rect', oval: 'ellipse', select: 'select' })
  $effect(() => {
    for (const t of TILES) if (t.ids.length > 1 && t.ids.includes(tool)) lastVariant[t.key] = tool
  })
  const toolOf = (t: { key: string; ids: EditorToolId[] }): EditorToolId => (t.ids.length > 1 ? lastVariant[t.key] : t.ids[0])
  const otherOf = (t: { key: string; ids: EditorToolId[] }): EditorToolId => t.ids.find((id) => id !== toolOf(t)) ?? t.ids[0]
  const toolInfo = (id: EditorToolId) => TOOLS.find((x) => x.id === id) ?? TOOLS[0]
  const activeTile = $derived(TILES.find((t) => t.ids.includes(tool)))
  const altHint = $derived(activeTile && activeTile.ids.length > 1 ? ` Press and hold the key for ${toolInfo(otherOf(activeTile)).short.toLowerCase()}.` : '')

  const TILE_HOLD_MS = 420
  let tileHold: ReturnType<typeof setTimeout> | null = null
  let tileHeld = false
  function flipTile(t: { key: string; ids: EditorToolId[] }) {
    lastVariant[t.key] = otherOf(t)
    chooseTool(lastVariant[t.key])
  }
  function tileDown(e: PointerEvent, t: { key: string; ids: EditorToolId[] }) {
    tileHeld = false
    if (t.ids.length < 2 || e.button !== 0) return
    tileHold = setTimeout(() => { tileHold = null; if (drag?.moved) return; tileHeld = true; navigator.vibrate?.(15); flipTile(t) }, TILE_HOLD_MS)
  }
  const tileUp = () => { if (tileHold) { clearTimeout(tileHold); tileHold = null } }
  function tileClick(t: { key: string; ids: EditorToolId[] }) {
    if (tileHeld) { tileHeld = false; return } // the hold already chose the other version
    chooseTool(toolOf(t))
  }
  function tileKey(e: KeyboardEvent, t: { key: string; ids: EditorToolId[] }) {
    if (t.ids.length > 1 && e.shiftKey && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flipTile(t) }
  }
  const LOOP_CHOICES: { id: LoopMode; label: string }[] = [
    { id: 'loop', label: 'Loop' },
    { id: 'bounce', label: 'Back and forth' },
    { id: 'once', label: 'Play once' },
  ]
  const DURATION_PRESETS = [50, 100, 200, 500]

  /** What is on the canvas right now: the stroke in progress, else the shown frame (and its faint onion-skin ghost). */
  function drawNow() {
    if (!renderer || !displayFrame) return
    const framePixels = pixelsLayerOf(displayFrame)?.pixels ?? new Uint8Array(625)
    const showSelection = !playing && displayFrame === frame
    const pixels = stroke ? stroke.preview() : showSelection && sel.isFloating ? sel.preview(framePixels) : framePixels
    const ghost = playing || !design || !frame ? undefined : onionPixels(design, frame.id, onion)
    renderer.draw(pixels, ghost, showSelection ? (selDraft ?? sel.outline()) : undefined)
  }

  /** Paint straight away. Needed while the canvas is being resized every frame, or it would flash blank in between. */
  function paintNow() { drawNow() }

  function schedulePaint() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      drawNow()
    })
  }

  $effect(() => {
    // Repaint whenever the picture, the frame or the zoom/pan changes.
    version
    currentFrameId
    playIndex
    playing
    onion
    selVersion
    selDraft
    renderer?.setView(view)
    schedulePaint()
  })

  function symmetry() { return { x: mirrorX, y: mirrorY } }

  // ---- selection ---------------------------------------------------------------------------------------------
  const frameBase = () => (frame ? pixelsLayerOf(frame)?.pixels : undefined)
  const bumpSelection = () => { selVersion++; schedulePaint() }

  function commitChange(name: string, change: PixelChange | null) {
    const layer = frame && pixelsLayerOf(frame)
    if (session && frame && layer) session.commitPixels(name, frame.id, layer.id, change)
  }

  /** Write a loose paste into the frame, then forget the selection. Used before the user moves on to something else. */
  function finishSelection() {
    if (tool === 'text') return
    const base = frameBase()
    if (base && canEdit && sel.isFloating) commitChange('Paste', sel.commit(base))
    sel.clear()
    selDrag = null
    selDraft = null
    bumpSelection()
  }

  function selectionGestureBegin(cell: Point) {
    const base = frameBase()
    if (!canEdit || !base) return
    if (tool === 'text') {
      if (sel.isFloating) selDrag = { kind: 'move', last: cell }
      return
    }
    if (hasSelection && sel.outline()[idx(cell.x, cell.y)]) {
      selDrag = { kind: 'move', last: cell }
      return
    }
    if (sel.isPasting) finishSelection()
    selDrag = { kind: 'new', start: cell, path: [cell] }
    selDraft = tool === 'lasso' ? lassoMask([cell]) : rectMask(cell, cell)
  }

  function selectionGestureMove(cell: Point) {
    const base = frameBase()
    if (!selDrag || !base) return
    if (selDrag.kind === 'move') {
      const dx = cell.x - selDrag.last.x, dy = cell.y - selDrag.last.y
      if (dx || dy) { sel.moveBy(base, dx, dy); selDrag.last = cell; bumpSelection() }
      return
    }
    selDrag.path.push(cell)
    selDraft = tool === 'lasso' ? lassoMask(selDrag.path) : rectMask(selDrag.start, cell)
    schedulePaint()
  }

  function selectionGestureEnd(cell: Point) {
    const drag = selDrag
    const base = frameBase()
    selDrag = null
    if (!drag || !base) return
    if (drag.kind === 'move') {
      if (!sel.isPasting) commitChange('Move selection', sel.commit(base))
      bumpSelection()
      return
    }
    const tap = drag.start.x === cell.x && drag.start.y === cell.y
    const mask = tool === 'lasso' ? lassoMask(drag.path) : rectMask(drag.start, cell)
    // A tap on an empty spot just clears the selection; a lasso needs a real loop to enclose something.
    if (tap && tool !== 'lasso') sel.clear()
    else sel.select(mask)
    selDraft = null
    bumpSelection()
  }

  function selectionGestureCancel() {
    if (selDrag?.kind === 'move') sel.dropFloating()
    selDrag = null
    selDraft = null
    bumpSelection()
  }

  let toast = $state('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function showToast(msg: string) {
    toast = msg
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = ''), 2200)
  }
  onDestroy(() => clearTimeout(toastTimer))

  function copySelection() {
    const base = frameBase()
    const f = base && sel.copy(base)
    if (f) {
      setClipboard(f)
      showToast(`Copied ${f.covered.reduce<number>((n, v) => n + v, 0)} pixels. Paste works in any frame or design.`)
      bumpSelection()
    } else showToast('Select something first, then copy.')
  }

  function pasteClipboard() {
    const base = frameBase()
    const f = getClipboard()
    if (!canEdit || !base) return
    if (!f) { showToast('Nothing copied yet.'); return }
    if (!selecting) tool = 'select'
    if (sel.isFloating) commitChange('Paste', sel.commit(base))
    const o = pasteOrigin(f)
    sel.pastePixels(f, o.x, o.y)
    bumpSelection()
  }

  type SelectionAction = 'flipH' | 'flipV' | 'rotateL' | 'rotateR' | 'delete' | 'done'
  function selectionAction(a: SelectionAction) {
    const base = frameBase()
    if (!canEdit || !base) return
    switch (a) {
      case 'flipH': commitChange('Flip selection', sel.flip(base, 'horizontal')); break
      case 'flipV': commitChange('Flip selection', sel.flip(base, 'vertical')); break
      case 'rotateL': commitChange('Rotate selection', sel.rotate(base, 'counterclockwise')); break
      case 'rotateR': commitChange('Rotate selection', sel.rotate(base, 'clockwise')); break
      case 'delete': commitChange('Delete selection', sel.delete(base)); break
      case 'done': finishSelection(); return
    }
    bumpSelection()
  }

  /** Show the typed text as loose pixels at its current position (centred the first time). */
  function rebuildText() {
    const b = textBitmap
    const pos = sel.position
    const f = textFloating(b, brightness || 255, pos ? pos.x : Math.floor((25 - b.w) / 2), pos ? pos.y : centredY(b.h))
    if (f) sel.pastePixels(f, f.x, f.y)
    else sel.clear()
    bumpSelection()
  }

  /** Write the text into the frame as one undoable action. */
  function confirmText() {
    const base = frameBase()
    if (!canEdit || !base || !sel.isFloating) return
    commitChange('Add text', sel.commit(base))
    sel.clear()
    text = ''
    bumpSelection()
  }

  function cancelText() {
    text = ''
    sel.clear()
    bumpSelection()
  }

  /** Generate the marquee as new frames after the current one, as one undoable action. */
  function addScroll() {
    if (!canEdit || !session || !frame || scrollPlan.error) return
    const frames = scrollPlan.frames.map((pixels) => ({ pixels, durationMs: scrollPlan.durationMs }))
    const ops = insertFramesOps(frame.id, frames)
    if (session.perform('Scrolling text', ops)) {
      const last = ops[ops.length - 1]
      if (last.t === 'addFrame') currentFrameId = last.frame.id
      showToast(`Added ${frames.length} frames. Press Play to see it.`)
    }
  }

  // Leaving the selection tools ends the selection; the text tool keeps its loose text until it is added or cancelled.
  $effect(() => {
    const t = tool
    untrack(() => {
      if (t === 'text') {
        if (!wasText) { wasText = true; sel.clear(); selDraft = null; rebuildText() }
      } else if (wasText) {
        wasText = false
        sel.clear()
        bumpSelection()
      } else if (!selecting && sel.hasSelection) finishSelection()
    })
  })
  $effect(() => {
    text; fontId; brightness
    if (tool === 'text' && !scrollOpen) untrack(rebuildText)
  })
  $effect(() => {
    currentFrameId
    untrack(() => {
      const keep = tool === 'text' ? sel.position : null
      sel.clear(); selDrag = null; selDraft = null; selVersion++
      if (keep) rebuildText()
    })
  })

  const host: GestureHost = {
    canvasSize: () => cssSize,
    getView: () => view,
    setView: (v) => { view = v },
    strokeBegin: (cell: Point) => {
      const t = tool
      if (!isDrawTool(t)) return selectionGestureBegin(cell)
      const px = frame && pixelsLayerOf(frame)?.pixels
      if (!canEdit || !px) return
      stroke = new Stroke(t, px, { brightness, symmetry: symmetry() })
      stroke.begin(cell)
      schedulePaint()
    },
    strokeMove: (cell) => {
      if (!isDrawTool(tool)) return selectionGestureMove(cell)
      stroke?.move(cell)
      schedulePaint()
    },
    strokeEnd: (cell) => {
      if (!isDrawTool(tool)) return selectionGestureEnd(cell)
      if (!stroke) return
      stroke.end(cell)
      const layer = frame && pixelsLayerOf(frame)
      if (session && frame && layer) session.commitPixels(label(tool), frame.id, layer.id, stroke.change())
      stroke = null
      schedulePaint()
    },
    strokeCancel: () => {
      if (selDrag) return selectionGestureCancel()
      stroke = null
      schedulePaint()
    },
  }
  const gestures = new GestureController(host)

  const label = (t: EditorToolId) => TOOLS.find((x) => x.id === t)?.label.replace(/ \(.*\)/, '') ?? 'Draw'

  function toPtr(e: PointerEvent): PtrEvent {
    const r = canvasEl.getBoundingClientRect()
    const type = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse'
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, pointerType: type, button: e.button }
  }
  const onPointerDown = (e: PointerEvent) => { canvasEl.setPointerCapture(e.pointerId); gestures.pointerDown(toPtr(e)) }
  let cursor = $state<{ x: number; y: number } | null>(null)
  const onPointerMove = (e: PointerEvent) => {
    const p = toPtr(e)
    cursor = cellAt(p.x, p.y, cssSize, view)
    gestures.pointerMove(p)
  }
  const onPointerUp = (e: PointerEvent) => gestures.pointerUp(toPtr(e))
  const onPointerCancel = (e: PointerEvent) => gestures.pointerCancel(toPtr(e))
  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const r = canvasEl.getBoundingClientRect()
    gestures.wheel(e.clientX - r.left, e.clientY - r.top, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, e.ctrlKey)
  }

  /** With "close after choosing" on, picking a tool or a brightness closes the tray. Otherwise it stays as you left it. */
  // Press and hold the matrix button to play this design as a Glyph Toy (it is also in the library's selection bar).
  let matrixHold: ReturnType<typeof setTimeout> | null = null
  let matrixHeld = false
  function playAsToy() { if (!design) return; keepDraft = true; showSlots = true }
  function matrixDown() {
    matrixHeld = false
    matrixHold = setTimeout(() => { matrixHeld = true; matrixHold = null; navigator.vibrate?.(15); playAsToy() }, 500)
  }
  const matrixUp = () => { if (matrixHold) { clearTimeout(matrixHold); matrixHold = null } }
  let toyHints = 0
  /** The first-time pointer goes away for good once the user has shown they found the tools. */
  function dismissHint() {
    if (!hintOpen) return
    hintOpen = false
    putSettings({ trayHintDone: true }).catch(() => {})
  }
  function chooseTool(id: EditorToolId) { dismissHint(); tool = id; if (autoClose) trayOpen = false }
  function chooseBrightness(v: number) { dismissHint(); brightness = v; if (autoClose) trayOpen = false }

  /** Write everything to the phone's storage right now, instead of waiting for the automatic save. */
  async function saveNow() {
    if (saving || status !== 'open') return
    saving = true
    try {
      const r = await saveDesign(designId)
      syncState = { ...syncState, savedRevision: Math.max(syncState.savedRevision, r.revision) }
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  /** Add imported pictures to this design (after the selected frame) or make a new design from them. */
  async function importFrames(frames: ImportedFrame[], name: string, target: ImportTarget) {
    if (target === 'new') {
      const created = await importDesigns([serializeDesign(designFromFrames(name, frames))])
      location.hash = `#/design/${created[0].id}`
      return
    }
    if (!session || !frame || !canEdit) throw new Error('This design cannot be edited right now. Check the connection to the phone.')
    const ops = insertFramesOps(frame.id, frames)
    if (!session.perform('Import picture', ops)) throw new Error('Could not add the frames.')
    const first = ops[0]
    if (first.t === 'addFrame') currentFrameId = first.frame.id
  }

  // ---- frames and animation ----------------------------------------------------------------------------------
  const animation = new AnimationPlayer((i) => { playIndex = i }, () => stopPlay())

  function startPlay() {
    if (!design || playing) return
    stroke = null
    playing = true
    animation.start(design.frames.map((f) => f.durationMs), design.loop)
    // With the live preview on, the phone plays the same animation on the real matrix with the same timing.
    if (previewOn) setPreview({ enabled: true, designId, frameId: frame?.id ?? null, playing: true }).then((s) => (previewStatus = s)).catch(() => {})
  }

  function stopPlay() {
    animation.stop()
    if (!playing) return
    playing = false
    playIndex = null
    schedulePaint()
    if (previewOn && frame) setPreview({ enabled: true, designId, frameId: frame.id, playing: false }).then((s) => (previewStatus = s)).catch(() => {})
  }

  const togglePlay = () => (playing ? stopPlay() : startPlay())

  function addFrame() {
    if (!session || !frame || !canEdit) return
    const op = addBlankFrameOp(session.design, frame.id)
    if (session.perform('Add frame', [op]) && op.t === 'addFrame') currentFrameId = op.frame.id
  }

  function duplicateFrame() {
    if (!session || !frame || !canEdit) return
    const op = duplicateFrameOp(session.design, frame.id)
    if (op && session.perform('Duplicate frame', [op]) && op.t === 'addFrame') currentFrameId = op.frame.id
  }

  let fadeRange = $state<FadeRange>('all')
  /** Dim (or brighten) the frames in the chosen range step by step, as one undoable action. */
  function applyFade(preset: FadePreset) {
    if (!canEdit || !session || !design || !frame) return
    const r = fadeOps(design, preset, fadeRange, frame.id)
    if (!r.ops) { showToast(r.error); return }
    if (session.perform('Fade', r.ops)) showToast(`Fade applied to ${r.ops.length} frame${r.ops.length === 1 ? '' : 's'}. Undo brings the old brightness back.`)
  }

  /** Delete several frames at once (everything after this one, or everything but this one) as one undoable action. */
  function removeFrames(which: 'after' | 'others') {
    if (!canEdit || !session || !design || !frame) return
    const i = design.frames.indexOf(frame)
    const victims = which === 'after' ? design.frames.slice(i + 1) : design.frames.filter((f) => f.id !== frame!.id)
    const ops = victims.map((f) => deleteFrameOp(session!.design, f.id)).filter((o): o is NonNullable<typeof o> => o !== null)
    if (!ops.length) return
    if (session.perform('Delete frames', ops)) showToast(`Deleted ${ops.length} frame${ops.length === 1 ? '' : 's'}. Undo brings them back.`)
  }

  function deleteFrame() {
    if (!session || !frame || !canEdit) return
    const next = selectionAfterDelete(session.design, frame.id)
    const op = deleteFrameOp(session.design, frame.id)
    if (op && session.perform('Delete frame', [op]) && next) currentFrameId = next
  }

  function moveFrame(id: string, toIndex: number) {
    if (!session || !canEdit) return
    const op = moveFrameToIndexOp(session.design, id, toIndex)
    if (op) session.perform('Move frame', [op])
  }

  function nudgeFrame(dir: -1 | 1) {
    if (design && frame) moveFrame(frame.id, design.frames.indexOf(frame) + dir)
  }

  function setFrameDuration(ms: number) {
    if (!session || !frame || !canEdit || !Number.isFinite(ms)) return
    session.perform('Frame duration', [{ t: 'setDuration', frameId: frame.id, durationMs: Math.round(ms) }])
  }

  function applyDurationToAll() {
    if (!session || !frame || !canEdit) return
    const ops = setAllDurationsOps(session.design, frame.durationMs)
    if (ops.length) session.perform('Same duration for all frames', ops)
  }

  function setLoopMode(mode: LoopMode) {
    if (!session || !canEdit || session.design.loop === mode) return
    session.perform('Loop mode', [{ t: 'setLoop', loop: mode }])
  }

  function measureTray() {
    if (!innerEl) return
    innerH = innerEl.offsetHeight
    capH = Math.round(window.innerHeight * 0.7)
  }

  // The tray follows your finger from anywhere on it (the bar, the handle or the gaps between buttons), then glides to
  // whichever end is nearer, or the way you flicked. A plain tap on the bar opens and closes it.
  function trayDown(e: PointerEvent) {
    if (e.button !== 0 || wide) return
    const target = e.target as HTMLElement
    if (target.closest('input, select, textarea')) return // sliders and number boxes keep their own gestures
    const onBar = !!target.closest('.tray-bar')
    if (!onBar && !trayOpen) return
    if (scrollable && !target.closest('.tray-bar, .grab')) return // a scrolling tray keeps its own touch scrolling
    const h = trayOpen ? contentH : 0
    drag = { startY: e.clientY, startH: h, h, moved: false, t: performance.now(), viaBar: onBar }
  }

  function trayMove(e: PointerEvent) {
    if (!drag) return
    const dy = e.clientY - drag.startY
    if (!drag.moved) {
      if (Math.abs(dy) < DRAG_THRESHOLD_PX) return // still a tap
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    drag = { ...drag, moved: true, h: draggedHeight(drag.startH, dy, contentH) }
  }

  function trayUp(e: PointerEvent) {
    if (!drag) return
    const d = drag
    drag = null
    if (!d.moved) {
      if (d.viaBar) trayOpen = !trayOpen
      return
    }
    swallowNextClick = true // the drag must not also press the button it started on
    setTimeout(() => (swallowNextClick = false), 0)
    const velocity = (e.clientY - d.startY) / Math.max(1, performance.now() - d.t) // px per ms; negative = upward
    trayOpen = settlesOpen(velocity, d.h, contentH)
  }

  const trayCancel = () => { drag = null }
  const swallowClickAfterDrag = (e: MouseEvent) => { if (swallowNextClick) { e.preventDefault(); e.stopPropagation() } }
  /** Keyboard activation (Enter/Space) arrives as a click with no pointer; real taps are handled in trayUp. */
  const onBarClick = (e: MouseEvent) => { if (e.detail === 0) trayOpen = !trayOpen }

  // ---- actions -----------------------------------------------------------------------------------------------
  function transform(name: string, fn: (p: Uint8Array) => Uint8Array) {
    const layer = frame && pixelsLayerOf(frame)
    if (!canEdit || !session || !frame || !layer) return
    session.commitPixels(name, frame.id, layer.id, diffPixels(layer.pixels, fn(layer.pixels)))
  }

  function stepFrame(dir: -1 | 1) {
    if (!design || !frame || playing) return
    const i = design.frames.indexOf(frame) + dir
    if (i >= 0 && i < design.frames.length) { finishSelection(); currentFrameId = design.frames[i].id }
  }

  function zoomStep(dir: -1 | 0 | 1) {
    const c = { x: cssSize.w / 2, y: cssSize.h / 2 }
    view = dir === 0 ? DEFAULT_VIEW : zoomAt(view, dir > 0 ? 1.25 : 0.8, c.x, c.y, cssSize)
  }

  function run(a: Action) {
    switch (a.type) {
      case 'tool': tool = a.tool; break
      case 'swatch': brightness = SWATCHES[a.index]; break
      case 'undo': if (canEdit) { sel.clear(); selVersion++; session?.undo(); if (tool === 'text') rebuildText() } break
      case 'redo': if (canEdit) { sel.clear(); selVersion++; session?.redo(); if (tool === 'text') rebuildText() } break
      case 'mirror': if (a.axis === 'x') mirrorX = !mirrorX; else mirrorY = !mirrorY; break
      case 'frame': stepFrame(a.dir); break
      case 'zoom': zoomStep(a.dir); break
      case 'shift': transform('Shift', (p) => shiftPixels(p, a.dx, a.dy)); break
      case 'play': togglePlay(); break
      case 'save': saveNow(); break
      case 'help': showHelp = true; break
      case 'delete': if (selecting && hasSelection) selectionAction('delete'); break
      case 'deselect': if (tool === 'text') cancelText(); else if (hasSelection) selectionAction('done'); break
      case 'copy': if (hasSelection) copySelection(); break
      case 'cut': if (canEdit && hasSelection) { copySelection(); selectionAction('delete') } break
      case 'paste': pasteClipboard(); break
    }
  }

  function isTyping(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null
    const tag = el?.tagName?.toUpperCase()
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === ' ' && !isTyping(e.target)) {
      gestures.setSpaceHeld(true) // hold Space and drag to pan
      e.preventDefault()
      return
    }
    const action = shortcutFor({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, target: e.target as HTMLElement })
    if (action) { e.preventDefault(); run(action) }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key !== ' ') return
    gestures.setSpaceHeld(false)
    if (!isTyping(e.target)) e.preventDefault() // stop Space from also "clicking" a focused button
  }

  // ---- live preview on the real Glyph Matrix -----------------------------------------------------------------
  async function applyPreview(enabled: boolean) {
    if (enabled && previewStatus?.supported === false) { showToast(previewStatus.message ?? 'The Glyph Matrix is not available on this phone.'); return }
    previewBusy = true
    try {
      previewStatus = enabled && frame
        ? await setPreview({ enabled: true, designId, frameId: frame.id, playing })
        : await setPreview({ enabled: false })
      if (enabled && previewStatus?.message) showToast(previewStatus.message)
      else if (enabled && toyHints++ < 2) showToast('Showing on the back of your phone. Press and hold this button to play it as a Glyph Toy.')
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e)
    } finally {
      previewBusy = false
    }
  }

  $effect(() => {
    // While previewing, show the frame being edited. (The edits themselves reach the matrix through the phone.)
    const frameId = frame?.id
    if (previewOn && frameId && !playing) setPreview({ enabled: true, designId, frameId }).catch(() => {})
  })

  // ---- undo history kept across sessions ---------------------------------------------------------------------
  // The phone stores the stacks next to the design and hands them back only if the design is exactly as it was left.
  let historyChanged = false
  let historyTimer: ReturnType<typeof setTimeout> | undefined

  /** Bring back the undo steps from the last time this design was open, unless the user has already started editing. */
  function restoreHistory(s: EditSession) {
    getHistory(designId).then((saved) => {
      if (session !== s || s.history.canUndo || s.history.canRedo) return
      s.history.restore(saved)
      historyChanged = false
      version++
    }).catch(() => { /* no history is fine */ })
  }

  /** Save soon after the user stops editing, so a closed or killed app keeps the steps. Only when everything is on the phone. */
  function scheduleHistorySave() {
    clearTimeout(historyTimer)
    historyTimer = setTimeout(saveHistoryNow, 2500)
  }

  function saveHistoryNow() {
    clearTimeout(historyTimer)
    if (!session || !historyChanged || status !== 'open' || isDirty(syncState)) return
    historyChanged = false
    putHistory(designId, session.history.snapshot()).catch(() => { historyChanged = true })
  }

  // ---- connection to the phone -------------------------------------------------------------------------------
  function connect() {
    sync = new SyncClient(designId, {
      onSnapshot: (d) => {
        const ed = toEditorDesign(d)
        if (session) session.replace(ed)
        else {
          session = new EditSession(ed, (ops) => { sync?.sendOps(ops) })
          restoreHistory(session)
        }
        if (!ed.frames.some((f) => f.id === currentFrameId)) currentFrameId = ed.frames[0].id
        problem = ''
        version++
        session.subscribe(() => { version++; historyChanged = true; scheduleHistorySave() })
      },
      onRemoteOp: (op) => { session?.applyRemote(op) },
      onRejected: (why) => { problem = `Out of sync (${why}). Reloading…`; sync?.reconnect() },
      onDeleted: () => onBack('That design was deleted.'),
      onStatus: (s) => { status = s },
      onSyncState: (st) => {
        syncState = st
        if (baseRevision < 0 && st.revision >= 0) baseRevision = st.revision // what the design was when it was opened
      },
      onError: (m) => { problem = m },
    })
    sync.connect()
  }

  function applyTheme() {
    renderer?.setTheme(DARK_THEME) // the display is the hardware: always dark, in either app theme
    schedulePaint()
  }

  function sizeCanvas() {
    const r = wrapEl.getBoundingClientRect()
    cssSize = { w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) }
    const dpr = window.devicePixelRatio || 1
    canvasEl.width = Math.round(cssSize.w * dpr)
    canvasEl.height = Math.round(cssSize.h * dpr)
    renderer?.resize(cssSize, dpr)
    paintNow()
  }

  onMount(() => {
    renderer = new MatrixRenderer(canvasEl.getContext('2d') as unknown as Ctx2D)
    colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    colorScheme.addEventListener('change', applyTheme)
    applyTheme()
    resizeObserver = new ResizeObserver(sizeCanvas)
    resizeObserver.observe(wrapEl)
    sizeCanvas()
    canvasEl.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    connect()
    getSettings().then((st) => {
      autoClose = st.autoClose
      if (!st.trayHintDone && !wide) { trayOpen = true; hintOpen = true }
    }, () => {})
    getPreview().then((s) => (previewStatus = s)).catch(() => {})
    trayResize = new ResizeObserver(measureTray)
    trayResize.observe(innerEl)
    measureTray()
    window.addEventListener('resize', measureTray)
    wideQuery = window.matchMedia('(min-width: 900px)')
    wideQuery.addEventListener('change', onWideChange)
    onWideChange()
  })

  onDestroy(() => {
    // A design made from a template just to look at it goes away again if nothing was changed.
    if (libraryState.draftId === designId) {
      libraryState.draftId = null
      const touched = keepDraft || (baseRevision >= 0 && syncState.revision > baseRevision) || (session?.history.canUndo ?? false) || (session?.history.canRedo ?? false)
      if (!touched) {
        libraryState.hidden.add(designId)
        deleteDesign(designId).catch(() => {}).finally(() => libraryState.hidden.delete(designId))
      }
    }
    saveHistoryNow() // leaving the editor: keep the undo steps (the phone has every edit by now)
    clearTimeout(historyTimer)
    animation.stop()
    if (previewOn) setPreview({ enabled: false }).catch(() => {}) // give the matrix back when leaving the editor
    sync?.close()
    resizeObserver?.disconnect()
    colorScheme?.removeEventListener('change', applyTheme)
    wideQuery?.removeEventListener('change', onWideChange)
    trayResize?.disconnect()
    window.removeEventListener('resize', measureTray)
    canvasEl?.removeEventListener('wheel', onWheel)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    if (rafId) cancelAnimationFrame(rafId)
  })

  const swatchColor = (v: number) => `rgb(${Math.round(38 + (255 - 38) * (v / 255))},${Math.round(38 + (255 - 38) * (v / 255))},${Math.round(42 + (255 - 42) * (v / 255))})`
</script>

<div class="editor">
  <header>
    <button class="labelled back" onclick={() => onBack()} aria-label="Back to library" title="Back to library"><Icon name="back" size={24} /><span class="wide-text">Library</span></button>
    <div class="titlewrap">
      <h2 title={design?.name}>{design?.name ?? 'Loading…'}</h2>
      <button
        class="savedot"
        class:dirty
        class:saving
        onclick={saveNow}
        disabled={saving || status !== 'open'}
        aria-label={saving ? 'Saving' : dirty ? 'Save now' : 'All changes saved'}
        title={dirty ? 'Save now (Ctrl+S). Changes are also saved automatically.' : 'All changes are saved'}
      ><i aria-hidden="true"></i><span class="wide-text">{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</span></button>
    </div>
    <span class="sr-only" role="status">{saving ? 'Saving' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
    <button
      class="labelled matrixbtn"
      class:on={previewOn}
      onclick={() => { if (matrixHeld) { matrixHeld = false; return } applyPreview(!previewOn) }}
      onpointerdown={matrixDown}
      onpointerup={matrixUp}
      onpointercancel={matrixUp}
      onpointerleave={matrixUp}
      oncontextmenu={(e) => { e.preventDefault(); playAsToy() }}
      disabled={previewBusy}
      aria-pressed={previewOn}
      aria-label="Show on Glyph Matrix. Press and hold to play this design as a Glyph Toy."
      title={previewStatus?.supported === false ? previewStatus.message : previewOn ? 'Showing on the back of your phone. Tap to stop. Press and hold to play it as a Glyph Toy.' : 'Show what you draw on the back of your phone, live. Press and hold to play it as a Glyph Toy.'}
    ><Icon name="matrix" size={24} /><span class="wide-text">On matrix</span></button>
    <button class="labelled undoredo" onclick={() => run({ type: 'undo' })} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><Icon name="undo" size={24} /><span>Undo</span></button>
    <button class="labelled undoredo" onclick={() => run({ type: 'redo' })} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Icon name="redo" size={24} /><span>Redo</span></button>
    {#if hasKeyboard}
      <button class="labelled undoredo kbd" onclick={() => (showHelp = true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)"><Icon name="keyboard" size={24} /><span>Shortcuts</span></button>
    {/if}
  </header>

  {#if status !== 'open' || problem}
    <div class="banner" role="status">
      <span>{problem || (status === 'connecting' ? 'Connecting to the phone…' : hasKeyboard ? 'Disconnected from the phone. Everything already saved is safe on the phone. Check that it is on the same Wi-Fi and PC editing is still on, then press Reconnect.' : 'Disconnected from the phone.')}</span>
      {#if status === 'closed'}<button onclick={() => sync?.reconnect()}>Reconnect</button>{/if}
    </div>
  {/if}

  <div class="stage">
    <div class="bezel"><div class="canvas-wrap" bind:this={wrapEl}>
      <canvas
      bind:this={canvasEl}
      aria-label="Glyph Matrix drawing canvas"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerCancel}
      oncontextmenu={(e) => e.preventDefault()}
    ></canvas>
    </div></div>
    {#if toast}<div class="toast" role="status">{toast}</div>{/if}

    <div class="readout" aria-hidden="true">
      <span>Pen <b>{brightness}</b></span>
      <span>Frame <b>{frameNumber}/{design?.frames.length ?? 0}</b></span>
      <span>X <b>{cursor ? cursor.x : '–'}</b> Y <b>{cursor ? cursor.y : '–'}</b></span>
    </div>
    {#if selecting && (hasSelection || clipFull) && canEdit}
      <div class="selbar" role="toolbar" aria-label="Selection actions">
        {#if hasSelection}
          <button onclick={copySelection} aria-label="Copy selection" title="Copy (Ctrl+C)"><Icon name="copy" size={20} /></button>
          <button onclick={() => { copySelection(); selectionAction('delete') }} aria-label="Cut selection" title="Cut (Ctrl+X)"><Icon name="cut" size={20} /></button>
        {/if}
        {#if clipFull}
          <button onclick={pasteClipboard} aria-label="Paste" title="Paste (Ctrl+V)"><Icon name="paste" size={20} /></button>
        {/if}
        {#if hasSelection}
        <button onclick={() => selectionAction('flipH')} aria-label="Flip selection left-right" title="Flip left-right"><Icon name="flipH" size={20} /></button>
        <button onclick={() => selectionAction('flipV')} aria-label="Flip selection top-bottom" title="Flip top-bottom"><Icon name="flipV" size={20} /></button>
        <button onclick={() => selectionAction('rotateL')} aria-label="Rotate selection left" title="Rotate left"><Icon name="rotateL" size={20} /></button>
        <button onclick={() => selectionAction('rotateR')} aria-label="Rotate selection right" title="Rotate right"><Icon name="rotateR" size={20} /></button>
        <button onclick={() => selectionAction('delete')} aria-label="Erase selection" title="Erase the selected area (Delete)"><Icon name="clear" size={20} /></button>
        <button class="done" onclick={() => selectionAction('done')} aria-label="Done with selection" title="Done (Esc)"><Icon name="check" size={20} /><span>Done</span></button>
        {/if}
      </div>
    {/if}
    {#if view.zoom > 1}
      <button class="zoom-reset" onclick={() => zoomStep(0)}>{view.zoom.toFixed(1)}× · reset</button>
    {/if}
  </div>

  {#if design && frame}
    {#if tool === 'text' && canEdit}
      <div class="textbar" role="group" aria-label="Text">
        <div class="textrow">
          <input type="text" bind:value={text} placeholder="Type text, then drag it into place" maxlength="80" autocomplete="off" aria-label="Text to add" />
        </div>
        {#if scrollOpen}
          <div class="seg" role="radiogroup" aria-label="Scroll direction">
            <button role="radio" aria-checked={scrollDir === 'rtl'} class:active={scrollDir === 'rtl'} onclick={() => (scrollDir = 'rtl')}>Right to left</button>
            <button role="radio" aria-checked={scrollDir === 'ltr'} class:active={scrollDir === 'ltr'} onclick={() => (scrollDir = 'ltr')}>Left to right</button>
          </div>
          <div class="seg" role="radiogroup" aria-label="Scroll speed">
            {#each SCROLL_SPEEDS as s (s.id)}
              <button role="radio" aria-checked={scrollSpeed === s.id} class:active={scrollSpeed === s.id} onclick={() => (scrollSpeed = s.id)}>{s.label}</button>
            {/each}
          </div>
          {#if scrollPlan.error && text}<p class="texthint" role="alert">{scrollPlan.error}</p>{/if}
          <div class="textrow">
            <button onclick={() => { scrollOpen = false; rebuildText() }}>Back</button>
            <button class="done" onclick={addScroll} disabled={!!scrollPlan.error}>{scrollPlan.error ? 'Add frames' : `Add ${scrollPlan.frames.length} frames`}</button>
          </div>
        {:else}
          <div class="seg" role="radiogroup" aria-label="Font">
            {#each FONTS as f (f.id)}
              <button role="radio" aria-checked={fontId === f.id} class:active={fontId === f.id} onclick={() => (fontId = f.id)}>{f.label}</button>
            {/each}
          </div>
          {#if textBitmap.missing}<p class="texthint">A character this font cannot draw is shown as a box.</p>{/if}
          <div class="textrow">
            <button onclick={cancelText} disabled={!text}>Cancel</button>
            <button onclick={() => { scrollOpen = true; sel.clear(); bumpSelection() }} disabled={!text}>Scroll…</button>
            <button class="done" onclick={confirmText} disabled={!hasSelection}><Icon name="check" size={20} /><span>Add</span></button>
          </div>
        {/if}
      </div>
    {/if}
    <div class="strip-row">
      <button class="play" class:on={playing} onclick={togglePlay} aria-label={playing ? 'Stop the animation' : 'Play the animation'} title="Play / stop (Enter)">
        <Icon name={playing ? 'stop' : 'play'} size={22} /><span>{playing ? 'Stop' : 'Play'}</span>
      </button>
      <FrameStrip
        frames={design.frames}
        currentId={frame.id}
        activeIndex={playing ? playIndex : null}
        disabled={!canEdit}
        onSelect={(id) => { finishSelection(); currentFrameId = id }}
        onActions={() => (showFrameActions = true)}
        onMove={moveFrame}
        onAdd={addFrame}
      />
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section
    class="panel"
    aria-label="Drawing tools"
    onpointerdown={trayDown}
    onpointermove={trayMove}
    onpointerup={trayUp}
    onpointercancel={trayCancel}
    onclickcapture={swallowClickAfterDrag}
  >
    <div
      class="tray"
      class:dragging={drag?.moved}
      class:scrollable
      style:height={trayHeight === undefined ? undefined : `${trayHeight}px`}
      inert={!trayOpen && !wide}
    >
      <div class="tray-inner" bind:this={innerEl}>
        <div class="grab" aria-hidden="true"><span></span></div>
        <div id="tray-body" class="tray-body">
    {#if hintOpen}
      <div class="pointer" role="note">
        <span>Your tools live here. Pick one, then draw on the board.</span>
        <button onclick={dismissHint}>Got it</button>
      </div>
    {/if}
    <div class="tabs" role="tablist" aria-label="Tray section">
      <button role="tab" class="tab" class:active={trayTab === 'draw'} aria-selected={trayTab === 'draw'} onclick={() => (trayTab = 'draw')}>Draw</button>
      <button role="tab" class="tab" class:active={trayTab === 'edit'} aria-selected={trayTab === 'edit'} onclick={() => (trayTab = 'edit')}>Edit</button>
      <button role="tab" class="tab" class:active={trayTab === 'frames'} aria-selected={trayTab === 'frames'} onclick={() => (trayTab = 'frames')}>Frames</button>
    </div>
    {#if trayTab === 'draw'}
    <h3 class="cap">Draw with</h3>
    <div class="tools" role="radiogroup" aria-label="Tool">
      {#each TILES as t (t.key)}
        {@const id = toolOf(t)}
        {@const info = toolInfo(id)}
        <button
          class="tile"
          class:active={t.ids.includes(tool)}
          class:twin={t.ids.length > 1}
          onclick={() => tileClick(t)}
          onpointerdown={(e) => tileDown(e, t)}
          onpointerup={tileUp}
          onpointercancel={tileUp}
          onpointerleave={tileUp}
          onkeydown={(e) => tileKey(e, t)}
          oncontextmenu={(e) => { if (t.ids.length > 1) { e.preventDefault(); if (!tileHeld) { tileUp(); flipTile(t) } } }}
          role="radio"
          aria-checked={t.ids.includes(tool)}
          aria-label={t.ids.length > 1 ? `${info.short}. Press and hold, or press Shift and Enter, for ${toolInfo(otherOf(t)).short.toLowerCase()}.` : info.label}
          title={t.ids.length > 1 ? `${info.label}. Press and hold for ${toolInfo(otherOf(t)).short.toLowerCase()}.` : info.label}
        >
          <Icon name={info.icon} size={22} />
          <span>{info.short}</span>
          {#if t.ids.length > 1}<i class="twinmark" aria-hidden="true"></i>{/if}
        </button>
      {/each}
    </div>

    <p class="toolhint" aria-live="polite"><strong>{currentTool.short}</strong> {TOOL_HINTS[tool]}{altHint}</p>

    <h3 class="cap">Brightness <span class="val">{brightness}</span></h3>
    <div class="row swatches" role="radiogroup" aria-label="Brightness">
      {#each SWATCHES as v, i (v)}
        <button
          class="swatch"
          class:active={exactSwatch && swatch === i}
          style:background={swatchColor(v)}
          onclick={() => chooseBrightness(v)}
          role="radio"
          aria-checked={exactSwatch && swatch === i}
          aria-label={`Brightness ${v}`}
          title={`${i + 1}: ${v}`}
        ></button>
      {/each}
    </div>
    <div class="row exact">
      <label for="exact">Fine tune</label>
      <input id="exact" type="range" min="0" max="255" step="1" bind:value={brightness} aria-label="Exact brightness" />
      <input class="num" type="number" min="0" max="255" value={brightness} oninput={(e) => (brightness = clampBrightness(Number(e.currentTarget.value)))} aria-label="Brightness value" />
    </div>

    {:else if trayTab === 'edit'}
    <h3 class="cap">Mirror &amp; edit this frame</h3>
    <div class="tools five">
      <button class="tile" class:active={mirrorX} onclick={() => (mirrorX = !mirrorX)} aria-pressed={mirrorX} aria-label="Mirror left-right (X)" title="Draw on both left and right at once (X)">
        <Icon name="mirrorX" size={22} /><span>Mirror L/R</span>
      </button>
      <button class="tile" class:active={mirrorY} onclick={() => (mirrorY = !mirrorY)} aria-pressed={mirrorY} aria-label="Mirror top-bottom (Y)" title="Draw on both top and bottom at once (Y)">
        <Icon name="mirrorY" size={22} /><span>Mirror U/D</span>
      </button>
      <button class="tile" onclick={() => transform('Flip horizontally', flipHorizontal)} disabled={!canEdit} aria-label="Flip left-right" title="Flip the picture left-right">
        <Icon name="flipH" size={22} /><span>Flip L/R</span>
      </button>
      <button class="tile" onclick={() => transform('Flip vertically', flipVertical)} disabled={!canEdit} aria-label="Flip top-bottom" title="Flip the picture top-bottom">
        <Icon name="flipV" size={22} /><span>Flip U/D</span>
      </button>
      <button class="tile danger" onclick={() => transform('Clear frame', clearPixels)} disabled={!canEdit} aria-label="Clear frame" title="Erase the whole frame (you can undo)">
        <Icon name="clear" size={22} /><span>Clear all</span>
      </button>
    </div>

    <h3 class="cap">Move picture</h3>
    <div class="tools">
      <button class="tile" onclick={() => run({ type: 'shift', dx: -1, dy: 0 })} disabled={!canEdit} aria-label="Move left" title="Move picture left (Alt+←)"><Icon name="left" size={22} /><span>Left</span></button>
      <button class="tile" onclick={() => run({ type: 'shift', dx: 0, dy: -1 })} disabled={!canEdit} aria-label="Move up" title="Move picture up (Alt+↑)"><Icon name="up" size={22} /><span>Up</span></button>
      <button class="tile" onclick={() => run({ type: 'shift', dx: 0, dy: 1 })} disabled={!canEdit} aria-label="Move down" title="Move picture down (Alt+↓)"><Icon name="down" size={22} /><span>Down</span></button>
      <button class="tile" onclick={() => run({ type: 'shift', dx: 1, dy: 0 })} disabled={!canEdit} aria-label="Move right" title="Move picture right (Alt+→)"><Icon name="right" size={22} /><span>Right</span></button>
    </div>

    <h3 class="cap">Selection &amp; clipboard</h3>
    <div class="tools">
      <button class="tile" onclick={() => chooseTool('select')} aria-label="Select a rectangle"><Icon name="select" size={22} /><span>Select</span></button>
      <button class="tile" onclick={() => chooseTool('lasso')} aria-label="Select freehand"><Icon name="lasso" size={22} /><span>Lasso</span></button>
      <button class="tile" onclick={pasteClipboard} disabled={!canEdit || !frame || !clipFull} title="Paste what you copied (Ctrl+V)"><Icon name="paste" size={22} /><span>Paste</span></button>
    </div>
    {:else}
      <h3 class="cap">Frame {frameNumber} of {design?.frames.length ?? 0}</h3>
      <p class="hint">Tap the selected frame under the board for Duplicate, Delete and Move. Press and hold a frame, then slide, to reorder.</p>

      <h3 class="cap">How long this frame shows</h3>
      <div class="row duration">
        <input type="number" min="16" max="60000" step="10" value={frame?.durationMs ?? 100} onchange={(e) => setFrameDuration(Number(e.currentTarget.value))} disabled={!canEdit} aria-label="Frame duration in milliseconds" />
        <span class="unit">ms</span>
        <span class="fps">≈ {frame ? (1000 / frame.durationMs).toFixed(1) : '–'} per second</span>
      </div>
      <div class="chips">
        {#each DURATION_PRESETS as ms (ms)}
          <button class="chipbtn" class:active={frame?.durationMs === ms} onclick={() => setFrameDuration(ms)} disabled={!canEdit}>{ms} ms</button>
        {/each}
        <button class="chipbtn wide-chip" onclick={applyDurationToAll} disabled={!canEdit} title="Give every frame this frame's duration">Same for all frames</button>
      </div>

      <details class="adv" bind:open={adv.fade}>
        <summary>Fade brightness</summary>
        <div class="seg" role="radiogroup" aria-label="Frames to fade">
          {#each FADE_RANGES as r (r.id)}
            <button role="radio" aria-checked={fadeRange === r.id} class:active={fadeRange === r.id} onclick={() => (fadeRange = r.id)}>{r.label}</button>
          {/each}
        </div>
        <div class="seg fadebtns">
          {#each FADE_PRESETS as p (p.id)}
            <button onclick={() => applyFade(p.id)} disabled={!canEdit || !design || design.frames.length < 2}>{p.label}</button>
          {/each}
        </div>

      </details>

      <details class="adv" bind:open={adv.play}>
        <summary>Loop and onion skin</summary>
        <div class="seg" role="radiogroup" aria-label="Loop mode">
          {#each LOOP_CHOICES as c (c.id)}
            <button role="radio" aria-checked={design?.loop === c.id} class:active={design?.loop === c.id} onclick={() => setLoopMode(c.id)} disabled={!canEdit}>{c.label}</button>
          {/each}
        </div>

        <h3 class="cap">Onion skin</h3>
        <div class="seg" role="radiogroup" aria-label="Onion skin">
          {#each ONION_MODES as m (m.id)}
            <button role="radio" aria-checked={onion === m.id} class:active={onion === m.id} onclick={() => (onion = m.id)}>{m.label}</button>
          {/each}
        </div>
        <p class="hint">Onion skin shows the neighbouring frames faintly under the one you draw on. It is only a guide and is never saved.</p>

      </details>

      <details class="adv" bind:open={adv.remove}>
        <summary>Remove many frames</summary>
        <div class="tools">
          <button class="tile danger" onclick={() => removeFrames('after')} disabled={!canEdit || !design || frameNumber >= design.frames.length} title="Delete every frame after this one (you can undo)"><Icon name="clear" size={22} /><span>All after this</span></button>
          <button class="tile danger" onclick={() => removeFrames('others')} disabled={!canEdit || !design || design.frames.length < 2} title="Keep only this frame (you can undo)"><Icon name="clear" size={22} /><span>Keep only this</span></button>
        </div>

      </details>

      <details class="adv" bind:open={adv.pics}>
        <summary>Pictures</summary>
        <button class="importbtn" onclick={() => (showImport = true)} disabled={!canEdit}>Import a picture or GIF…</button>
      </details>

    {/if}
        </div>
      </div>
    </div>
    <button
      class="tray-bar"
      onclick={onBarClick}
      aria-expanded={trayOpen}
      aria-controls="tray-body"
      title={trayOpen ? 'Close the tool tray' : 'Open the tool tray (or swipe up)'}
    >
      <span class="chip"><Icon name={currentTool.icon} size={20} /><span>{currentTool.short}</span></span>
      <span class="chip"><span class="dot" style:background={swatchColor(brightness)}></span><span>{brightness}</span></span>
      {#if mirrorX}<span class="chip">Mirror L/R</span>{/if}
      {#if mirrorY}<span class="chip">Mirror U/D</span>{/if}
      {#if previewOn}<span class="chip live">● On matrix</span>{/if}
      <span class="spacer"></span>
      <span class="chev">{trayOpen ? 'Close' : 'Tools'}<Icon name={trayOpen ? 'down' : 'up'} size={20} /></span>
    </button>
  </section>
</div>

{#if showHelp}
  <ShortcutsDialog onClose={() => (showHelp = false)} />
{/if}

{#if showImport && design}
  <ImportDialog
    canInsert={true}
    insertLabel={`After frame ${frameNumber}`}
    onClose={() => (showImport = false)}
    onImport={importFrames}
  />
{/if}

{#if showFrameActions && design && frame}
  <Dialog title={`Frame ${frameNumber} of ${design.frames.length}`} onClose={() => (showFrameActions = false)}>
    <div class="moremenu">
      <button onclick={() => { showFrameActions = false; duplicateFrame() }} disabled={!canEdit}>Duplicate</button>
      <button onclick={() => { showFrameActions = false; nudgeFrame(-1) }} disabled={!canEdit || frameNumber <= 1}>Move earlier</button>
      <button onclick={() => { showFrameActions = false; nudgeFrame(1) }} disabled={!canEdit || frameNumber >= design.frames.length}>Move later</button>
      <button class="danger" onclick={() => { showFrameActions = false; deleteFrame() }} disabled={!canEdit || design.frames.length < 2}>Delete this frame</button>
      <button onclick={() => (showFrameActions = false)}>Close</button>
    </div>
  </Dialog>
{/if}

{#if showSlots && design}
  <SlotPicker {designId} designName={design.name} onClose={() => (showSlots = false)} />
{/if}

<style>
  .editor {
    height: 100%;
    display: flex;
    flex-direction: column;
    max-width: 1100px;
    margin: 0 auto;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.25rem;
  }
  h2 {
    margin: 0 0.25rem;
    font-size: 1.05rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spacer { flex: 1; }
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    border: 1px solid var(--accent);
    font-size: 0.9rem;
  }
  /* The display is round like the hardware: a square stage, a metal bezel ring, the LED well inside it. */
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    margin: 0.25rem 0.5rem;
    padding-bottom: 1.15rem; /* room for the readout under the ring */
    container-type: size;
    display: grid;
    place-items: center;
  }
  .bezel {
    --d: min(100cqw, 100cqh);
    width: var(--d);
    height: var(--d);
    padding: calc(var(--d) * 0.03);
    border-radius: 50%;
    background: linear-gradient(145deg, var(--bezel-top), var(--bezel-bottom) 62%);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.2), 0 18px 30px -16px rgb(0 0 0 / 0.85);
  }
  .canvas-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--well);
    overflow: hidden;
    box-shadow: inset 0 3px 12px rgb(0 0 0 / 0.75), 0 0 0 1px rgb(0 0 0 / 0.6);
  }
  .readout {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    display: flex; justify-content: center; gap: 1rem;
    font-family: var(--font-mono); font-size: 0.7rem; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--muted);
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .readout b { color: var(--text); font-weight: 500; }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none; /* we handle every gesture ourselves */
    user-select: none;
    -webkit-user-select: none;
  }
  .selbar {
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    width: fit-content;
    margin: 0 auto;
    bottom: 0.5rem;
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .textbar {
    margin: 0 0.5rem 0.25rem;
    display: grid;
    gap: 0.4rem;
    padding: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  .textbar input { width: 100%; min-height: 44px; font-size: 1rem; padding: 0 0.7rem; box-sizing: border-box; }
  .textrow { display: flex; gap: 0.4rem; }
  .textrow input { flex: 1; }
  .textrow button { flex: 1; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; }
  .textrow .done { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .texthint { margin: 0; font-size: 0.8rem; color: var(--muted, inherit); }
  .selbar button {
    min-width: 44px;
    min-height: 44px;
    padding: 0.2rem 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }
  .selbar .done { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
  .toast {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    max-width: calc(100% - 1rem);
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--accent);
    color: var(--text, inherit);
    font-size: 0.9rem;
    pointer-events: none;
  }
  .zoom-reset {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem 0.7rem;
    min-height: 44px;
    min-width: 44px;
    font-size: 0.8rem;
  }
  .panel {
    position: relative;
    padding: 0.4rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
    touch-action: none; /* we follow vertical drags ourselves instead of letting the page scroll */
  }
  /* The tray is part of the layout: opening it pushes the drawing board up, and the board stays usable. */
  .tray {
    overflow: hidden;
    border-radius: 18px 18px 0 0;
    transition: height 0.3s cubic-bezier(0.22, 0.9, 0.25, 1);
  }
  .tray.dragging { transition: none; } /* follow the finger exactly */
  .tray.scrollable { overflow-y: auto; touch-action: pan-y; overscroll-behavior: contain; scrollbar-width: none; }
  .tray-inner { padding-bottom: 0.4rem; }
  .grab {
    display: grid;
    place-items: center;
    height: 22px;
    touch-action: none;
    cursor: grab;
  }
  .grab span { width: 42px; height: 5px; border-radius: 999px; background: var(--line); }
  @media (prefers-reduced-motion: reduce) { .tray { transition: none; } }
  .strip-row { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.5rem; min-width: 0; }
  .strip-row :global(.strip) { flex: 1; min-width: 0; }
  button.play {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 60px;
    padding: 0 0.9rem 0 0.7rem;
    border-radius: 14px;
    min-height: 0;
  }
  button.play.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
  .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.3rem; padding: 0.15rem; border-radius: 14px; background: var(--bg); border: 1px solid var(--line); }
  button.tab { border: 0; background: transparent; border-radius: 11px; min-height: 44px; font-size: 0.85rem; transition: background var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
  button.tab.active { background: var(--surface); box-shadow: 0 0 0 1px var(--line); font-weight: 600; }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0.3rem; }
  .seg button { border-radius: 12px; min-height: 44px; padding: 0 0.4rem; font-size: 0.8rem; }
  .fadebtns { margin-top: 0.35rem; }
  .seg button.active { background: var(--text); color: var(--bg); border-color: var(--text); }
  .duration { gap: 0.4rem; }
  .duration input {
    width: 6rem;
    padding: 0.35rem 0.5rem;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    min-height: 44px;
  }
  .duration .unit, .duration .fps { font-size: 0.8rem; color: var(--muted); }
  button.importbtn { min-height: 48px; border-radius: 14px; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  button.chipbtn { min-height: 44px; padding: 0 0.7rem; font-size: 0.8rem; border-radius: 999px; }
  button.chipbtn.active { background: var(--text); color: var(--bg); border-color: var(--text); }
  .tray-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    min-height: 52px;
    padding: 0.3rem 0.6rem;
    border-radius: 14px;
    text-align: left;
    position: relative;
    z-index: 2; /* above the sheet while it slides behind the bar */
    touch-action: none; /* vertical drags open the tray instead of scrolling */
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--line);
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .chip.live { color: var(--accent); border-color: var(--accent); }
  .dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--line); }
  .chev { display: inline-flex; align-items: center; gap: 0.2rem; font-size: 0.85rem; color: var(--muted); }
  .tray-body { display: grid; gap: 0.3rem; }
  .row { display: flex; align-items: center; gap: 0.35rem; }
  .swatches { justify-content: space-between; flex-wrap: wrap; }
  .exact { gap: 0.6rem; font-size: 0.85rem; color: var(--muted); }
  .exact input[type='range'] { flex: 1; accent-color: var(--text); min-height: 44px; }
  .num {
    width: 4.2rem;
    padding: 0.35rem 0.4rem;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    min-height: 44px;
  }
  .swatch {
    /* the button is a full 44px target; the visible circle is 38px, painted inside its padding */
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 3px;
    background-clip: content-box;
    border: 0;
    border-radius: 50%;
    flex: none;
    box-sizing: border-box;
  }
  .swatch.active { box-shadow: inset 0 0 0 2px var(--accent); }

  .hint { margin: 0; font-size: 0.8rem; color: var(--muted); }
  details.adv { border-top: 1px dotted var(--dot); padding: 0.1rem 0; }
  details.adv > summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; min-height: 44px; font-size: 0.85rem; font-weight: 600; color: var(--text); }
  details.adv > summary::-webkit-details-marker { display: none; }
  details.adv > summary::after { content: '+'; font-family: var(--font-mono); font-size: 1.1rem; color: var(--muted); }
  details.adv[open] > summary::after { content: '–'; }
  details.adv > :global(*:not(summary)) { margin-top: 0.4rem; }
  .pointer { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.5rem 0.5rem 0.5rem 0.8rem; border-radius: var(--radius-m); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--accent); font-size: 0.85rem; line-height: 1.3; }
  .pointer button { flex: none; min-height: 44px; border-radius: 999px; padding: 0 0.9rem; }
  /* Two tiny dots in the corner of a key that holds a second tool: one lit, one not. */
  button.tile { position: relative; -webkit-touch-callout: none; user-select: none; }
  button.tile .twinmark { position: absolute; top: 5px; right: 6px; width: 11px; height: 5px; background: radial-gradient(circle, currentColor 1.7px, transparent 2.1px) 0 50% / 6px 5px no-repeat, radial-gradient(circle, color-mix(in srgb, currentColor 35%, transparent) 1.7px, transparent 2.1px) 100% 50% / 6px 5px no-repeat; opacity: 0.8; }
  .toolhint { margin: 0; font-size: 0.8rem; line-height: 1.3; color: var(--muted); }
  .toolhint strong { color: var(--text); font-weight: 600; margin-right: 0.25rem; }
  .titlewrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.1rem; }
  .titlewrap h2 { min-width: 0; }
  /* The save state is a small lamp beside the name: quiet when saved, red when there are unsaved changes. Tap to save now. */
  button.savedot { flex: none; min-height: 44px; min-width: 44px; padding: 0 0.3rem; border: 0; background: transparent; box-shadow: none; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; font-size: 0.8rem; color: var(--muted); }
  button.savedot i { width: 8px; height: 8px; border-radius: 50%; background: var(--dot); transition: background var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
  button.savedot.dirty i { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
  button.savedot.saving i { background: var(--accent); animation: savepulse 0.9s ease-in-out infinite; }
  button.savedot:disabled { opacity: 1; }
  button.labelled.matrixbtn.on { color: var(--accent); }
  button.labelled.matrixbtn.on :global(circle.on) { filter: drop-shadow(0 0 3px var(--accent)); }
  .moremenu { display: grid; gap: 0.5rem; }
  /* Header controls are bare icons: no box, a soft round pad on hover and press, the full 44 px still tappable. */
  header button.labelled { background: transparent; border-color: transparent; box-shadow: none; border-radius: 999px; }
  header button.labelled:not(:disabled):active { background: var(--surface-2); }
  @media (hover: hover) { header button.labelled:not(:disabled):hover { background: var(--surface-2); border-color: transparent; } }
  header button.labelled:disabled { opacity: 0.35; }
  header { border-bottom: 0; position: relative; }
  header::after { content: ''; position: absolute; left: 0.5rem; right: 0.5rem; bottom: 0; height: 1px; background: radial-gradient(circle, var(--dot) 0.6px, transparent 0.8px) 0 0 / 5px 1px repeat-x; }
  /* On a phone the header is icons only: the back arrow, undo, redo and a save light. Words return on wide screens. */
  @media (max-width: 899px) {
    button.labelled.back, button.labelled.matrixbtn { padding: 0; width: 44px; justify-content: center; }
    .wide-text { display: none; }
    header { gap: 0; padding-inline: 0.25rem; }
  }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @keyframes savepulse { 50% { opacity: 0.45; } }
  @media (prefers-reduced-motion: reduce) { button.savedot.saving i { animation: none; } }
  @media (max-width: 480px) {
    /* Make room for Save: Undo and Redo keep their icons and lose their words on narrow screens. */
    button.labelled.undoredo { padding: 0 0.6rem; min-width: 44px; }
    button.labelled.undoredo span { display: none; }
  }
  button.labelled {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.8rem 0 0.55rem;
    height: 44px;
    border-radius: 12px;
    flex: none;
    font-size: 0.9rem;
  }
  .cap {
    margin: 0.15rem 0 0;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .cap .val { margin-left: 0.4rem; color: var(--text); letter-spacing: 0; }
  .tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.35rem; }
  .tools.five { grid-template-columns: repeat(5, 1fr); }
  .tools.five .tile { font-size: 0.66rem; }
  button.tile {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.1rem;
    min-height: 50px;
    padding: 0.2rem 0.1rem;
    border-radius: 12px;
    font-size: 0.72rem;
    line-height: 1.15;
    text-align: center;
    border-color: transparent;
    background: linear-gradient(var(--key-top), var(--key-bottom));
    box-shadow: 0 2px 0 var(--key-edge), inset 0 1px 0 rgb(255 255 255 / 0.08);
  }
  button.tile:not(:disabled):active { transform: translateY(1px); box-shadow: 0 1px 0 var(--key-edge), inset 0 1px 0 rgb(255 255 255 / 0.05); }
  /* A key that is on looks sunk and lit: dark well, red edge. */
  button.tile.active {
    background: var(--key-on-bg);
    color: var(--key-on-ink);
    border-color: transparent;
    transform: translateY(1px);
    box-shadow: inset 0 2px 6px rgb(0 0 0 / 0.55), 0 0 0 1px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 35%, transparent);
  }
  button.tile.danger:not(:disabled) { color: var(--accent); }
  .moremenu .danger { color: var(--accent); }

  /* PC: tools sit in a column beside the canvas. */
  @media (min-width: 900px) {
    /* a mouse needs less than a finger: smaller swatches so all eight fit on one row of the side panel */
    .swatch { width: 34px; height: 34px; min-height: 34px; padding: 2px; }
    .swatches { flex-wrap: nowrap; }
    .editor {
      display: grid;
      grid-template-columns: 1fr 340px;
      grid-template-rows: auto auto 1fr auto;
      grid-template-areas: 'head head' 'banner banner' 'canvas panel' 'strip panel';
    }
    header { grid-area: head; }
    .banner { grid-area: banner; }
    .stage { grid-area: canvas; margin: 0.5rem; }
    .textbar { grid-area: banner; }
    .strip-row { grid-area: strip; padding: 0 0.5rem 0.5rem; }
    .panel { grid-area: panel; z-index: auto; padding: 0.5rem; overflow-y: auto; }
    .tray-bar, .grab { display: none; }
    .tray { overflow: visible; transition: none; }
  }
</style>
