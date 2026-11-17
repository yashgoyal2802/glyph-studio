# Spec Delta

## Purpose

Makes user designs selectable as real Glyph Toys through a fixed set of toy slots that each point at one design.

## ADDED Requirements

### Requirement: Fixed toy slots
The app SHALL register 5 Glyph Toys named "Toy 1" to "Toy 5", each with a preview image, so they appear in the phone's Glyph Toys settings and can be enabled and ordered there.

#### Scenario: Slots visible after install
- **WHEN** the app is installed
- **THEN** "Toy 1" to "Toy 5" are listed among available Glyph Toys in the phone settings

### Requirement: Assign design to slot
The user SHALL be able to assign any design to any slot, replace it, or clear the slot, from the library or the editor. A slot SHALL hold at most one design; one design MAY be assigned to several slots.

#### Scenario: Assign from editor
- **WHEN** the user assigns "Pacman" to slot 2
- **THEN** the slots screen shows slot 2 = "Pacman" with its thumbnail

### Requirement: Slot shows assigned design
When a slot's toy is selected on the phone via the Glyph Button, the matrix SHALL play the assigned design with its frame timing and loop mode.

#### Scenario: Play assigned animation
- **WHEN** the user presses the Glyph Button until "Toy 2" is active
- **THEN** the matrix plays "Pacman"

#### Scenario: Empty slot
- **WHEN** an empty slot's toy becomes active
- **THEN** the matrix shows a simple placeholder icon indicating the slot is empty

### Requirement: Slot content stays current
Edits to a design assigned to a slot SHALL be reflected the next time that toy becomes active, and immediately if it is currently active.

#### Scenario: Edit while active
- **WHEN** "Toy 2" is active and the user edits "Pacman" and leaves the editor
- **THEN** the matrix plays the updated "Pacman"

### Requirement: Default Glyph Button behaviour
The app SHALL NOT change the system's Glyph Button behaviour in this version: a short press continues to cycle toys as defined by the phone.

#### Scenario: Short press
- **WHEN** a slot toy is active and the user short-presses the Glyph Button
- **THEN** the phone switches to the next toy as normal
