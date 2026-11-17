# Tasks

## 1. Long-press spike (de-risk before building the toys)

- [x] 1.1 Build a throwaway toy service that returns a `Messenger` from `onBind` and logs every `GlyphToy` message (event, time) to logcat; verify messages are received (the toy could not be listed as a new entry, so Toys 4 and 5 were borrowed as probes)
- [x] 1.2 Run it on the Phone (3) with and without the long-press manifest metadata: short press, long press, hold and release, press while another toy is active; verify the events for each are captured
- [x] 1.3 Record the findings (events sent, timing, whether short press still switches, anything unexpected) under "Spike findings" in design.md, and revise decision 9 and group 8 of this list if the behaviour differs from the expectation; verify design.md reflects the measurements

## 2. Selection editing

- [x] 2.1 Implement lift, move, flip, rotate (90 degree steps) and commit as pure functions on pixel buffers, with mask clipping; verify unit tests cover each `selection-editing` scenario, including pixels leaving the mask
- [x] 2.2 Add rectangle and freehand selection and the floating buffer to the editor session with one history entry per committed change; verify tests that nothing is sent to the phone while dragging and that undo restores the frame
- [x] 2.3 Add the selection tool UI (touch and mouse): outline, drag to move, action bar for flip, rotate, delete and clear; verify on phone and PC
- [x] 2.4 Add copy, cut and paste with the clipboard kept across frames and designs, and the PC shortcuts (selection tool key, Ctrl+C/X/V, Delete, Escape); verify the paste-into-another-frame and paste-into-another-design scenarios, and update the shortcuts list and `editor/README.md`

## 3. Text tool

- [x] 3.1 Add the two bitmap fonts (about 5 and 7 pixels tall) covering letters, digits and common punctuation, with a placeholder glyph; verify tests that every supported character renders within its font height
- [x] 3.2 Implement text rendering to a pixel buffer (width measurement, spacing, brightness, mask clipping); verify unit tests for placement, clipping and the missing-character placeholder
- [x] 3.3 Add the text tool UI: text field, font and brightness choice, live preview, positioning, confirm and cancel as one undoable action; verify the confirm and cancel scenarios on phone and PC
- [x] 3.4 Implement scrolling text generation (direction, speed, font) as one batch of frames with seamless looping and the frame-limit message; verify unit tests for first and last frame, loop continuity and the limit, and a visual check on the device

## 4. Frame effects and templates

- [x] 4.1 Implement fade-in, fade-out and fade-in-and-out presets over a frame range as one history entry; verify unit tests for the fade-out, single-frame and undo scenarios
- [x] 4.2 Add the fade presets to the frame tools UI; verify applying and undoing on the device
- [x] 4.3 Define the templates (blank, heart, clock face, battery, arrow, smiley, loading ring) and a new-design chooser with previews; verify a test that every template passes `parseDesign` with no pixels dropped, and create each on the device
- [x] 4.4 Show the templates as a strip of previews above the design list, leaving "New design" as the one-tap blank path (the chooser-in-front-of-Blank idea was dropped because it adds a tap); verify the blank path takes no more taps than before
- [x] 4.5 Add selecting several designs in the library and deleting them together with one confirmation (requested during v2 testing); verified on the device

## 5. Undo history across sessions

- [x] 5.1 Store and load a per-design history sidecar on the phone with the design revision recorded, size limits, and removal on delete; verify JUnit tests for save, load, stale-revision discard, deletion and that export ignores it
- [x] 5.2 Send the stored history with the first snapshot and restore it in the editor session, writing it when the session ends or goes idle; verify reopen-and-undo, and edited-elsewhere scenarios (including editing from the PC while the phone editor is closed)

## 6. First-run help and accessibility

- [x] 6.1 Add the first-run flag, the sample design, the introduction (at most four screens, skippable) and the "How it works" menu entry; verify the skip, library-on-first-launch and reopen scenarios on a fresh install
- [x] 6.2 Raise every phone tap target to at least 44 by 44 pixels of tappable area; verified with tools/measure_tap_targets.py on the device (library and every tray tab: 0 controls under 44 dp)
- [x] 6.3 Label every icon-only control and expose toggle state; verify a test that fails on any unlabeled icon button
- [x] 6.4 Add visible keyboard focus, dialog focus trapping and focus return; verify the dialog-focus scenario by keyboard on the PC
- [x] 6.5 Lay out the editor and library at 768 and 1024 pixel widths; verify no overlap and a square canvas in a browser window at those widths

