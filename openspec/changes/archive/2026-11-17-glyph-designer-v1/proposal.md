# Proposal

## Why

The Nothing Phone (3) Glyph Matrix can show custom art, but existing apps either ship fixed, hand-coded toys (e.g. Glyph Toybox) or offer limited/paid drawing. There is no good free tool to draw and animate your own Glyph designs comfortably — with a finger on the phone *and* on a PC — and then actually run them as Glyph Toys. This change builds that foundation (Phase 1), structured so later phases (creative tools, live info toys, ecosystem) extend it rather than rewrite it.

## What Changes

- New Android app (Kotlin) for the Nothing Phone (3) that hosts a web-based Glyph editor full-screen and integrates the official GlyphMatrix SDK.
- A single TypeScript web editor used both on the phone (touch) and from a PC browser (mouse/keyboard), served by the phone over local Wi-Fi with pairing-code protection.
- Pixel editor for the 489-LED circular 25x25 matrix: pen, eraser, fill, line, rectangle, circle, mirror/symmetry, undo/redo, pinch-zoom/pan, 8 brightness swatches plus exact-value picker.
- Frame-by-frame animation: add/duplicate/delete/reorder frames, per-frame durations, loop modes (loop, bounce, play once), onion skin, in-editor playback.
- Image and GIF import, automatically scaled to the circular matrix and quantised to brightness levels.
- Design library stored on the phone, with export/import of design files.
- Live preview: the physical matrix mirrors the canvas while editing (from phone or PC).
- A fixed set of Glyph Toy slots ("Toy 1..N"); any design can be assigned to a slot and plays on the matrix when that toy is selected via the Glyph Button.
- A versioned design format whose frames already hold a list of typed layers, so future layer types (text, info blocks) are additive.

### Roadmap (out of scope for this change, recorded for direction)

- **Phase 2 – Creative power:** text tool with pixel fonts, selection with move/rotate, multiple layers per frame, tweening, gradients, video import.
- **Phase 3 – Living toys:** info blocks (clock, battery, notifications, call status), Always-On toys, Glyph Button actions (long-press next design, hold to pause), native on-phone renderer for live content.
- **Phase 4 – Ecosystem:** Glyph Museum format import/export, design sharing, sound/sensor-reactive toys, further enhancements.

### Non-goals for this change

- Play Store publishing, accounts, cloud sync, or editing when not on the same Wi-Fi as the phone (file export/import covers offline transfer).
- Support for devices other than Nothing Phone (3).

## Capabilities

### New Capabilities

- `design-format`: The versioned, layered on-disk representation of a design (frames, layers, timing, loop mode) and its validation/migration rules.
- `design-library`: Storing, listing, renaming, duplicating and deleting designs on the phone, plus export/import of design files.
- `matrix-editor`: Drawing on the circular 25x25 canvas: tools, brightness selection, symmetry, undo/redo, zoom/pan, touch and mouse/keyboard input.
- `frame-animation`: Creating and managing animation frames, per-frame timing, loop modes, onion skin and in-editor playback.
- `media-import`: Converting images and animated GIFs into designs fitted to the circular matrix with quantised brightness.
- `live-matrix-preview`: Mirroring the current editor canvas/playback onto the physical Glyph Matrix in real time.
- `toy-slots`: The fixed set of Glyph Toy slots, assigning designs to slots, and playing assigned designs as Glyph Toys.
- `remote-editing`: Serving the editor to a PC browser over local Wi-Fi, pairing-code access control, and keeping phone and PC sessions in sync.

### Modified Capabilities

None (new project).

## Impact

- New codebase: Android app module (Kotlin, GlyphMatrix SDK `.aar`, embedded WebView, local HTTP/WebSocket server) and a web editor package (TypeScript) bundled into the app's assets.
- Dependencies: GlyphMatrix Developer Kit, Android SDK (min API per SDK requirements), a lightweight embedded HTTP/WebSocket server library, a web UI framework and GIF decoder for the editor.
- Device requirements: Nothing Phone (3) on system version 20250801+; same Wi-Fi network for PC editing.
- Development tooling on Windows 11: Android Studio, Node.js, wireless ADB for installing builds.
