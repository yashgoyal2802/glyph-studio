# Spec Delta

## Purpose

Keeps the user's designs on the phone and lets them be browsed, managed, backed up and moved between devices as files.

## ADDED Requirements

### Requirement: Designs persist on the phone
The system SHALL store all designs on the phone so they survive app restarts and phone reboots, and SHALL save edits automatically without requiring an explicit save action.

#### Scenario: Autosave survives restart
- **WHEN** the user draws on a design and the app is force-closed a few seconds later
- **THEN** reopening the app shows the design with those edits

### Requirement: Library listing
The system SHALL show all designs as a list with an animated or static thumbnail rendered in the circular matrix shape, the name, and frame count, sorted by last modified (newest first).

#### Scenario: Recently edited first
- **WHEN** the user edits an older design and returns to the library
- **THEN** that design appears at the top of the list

### Requirement: Manage designs
The user SHALL be able to create, rename, duplicate and delete designs. Deleting SHALL require confirmation.

#### Scenario: Duplicate
- **WHEN** the user duplicates a design named "Pacman"
- **THEN** a new design "Pacman copy" with identical frames and a new id appears in the library

#### Scenario: Delete design assigned to a slot
- **WHEN** the user confirms deletion of a design currently assigned to a toy slot
- **THEN** the design is removed and that slot becomes empty

### Requirement: Export designs
The user SHALL be able to export one design or all designs as a file that can be shared through Android's share sheet or downloaded in the PC browser.

#### Scenario: Export single design
- **WHEN** the user exports "Pacman"
- **THEN** a design file containing the full design document is produced and offered for sharing/download

### Requirement: Import designs
The user SHALL be able to import previously exported design files. Imported designs SHALL receive new ids so they never overwrite existing designs.

#### Scenario: Import duplicate
- **WHEN** the user imports a file of a design that already exists in the library
- **THEN** it is added as a separate design and the original is unchanged

#### Scenario: Invalid file
- **WHEN** the user imports a file that is not a valid design
- **THEN** nothing is added and an error explains why
