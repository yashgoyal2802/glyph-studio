# Design

## Context

v1 is complete apart from device checks. What v2 builds on, as found in the code:

- The editor (Svelte 5 + TypeScript) draws through a `Tool` interface in `core/tools.ts` (pen, eraser, fill, line, rect, ellipse) and edits only through operations (`core/ops.ts`) sent to the phone, which orders them (`SyncHub`). Undo is a `History` of op pairs, capped at `MAX_HISTORY = 100`, held in memory.
- `core/transforms.ts` already has whole-frame flip and shift, and `core/onion.ts` already implements onion skin. Frame duplicate, reorder and per-frame duration are in `core/frames.ts`.
- Designs store frames as layers; every layer is a 625-byte `pixels` layer. Playback is native: the Kotlin side bakes frames and `FramePlayer` shows them.
- Toys are five services (`ToySlot1Service..5`) extending `BaseToySlotService`. `onBind` returns `null`: they only play frames, and they receive no events.
- The Glyph SDK in `app/libs` exposes `GlyphToy` with `MSG_GLYPH_TOY`, `MSG_GLYPH_TOY_DATA = "data"`, and the events `change`, `aod`, `action_down`, `action_up`. These are the toy's input channel. What exactly the system sends for each button gesture on this phone is not documented in the SDK and has not been observed.
- Constraints from v1 findings: the system stops any toy after the user's `glyph_toy_timeout` (15 s default here), counted from bind. An interactive toy must work within that.

## Goals / Non-Goals

**Goals:**
- Text, selection editing, fades, templates, persistent undo, first-run help and accessibility in the existing editor with no change to the design format.
- (Dropped) interactive toys driven by the long press; see decision 9.
- A signed release APK with a key the user controls.

**Non-Goals:**
- Editable text or any live-rendered layer (needs a native layer renderer; belongs with info blocks).
- User-authored interactive toys, Always-On display, info blocks, Glyph Museum format.
- Changing sync, pairing or the PC server.

## Decisions

### 1. Text is rasterised into pixels, not stored as a text layer
The text tool renders text with a bundled bitmap font and writes pixels into the current frame as one op batch. Scrolling text generates N frames of pixels.
- **Why:** native playback and the format stay unchanged, nothing on the Kotlin side needs to know about fonts, and sync and undo already handle it.
- **Alternative:** a typed `text` layer composited at play time. Better for re-editing, but it requires a Kotlin renderer and a font on both sides. Deferred to the info-block change, where that renderer is needed anyway.

### 2. Fonts are bitmap tables in the editor
Two fonts (about 5 and 7 pixels tall) stored as small TypeScript tables (glyph rows as bit patterns) with a placeholder glyph. No font files and no canvas text measurement, so output is identical on the phone WebView and every PC browser.
- **Alternative:** rendering a web font to a canvas and thresholding. Output varies by platform and blurs at this size.

### 3. Selection is an editor-only floating buffer
A selection is a mask plus, once lifted, a floating pixel buffer held in the editor session. Moving, rotating or flipping changes the buffer only; committing sends one `setPixels`-style op batch (clear the source, write the buffer) as a single history entry. Nothing is sent while the user is still dragging, so the phone and other editors never see half-moved pixels.
- Rotation is 90 degree steps on the buffer's bounding box; pixels outside the circular mask are dropped at commit.
- The clipboard is a module-level store in the editor, saved to `sessionStorage` so it survives switching designs but not closing the tab. Across the phone and PC it is not shared.
- **Alternative:** a persistent clipboard on the phone. More moving parts for little gain.

### 4. Fades are computed in the editor as one op batch
For frames i of n in the range, each pixel value is scaled by a factor (linear from 1 to 0, 0 to 1, or both) and written back for every frame as a single history entry. Rounding keeps non-zero pixels at least 1 until the last frame so a fade does not blank early.

### 5. Templates are code-defined designs
Templates are generated in TypeScript from small shape descriptions (circles, lines, bitmaps) into valid designs, then created through the existing create-design call. No assets to ship, and a test validates every template against `parseDesign`.

### 6. Undo history is stored on the phone, per design
History entries are already op lists. The phone stores them in a sidecar file next to each design (`<id>.history.json`), written when the editor session ends or goes idle, and sends them back with the first snapshot on the next open. The sidecar records the design's revision at write time; if the revision on open differs (because it was edited elsewhere or imported), the history is discarded.
- Capped at `MAX_HISTORY` and a byte limit; deleting a design deletes the sidecar; exports do not read it.
- **Alternative:** a browser-side store (IndexedDB). The phone WebView and the PC browser would each have separate histories and the PC one would be lost with the tab. The phone is the single source of truth, so the sidecar fits.

### 7. First run is a flag plus a created design
A `firstRunDone` flag in the app's settings store. The first launch creates the sample design through the repository and shows the introduction; "How it works" in the home menu shows it again without recreating the sample.

### 8. Accessibility is a pass, not a rewrite
A checklist applied across `ui/`: a minimum tappable area through padding (not bigger visuals), `aria-label` and `aria-pressed` from the same tables that define tool and onion labels, a dialog component that traps and restores focus, and a layout pass at widths 360, 768 and 1024 using the existing responsive rules. A test asserts every icon button has a label.

