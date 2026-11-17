# selection-editing Specification

## Purpose
Lets the user pick part of a picture and move, copy, paste, flip or rotate it.

## Requirements

### Requirement: Select an area
The editor SHALL provide a selection tool with a rectangle mode and a freehand mode. The selection SHALL be shown on the canvas and SHALL only cover pixels of the current frame.

#### Scenario: Rectangle selection
- **WHEN** the user drags a rectangle with the selection tool
- **THEN** the pixels inside it are outlined as selected

### Requirement: Move a selection
The user SHALL be able to drag a selection to a new position. Moving SHALL lift the selected pixels, leave the area they came from empty, and drop them on release. Pixels moved outside the matrix mask SHALL be dropped.

#### Scenario: Move
- **WHEN** the user drags a selected shape 3 pixels right
- **THEN** the shape appears 3 pixels to the right and its old position is empty, as one undoable action

### Requirement: Copy, cut and paste
The user SHALL be able to copy, cut and paste a selection. Pasted content SHALL appear as a floating selection that can be positioned before it is committed. The clipboard SHALL work between frames of a design and between designs on the same device.

#### Scenario: Paste into another frame
- **WHEN** the user copies a selection on frame 1, switches to frame 2 and pastes
- **THEN** the copied pixels appear on frame 2 as a floating selection

#### Scenario: Paste into another design
- **WHEN** the user copies in one design, opens another, and pastes
- **THEN** the copied pixels appear in the second design

### Requirement: Flip and rotate a selection
The user SHALL be able to flip a selection horizontally or vertically and rotate it by 90 degrees. A rotation that would push pixels outside the matrix mask SHALL drop only those pixels.

#### Scenario: Rotate
- **WHEN** the user rotates a selection 90 degrees clockwise
- **THEN** the selected pixels are rotated about the selection's centre

### Requirement: Delete and deselect
The user SHALL be able to delete the selected pixels and to clear the selection. Both SHALL leave the rest of the frame unchanged.

#### Scenario: Delete
- **WHEN** the user presses delete with an area selected
- **THEN** only those pixels become off, as one undoable action

### Requirement: Keyboard shortcuts on PC
On a PC the selection tool SHALL be reachable by a key, copy, cut, paste and delete SHALL use the usual shortcuts, and Escape SHALL clear the selection.

#### Scenario: Copy with keyboard
- **WHEN** the user presses Ctrl+C with an area selected
- **THEN** the area is copied
