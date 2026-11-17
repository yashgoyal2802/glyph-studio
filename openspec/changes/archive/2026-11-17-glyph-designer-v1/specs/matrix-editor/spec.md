# Spec Delta

## Purpose

Lets the user draw a single frame on the circular 25x25 Glyph Matrix canvas comfortably with a finger on the phone or a mouse and keyboard on a PC.

## ADDED Requirements

### Requirement: Circular canvas
The editor SHALL display the 25x25 grid with the 489 LED positions visually distinct from non-LED positions, render each LED at its brightness, and prevent drawing on non-LED positions.

#### Scenario: Drawing outside circle
- **WHEN** the user drags the pen across a corner position with no LED
- **THEN** that position stays unlit and no value is stored

### Requirement: Drawing tools
The editor SHALL provide pen, eraser, flood fill, line, rectangle (outline and filled) and circle/ellipse (outline and filled) tools that apply the current brightness.

#### Scenario: Flood fill
- **WHEN** the user uses fill on an enclosed region of value 0 with brightness "full"
- **THEN** every connected position of value 0 inside the region becomes full brightness and nothing outside changes

#### Scenario: Shape preview
- **WHEN** the user drags with the line tool
- **THEN** a preview of the line is shown and pixels are only committed when the drag ends

### Requirement: Brightness selection
The editor SHALL offer 8 brightness swatches from off to full and an option to choose any exact value from 0 to 255.

#### Scenario: Exact value
- **WHEN** the user picks exact value 37 and draws a pixel
- **THEN** that pixel's stored value is 37

### Requirement: Symmetry
The editor SHALL support mirror drawing across the vertical axis, horizontal axis, or both, applying to all drawing tools.

#### Scenario: Vertical mirror
- **WHEN** vertical mirror is on and the user draws at column 3
- **THEN** the same stroke also appears at the mirrored column 21 on the same row

### Requirement: Undo and redo
The editor SHALL support undo and redo of at least the last 100 edit actions, where one stroke or one shape counts as one action.

#### Scenario: Undo a stroke
- **WHEN** the user draws a stroke and presses undo
- **THEN** the canvas returns exactly to its state before that stroke

### Requirement: Clear, shift and flip frame
The editor SHALL let the user clear the current frame, shift its content one pixel in any direction, and flip it horizontally or vertically, each as an undoable action.

#### Scenario: Shift left
- **WHEN** the user shifts the frame left
- **THEN** every lit pixel moves one column left and pixels pushed beyond the mask are discarded

### Requirement: Touch input on phone
On the phone, one-finger drag SHALL draw with the active tool, two-finger pinch SHALL zoom, and two-finger drag SHALL pan, without accidental marks from multi-touch gestures.

#### Scenario: Pinch does not draw
- **WHEN** the user starts a pinch-zoom with two fingers
- **THEN** no pixel is changed by the gesture

### Requirement: Mouse and keyboard input on PC
In a PC browser, the editor SHALL support mouse drawing, scroll-wheel zoom, and keyboard shortcuts for tool selection, undo/redo, brightness swatches and frame navigation.

#### Scenario: Undo shortcut
- **WHEN** the user presses Ctrl+Z in the PC editor
- **THEN** the last action is undone
