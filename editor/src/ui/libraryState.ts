/**
 * Library state that has to survive leaving the library and coming back (the library is created fresh each time).
 * - tab: which tab was showing, so Back from a template returns to Templates, not Designs.
 * - draftId: a design just created from a template for a look; it is removed again if you leave without changing it.
 * - hidden: designs being deleted right now, kept out of the list so they do not flash back in.
 */
export const libraryState: { tab: 'designs' | 'templates'; draftId: string | null; hidden: Set<string> } = {
  tab: 'designs',
  draftId: null,
  hidden: new Set(),
}
