# design-format Specification

## Purpose
Defines the versioned, layered representation of a Glyph design so every part of the app (editor, library, import/export, toy playback) and future phases share one stable contract.

## Requirements

### Requirement: Versioned design document
Every design SHALL be stored as a self-describing document containing a format version, a unique id, a name, created/modified timestamps, matrix dimensions (25x25), animation settings, and an ordered list of one or more frames.

#### Scenario: New design defaults
- **WHEN** the user creates a new design
- **THEN** the document has the current format version, a new unique id, matrix size 25x25, loop mode "loop", and exactly one empty frame

#### Scenario: Design without frames rejected
- **WHEN** a design document with zero frames is loaded
- **THEN** the system rejects it as invalid and reports the reason

### Requirement: Frames contain typed layers
Each frame SHALL contain a duration in milliseconds and an ordered list of layers, where each layer has a type. This change SHALL support the `pixels` layer type, holding one brightness value (0-255) per matrix position.

#### Scenario: Phase 1 frame shape
- **WHEN** a frame is created in this version
- **THEN** it contains exactly one `pixels` layer with all positions set to 0

#### Scenario: Unknown layer type preserved
- **WHEN** a design containing a layer type this version does not understand is loaded
- **THEN** the system keeps the unknown layer unchanged when saving and does not discard it

### Requirement: Circular matrix mask
The format SHALL treat only the 489 matrix positions that have physical LEDs as drawable. Values at positions outside the circular mask SHALL be ignored for display and stored as 0.

#### Scenario: Value outside mask
- **WHEN** a design is saved with a non-zero value at a corner position that has no LED
- **THEN** the stored value at that position is 0

### Requirement: Frame duration bounds
Each frame duration SHALL be an integer between 16 ms and 60000 ms inclusive.

#### Scenario: Out-of-range duration clamped
- **WHEN** a frame duration of 5 ms is set or loaded
- **THEN** the duration is clamped to 16 ms

### Requirement: Loop modes
A design SHALL specify one loop mode: `loop` (restart after last frame), `bounce` (play forward then backward repeatedly), or `once` (stop on the last frame).

#### Scenario: Bounce ordering
- **WHEN** a 3-frame design in `bounce` mode plays
- **THEN** frames are shown in the order 1,2,3,2,1,2,3,...

### Requirement: Forward migration of older formats
When loading a document with an older format version, the system SHALL migrate it to the current version without losing data. Documents with a newer, unknown major version SHALL be rejected with a clear message.

#### Scenario: Newer version rejected
- **WHEN** a design file declares a format major version higher than the app supports
- **THEN** the import fails with a message saying the design needs a newer app version
