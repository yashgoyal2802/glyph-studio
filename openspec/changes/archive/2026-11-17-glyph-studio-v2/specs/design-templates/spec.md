# Spec Delta

## Purpose

Gives the user ready-made starting points instead of a blank grid.

## ADDED Requirements

### Requirement: Choose a template when creating
The design library SHALL show a list of templates with previews next to "New design", which keeps creating a blank design in one tap. The list SHALL include at least a heart, a clock face, a battery icon, an arrow, a smiley and a loading ring (animated). Choosing one SHALL create a new, independent, fully editable design.

#### Scenario: Create from template
- **WHEN** the user taps "Heart" in the template list
- **THEN** a new design opens containing the heart and the user can edit it

#### Scenario: Blank remains the quick path
- **WHEN** the user taps "New design"
- **THEN** a one-frame empty design opens, as before

### Requirement: Templates fit the matrix
Every template SHALL be valid against the design format and lie within the circular matrix mask.

#### Scenario: Validity
- **WHEN** any template is loaded
- **THEN** it passes design validation without pixels being dropped
