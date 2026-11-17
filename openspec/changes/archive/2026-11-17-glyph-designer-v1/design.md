# Design

## Context

Greenfield project. Motivation and scope: see `proposal.md`. Requirements: see `specs/`.

Constraints that shape the approach:
- The GlyphMatrix SDK is an Android `.aar`; matrix output is an `int[625]` (25x25, 0-255) via `setMatrixFrame` (inside a Glyph Toy service) or `setAppMatrixFrame` (from the app, system 20250801+). Toy display takes priority over app display.
- Glyph Toys must be declared statically in `AndroidManifest.xml` as services with action `com.nothing.glyph.TOY`, a name and a preview image. They cannot be created at runtime.
- Only 489 of the 625 positions have LEDs (circular cut-out).
- The editor must run both inside the app (touch) and in a PC browser (mouse/keyboard) from one codebase.
- Personal sideloaded app; development on Windows 11.

## Goals / Non-Goals

**Goals:**
- One editor codebase, two hosts (in-app WebView, PC browser).
- The phone is the single source of truth for designs; no cloud.
- Toy playback runs entirely natively, independent of the editor.
- The data model and module boundaries absorb Phase 2-4 features (layers, text, info blocks, AOD, button actions) without format rewrites.

**Non-Goals:**
- Offline PC editing without the phone (file export/import covers this).
- HTTPS or internet exposure for the PC server; it is LAN-only.
- A native (Compose) drawing UI.

## Decisions

### 1. Hybrid app: Kotlin shell + web editor
```
 +--------------------------- Android app ------------------------------+
 |                                                                       |
 |  WebView (editor UI) ---HTTP/WS 127.0.0.1---+                         |
 |                                             v                         |
 |                                  +---------------------+              |
 |  PC browser ----HTTP/WS LAN----> | Local server (Ktor) |              |
 |  (when PC editing on, paired)    +----------+----------+              |
 |                                             |                         |
 |                    +------------------------+------------------+      |
 |                    v                        v                  v      |
 |            DesignRepository          SyncHub (ops,      PreviewController
 |            (JSON files)              broadcast)          -> setAppMatrixFrame
 |                    |                                               |   |
 |                    v                                               v   |
 |            SlotStore + baked frames ---> ToySlotService 1..5 ---> FramePlayer
 |                                           (setMatrixFrame)             |
 +-----------------------------------------------------------------------+
```
- **Why:** one editor for both hosts; rich drawing UI is faster to build on the web; Kotlin handles everything hardware-related.
- **Alternatives:** native Compose editor plus a separate web editor (two editors, drift); Compose-only with no PC editing (fails requirement).

### 2. One transport for both hosts: local HTTP + WebSocket
The in-app WebView talks to the same embedded server as the PC, bound to `127.0.0.1` normally, and additionally to the Wi-Fi interface while PC editing is on. The WebView receives a per-launch trusted token; PC browsers obtain a session token by pairing (6-digit code, regenerated after 5 failures).
- **Why:** a single API means the editor has no host-specific code paths beyond input handling and layout.
- **Alternatives:** JavaScript bridge for the WebView plus HTTP for PC (two transports to keep in sync).
- **Server library:** Ktor (CIO engine) with WebSockets. NanoHTTPD was considered; Ktor is maintained, coroutine-native and has first-class WebSocket support.

### 3. Web editor stack
TypeScript + Vite + Svelte, rendering the matrix on a `<canvas>`. Tools are self-contained modules implementing a common interface (pointer down/move/up -> preview + committed pixel ops), so Phase 2 tools (text, selection, gradient) are additions. Build output is copied into `android/app/src/main/assets/editor/` by a Gradle task.
- **Alternatives:** React (heavier for WebView), plain TS (more UI plumbing).

### 4. Design format: JSON, versioned, layered
```json
{ "format": 1, "id": "uuid", "name": "Pacman", "created": 0, "modified": 0,
  "matrix": { "w": 25, "h": 25 },
  "anim": { "loop": "loop" },
  "frames": [ { "id": "uuid", "durationMs": 100,
                "layers": [ { "id": "uuid", "type": "pixels", "data": "<base64 625 bytes>" } ] } ] }
```
- Frames and layers have stable ids (not indices) so sync ops survive reordering.
- Unknown layer types are carried through untouched (forward compatibility for Phase 2-3).
- Migrations are a chain `vN -> vN+1` run on load; files are written in the current version.
- Export extension: `.glyph.json` (single) or `.glyphpack.json` (array, for "export all").
- Glyph Museum compatibility is a Phase 4 converter, not the native format.

### 5. Sync model: server-ordered operations
Clients send small ops: `setPixels(frameId, layerId, [(index, value)])`, `addFrame`, `deleteFrame`, `moveFrame`, `setDuration`, `setLoop`, `rename`. The server applies ops in arrival order, bumps a revision, persists (debounced ~500 ms), and broadcasts to all clients with the design open. Pixel ops merge naturally, so concurrent phone/PC strokes are both kept. Undo/redo is client-local and implemented as inverse ops.
- **Alternatives:** whole-document last-writer-wins (loses concurrent edits); CRDT (unneeded complexity for two clients).

### 6. Circular mask as a shared constant
A 625-entry mask table, defined once and generated into both TypeScript and Kotlin from one source file, is used by the editor, importer and Kotlin side. It is verified on the device with a calibration pattern (Task: hardware spike) because the exact LED layout must match reality.

