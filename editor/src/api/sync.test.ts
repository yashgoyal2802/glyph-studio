import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Op } from '../core/ops'
import { createDesign, serializeDesign } from '../format/design'
import { HEARTBEAT_MS, SILENCE_LIMIT_MS, SyncClient, isDirty, type SocketLike, type SyncHandlers, type SyncState, type SyncStatus } from './sync'

class FakeSocket implements SocketLike {
  readyState = 0
  sent: string[] = []
  closed = false
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  constructor(readonly url: string) {}
  send(d: string) { this.sent.push(d) }
  close() { this.closed = true; this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.({}) }
  receive(obj: unknown) { this.onmessage?.({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) }) }
  drop() { this.readyState = 3; this.onclose?.({}) }
}

function setup(loc = { protocol: 'http:', host: '127.0.0.1:8080' }) {
  const log = { states: [] as SyncState[], snapshots: [] as [string, number][], remote: [] as [Op, number][], rejected: [] as string[], deleted: 0, status: [] as SyncStatus[], errors: [] as string[] }
  const handlers: SyncHandlers = {
    onSnapshot: (d, r) => log.snapshots.push([d.name, r]),
    onRemoteOp: (op, r) => log.remote.push([op, r]),
    onRejected: (m) => log.rejected.push(m),
    onDeleted: () => { log.deleted++ },
    onStatus: (s) => log.status.push(s),
    onSyncState: (s) => log.states.push(s),
    onError: (m) => log.errors.push(m),
  }
  const sockets: FakeSocket[] = []
  const client = new SyncClient('design-1', handlers, (url) => { const s = new FakeSocket(url); sockets.push(s); return s }, loc)
  return { client, log, sockets }
}

const snapshotMsg = (name = 'D', revision = 0) => ({ type: 'snapshot', revision, client: 'x', design: serializeDesign(createDesign(name)) })
const renameOp: Op = { t: 'rename', name: 'N' }

describe('SyncClient', () => {
  it('builds a ws:// URL for http pages and wss:// for https, with the client id', () => {
    const a = setup()
    expect(a.client.url).toBe(`ws://127.0.0.1:8080/ws/designs/design-1?client=${a.client.clientId}`)
    expect(setup({ protocol: 'https:', host: 'h' }).client.url.startsWith('wss://h/')).toBe(true)
  })

  it('reports connecting then open', () => {
    const { client, log, sockets } = setup()
    client.connect()
    expect(log.status).toEqual(['connecting'])
    sockets[0].open()
    expect(log.status).toEqual(['connecting', 'open'])
    expect(client.isOpen).toBe(true)
  })

  it('hands the snapshot to the editor', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('Pacman', 4))
    expect(log.snapshots).toEqual([['Pacman', 4]])
  })

  it('reports an invalid snapshot instead of crashing', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive({ type: 'snapshot', revision: 1, design: { format: 1, id: 'x' } })
    expect(log.snapshots).toHaveLength(0)
    expect(log.errors).toHaveLength(1)
    sockets[0].receive('this is not json')
    expect(log.errors).toHaveLength(2)
  })

  it('sends each op as its own numbered message, in order', () => {
    const { client, sockets } = setup()
    client.connect(); sockets[0].open()
    expect(client.sendOps([renameOp, { t: 'setLoop', loop: 'bounce' }])).toBe(true)
    client.sendOps([{ t: 'rename', name: 'again' }])
    const sent = sockets[0].sent.map((s) => JSON.parse(s))
    expect(sent.map((m) => m.seq)).toEqual([1, 2, 3])
    expect(sent.every((m) => m.type === 'op')).toBe(true)
    expect(sent[1].op).toEqual({ t: 'setLoop', loop: 'bounce' })
  })

  it('refuses to send while not open and does not queue', () => {
    const { client, sockets } = setup()
    expect(client.sendOps([renameOp])).toBe(false) // never connected
    client.connect()
    expect(client.sendOps([renameOp])).toBe(false) // still connecting
    sockets[0].open()
    sockets[0].drop()
    expect(client.sendOps([renameOp])).toBe(false) // dropped
    expect(sockets[0].sent).toHaveLength(0)
  })

  it('passes other devices\' edits on, but skips updates already included in the snapshot', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('D', 5))
    sockets[0].receive({ type: 'update', revision: 5, origin: 'pc', op: renameOp }) // already in the snapshot
    sockets[0].receive({ type: 'update', revision: 4, origin: 'pc', op: renameOp }) // older still
    sockets[0].receive({ type: 'update', revision: 6, origin: 'pc', op: { t: 'rename', name: 'new' } })
    expect(log.remote).toEqual([[{ t: 'rename', name: 'new' }, 6]])
  })

  it('surfaces rejections and deletion', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive({ type: 'reject', seq: 3, reason: 'Unknown frame: f9' })
    sockets[0].receive({ type: 'ack', seq: 4, revision: 9 })
    sockets[0].receive({ type: 'deleted' })
    expect(log.rejected).toEqual(['Unknown frame: f9'])
    expect(log.deleted).toBe(1)
  })

  it('knows when edits are waiting to be confirmed and saved', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('D', 4))
    const last = () => log.states[log.states.length - 1]
    expect(isDirty(last())).toBe(false) // just opened: what we see is what is stored
    client.sendOps([renameOp, { t: 'setLoop', loop: 'once' }])
    expect(last().pending).toBe(2)
    expect(isDirty(last())).toBe(true)
    sockets[0].receive({ type: 'ack', seq: 1, revision: 5 })
    expect(last()).toMatchObject({ pending: 1, revision: 5 })
    sockets[0].receive({ type: 'ack', seq: 2, revision: 6 })
    expect(last()).toMatchObject({ pending: 0, revision: 6, savedRevision: 4 })
    expect(isDirty(last())).toBe(true) // applied on the phone but not yet written to disk
    sockets[0].receive({ type: 'saved', revision: 6 })
    expect(last().savedRevision).toBe(6)
    expect(isDirty(last())).toBe(false)
  })

  it('an older save does not hide newer unsaved edits, and another device\'s edit counts as unsaved too', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('D', 0))
    client.sendOps([renameOp])
    sockets[0].receive({ type: 'ack', seq: 1, revision: 1 })
    client.sendOps([renameOp])
    sockets[0].receive({ type: 'ack', seq: 2, revision: 2 })
    sockets[0].receive({ type: 'saved', revision: 1 }) // the save that was already under way
    expect(isDirty(log.states[log.states.length - 1])).toBe(true)
    sockets[0].receive({ type: 'saved', revision: 2 })
    expect(isDirty(log.states[log.states.length - 1])).toBe(false)
    sockets[0].receive({ type: 'update', revision: 3, origin: 'pc', op: renameOp })
    expect(isDirty(log.states[log.states.length - 1])).toBe(true)
    sockets[0].receive({ type: 'saved', revision: 1 }) // stale: must not go backwards
    expect(log.states[log.states.length - 1].savedRevision).toBe(2)
  })

  it('a rejected edit is no longer waiting', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('D', 0))
    client.sendOps([renameOp])
    sockets[0].receive({ type: 'reject', seq: 1, reason: 'nope' })
    expect(log.states[log.states.length - 1].pending).toBe(0)
  })

  it('a new snapshot (after reconnecting) resets the picture', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('D', 3))
    client.sendOps([renameOp])
    client.reconnect(); sockets[1].open()
    sockets[1].receive(snapshotMsg('D', 1))
    expect(log.states[log.states.length - 1]).toEqual({ pending: 0, revision: 1, savedRevision: 1 })
  })

  it('reports an unexpected drop as closed', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].drop()
    expect(log.status).toEqual(['connecting', 'open', 'closed'])
    expect(client.isOpen).toBe(false)
  })

  it('close() shuts the socket and reports closed exactly once', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    client.close()
    expect(sockets[0].closed).toBe(true)
    sockets[0].drop() // late close event from the old socket must be ignored
    expect(log.status.filter((s) => s === 'closed')).toHaveLength(1)
  })

  it('reconnect opens a fresh socket and expects a new snapshot', () => {
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    sockets[0].receive(snapshotMsg('D', 7))
    client.reconnect()
    expect(sockets).toHaveLength(2)
    expect(sockets[0].closed).toBe(true)
    sockets[1].open()
    sockets[1].receive(snapshotMsg('D', 2)) // revision restarts: it must still be accepted
    expect(log.snapshots).toEqual([['D', 7], ['D', 2]])
  })
})

