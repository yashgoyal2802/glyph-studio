# Spec Delta

## Purpose

Produces an installable release build that can be updated later.

## ADDED Requirements

### Requirement: App icon
The app SHALL have its own launcher icon, including an adaptive and a themed (monochrome) variant, instead of the default icon.

#### Scenario: Launcher
- **WHEN** the app is installed
- **THEN** the launcher shows the Glyph Studio icon

### Requirement: Signing key outside the project
The release SHALL be signed with a key that is stored outside the project folder and outside version control. The build SHALL read its location and passwords from configuration that is not committed. A release build SHALL fail with a clear message when the key is not configured, and SHALL NOT fall back to the debug key.

#### Scenario: Key missing
- **WHEN** a release build is run without the key configured
- **THEN** it stops with a message saying how to configure it

#### Scenario: Key not in the repository
- **WHEN** the repository contents are listed
- **THEN** no keystore file or password appears in them

### Requirement: Signed release APK
The build SHALL produce a release APK that is signed, minified without breaking the app, and installs on the Phone (3). A clean install SHALL show the five slot toys, the interactive toys and a library containing only the sample design.

#### Scenario: Clean install
- **WHEN** the release APK is installed on a phone with no earlier version
- **THEN** the app opens, the toys are listed in Glyph Toys settings, and the editor and PC editing work

### Requirement: Updates keep data
Installing a newer release signed with the same key over an older one SHALL keep the user's designs, slot assignments and settings.

#### Scenario: Update in place
- **WHEN** a newer release APK is installed over the current one
- **THEN** all designs and slot assignments are still present

### Requirement: Key backup is explained
The project documentation SHALL state where the key lives, that it must be backed up, and that losing it prevents updating an installed app.

#### Scenario: Documentation
- **WHEN** a person reads the release section of the README
- **THEN** it explains the key location, the backup advice and the loss consequence
