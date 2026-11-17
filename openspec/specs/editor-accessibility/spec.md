# editor-accessibility Specification

## Purpose
Makes the editor comfortable to use on small and large screens and with assistive technology.

## Requirements

### Requirement: Touch targets
Every control that is tapped on the phone SHALL be at least 44 by 44 CSS pixels, or have that much tappable area.

#### Scenario: Tool buttons
- **WHEN** the editor is shown at phone width
- **THEN** no tappable control has a smaller tappable area than 44 by 44 pixels

### Requirement: Labels
Every icon-only control SHALL have a text label available to screen readers, and the state of toggles (selected tool, onion skin mode, connection) SHALL be exposed.

#### Scenario: Screen reader
- **WHEN** a screen reader focuses the eraser button
- **THEN** it announces "Eraser" and whether it is selected

### Requirement: Keyboard focus
On a PC every control SHALL be reachable by keyboard with a visible focus indicator, and dialogs SHALL trap focus while open and return it to the control that opened them.

#### Scenario: Dialog focus
- **WHEN** the user opens a dialog from a button and closes it
- **THEN** focus returns to that button

### Requirement: Large windows
At tablet-size and wider windows (about 768 CSS pixels and up) the editor and the library SHALL use the extra space without stretched or overlapping controls.

#### Scenario: Tablet width
- **WHEN** the editor is opened in a 1024 pixel wide window
- **THEN** the canvas, tools and frame strip are laid out without overlap and the canvas stays square
