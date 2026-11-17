# Spec Delta

## Purpose

Turns a design into a frame-by-frame animation that the user can build, time and preview inside the editor.

## ADDED Requirements

### Requirement: Frame strip
The editor SHALL show all frames of the design as an ordered strip of thumbnails with the current frame highlighted, and let the user select any frame to edit.

#### Scenario: Select frame
- **WHEN** the user taps frame 3 in the strip
- **THEN** the canvas shows frame 3 for editing

### Requirement: Frame management
The user SHALL be able to add an empty frame, duplicate the current frame, delete a frame (except the last remaining one), and reorder frames by dragging. Each operation SHALL be undoable.

#### Scenario: Duplicate inserts after current
- **WHEN** the user duplicates frame 2 of 4
- **THEN** an identical frame is inserted as frame 3 and the design has 5 frames

#### Scenario: Cannot delete only frame
- **WHEN** a design has one frame
- **THEN** the delete-frame action is unavailable

### Requirement: Frame timing
The user SHALL be able to set the duration of an individual frame and to set one duration for all frames at once (shown in milliseconds and as frames per second).

#### Scenario: Apply to all
- **WHEN** the user sets 125 ms for all frames
- **THEN** every frame's duration becomes 125 ms

### Requirement: Loop mode selection
The user SHALL be able to choose the design's loop mode (loop, bounce, once).

#### Scenario: Change loop mode
- **WHEN** the user selects "once"
- **THEN** in-editor playback and toy playback stop on the last frame

### Requirement: Onion skin
The editor SHALL optionally show the previous frame (and optionally the next frame) faintly beneath the current frame, without affecting stored values.

#### Scenario: Onion skin is visual only
- **WHEN** onion skin is on and the user saves the current frame
- **THEN** the stored frame contains only pixels drawn on that frame

### Requirement: In-editor playback
The editor SHALL play the animation on the canvas using each frame's duration and the loop mode, and editing SHALL be disabled while playing.

#### Scenario: Timing respected
- **WHEN** frames have durations 100 ms and 300 ms and playback runs
- **THEN** the first frame is shown for about 100 ms and the second for about 300 ms
