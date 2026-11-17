import { mount, unmount, flushSync } from 'svelte'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import Dialog from './Dialog.svelte'
import { createRawSnippet } from 'svelte'

// jsdom has no modal <dialog>; a stand-in is enough to check what we add: focus goes back to the opener.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as unknown as { showModal(): void }
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
})
afterEach(() => { document.body.innerHTML = '' })

describe('dialog focus', () => {
  it('returns focus to the control that opened it', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open'
    document.body.append(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const children = createRawSnippet(() => ({ render: () => '<button id="inside">Inside</button>' }))
    const dlg = mount(Dialog, { target: document.body, props: { title: 'T', onClose: () => {}, children } })
    flushSync()
    document.getElementById('inside')!.focus()
    expect(document.activeElement?.id).toBe('inside')

    unmount(dlg)
    flushSync()
    expect(document.activeElement).toBe(opener)
  })

  it('does not fail when the opener is gone', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const children = createRawSnippet(() => ({ render: () => '<p>x</p>' }))
    const dlg = mount(Dialog, { target: document.body, props: { title: 'T', onClose: () => {}, children } })
    opener.remove()
    expect(() => { unmount(dlg); flushSync() }).not.toThrow()
  })
})
