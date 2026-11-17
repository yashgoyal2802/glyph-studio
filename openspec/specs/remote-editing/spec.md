# remote-editing Specification

## Purpose
Lets the user design from a PC browser by connecting to the phone over local Wi-Fi, with the phone as the single source of truth for designs.

## Requirements

### Requirement: Start PC editing session
The user SHALL be able to turn on "PC editing" in the app, which SHALL display a local address (and QR code) to open in a PC browser and a 6-digit pairing code.

#### Scenario: Address shown
- **WHEN** the user turns on PC editing while on Wi-Fi
- **THEN** the app shows an address like http://192.168.x.x:port and a pairing code

#### Scenario: No Wi-Fi
- **WHEN** the user turns on PC editing without a Wi-Fi connection
- **THEN** the app explains that phone and PC must be on the same Wi-Fi and does not start the server

### Requirement: Pairing-code access control
The PC browser SHALL be required to enter the current pairing code before accessing any design data. After 5 wrong attempts, the code SHALL be regenerated. Paired browsers SHALL stay paired until PC editing is turned off or the user revokes them.

#### Scenario: Wrong code
- **WHEN** a browser enters a wrong code 5 times
- **THEN** the code shown on the phone changes and the old code stops working

#### Scenario: Unpaired request
- **WHEN** a device on the network requests design data without pairing
- **THEN** the request is refused

### Requirement: Same editor and library on PC
A paired PC browser SHALL get the full editor, library, media import, export/import and slot assignment, operating directly on the designs stored on the phone.

#### Scenario: Design created on PC
- **WHEN** the user creates a design in the PC browser
- **THEN** it appears in the phone app's library without manual transfer

### Requirement: Concurrent editing safety
If the same design is open on both the phone and the PC, edits from either side SHALL appear on the other within 1 second, and no edit SHALL be silently lost.

#### Scenario: Edit visible on phone
- **WHEN** the user draws on the PC while the same design is open on the phone
- **THEN** the phone's canvas shows the change within 1 second

### Requirement: Session lifetime
The PC editing server SHALL run only while explicitly turned on, SHALL show a persistent notification while running, and SHALL stop automatically after 30 minutes with no connected browser.

#### Scenario: Idle timeout
- **WHEN** PC editing is on and no browser connects for 30 minutes
- **THEN** the server stops and the notification is removed

#### Scenario: Connection lost
- **WHEN** the phone leaves Wi-Fi during a PC session
- **THEN** the PC editor shows a "disconnected" state and edits already saved remain on the phone