### 7. Playback is native; frames are baked
- `FramePlayer` (Kotlin coroutine) takes a list of `(int[625], durationMs)` plus a loop mode and pushes frames to a sink (`setMatrixFrame` for toys, `setAppMatrixFrame` for preview).
- Phase 1 "baking" = flattening each frame's layers into one `int[625]`, done when a design is saved or assigned. Baked frames for slotted designs are cached next to the slot table.
- **Phase 3 path:** live blocks require a Kotlin layer renderer that composites at play time; `FramePlayer` stays and gains a "frame source" abstraction (baked list vs. live renderer).
- **Alternative:** running the web editor's renderer headless in the toy service (heavy, fragile in background).

### 8. Toy slots
Five services `ToySlot1Service..ToySlot5Service`, all subclasses of `BaseToySlotService(slotIndex)`, declared in the manifest with static names "Toy N" and preview SVGs. On bind: init `GlyphMatrixManager`, register for Phone (3), load baked frames for the slot, start `FramePlayer`. On unbind: stop and `unInit`. The service observes the slot store, so edits to an active slot's design are picked up immediately. Long-press/AOD metadata stay off in this phase (Phase 3).

### 9. Live preview
`PreviewController` subscribes to SyncHub for the design opened with preview enabled, renders the current frame (throttled to ~30 updates/s), and calls `setAppMatrixFrame`. Play commands from the editor start a `FramePlayer` with the app sink so preview timing matches toy timing exactly. It releases the matrix (`closeAppMatrix`) on toggle off, editor close, or background > 10 s with no PC session.

### 10. Media import runs in the editor
Decoding and conversion happen in the browser/WebView: `ImageDecoder` (with `gifuct-js` fallback) for GIF frames, canvas downscaling, luminance conversion, and brightness/contrast/levels/invert, with the mask applied. The result becomes ordinary ops or a new design, so the server needs no imaging code.

### 11. Repository layout
```
glyph-proj/
  android/            Gradle project (app module, libs/glyph-matrix-sdk.aar)
  editor/             Vite + Svelte + TS
  shared/             mask + format schema source -> generated TS/Kotlin
  openspec/
```
`minSdk` 34 and `targetSdk` latest; Phone (3) only.

## Spike findings (tasks 2.1-2.4, measured on a real Phone (3), system build C5.0-260924, Android 17)

- **LED mask (2.1):** a cell has an LED when `(x-12)^2 + (y-12)^2 <= 154` (exactly 489 LEDs). Verified visually: all-625-on lit exactly this circle; a mask-only frame looked identical. Stored in `shared/mask/`. Frame data is a plain `int[625]`, row-major, row 0 on top, values 0-255 map linearly to brightness (verified with a ramp); orientation not mirrored (verified with an "L").
- **Frame rate (2.2):** `setAppMatrixFrame` sustained ~67 fps and `setMatrixFrame` (toy path) ~64 fps over 3-10 s with 0 errors. This is the rate the calls return, not a proof of panel refresh. Decision: no extra clamp beyond the 16 ms format minimum.
- **Toy auto-off (2.3):** the system stops every Glyph Toy after the user setting `system:glyph_toy_timeout` (default on this phone: 15000 ms), measured from bind: log line `GlyphToyController: Timeout`, then the system unbinds the toy. Reproduced at 15 s and 45 s. `GlyphMatrixManager.setGlyphMatrixTimeout(false)` returns OK but does NOT change this. The reported "inactive after 3-4 minutes" is most likely the same setting on other phones. Consequences: a toy cannot stay lit longer than the user's timeout; the app must not promise more, should explain it on first run, and Always-On toys (Phase 3) are the way to persistent display. Changing the setting from the app would need the WRITE_SETTINGS special permission and is out of scope.

- **App display path (2.4):** `setAppMatrixFrame` content stays lit indefinitely (observed 40+ s) and is NOT subject to `glyph_toy_timeout`. `closeAppMatrix()` turns the app display off immediately. A Glyph Button press makes the toy carousel override the app content; the app's last frame reappears about 11-12 s later once the carousel finishes, with no action needed from the app. Live preview therefore only needs to keep its last frame; no re-send logic is required.

## Risks / Trade-offs

- [SDK frame rate] -> Measured ~64-67 fps (see spike findings); no clamp needed.
- [Toys auto-stop after the phone's `glyph_toy_timeout`, 15 s by default] -> Explain in the app (slots screen hint), deep-link users to the Glyph Toys manager; consider Always-On in Phase 3. Does not affect correctness of playback.
- [Exact LED mask differs from a computed circle] -> Resolved: verified on device (see spike findings).
- [Toy display overrides app preview] -> Preview UI notes that an active toy can take over; preview resumes when the toy is deselected.
- [WebView touch latency] -> Canvas rendering only redraws changed cells; pointer events with `touch-action: none`; test early on device.
- [LAN networks with client isolation (e.g. college/public Wi-Fi) block PC access] -> Clear error in PC-editing screen; file export/import as fallback; phone hotspot as a workaround.
- [Plain HTTP on LAN] -> Pairing tokens, LAN-only binding, auto-stop after 30 min idle, persistent notification. Accepted for personal home use.
- [Ktor adds APK size] -> Acceptable for a sideloaded personal app.

## Migration Plan

New app; no migration. Install via Android Studio over wireless ADB during development; release builds are signed APKs sideloaded. The design format carries a version from day one so later phases migrate stored designs on load.

## Open Questions

- Final preview icons for "Toy 1-5" (can be refined anytime).
- Exact keyboard shortcut map for the PC editor (decided during implementation).
