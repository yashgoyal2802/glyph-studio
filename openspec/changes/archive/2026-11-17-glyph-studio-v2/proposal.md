# Proposal

## Why

Version 1 delivers the core loop: draw, animate, import, run as a Glyph Toy, edit from a PC. Using it showed what is missing for everyday use: there is no way to put text on the matrix, no way to select, move or copy part of a picture, a blank screen on first launch, and toys can only play passively. The Glyph Button long press is the one input a toy gets, and it opens a class of toys (spin the bottle, dice, coin flip) that no designed animation can do. This change adds those, then ships a signed release.

## What Changes

- **Text:** a text tool with built-in pixel fonts that places text onto the current frame, plus a "scroll text" helper that generates the frames of a marquee.
- **Selection editing:** select a rectangle or free area, then move, copy, paste (within and across frames and designs), flip, rotate in 90 degree steps, and delete it.
- **Frame effects:** fade the whole design in, out, or both across its frames, from a preset.
- **Starter templates:** "New design" offers a short list of ready-made designs (heart, clock face, battery, arrow, smiley, loading ring) as starting points.
- **Undo across sessions:** undo and redo history is kept when the editor is closed and reopened for the same design.
- **First-run help:** a short introduction on first launch, with a sample design created for the user.
- **Accessibility and layout:** larger touch targets, labels for every control, visible focus, and a layout check on a tablet-size window.
- **Interactive toys (dropped):** built-in toys driven by the Glyph Button long press were built and tried on the device, then removed at the user's request because the phone already ships its own Bottle and 8-ball toys. The long-press findings are kept in `design.md`.
- **Release:** an app icon, a signing key kept outside the project, and a signed release APK (moved here from v1 task 11.3).

Already in v1, so not repeated here: onion skin, frame duplicate, reorder, per-frame duration, whole-frame flip and shift.

### Non-goals

- Editable text after it is placed (text becomes pixels; a live text layer needs a native renderer, which belongs with info blocks in a later change).
- Live info blocks (clock, battery, notifications), Always-On display, and the Glyph Museum format. These stay on the roadmap for a later change.
- Play Store publishing, cloud sync, devices other than the Nothing Phone (3).
- User-authored interactive toys. Only built-in ones are included; a designer for them can follow once the long-press behaviour is proven.

## Capabilities

### New Capabilities

- `text-tool`: Pixel fonts, placing text on a frame, and generating scrolling-text frames.
- `selection-editing`: Selecting an area and moving, copying, pasting, flipping, rotating and deleting it.
- `frame-effects`: Applying a brightness fade preset across a design's frames.
- `design-templates`: Ready-made starter designs offered when creating a design.
- `undo-persistence`: Keeping undo and redo history between editing sessions.
- `first-run-help`: The first-launch introduction and sample design.
- `editor-accessibility`: Touch target size, control labels, focus visibility and tablet-size layout.
- `release-packaging`: App icon, signing key handling, and the signed release APK.

### Modified Capabilities

None. The v1 capabilities (`matrix-editor`, `toy-slots`, and others) are still in the unarchived `glyph-designer-v1` change, so there are no main specs to modify. Where v2 extends them, the new capabilities above describe the added behaviour.

## Impact

- **Editor (`editor/`):** new tools and dialogs, a bitmap font module, selection and clipboard state in `core/`, a history persistence layer, onboarding and template screens, and accessibility fixes across `ui/`.
- **Android (`android/`):** a toy service type that returns a Messenger and handles `GlyphToy` events, new manifest metadata for long press, built-in toy renderers, an icon, and release signing in Gradle.
- **Format:** none. Text and selections produce ordinary pixel layers, so the design format stays at version 1.
- **Dependencies:** none expected beyond a small bundled pixel font.
- **v1:** task 11.3 (release APK) moves to this change. v1 closes after its end-to-end and stability checks.
