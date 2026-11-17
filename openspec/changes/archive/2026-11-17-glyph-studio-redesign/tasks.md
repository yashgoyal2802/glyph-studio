## 1. Foundation (tokens, type, icons, keys)

- [x] 1.1 Create `tokens.css` with colour, type, radius, spacing, shadow and motion tokens in dark and light, and move `app.css` and shared component styles onto it; verify no literal colours remain in shared styles and both themes render readable text (contrast at least 4.5:1)
- [x] 1.2 Bundle the display face (Doto) and the mono face (Geist Mono) as subset woff2 in the editor assets with their licences, load them with fallbacks; verify the library and editor render in them with the phone offline
- [x] 1.3 Build the dot-grid icon set and an `Icon` that renders it, covering every tool and action icon in use; verify every existing icon is replaced and the set looks uniform at 22 px on the phone
- [x] 1.4 Add the shared key, chip, dotted-divider and dot-count components with hover, focus, pressed, active and disabled states; verify each state is distinct with the keyboard and on the phone
- [x] 1.5 Put the brand mark in the library header and the intro (it already exists as the launcher icon and favicon); verify the three match
- [x] 1.6 Phone check of stage 1 with the author: the existing screens in the new tokens and type

## 2. The tray (priority; enhance the current tray, do not redo it)

Each step is small and shown to the author on the phone; anything not clearly better is reverted.

- [x] 2.1 Restructure the Draw tab to groups Draw, Shapes, Select and Text with full-word labels, the one-line hint under the tools, then brightness; verify one tap selects any tool and the hint changes with it
- [x] 2.2 Move the matrix preview toggle (with lamp) and Play as toy to the editor's top bar, show Shortcuts only on a wide layout, and move the auto-close preference to Settings; verify nothing but drawing controls remains in the Draw tab and the moved actions still work from the top bar; if the top bar is cramped on a 360 dp phone, stop and propose a better arrangement to the author instead of squeezing it
- [x] 2.3 Rework the collapsed bar to show the active tool (icon and full name), brightness with swatch, and mode chips; verify state is readable without opening the tray
- [x] 2.4 Add the first-use behaviour: the tray opens on the first editor visit with a one-line pointer that goes away on a tool choice, the first stroke or a tap, and never returns (flag in phone settings); verify with a fresh install and a second launch
- [x] 2.5 Remember the tray's open state and tab while the editor is open; verify switching tabs, drawing and reopening keeps them
- [x] 2.6 Reorganise the Frames tab into Everyday and collapsible Advanced groups (fade, loop and onion skin, remove many, pictures) remembered between visits; verify the everyday actions fit a 360 by 640 dp phone without scrolling and nothing was lost
- [x] 2.7 Speed pass: act on press, no layout thrash, tray motion 250 ms or less; verify with a frame-time capture on the phone that opening, closing and tab switching have no dropped frames and respond within 100 ms
- [x] 2.8 Accessibility and tests: roles, names, descriptions, focus order and keyboard operation for every tray control; verify with the tap-target tool (no control under 44 dp on any tab), the keyboard in Chrome and component tests for the tray structure
- [x] 2.9 Hand the tray to the author on the phone and fix what they find before moving on

## 3. The matrix canvas

- [x] 3.1 Render the matrix with sprite-based glow in a bezel, readable in both themes; verify drawing stays smooth on the phone and the matrix is at least as large as before
- [x] 3.2 Add the readouts (pen level, frame of total, cell under the pointer); verify they update while drawing on phone and PC
- [x] 3.3 Restyle the frame strip (kept as pictures, since previews help): display-well cells, current frame lit red, the playing frame follows the playhead, tap to select, add and play one tap; verify with a 48-frame design that it stays usable
- [x] 3.4 Run the whole editor test suite and the phone sync and PC checks; verify no behaviour changed

## 4. The library

- [x] 4.1 Build the wordmark header, the playing-now panel (live preview, slot, lamp, Change) and its empty variant; verify with one, several and no toys assigned
- [x] 4.2 Build the tabs (Designs, Templates) and the numbered list with thumbnails, frame dots and the playing marker; verify the first screen on 360 by 640 dp shows the wordmark, panel and two designs
- [x] 4.3 Keep every existing library action (rename, duplicate, export, import, delete, multi-select, menu, How it works) in the new styling; verify each by hand and with the existing tests
- [x] 4.5 Press and hold a design to start selecting, with an action bar (Toy, Rename, Duplicate, Share, Delete for one; Share and Delete for several) and Back leaving selection first; verify on the phone
- [x] 4.4 Add the calm empty state; verify with an empty library

## 5. Motion and intro

- [x] 5.1 Animate thumbnails with one shared loop, only when visible, paused in the background, a still frame under reduced motion; verify smooth scrolling with 50 designs on the phone
- [x] 5.2 Add the key press, tray glide, playing lamp and current-frame motion at 100 to 250 ms; verify taps are never blocked and reduced motion removes all decorative movement
- [x] 5.3 Rebuild the first-run intro in the new identity with the dots lighting in sequence, at most four screens, skippable, and available from How it works; verify on a fresh install
- [x] 5.4 Add the quiet toy-set confirmation animation; verify it shows within 300 ms of choosing a slot

## 6. Finish

- [x] 6.1 Dialogs, menus, slot picker and settings in the new identity; verify nothing is left in the old style
- [x] 6.2 Light theme pass across every screen; verify contrast and that red is used only for primary, current and warning states
- [x] 6.3 Tablet and PC layouts pass (side tray column, readouts, wide library); verify at 768, 1024 and 1440 px
- [x] 6.4 Run the design detector and an accessibility audit on the changed UI and fix findings; verify zero open findings
- [x] 6.5 Update README screenshots or descriptions and `PRODUCT.md` if anything changed; then resume the release steps (clean install, update in place, full path, stability run) from `glyph-studio-v2`
