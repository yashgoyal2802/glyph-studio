# Spec Delta

## Purpose
The tool tray is the most used part of the editor. It must let someone who has never seen the app pick a tool or brightness in one tap, understand what each control does without a manual, and never get in the way of the drawing.

## ADDED Requirements

### Requirement: Drawing controls come first and alone
The Draw tab SHALL contain only controls that change how the user draws: the tools and the brightness. Controls that are about something else (showing the drawing on the phone's matrix, making the design a Glyph Toy, tray preferences) SHALL NOT sit among the tools.

#### Scenario: Draw tab content
- **WHEN** the tray is open on the Draw tab
- **THEN** the first thing shown is the tools, followed by brightness, with no switch, toy button or preference between or above them

#### Scenario: Matrix and toy actions stay reachable
- **WHEN** the user wants to show the drawing on the phone's matrix or play the design as a toy
- **THEN** both are one tap away from the editor's top bar (or an equally direct place that does not crowd it), and are never hidden inside the tray

### Requirement: One tap to a tool or brightness
Choosing a tool or a brightness SHALL take one tap from the Draw tab, and switching between tabs SHALL take one tap. No tool SHALL need a second screen, a long press or a menu to become active.

#### Scenario: Switching tools
- **WHEN** the user taps a tool tile
- **THEN** that tool is active immediately and its tile shows the pressed state

#### Scenario: Brightness
- **WHEN** the user taps a brightness swatch or moves the fine control
- **THEN** the new value applies to the next pixel drawn and the current value is visible in the tray and on the collapsed bar

### Requirement: Tools are grouped and fully named
Tools SHALL be grouped by purpose (for example draw, shapes, select, text) with a visible full-word label under every icon. Abbreviated or icon-only labels SHALL NOT be used. Every tool SHALL have a short description available (on hover for pointer users, and as a one-line hint under the tools when it is chosen).

#### Scenario: A new user reads the tools
- **WHEN** a user who has never used the app opens the tray
- **THEN** every tool shows an icon and its full name, in a group, and the active tool's one-line description is visible

#### Scenario: Screen reader
- **WHEN** a screen reader focuses a tool
- **THEN** it announces the tool name, its state (selected or not) and its description

### Requirement: Current state is always visible
The collapsed tray bar SHALL show the active tool, the current brightness and any active mode (mirror, matrix preview). Opening the tray SHALL NOT be required to find out what the next touch will do.

#### Scenario: Collapsed bar
- **WHEN** the tray is closed
- **THEN** the bar shows the active tool's icon and name, the brightness value with its swatch, and chips for active modes

### Requirement: First use is explained
On the first design a user opens, the tray SHALL start open with a short pointer explaining that tools live there, and the pointer SHALL go away on the first tool choice, on the first stroke, or on dismissal. It SHALL NOT appear again.

#### Scenario: First time
- **WHEN** the user opens an editor for the first time
- **THEN** the tray is open and a one-line pointer is visible

#### Scenario: Never again
- **WHEN** the pointer has been dismissed or the user has chosen a tool once
- **THEN** it is not shown again on later launches

### Requirement: The tray is fast and steady
Opening, closing and tab switching SHALL feel immediate: the tray SHALL respond within 100 ms of the touch and settle within 250 ms. The tray SHALL remember its open or closed state and its tab while the editor stays open. Closing and opening SHALL NOT change what the matrix shows beyond resizing it.

#### Scenario: Remembered tab
- **WHEN** the user switches to the Frames tab, draws, then reopens the tray
- **THEN** the Frames tab is still selected

### Requirement: Frames tab separates everyday from advanced
The Frames tab SHALL show the everyday frame actions first (add, duplicate, delete, reorder, how long the frame shows) and SHALL keep rarely used actions (fade brightness, loop mode, onion skin, removing many frames, picture import) in groups that are collapsed by default and remember how the user left them.

#### Scenario: Default Frames tab
- **WHEN** the user opens the Frames tab for the first time
- **THEN** the everyday actions are visible without scrolling on a 360 dp wide, 640 dp tall phone, and the advanced groups are present but collapsed

### Requirement: The existing tray structure is kept
The tray SHALL keep three tabs (Draw, Edit, Frames), the swipe-to-open and swipe-to-close gesture, the pointer and keyboard behaviour and all current shortcuts. Preferences about the tray itself (such as closing it after a choice) SHALL live in Settings, not in the tray.

#### Scenario: Gesture and shortcuts unchanged
- **WHEN** the user swipes the tray bar or presses a tool shortcut
- **THEN** it behaves as before

### Requirement: Reachable and accessible
Every tray control SHALL be at least 44 by 44 dp, operable with a keyboard on a computer, visibly focused, and reachable with one thumb on a phone (controls at the bottom of the screen). On a wide layout the tray SHALL be a side column that needs no opening.

#### Scenario: Tap targets
- **WHEN** the tap-target measurement runs on every tab
- **THEN** no control is smaller than 44 dp
