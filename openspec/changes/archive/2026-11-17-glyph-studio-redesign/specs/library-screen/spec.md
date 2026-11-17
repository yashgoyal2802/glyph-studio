# Spec Delta

## Purpose
The library is the first screen. It must show the designs, say what is playing on the phone, and get the user to a new or existing design in one tap.

## ADDED Requirements

### Requirement: Wordmark header
The library SHALL open with the large dot-matrix wordmark and a menu button, and SHALL fit, together with the playing panel and the first designs, on a 360 dp wide, 640 dp tall phone without scrolling.

#### Scenario: First screen
- **WHEN** the library opens on a 360 by 640 dp phone with at least three designs
- **THEN** the wordmark, the playing panel and at least two designs are visible without scrolling

### Requirement: Playing-now panel
When a design is assigned to a toy slot, the library SHALL show a panel with a live preview of that design, its name and slot, a lit lamp, and a button to change it. When no toy is assigned, the panel SHALL invite the user to set one.

#### Scenario: Toy assigned
- **WHEN** slot 2 plays "Heart"
- **THEN** the panel shows an animated preview, "Heart", "Toy 2" and a Change button

#### Scenario: No toy
- **WHEN** no slot has a design
- **THEN** the panel explains how to play a design as a toy and offers to choose one

### Requirement: Numbered list with frame dots
Designs SHALL be listed with an index, a thumbnail, the name, how long ago it changed, and a row of dots, one per frame (capped, with a count after the cap). The design playing on a toy SHALL carry a red marker.

#### Scenario: Row content
- **WHEN** a design with 3 frames is listed
- **THEN** its row shows three lit dots and its index

### Requirement: Tabs for designs and templates
The library SHALL offer Designs and Templates as tabs, so templates no longer sit above the list.

#### Scenario: Starting from a template
- **WHEN** the user opens Templates and taps one
- **THEN** a new design is created from it and opened, as before

### Requirement: Everything from before still works
Creating, opening, renaming, duplicating, exporting, importing, deleting, multi-select delete, the menu and "How it works" SHALL remain available with the same behaviour.

#### Scenario: Multi-select
- **WHEN** the user chooses Select several
- **THEN** the multi-select delete flow works as before in the new styling

### Requirement: Calm empty state
With no designs the library SHALL show a short, friendly empty state with one obvious action.

#### Scenario: Empty library
- **WHEN** there are no designs
- **THEN** the screen shows a one-line explanation and a New design button

### Requirement: Press and hold to select
Pressing and holding a design SHALL start selection with that design selected. While selecting, tapping a design SHALL add or remove it, and a bar SHALL offer actions on the selection: with one design selected Toy, Rename, Duplicate, Share and Delete, with several Share and Delete. Back or Cancel SHALL leave selection, and removing the last selected design SHALL leave it too. A press that starts selection SHALL NOT also open the design.

#### Scenario: Selecting by long press
- **WHEN** the user presses and holds "Heart" for about half a second
- **THEN** "Heart" is selected, the action bar appears, and the design is not opened

#### Scenario: Several designs
- **WHEN** the user then taps "Diwali"
- **THEN** two designs are selected and the bar offers Share and Delete only

### Requirement: Swipe between tabs and remember the tab
Swiping sideways on the library content SHALL switch between Designs and Templates, ignoring swipes that start at the screen edge. Returning to the library SHALL show the tab that was showing when the user left. A design created from a template only to be looked at SHALL be removed again when the user leaves it unchanged.

#### Scenario: Back from a template
- **WHEN** the user opens a template, changes nothing and goes back
- **THEN** the Templates tab is showing and no new design was added
