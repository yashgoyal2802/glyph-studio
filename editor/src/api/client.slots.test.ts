import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignSlot, getPreview, listSlots, openToyManager, setPreview } from './client'

function mockFetch(body: unknown = {}, status = 200) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
  vi.stubGlobal('fetch', fn)
  return fn
}
afterEach(() => vi.unstubAllGlobals())

describe('slots, preview and device calls', () => {
  it('lists slots', async () => {
    const fn = mockFetch([{ slot: 1, designId: null, designName: null }])
    expect(await listSlots()).toHaveLength(1)
    expect(fn.mock.calls[0][0]).toBe('/api/slots')
  })

  it('assigns and clears a slot with PUT', async () => {
    const fn = mockFetch([])
    await assignSlot(3, 'abc')
    await assignSlot(3, null)
    const [first, second] = fn.mock.calls as unknown as [string, RequestInit][]
    expect(first[0]).toBe('/api/slots/3')
    expect(first[1].method).toBe('PUT')
    expect(JSON.parse(first[1].body as string)).toEqual({ designId: 'abc' })
    expect(JSON.parse(second[1].body as string)).toEqual({ designId: null })
  })

  it('starts and stops the live preview', async () => {
    const fn = mockFetch({ supported: true, active: true, designId: 'd', frameId: 'f', message: null })
    await setPreview({ enabled: true, designId: 'd', frameId: 'f' })
    await setPreview({ enabled: false })
    const calls = fn.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][1].method).toBe('PUT')
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ enabled: true, designId: 'd', frameId: 'f' })
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ enabled: false })
    expect((await getPreview()).supported).toBe(true)
  })

  it('opens the toy manager with POST', async () => {
    const fn = mockFetch({ ok: true })
    expect(await openToyManager()).toEqual({ ok: true })
    expect((fn.mock.calls as unknown as [string, RequestInit][])[0][1].method).toBe('POST')
  })
})
