/** The introduction shown on the first launch and from "How it works". At most four screens. */
export interface IntroStep {
  title: string
  body: string
  /** Id of a template whose picture illustrates the step. */
  art: string
}

export const INTRO_STEPS: readonly IntroStep[] = [
  {
    title: 'Draw on the Glyph Matrix',
    body: 'Pick a tool, draw on the grid, and add frames to make it move. Start from a template, or type text and make it scroll.',
    art: 'heart',
  },
  {
    title: 'Turn it into a Glyph Toy',
    body: 'Open the ⋯ menu of a design and choose “Play as Glyph Toy…”, then pick a slot. Your design now plays on the back of the phone.',
    art: 'loading',
  },
  {
    title: 'Pick it with the Glyph Button',
    body: 'In Settings, open Glyph Interface → Glyph Toys and switch your toys on. Then press the Glyph Button on the back until your toy shows.',
    art: 'smiley',
  },
  {
    title: 'Edit from a computer',
    body: 'Open the ⋯ menu at the top of the library and choose “Edit from a computer…”. Type the address shown into a browser on the same Wi-Fi.',
    art: 'arrow',
  },
]
