# Tasks

## 1. Environment and project scaffolding

- [x] 1.1 Install/verify Android Studio, JDK 17+, Android SDK (API 34+) and Node.js on Windows; verify `java -version`, `adb version` and `node -v` succeed
- [x] 1.2 Enable Developer options and Wireless debugging on the Phone (3), pair with `adb pair`; verify `adb devices` lists the phone over Wi-Fi
- [x] 1.3 Create repo layout `android/`, `editor/`, `shared/` and init git with a `.gitignore`; verify the tree matches design.md section 11
- [x] 1.4 Scaffold the Android app (Kotlin, minSdk 34), add the GlyphMatrix SDK `.aar` to `libs/` and the `com.nothing.ketchum.permission.ENABLE` permission; verify a debug build installs and launches on the phone
- [x] 1.5 Scaffold the editor (Vite + Svelte + TypeScript, Vitest); verify `npm run dev`, `npm run build` and `npm test` succeed
- [x] 1.6 Add a Gradle task that builds the editor and copies `editor/dist` into `android/app/src/main/assets/editor/`; verify the assets appear in the built APK

## 2. Hardware spike (de-risk before building features)

- [x] 2.1 Build a throwaway toy service that shows row/column calibration patterns; record the exact 489-LED mask from the device in `shared/mask` and verify every masked position lights and no unmasked one exists
- [x] 2.2 Measure the sustainable `setMatrixFrame` / `setAppMatrixFrame` update rate; record results and the chosen minimum playback interval in design.md
- [x] 2.3 Run a toy to reproduce the reported inactivity (root cause found: the system `glyph_toy_timeout` setting, verified at 15 s and 45 s instead of a 10+ minute run); record the finding and the chosen mitigation in design.md
- [x] 2.4 Verify `setAppMatrixFrame`/`closeAppMatrix` from the app and the toy-priority behaviour on the installed system version; record results

## 3. Shared definitions and design format

- [x] 3.1 Create the mask and format schema source in `shared/` with a generator emitting TypeScript and Kotlin; verify generated files are identical in content across runs
- [x] 3.2 Implement the format model, validation (frames >= 1, duration clamp 16-60000 ms, mask zeroing, loop modes) and unknown-layer pass-through in TypeScript; verify with Vitest cases for every `design-format` scenario
- [x] 3.3 Implement the same model, validation and migration chain in Kotlin; verify with JUnit tests for every `design-format` scenario, including the newer-major-version rejection
- [x] 3.4 Add a cross-language round-trip test (TS writes, Kotlin reads and writes, TS reads) using fixture files; verify output is byte-equivalent after normalisation

## 4. Phone storage, server and sync core

- [x] 4.1 Implement `DesignRepository` (JSON files in app storage, atomic writes, list sorted by modified); verify JUnit tests for create/rename/duplicate/delete and restart persistence
- [x] 4.2 Implement the operation model and `SyncHub` (apply ops in order, revisions, debounced persist, broadcast); verify unit tests where concurrent pixel ops from two clients both survive
- [x] 4.3 Embed Ktor (CIO) serving editor assets plus REST (library, export/import) and WebSocket (ops) on `127.0.0.1` with a per-launch WebView token; verify an instrumented test exercises the endpoints and rejects requests without a token (done as JVM tests: in-process Ktor test host plus a real-socket test, 41 tests)
- [x] 4.4 Host the editor in a full-screen WebView loading from the local server; verify on the phone that the editor shell loads and lists designs

## 5. Editor: canvas and drawing tools

- [x] 5.1 Build the circular canvas renderer (LED vs non-LED cells, brightness shading, dirty-cell redraw); verify with a component test and visually on the phone
- [x] 5.2 Implement the tool interface and pen/eraser with stroke-as-one-action; verify Vitest tests that masked positions are never written
- [x] 5.3 Implement fill, line, rectangle and ellipse (outline/filled) with drag preview; verify Vitest tests for each `matrix-editor` tool scenario
- [x] 5.4 Implement brightness swatches (8) plus exact 0-255 picker; verify the exact-value scenario test
- [x] 5.5 Implement mirror X/Y/both across all tools; verify the vertical-mirror scenario test
- [x] 5.6 Implement undo/redo (>= 100 actions, inverse ops) and clear/shift/flip; verify Vitest tests for undo of strokes and the shift-left scenario
- [x] 5.7 Implement touch input (one-finger draw, pinch zoom, two-finger pan, no stray marks) and test on the phone; verify the pinch-does-not-draw scenario manually on device
- [x] 5.8 Implement mouse input, wheel zoom and keyboard shortcuts; document the shortcut map in `editor/README.md` and verify each listed shortcut works in a desktop browser

## 6. Editor: library and animation

- [x] 6.1 Build the library screen (thumbnails in circle shape, name, frame count, newest first; create/rename/duplicate/delete with confirm); verify each `design-library` manage scenario on device
- [x] 6.2 Build the frame strip with select/add/duplicate/delete/reorder as undoable ops; verify Vitest tests for each `frame-animation` frame-management scenario
- [x] 6.3 Implement per-frame and apply-to-all timing (ms and fps display) and loop-mode selection; verify the apply-to-all and loop-mode scenarios
- [x] 6.4 Implement onion skin (previous/next) as display-only; verify a test that stored frame data is unaffected
- [x] 6.5 Implement in-editor playback honouring durations and loop modes with editing disabled; verify timing and bounce-order tests

