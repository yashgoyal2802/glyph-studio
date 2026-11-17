## Context

The editor is a Svelte 5 app in a WebView (phone) and a browser (PC). Today's look is a system-font dark theme with a red accent; the tray lives in `Editor.svelte` (tabs Draw, Edit, Frames; swipe handling in `core/tray.ts`). The chosen direction is mockup "H, Dot Instrument" (a hybrid of the Instrument and Dot OS mockups), reviewed with the user. Product facts are in `PRODUCT.md`. Constraint: offline, mid-range WebView, 44 dp targets, keyboard and screen-reader access.

## Goals / Non-Goals

**Goals**
- One coherent identity across library, editor, dialogs and intro.
- A tray that a new user understands without help and that experienced users can operate without thinking.
- Delight in a few places (intro, playing lamp, key press, toy confirmation) without slowing anything.

**Non-Goals**
- No new editing features, no change to the data format, sync or Android native code.
- No re-layout of the tray beyond tidying (three tabs and the swipe stay).
- No full light-first design: light is supported and tested, dark leads.

## Decisions

1. **Tokens first.** One `tokens.css` holds colour, type, radius, spacing, shadow and motion tokens with dark and light values; `app.css` and components only reference tokens. This is stage 1, so every later stage can be reviewed on the phone in the new look.
2. **Type.** Display: Doto (dot-matrix, open font licence) subset to Latin and digits, self-hosted as woff2. Readouts: Geist Mono subset. Body and controls: the system sans, to keep the bundle small and text crisp. Alternative considered: Geist for body too (rejected: extra weight for little gain).
3. **Icons.** A custom 7x7 dot-grid icon set (pen, eraser, fill, line, box, solid box, oval, solid oval, select, lasso, text, mirror, flip, move, copy, paste, clear, and so on) defined as small string grids and rendered to inline SVG circles, so they are crisp, themeable, and cheap. Replaces the current icon component's glyphs.
4. **Keys.** A shared `Key` look (raised, sinks on press, lit red edge when on) for tools and toggles; plain buttons and chips for the rest, so not everything is a key.
5. **Matrix canvas.** Draw lit pixels with a soft glow using a cached sprite per brightness level instead of per-frame shadow blur, because shadowBlur on 489 dots is too slow on a mid-range phone. The bezel is CSS around the canvas.
6. **Thumbnails.** Animated only when visible (IntersectionObserver), one shared requestAnimationFrame loop at about 12 fps (the matrix's own rate), paused when the page is hidden, still frame under reduced motion.

### The tray (the quality bar of this change)

**Approach: enhance, do not redo.** The author finds the current tray fine and wants it improved, not reinvented. Every tray change below is a small, separate step that keeps today's three tabs, swipe, shortcuts and muscle memory. Each step is shown on the phone before the next, and any step the author does not find better is reverted. The restyle (tokens, dot icons, keys) is the main visible change; the structural tidy-ups are kept only when they clearly help.

Current problems found by reading the code: it starts closed, so a new user may not find the tools; the Draw tab leads with a "Show on Glyph Matrix" switch and a "Play as toy" button before any tool; labels are abbreviated; the Frames tab is one long scroll of nine sections; a tray preference (auto-close) sits in the tray.

Layout of the Draw tab, top to bottom:

```
[ Draw | Edit | Frames ]
 DRAW        Pen  Eraser  Fill
 SHAPES      Line  Box  Solid box  Oval  Solid oval
 SELECT      Select  Lasso        TEXT   Text
 "Pen: tap or drag to light pixels."          <- one-line hint for the active tool
 BRIGHTNESS 255   o o o o o o o o   [ fine slider ]  [255]
```

- Groups with small captions; every tile is icon plus a full word; the active tile is a lit key. Eleven tools in four groups scan faster than a flat grid of eleven.
- The hint line changes with the tool and is also the tooltip text and the accessible description.
- The collapsed bar keeps the active tool, the brightness and mode chips, now using the same icons and full names.
- The matrix preview toggle (with a lamp) and Play as toy move to the top bar as two compact buttons (the author is fine with this). If the top bar turns out cramped on a 360 dp phone once built, do not squeeze: pick a better arrangement (for example the Shortcuts button only on a wide layout, a single combined "Matrix" button with a small menu, or a slim secondary row under the bar) and show it to the author. Auto-close moves to Settings.
- First use: the tray opens by itself the first time, with a one-line pointer; dismissed by any tool choice, the first stroke or tapping it. The flag is stored with the other phone settings (the WebView storage is not persistent).
- Remembered: open state and tab are kept in memory while the editor is open.
- Frames tab: "Everyday" (add, duplicate, delete, earlier, later, duration presets) visible; "Fade brightness", "Loop and onion skin", "Remove many frames", "Pictures" as collapsible groups, collapsed by default, with their open state remembered in settings.
- Speed: all tile handlers act on pointerdown/click without waiting, state changes are synchronous, and tray height changes use transform/height transitions of at most 250 ms with no layout thrash (measured on the phone).

## Risks / Trade-offs

- Pure-CSS glow and gradients can be heavy on the WebView: mitigated by sprites, no backdrop-filter on the tray, and a measured frame-time check on the phone.
- Dotted dividers via background gradients can look uneven at some pixel ratios: use SVG or a repeating radial gradient on whole pixels and check on the phone and PC.
- A changed layout means retraining the author's muscle memory: the three tabs, the swipe and the shortcuts are kept to limit this.
- Doto readability at small sizes is poor: use it only large (titles, numbers), never for body or labels.

## Migration Plan

Stages are independent releases of the editor bundle, each tested on the phone before the next starts. No data migration. The signed release APK is built only after the whole change is accepted.

## Open Questions

- Whether the "Shortcuts" button needs any place on the phone (leaning no).
- Exact toy-confirmation animation, to be tried on the phone and judged by the author.