describe('SyncClient heartbeat (phone leaves Wi-Fi or stops its server without closing the socket)', () => {
  afterEach(() => { vi.useRealTimers() })

  it('pings regularly while the phone answers, and stays open', () => {
    vi.useFakeTimers()
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(HEARTBEAT_MS)
      sockets[0].receive({ type: 'pong' })
    }
    expect(sockets[0].sent.filter((m) => JSON.parse(m).type === 'ping').length).toBe(6)
    expect(log.status).toEqual(['connecting', 'open'])
    expect(client.isOpen).toBe(true)
  })

  it('reports the link as closed when nothing comes back for too long', () => {
    vi.useFakeTimers()
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    vi.advanceTimersByTime(SILENCE_LIMIT_MS + HEARTBEAT_MS * 2)
    expect(log.status.at(-1)).toBe('closed')
    expect(sockets[0].closed).toBe(true)
    expect(client.isOpen).toBe(false)
    expect(client.sendOps([renameOp])).toBe(false)
  })

  it('counts any message from the phone as proof it is alive', () => {
    vi.useFakeTimers()
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1000)
      sockets[0].receive({ type: 'saved', revision: i })
    }
    expect(log.status).toEqual(['connecting', 'open'])
  })

  it('does not mistake a held-back timer (hidden browser tab) for a lost phone', () => {
    vi.useFakeTimers()
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    vi.advanceTimersByTime(HEARTBEAT_MS)
    sockets[0].receive({ type: 'pong' })
    vi.setSystemTime(Date.now() + SILENCE_LIMIT_MS * 4) // the tab slept: no tick ran for a long while
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(log.status).toEqual(['connecting', 'open'])
    expect(sockets[0].sent.filter((m) => JSON.parse(m).type === 'ping').length).toBe(2) // it pinged again at once
    vi.advanceTimersByTime(SILENCE_LIMIT_MS + HEARTBEAT_MS * 2) // but a phone that really stays silent is still dropped
    expect(log.status.at(-1)).toBe('closed')
  })

  it('stops pinging after close() and after a reconnect it works again', () => {
    vi.useFakeTimers()
    const { client, log, sockets } = setup()
    client.connect(); sockets[0].open()
    client.close()
    const sentBefore = sockets[0].sent.length
    vi.advanceTimersByTime(SILENCE_LIMIT_MS * 3)
    expect(sockets[0].sent.length).toBe(sentBefore)
    client.reconnect(); sockets[1].open()
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(sockets[1].sent.some((m) => JSON.parse(m).type === 'ping')).toBe(true)
    expect(log.status.at(-1)).toBe('open')
  })
})
