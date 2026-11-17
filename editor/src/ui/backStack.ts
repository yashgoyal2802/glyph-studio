/**
 * What the Android Back button should close first. Dialogs and the library's selection register here while they are
 * open; the app asks the page (window.glyphBack) before it leaves the screen, so Back closes the topmost one.
 */
const stack: (() => void)[] = []

export function pushBack(close: () => void): () => void {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Close the topmost registered thing. True when something was closed. */
export function handleBack(): boolean {
  const close = stack.pop()
  if (!close) return false
  close()
  return true
}

if (typeof window !== 'undefined') (window as unknown as { glyphBack: () => boolean }).glyphBack = handleBack