## 7. Interactive toys (dropped)

Built, tested on the device and then removed at the user's request (Nothing already ships Bottle and Magic 8 Ball toys). No tasks remain; the long-press spike findings are kept in design.md.

- [x] 7.1 Built and verified a framework and four interactive toys (spin the bottle, dice, coin flip, magic 8-ball), then removed them again at the user's request

## 9. Release packaging

- [x] 9.1 Design the app icon (adaptive and monochrome) and add it; verify the launcher shows it and a themed icon on the phone
- [x] 9.2 Create the signing key outside the project with the user, add the release signing config reading ignored `keystore.properties`, and make the build fail with instructions when it is missing; verify a release build without configuration fails clearly and that no keystore or password is tracked in the repository
- [x] 9.3 Enable minification with keep rules for the server, JavaScript bridges and Glyph SDK; verify the release APK builds and unit tests still pass
- [x] 9.4 Document the release steps and key backup in `README.md`; verify the key-location, backup and loss-consequence text is present

## 10. Integration checks

- [x] 10.1 Install the signed release APK on a clean phone state and verify a clean install shows the five slot toys and a library with only the sample design
- [x] 10.2 Verify update-in-place: install a newer build signed with the same key over the old one and check designs and slot assignments remain
- [x] 10.3 Run the full path on the release build: text and selection editing from the PC and the phone, a design on a toy, PC editing and disconnect, export and import; verify no crashes and that PC editing and sharing work with minification on
- [x] 10.4 Stability run: a PC session for 20 minutes (done: 20.5 min, 0 drops, 0 crashes). The 15-minute slot-toy run was dropped with the user's agreement on 2026-11-17: Nothing OS stops every toy after the user's `glyph_toy_timeout` (15 s on this phone), so a toy cannot play for 15 minutes; toy playback was confirmed on the device (Diwali on Toy 1) and by unit tests
  - 2026-11-16/17 PC session finding, FIXED: the paired PC editor dropped its link after about 2-4 minutes. Cause: the browser held the editor's heartbeat timer back while the tab was hidden, so when it finally ran it saw "10 s of silence" and closed the link (the phone was fine; HTTP polls and ping all succeeded). It was not R8 (the `-PnoMinify` build dropped too) and not Wi-Fi sleep (a Wi-Fi lock and wake lock were tried; they stay, harmlessly, while PC editing is on). Fix in `editor/src/api/sync.ts`: a tick that arrives long after the last one restarts the silence count; unit test added. Verified on the minified release build: the tab stayed hidden for 8 minutes, link stayed open, no banner. Still to do: the 20-minute PC session, the PC disconnect check, the 15-minute toy run.
  - 2026-11-17 PC session: 20.5 minutes on the minified release build with the editor tab hidden for most of it and an edit from the PC every 4 minutes: 0 connection closes, 0 banners, 43 of 43 HTTP polls ok (slowest 88 ms), 0 crashes (crash log), phone memory flat at about 142 MB. 30-minute idle auto-off was also seen working (PC editing was off when I came back).
  - 2026-11-17 PC disconnect check found a real bug: "Disconnect all computers" refused new requests but left an already open editor connection working, so the signed-out computer could keep editing (a stroke made after the disconnect reached the phone's design). Fixed: the live connection checks every 1.5 s that its session is still valid and closes with code 1008 "Signed out"; new test `disconnectAllAlsoClosesLiveEditingConnections`. Verified on the phone: the PC connection closed within about 1.5 s of pressing it, the banner appeared, Reconnect failed, the API answered 401, a new code was made, "Turn off" made the server unreachable and released the Wi-Fi and wake locks. Remaining in 10.4: the 15-minute slot toy run (needs Toy 1 switched on in Nothing's Glyph Toys settings).

## Workflow follow-up

- Run `openspec validate glyph-studio-v2` and resolve any issues before starting implementation.
- Close `glyph-designer-v1` once its tasks 11.1 and 11.2 are verified (task 11.3 moves to group 9 and 10 of this change).
- Archive this change with `/opsx:archive` after all tasks are complete and verified.
