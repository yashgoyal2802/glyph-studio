# text-tool Specification

## Purpose
Lets the user put readable text on the 25x25 matrix, as a still or as a scrolling marquee.

## Requirements

### Requirement: Place text on a frame
The editor SHALL provide a text tool. The user types text, chooses a built-in pixel font and brightness, sees a live preview on the canvas, positions it, and confirms. Confirming SHALL draw the text into the current frame's pixels as one undoable action. Pixels outside the circular matrix mask SHALL be dropped.

#### Scenario: Confirm text
- **WHEN** the user types "HI", positions it and confirms
- **THEN** the current frame contains the text pixels and a single undo removes them

#### Scenario: Cancel text
- **WHEN** the user cancels the text tool before confirming
- **THEN** the frame is unchanged

### Requirement: Fonts that fit the matrix
The app SHALL include at least a small font (about 5 pixels tall) and a larger font (about 7 pixels tall), each covering letters, digits and common punctuation. A character a font cannot draw SHALL be shown as a visible placeholder rather than dropped.

#### Scenario: Missing character
- **WHEN** the user types a character the chosen font does not have
- **THEN** a placeholder is drawn in its place and the preview makes this visible

### Requirement: Scrolling text
The user SHALL be able to generate a scrolling marquee from text, choosing direction (right to left, or left to right), speed and font. The result SHALL be added to the design as a sequence of frames, and SHALL loop smoothly when the design's loop mode is loop.

#### Scenario: Marquee frames
- **WHEN** the user generates a right-to-left scroll of "HELLO"
- **THEN** new frames are added in which the text enters from the right edge and leaves at the left edge, as one undoable action

#### Scenario: Frame limit
- **WHEN** the requested scroll would exceed the design's frame limit
- **THEN** the user is told and no frames are added

### Requirement: Text works from phone and PC
The text tool SHALL be usable with touch (on-screen keyboard) and with a PC keyboard, and the preview SHALL update as the user types.

#### Scenario: Type on phone
- **WHEN** the user taps the text field on the phone and types
- **THEN** the preview on the canvas updates after each character
