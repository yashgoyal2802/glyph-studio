# live-matrix-preview Specification

## Purpose
Shows what the user is designing on the real Glyph Matrix while they edit, so they can judge brightness and shapes on the actual hardware.

## Requirements

### Requirement: Mirror canvas to matrix
While live preview is on and a design is open (on the phone or from a PC), the physical matrix SHALL show the current frame and update within 200 ms of each edit.

#### Scenario: PC edit appears on phone
- **WHEN** the user draws a pixel in the PC editor with live preview on
- **THEN** the same pixel lights up on the phone's matrix within 200 ms

### Requirement: Mirror playback to matrix
When in-editor playback runs with live preview on, the matrix SHALL play the same animation in step with the editor.

#### Scenario: Playback mirrored
- **WHEN** the user presses play in the editor
- **THEN** the matrix plays the animation with the same frame timing

### Requirement: Preview toggle and release
Live preview SHALL be user-toggleable, and the app SHALL release the matrix when preview is turned off, the editor is closed, or the app goes to the background for more than 10 seconds without a connected PC session.

#### Scenario: Leaving editor releases matrix
- **WHEN** the user closes the editor
- **THEN** the matrix stops showing the preview and returns to normal Glyph behaviour

### Requirement: Unsupported system handling
If the phone's system version does not support app-driven matrix display, the app SHALL disable live preview and explain the required system version, while the rest of the editor keeps working.

#### Scenario: Old system version
- **WHEN** the app runs on a system older than 20250801
- **THEN** the live preview toggle is disabled with an explanation
