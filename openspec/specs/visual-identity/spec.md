# visual-identity Specification

## Purpose
One visual language for the whole app, taken from the Glyph Matrix itself, so every screen reads as one product in dark and light.

## Requirements

### Requirement: A single token set drives every screen
Colours, type, radii, spacing and shadows SHALL come from one shared set of named tokens, with dark and light values for each. No screen SHALL use a literal colour that works in only one theme.

#### Scenario: Theme switch
- **WHEN** the phone or browser switches between dark and light
- **THEN** every screen, dialog and canvas follows with readable text (contrast at least 4.5:1) and no leftover colour from the other theme

### Requirement: Graphite surfaces with one signal colour
Surfaces SHALL be near-black graphite in dark theme with a lighter layer for raised elements. Signal red SHALL be reserved for the primary action, the thing that is current or playing, and warnings. It SHALL NOT be used as decoration.

#### Scenario: Red means something
- **WHEN** a screen is shown
- **THEN** red appears only on the primary action, the active or playing item, or a destructive or warning state

### Requirement: Dot-matrix display type, plain body type
The wordmark, screen titles and big numbers SHALL use a dot-matrix display face bundled with the app. Body text, labels and controls SHALL use a plain sans. Small readouts SHALL use a monospace face. The app SHALL work fully offline.

#### Scenario: Offline
- **WHEN** the phone has no internet connection
- **THEN** all type renders in the intended faces

### Requirement: Dots are the structural motif
Dividers SHALL be dotted, frame counts SHALL be shown as dots, and tool icons SHALL be drawn from a dot grid in one consistent set. Icons SHALL NOT mix styles.

#### Scenario: Icon set
- **WHEN** any tool or action icon is shown
- **THEN** it comes from the same dot-grid set at the same grid size

### Requirement: Controls feel physical
Primary controls SHALL show a clear pressed state (sink and shade), and keys that are on SHALL look lit. The states hover, focus, active, disabled and selected SHALL be distinct for every control.

#### Scenario: Pressed key
- **WHEN** the user presses a tool key
- **THEN** it visibly sinks and, once active, shows a lit red edge

### Requirement: Brand mark in app and launcher
The dot-matrix "G" mark SHALL appear as the launcher icon, the editor favicon and a small header mark, and SHALL match across them.

#### Scenario: Consistency
- **WHEN** the launcher icon, favicon and header mark are compared
- **THEN** they show the same dots and colours
