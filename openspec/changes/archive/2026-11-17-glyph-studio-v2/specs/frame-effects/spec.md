# Spec Delta

## Purpose

Adds a quick brightness fade across a design's frames.

## ADDED Requirements

### Requirement: Fade presets
The user SHALL be able to apply a fade-in, fade-out, or fade-in-and-out preset across a chosen range of frames (default: all). The preset SHALL scale each frame's brightness by a factor that changes evenly from frame to frame, and SHALL leave pixels that are off unchanged.

#### Scenario: Fade out
- **WHEN** the user applies fade out to a 5-frame design
- **THEN** frame 1 keeps its brightness and each later frame is dimmer, ending near off on frame 5

#### Scenario: Single frame
- **WHEN** the range contains only one frame
- **THEN** the user is told a fade needs at least two frames and nothing changes

### Requirement: Fade is one undoable action
Applying a preset SHALL be a single undoable action covering every frame it changed.

#### Scenario: Undo fade
- **WHEN** the user undoes after applying a fade
- **THEN** all affected frames return to their previous brightness
