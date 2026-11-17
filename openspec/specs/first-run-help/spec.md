# first-run-help Specification

## Purpose
Helps a new user get from an empty app to their first toy.

## Requirements

### Requirement: First launch introduction
On the first launch the app SHALL show a short introduction (no more than four screens) covering: draw a design, assign it to a toy, select the toy with the Glyph Button, and edit from a computer. The user SHALL be able to skip it at any point, and it SHALL NOT appear again unless requested.

#### Scenario: Skip
- **WHEN** the user taps skip on the first screen
- **THEN** the library opens and the introduction does not reappear on the next launch

### Requirement: Sample design
On the first launch the app SHALL create one sample design so the library is not empty. The user SHALL be able to delete it like any other design.

#### Scenario: Library on first launch
- **WHEN** the user finishes or skips the introduction
- **THEN** the library lists the sample design

### Requirement: Help can be reopened
The user SHALL be able to open the introduction again from the home menu.

#### Scenario: Reopen
- **WHEN** the user chooses "How it works" in the home menu
- **THEN** the introduction is shown again
