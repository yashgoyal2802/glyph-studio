# undo-persistence Specification

## Purpose
Keeps the user's undo and redo available after the editor is closed.

## Requirements

### Requirement: History survives closing the editor
When the user leaves a design and opens it again, undo and redo SHALL still step through the edits made earlier, up to the history limit. The history SHALL be stored on the phone with the design.

#### Scenario: Reopen and undo
- **WHEN** the user draws a stroke, goes back to the library, reopens the design and presses undo
- **THEN** the stroke is removed

### Requirement: History is dropped when it no longer fits
If the design was changed in a way the stored history cannot be applied to (for example edited from another device while closed, or imported over), the app SHALL discard the stored history instead of applying it, and SHALL NOT change the design.

#### Scenario: Edited elsewhere
- **WHEN** the design was edited from the PC while the phone's editor was closed and the phone reopens it
- **THEN** undo does not alter the design incorrectly; the stale history is discarded

### Requirement: History is removed with the design
Deleting a design SHALL delete its stored history. Exports SHALL NOT contain history.

#### Scenario: Delete
- **WHEN** a design is deleted
- **THEN** no history for it remains on the phone
