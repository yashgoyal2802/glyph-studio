# Proposal

## Why

Glyph Studio works, but it looks like a generic dark app wrapped around a very distinctive piece of hardware, and its most-used control, the tool tray, has grown by accretion: a new user has to discover it, and it mixes drawing tools with unrelated switches and settings. Before the first release, the app should have one coherent identity (the dot matrix itself) and a tray that is fast and self-explanatory.

## What Changes

- A visual identity called "Dot Instrument": graphite surfaces, one signal red, a bundled dot-matrix display face for the wordmark and numbers, dotted dividers, tool icons built from dots, and tactile pressable keys. Dark is the lead theme; light stays supported.
- A redesigned library: big wordmark, a "live on the phone" panel showing the toy that is playing, tabs for Designs / Templates, a numbered list whose rows show a dot count for frames and a red marker for the design playing now, thumbnails that animate.
- A reworked editor tray (the main quality bar of this change): drawing controls only in the Draw tab, always-visible state, full-word labels, grouped tools, an explained first use, a Frames tab split into everyday and advanced actions. The three tabs and swipe behaviour stay.
- A bezelled matrix canvas with readouts (pen level, frame, cursor position) and a dotted frame timeline.
- Purposeful motion: key press, tray glide, lamp, a lit-in-sequence intro, all respecting reduced motion.
- A more cinematic first-run intro that uses the new identity.
- Bundle the dot-matrix typeface (open font licence) so the app stays offline.

## Capabilities

### New Capabilities
- `visual-identity`: the colour, type, shape and icon language shared by every screen, in dark and light, including the brand mark.
- `library-screen`: what the library shows and how designs and the playing toy are presented.
- `editor-tray`: the tool tray's content, organisation, discoverability and speed.
- `editor-canvas`: how the matrix, readouts and frame timeline are presented while editing.
- `interface-motion`: which interactions animate, how long, and how motion is reduced; the first-run intro.

### Modified Capabilities

(none: the v2 specs have not been archived into `openspec/specs/` yet, so this change adds new capabilities that refine them.)

## Impact

- Editor (`editor/src/ui/*`, `app.css`, new tokens, new font files under `editor/public`): Library, Editor, Intro, dialogs, PixelThumb/Thumbnail, a new icon set.
- Android: font assets are served from the editor bundle; launcher icon already done; no native behaviour changes.
- Tests: component tests for the tray structure and focus order; tap-target and keyboard checks repeated.
- Release is held until this change is accepted on the phone.