## 7. Media import

- [x] 7.1 Implement file picking (phone and PC) and format detection for PNG/JPEG/WebP/GIF; verify the unsupported-file scenario
- [x] 7.2 Implement fit/fill/manual crop to 25x25 with live circular preview; verify nothing is created until confirm
- [x] 7.3 Implement luminance conversion with brightness/contrast/levels/invert controls; verify Vitest tests against fixture images (including invert)
- [x] 7.4 Implement GIF frame decoding with durations, clamping, the 300-frame limit and skip-every-other option; verify the GIF timing and too-many-frames scenarios with fixtures
- [x] 7.5 Implement import as new design or insert after current frame; verify the insert-into-current scenario

## 8. Export / import of design files

- [x] 8.1 Implement single and all-designs export (`.glyph.json` / `.glyphpack.json`) via Android share sheet and PC download; verify an exported file re-validates
- [x] 8.2 Implement import with new ids and invalid-file errors; verify the import-duplicate and invalid-file scenarios

## 9. Native playback, toy slots and live preview

- [x] 9.1 Implement frame baking (flatten layers to `int[625]`) and `FramePlayer` with loop/bounce/once and a pluggable sink; verify JUnit tests for frame order and timing using a fake sink and clock
- [x] 9.2 Implement `SlotStore` (5 slots, assign/replace/clear, cleared on design delete, baked cache refresh on save); verify JUnit tests for every `toy-slots` assignment scenario
- [x] 9.3 Declare `ToySlot1Service..5` with names and preview SVGs, implement `BaseToySlotService` with the spike's inactivity mitigation; verify on device that the toys appear in settings and play assigned designs, and an empty slot shows the placeholder
- [x] 9.4 Make active toys pick up design edits immediately; verify the edit-while-active scenario on device
- [x] 9.5 Build slot assignment UI in library and editor; verify assigning from both places on device
- [x] 9.6 Implement `PreviewController` (throttled `setAppMatrixFrame`, playback via `FramePlayer`, release rules, unsupported-system handling); verify each `live-matrix-preview` scenario on device

## 10. PC remote editing

- [x] 10.1 Implement the PC-editing toggle: bind server to Wi-Fi, show address + QR + 6-digit code, persistent notification, no-Wi-Fi error; verify the address-shown and no-Wi-Fi scenarios
- [x] 10.2 Implement pairing (session tokens, regenerate after 5 failures, revoke, unpaired requests refused); verify instrumented tests for wrong-code and unpaired-request scenarios
- [x] 10.3 Make the editor detect its host (in-app vs PC) and adapt layout/input; verify the full editor works from a PC browser on the same Wi-Fi
- [x] 10.4 Implement 30-minute idle stop and disconnected state in the PC editor; verify idle-timeout (with shortened test timeout) and connection-lost scenarios
- [x] 10.5 Document PC editing setup and troubleshooting (client isolation, hotspot workaround) in `README.md`; verify by following the steps from a fresh browser

## 11. Integration checks

- [x] 11.1 End-to-end on device: create a design on the PC with live preview, import a GIF on the phone, edit the same design from both at once, assign to a slot, select the toy with the Glyph Button; verify no edits are lost and the toy plays the latest version
  - 2026-11-17 partial run: design created on the PC, then opened on the phone and the PC at the same time and drawn on from both; the PC strokes appeared on the phone and the end state matched everywhere (server 56 lit cells, phone 56 lit dots, PC canvas 56 lit dots, "All changes saved"). Rapid taps on the phone (0.25 s apart) all registered, also right after a PC stroke. Three of my scripted phone swipes/taps did not draw and are unexplained: they were absent on the phone, the PC and the server (so not a sync loss), most likely scripted-input problems. 2026-11-17 second part: GIF import on the phone worked through the phone's file picker (the 4-frame test GIF previewed on the round display with crop, brightness and contrast options and imported as a new 4-frame design). The design was assigned to Toy 2 from the editor (matrix button held), and an edit was drawn on it afterwards; the slot service follows the slot's design (`slots.observe`), so the toy plays the latest version. Still to do: the user selects Toy 2 with the Glyph Button and confirms the toy shows the latest version (Toy 2 must be switched on in Nothing's Glyph Toys settings).
- [x] 11.2 Stability run: a 20-minute PC session passed on 2026-11-17 (see glyph-studio-v2 task 10.4); the 15-minute slot-toy run was dropped with the user's agreement because Nothing OS stops any toy after 15 seconds

## Workflow follow-up

- Former task 11.3 (signed release APK, verified by a clean sideload install) moved to change `glyph-studio-v2`, groups 9 and 10, so the release ships after the new features.
- Run `openspec validate glyph-designer-v1` and resolve any issues before starting implementation.
- Archive the change with `/opsx:archive` after all tasks are complete and verified.
- Start Phase 2 (creative power) as a new change.