### 9. Interactive toys: spike first, then a small framework (DROPPED)
**Status:** the spike, a framework and four toys (spin the bottle, dice, coin flip, 8-ball) were built and worked on the device, then removed at the user's request: Nothing's own Bottle and Magic 8 Ball toys already cover them. Nothing below is shipped; the spike findings stay because they describe how the Glyph Button reaches a third-party toy.

**Spike (first task):** a throwaway toy service that returns a `Messenger` from `onBind`, declares long-press support in the manifest metadata, and logs every `GlyphToy` message (event name and timestamps) for short press, long press and release, with and without the metadata. The findings are written into this file under "Spike findings" before anything else is built. The plan below is the expected outcome and may change with the result:
- (Measured, see Spike findings.) Declared with `com.nothing.glyph.toy.longpress = 1`, the toy receives `action_down`, then `change` about 500 ms later while the button is held (the long press), then `action_up` on release. A short press sends `action_down` and the system then switches toys. The toy acts on `change`.

**Framework (after the spike):** an `InteractiveToyService` base: `onBind` returns a `Messenger` whose handler maps messages to `onPress()` / `onRelease()` and a renderer that draws frames on the existing matrix link and `FramePlayer` path. Each interactive toy supplies an idle frame, a `render(progress)` function and a result chooser. Services are static manifest entries, as for slots.
- **Spin the bottle:** the bottle is drawn as a rotated bar at angle `theta`; a spin runs from a random initial speed with exponential slowdown (about 3 to 5 seconds) and stops at the angle reached, so the result is not pre-chosen. It ends by holding the final frame until the toy timeout. Randomness comes from `SecureRandom`.
- **Dice, coin, 8-ball:** same base with face tables; 8-ball answers are short icons or letters since text is limited to the matrix.
- All animation runs on the playback scheduler already used by `FramePlayer`; unbind cancels it.
- **Alternative:** a user-designable interactive toy (frames + trigger rules). Larger scope; it needs the spike's results and a rule editor, so it waits for a later change.

### 10. Release build
A `release` signing config reading `keystore.properties` (path, alias, passwords), located outside the project and ignored by git; the build fails with a message if it is missing. R8 minification is enabled with keep rules for the Ktor server, the JS bridge classes (`@JavascriptInterface`) and the Glyph SDK, then verified on device because the server and bridge are reached by reflection or from JavaScript. The icon is an adaptive vector with a monochrome layer.
- **Why a keep-rule check matters:** a release build that minifies away the bridge looks fine until PC editing or sharing is used.

## Risks / Trade-offs

- **Long-press behaviour unknown:** the system may send different events, deliver nothing to third-party toys, or conflict with its own long-press action. Mitigation: the spike comes first, and the interactive-toy tasks are written to be revisited after it. If long press is not delivered, the fallback is a tap-to-spin design inside the app (a toy that spins when selected) and the spec is updated.
- **Selection complexity:** lifting, floating and committing is the largest editor change. Mitigation: pure functions with unit tests for lift, rotate and commit before any UI.
- **History sidecar size and staleness:** bounded by the history cap and byte limit; stale history is discarded, never applied.
- **R8 breakage:** mitigated by keep rules and a full on-device pass on the release build, not just the debug one.
- **Toy timeout:** a result is only visible until the system timeout (15 s by default), so spins are short and results hold until then. Documented for the user.

## Spike findings

Task 1, measured on the Phone (3) (system build C5.0-260924, Android 17) with a throwaway toy that returned a `Messenger` from `onBind` and logged every message. Toy 4 was declared plainly and Toy 5 with `com.nothing.glyph.toy.longpress = 1`; both were probed with short presses, presses held about 1 s and 3 s, and one 7 s hold.

- A toy that returns a `Messenger` receives `what = 1` messages whose `data` string is `action_down` or `action_up`, with no extras. This works without any metadata.
- **Short press** (released in under about 0.4 s): the toy receives `action_down`, then the system switches to the next toy and unbinds it about 0.25 to 0.4 s later. No `action_up` arrives.
- **Long press without the metadata:** `action_down` on press and `action_up` on release (observed holds of 0.55 s up to 2.8 s). The system does not switch toys.
- **Long press with the metadata:** the same, plus a `change` event about 500 ms after `action_down` while the button is still held. This is the system saying "long press recognised". `action_up` follows on release, however long the hold (7 s observed). The system does not switch toys.
- **A stray `action_up` arrives right after binding** when the toy was selected by a press: the release of the press that switched to it. Toys must ignore an `action_up` that has no matching `action_down` since bind.
- A hold keeps the toy bound; the 15 s system timeout still applies from bind and ended the toy while the button was down in one run.
- No events were ever sent for `aod` or for anything except the three above.

Consequences for the interactive toys:
- Trigger the action on `change` (long press recognised), not on `action_down`: a short press also sends `action_down` and then switches away, so using `action_down` would spin the bottle every time the user just moves to the next toy.
- Declare the long-press metadata on every interactive toy.
- Treat `action_up` as "the button was released" only after a matching `action_down`.
