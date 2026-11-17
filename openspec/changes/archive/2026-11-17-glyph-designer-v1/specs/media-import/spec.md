# Spec Delta

## Purpose

Converts ordinary images and animated GIFs into Glyph designs so the user can start from existing pictures instead of drawing every pixel.

## ADDED Requirements

### Requirement: Supported sources
The system SHALL import PNG, JPEG, WebP and GIF files from the phone's file picker or from the PC browser's file picker.

#### Scenario: Unsupported file
- **WHEN** the user picks a PDF
- **THEN** the import is refused with a message listing supported formats

### Requirement: Fit to circular matrix
Imported images SHALL be scaled down to the 25x25 matrix with a user-adjustable crop (fit, fill, or manual zoom/position) and previewed in the circular mask before confirming.

#### Scenario: Preview before confirm
- **WHEN** the user picks an image
- **THEN** a preview of the converted result inside the circle is shown and nothing is created until the user confirms

### Requirement: Brightness conversion controls
The conversion SHALL turn colour into brightness and let the user adjust brightness, contrast, threshold/levels (8 levels or full 0-255) and invert, updating the preview live.

#### Scenario: Invert
- **WHEN** the user toggles invert
- **THEN** bright areas become dark and dark areas become bright in the preview

### Requirement: Animated GIF frames
Importing an animated GIF SHALL create one frame per GIF frame (up to 300 frames) with each frame's duration taken from the GIF, clamped to the format's duration bounds.

#### Scenario: GIF timing
- **WHEN** a 10-frame GIF with 80 ms per frame is imported
- **THEN** a design with 10 frames of 80 ms each is created

#### Scenario: Too many frames
- **WHEN** a GIF has 500 frames
- **THEN** the user is told only the first 300 will be imported, or can choose to skip every other frame

### Requirement: Import target
The user SHALL choose whether an import becomes a new design or is inserted as frames into the currently open design after the current frame.

#### Scenario: Insert into current design
- **WHEN** the user imports a still image into an open 4-frame design with frame 2 selected
- **THEN** the image becomes a new frame 3 and the design has 5 frames
