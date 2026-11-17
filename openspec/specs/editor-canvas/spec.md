# editor-canvas Specification

## Purpose
The matrix is the hero of the editor. It should look like the real hardware and tell the user exactly what the pen is doing.

## Requirements

### Requirement: Bezelled matrix
The matrix SHALL be shown as a round LED display in a bezel, with lit pixels clearly brighter than off pixels, in both themes. It SHALL stay at least as large as today on every layout.

#### Scenario: Drawing
- **WHEN** the user lights a pixel
- **THEN** it appears lit at its brightness level immediately, with no visible lag

### Requirement: Readouts
Beneath the matrix a compact readout SHALL show the pen brightness, the current frame out of the total, and the cell under the pointer or finger while drawing.

#### Scenario: Cell readout
- **WHEN** the user draws at column 12, row 9
- **THEN** the readout shows X 12 and Y 9 while the pointer is down

### Requirement: Frame strip in the same language
Frames SHALL be shown as small previews of their pictures in display wells, with the current frame marked in red and, while playing, the playing frame following the playhead. Tapping a frame selects it. Adding a frame and playing remain one tap each, and reordering by long press is unchanged.

#### Scenario: Selecting a frame
- **WHEN** the user taps the third frame
- **THEN** frame 3 becomes current and is drawn on the matrix

### Requirement: Existing editing behaviour is unchanged
Drawing, selection, text, onion skin, undo and redo, and sync with the phone and the PC SHALL behave as before.

#### Scenario: Regression
- **WHEN** the existing editor tests run
- **THEN** they pass with no change to their expectations of behaviour
