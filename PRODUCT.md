# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Owners of a Nothing Phone (3) who want to put their own art and animations on the Glyph Matrix (25x25, 489 LEDs) on the back of the phone. They draw on the phone itself, often one-handed and on the move, and sometimes on a PC browser on the same Wi-Fi for precise work. The first user is the author, with friends and the Nothing community as likely later users.

## Product Purpose
Glyph Studio is a free Android app (`com.yash.glyphstudio`) with an editor for designing Glyph Matrix pixel art and frame animations, running them as Glyph Toys on the back of the phone (five slot toys picked with the Glyph Button), and sharing designs as files. Success: from opening the app to seeing your own design glow on the phone's back takes a minute, and drawing on it feels as good as the hardware looks.

## Positioning
The matrix preview is the real hardware's shape (round, 489 LEDs, no LED in the corners), at its real brightness levels. Editing works the same on the phone and on a PC, kept in sync live. No account, no cloud, designs are plain files.

## Operating Context
Phone: WebView hosting a Svelte/TypeScript editor, touch first, one-handed, indoor and outdoor light, dark and light system themes. PC: browser on the same Wi-Fi, mouse and keyboard shortcuts, wide layouts. Tablets are a supported size.

## Capabilities and Constraints
Tools: pen, eraser, fill, line, box, oval, select, lasso, text (static and scrolling), copy/paste, mirror/flip, move, onion skin, fades, templates, undo history kept across sessions, multi-frame animation with per-frame duration, GIF/picture import, export and share files. Gestures: press and hold a design to select it, press and hold a tool key (Box, Oval, Select) for its second version, press and hold the matrix button to play as a Glyph Toy, tap the selected frame for its actions, swipe between Designs and Templates. Constraints: the glyph matrix redraws about 12 times a second; the editor must stay smooth on a phone WebView; no network fonts at runtime (the app works offline, so any typeface must ship inside the app); touch targets at least 44dp; keyboard and screen-reader access required.

## Brand Commitments
Name: Glyph Studio. Identity: "Dot Instrument", an evolution of the Nothing-inspired dot-matrix language: graphite surfaces with a single signal-red accent for what is current or primary, a dot-matrix display face (Doto) for titles, dot-grid icons, raised keys that sink when pressed, and a round bezelled matrix that is always dark. The launcher icon is a round dot matrix with a lit red "G". Tokens live in `editor/src/tokens.css`.

## Product Principles
- The matrix is the hero; chrome recedes around it.
- One-handed phone use first, PC is the precision mode.
- Motion explains state (what is selected, what is playing, what was saved), never decorates.
- Light and dark are both first-class.
- Everything works offline and on a mid-range WebView.

## Accessibility & Inclusion
44dp minimum touch targets, visible keyboard focus, labels on every control, reduced-motion respected, contrast at least 4.5:1 for text.
