# Glyph Studio editor

The web editor for Glyph Matrix designs. It runs inside the Android app (touch) and in a PC browser (mouse and
keyboard) from the same code. All designs live on the phone; the editor talks to the phone's server (`/api/...` and a
WebSocket per open design).

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm test` | Run the unit tests (Vitest) |
| `npm run check` | Type-check TypeScript and Svelte |
| `npm run build` | Build to `dist/` (the Android build copies this into the app) |
| `node ../shared/generate.mjs` | Regenerate the shared constants (matrix mask, format limits) for TypeScript and Kotlin |

## Keyboard and mouse (PC)

| Keys | Action |
|---|---|
| `P` `E` `F` `L` | Pen, eraser, fill, line |
| `T` | Text: type, drag it into place, then Add (or make it scroll) |
| `S` / `Shift+S` | Select a rectangle / select freehand |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste the selection (works across frames and designs) |
| `Delete` | Erase the selected area |
| `Esc` | Finish and clear the selection |
| `R` / `Shift+R` | Rectangle outline / filled |
| `O` / `Shift+O` | Ellipse outline / filled |
| `1` – `8` | Brightness swatch (1 = off … 8 = full) |
| `X` / `Y` | Mirror left-right / top-bottom |
| `Ctrl+Z` (`Cmd+Z`) | Undo |
| `Ctrl+Shift+Z` or `Ctrl+Y` | Redo |
| `Ctrl+S` (`Cmd+S`) | Save now (edits are also saved automatically) |
| `[` or `←` / `]` or `→` | Previous / next frame |
| `Alt` + arrow keys | Shift the picture by one pixel |
| `Enter` | Play / stop the animation |
| `?` | Show the list of shortcuts |
| `+` `-` `0` | Zoom in / out / reset |
| Mouse wheel | Zoom at the cursor |
| Hold `Space` and drag, or middle mouse button | Pan |

Shortcuts are ignored while typing in a text box, and other Ctrl/Cmd combinations are left to the browser. The list is
defined in `src/core/shortcuts.ts` (`SHORTCUT_HELP`).

## Touch (phone)

* One finger draws with the selected tool.
* Two fingers pinch to zoom and drag to pan. A second finger landing cancels the stroke the first one started, so a
  pinch never leaves a mark.

## Layout of `src/`

| Folder | Contents |
|---|---|
| `format/` | The design file format: model, validation, migration, pixels, playback order |
| `core/` | Editor engine without any DOM: renderer, viewport, tools, strokes, undo history, operations, gestures, shortcuts |
| `api/` | REST client and the live WebSocket link to the phone |
| `ui/` | Svelte screens and components |
| `generated/` | Generated from `../shared` (do not edit) |
