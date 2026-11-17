# Spec Delta

## Purpose
Motion explains what changed and adds delight in a few chosen places. It never slows the user down.

## ADDED Requirements

### Requirement: Motion carries state
Animation SHALL be used to show state changes (a key pressed, the tray opening, the playing lamp, a frame becoming current, something saved) and SHALL NOT delay any action. Transitions SHALL last 100 to 250 ms unless they are part of the intro.

#### Scenario: Not blocking
- **WHEN** the user taps during an animation
- **THEN** the tap takes effect immediately

### Requirement: Reduced motion is respected
When the system asks for reduced motion, decorative animation SHALL be removed and state changes SHALL appear without movement.

#### Scenario: Reduced motion on
- **WHEN** the phone's reduce-motion setting is on
- **THEN** no looping or sliding animation runs, and thumbnails show a still frame

### Requirement: Animated thumbnails are cheap
Library thumbnails MAY play their animation, but only for designs that are visible, and SHALL stop when the app is in the background, so the library stays smooth on a mid-range phone.

#### Scenario: Scrolling
- **WHEN** the library has 50 designs and the user scrolls
- **THEN** scrolling stays smooth and only visible thumbnails animate

### Requirement: Cinematic first-run intro
The first-run introduction SHALL use the new identity, light its dots in sequence as its opening moment, keep at most four screens, remain skippable, and be available again from "How it works".

#### Scenario: First launch
- **WHEN** the app opens for the first time
- **THEN** the intro plays with the dot sequence, can be skipped at any time and does not show again

### Requirement: A small reward for setting a toy
When the user assigns a design to a toy slot, the confirmation SHALL include a short, quiet animation of the slot lighting up.

#### Scenario: Toy set
- **WHEN** the user confirms a slot
- **THEN** the confirmation shows the slot lighting within 300 ms
