import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createDesign, deleteDesign, listDesigns } from './client'

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('lists designs from a relative URL', async () => {
    const fetchMock = mockFetch(() => jsonResponse([{ id: 'a', name: 'A', frameCount: 2, modified: 5 }]))
    const list = await listDesigns()
    expect(list).toEqual([{ id: 'a', name: 'A', frameCount: 2, modified: 5 }])
    expect(fetchMock.mock.calls[0][0]).toBe('/api/designs')
  })

  it('creates a design with an optional name', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ revision: 0, design: { id: 'x' } }, 201))
    await createDesign('Pacman')
    const init = fetchMock.mock.calls[0][1]!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Pacman' })
    await createDesign()
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({})
  })

  it('turns server errors into ApiError with the server message', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    const err = await listDesigns().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('Unauthorized')
  })

  it('handles non-JSON error bodies', async () => {
    mockFetch(() => new Response('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' }))
    const err = await listDesigns().catch((e) => e)
    expect(err.status).toBe(502)
    expect(err.message).toBe('Bad Gateway')
  })

  it('reports an unreachable phone clearly', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')))
    const err = await listDesigns().catch((e) => e)
    expect(err.status).toBe(0)
    expect(err.message).toMatch(/Cannot reach the phone/)
  })

  it('handles 204 No Content and encodes ids', async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }))
    await expect(deleteDesign('a/b')).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/designs/a%2Fb')
    expect(fetchMock.mock.calls[0][1]!.method).toBe('DELETE')
  })
})
