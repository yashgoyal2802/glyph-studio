import { parseDesign } from '../format/design'
import type { Design } from '../format/types'
import { uuid } from '../format/uuid'
import type { Op } from '../core/ops'

export type SyncStatus = 'connecting' | 'open' | 'closed'

/** What the editor knows about saving: edits still travelling to the phone, and how far the phone has written to disk. */
export interface SyncState {
  /** Edits sent that the phone has not confirmed yet. */
  pending: number
  /** Newest revision the phone has applied (from our edits or another device's). */
  revision: number
  /** Newest revision the phone has written to disk. */
  savedRevision: number
}

/** True while there is anything not yet safely on the phone's storage. */
export const isDirty = (s: SyncState): boolean => s.pending > 0 || s.revision > s.savedRevision

/** The part of the browser WebSocket we use, so tests can supply a fake. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(): void
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export type SocketFactory = (url: string) => SocketLike

export interface SyncHandlers {
  /** The phone's current copy of the design (sent on connect). Replace the local copy with it. */
  onSnapshot(design: Design, revision: number): void
  /** An edit made on another device. */
  onRemoteOp(op: Op, revision: number): void
  /** The phone refused one of our edits, so our copy may have drifted: reload from the phone. */
  onRejected(reason: string): void
  /** The design was deleted on the phone. */
  onDeleted(): void
  onStatus(status: SyncStatus): void
  /** Called whenever the saving picture changes (an edit sent, confirmed, or written to disk). */
  onSyncState?(state: SyncState): void
  onError(message: string): void
}

const OPEN = 1
/** How often we check the link, and how long it may stay silent. Wi-Fi dropping does not close a browser socket by itself. */
export const HEARTBEAT_MS = 4000
export const SILENCE_LIMIT_MS = 10000

/**
 * Live link to one design on the phone (WebSocket). Sends our edits, receives everyone else's.
 * Edits made while the link is down are NOT queued: sendOps reports false so the UI can stop the user drawing,
 * which keeps the local copy and the phone from silently diverging.
 */
export class SyncClient {
  readonly clientId = uuid()
  private socket: SocketLike | null = null
  private seq = 0
  private snapshotRevision = -1
  private pending = 0
  private revision = -1
  private savedRevision = -1
  private lastHeard = 0
  private beat: ReturnType<typeof setInterval> | null = null
  private lastTick = 0

  constructor(
    private readonly designId: string,
    private readonly handlers: SyncHandlers,
    private readonly factory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike,
    private readonly loc: { protocol: string; host: string } = window.location,
  ) {}

  get url(): string {
    const scheme = this.loc.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${scheme}//${this.loc.host}/ws/designs/${encodeURIComponent(this.designId)}?client=${this.clientId}`
  }

  get isOpen(): boolean {
    return this.socket?.readyState === OPEN
  }

  private emit() {
    this.handlers.onSyncState?.({ pending: this.pending, revision: this.revision, savedRevision: this.savedRevision })
  }

  connect() {
    this.snapshotRevision = -1
    this.pending = 0
    this.revision = -1
    this.savedRevision = -1
    this.handlers.onStatus('connecting')
    const s = this.factory(this.url)
    this.socket = s
    s.onopen = () => {
      this.lastHeard = Date.now()
      this.startHeartbeat(s)
      this.handlers.onStatus('open')
    }
    s.onclose = () => {
      this.stopHeartbeat()
      if (this.socket === s) this.socket = null
      this.handlers.onStatus('closed')
    }
    s.onerror = () => this.handlers.onError('Connection to the phone failed.')
    s.onmessage = (ev) => this.receive(String(ev.data))
  }

  /**
   * A closed socket is reported by the browser, but a phone that left Wi-Fi or stopped its server often closes nothing.
   * So every few seconds we ask the phone "are you there?"; if nothing at all has come back for a while, the link is
   * treated as lost and the editor shows the disconnected message.
   */
  private startHeartbeat(s: SocketLike) {
    this.stopHeartbeat()
    this.lastTick = Date.now()
    this.beat = setInterval(() => {
      if (this.socket !== s) return this.stopHeartbeat()
      const now = Date.now()
      // A browser holds timers back in a hidden tab (and a sleeping laptop stops them), so this tick can arrive long after
      // the last one. Silence measured across that gap says nothing about the phone: start counting again from now.
      if (now - this.lastTick > HEARTBEAT_MS * 2.5) this.lastHeard = now
      this.lastTick = now
      if (now - this.lastHeard > SILENCE_LIMIT_MS) return this.dropSilently(s)
      try { s.send(JSON.stringify({ type: 'ping' })) } catch { this.dropSilently(s) }
    }, HEARTBEAT_MS)
  }

  private stopHeartbeat() {
    if (this.beat !== null) clearInterval(this.beat)
    this.beat = null
  }

  private dropSilently(s: SocketLike) {
    this.stopHeartbeat()
    if (this.socket === s) this.socket = null
    s.onopen = s.onclose = s.onmessage = s.onerror = null
    try { s.close() } catch { /* already gone */ }
    this.handlers.onStatus('closed')
  }

  /** Re-open the link (and receive a fresh snapshot). */
  reconnect() {
    this.close()
    this.connect()
  }

  close() {
    this.stopHeartbeat()
    const s = this.socket
    this.socket = null
    if (s) {
      // Detach first so the socket's own close event is not reported as an unexpected drop.
      s.onopen = null
      s.onclose = null
      s.onmessage = null
      s.onerror = null
      s.close()
    }
    this.handlers.onStatus('closed')
  }

  /** Send edits in order. Returns false (and sends nothing) when the link is not open. */
  sendOps(ops: Op[]): boolean {
    if (!this.socket || !this.isOpen) return false
    for (const op of ops) this.socket.send(JSON.stringify({ type: 'op', seq: ++this.seq, op }))
    this.pending += ops.length
    this.emit()
    return true
  }

  private receive(text: string) {
    this.lastHeard = Date.now()
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(text)
    } catch {
      return this.handlers.onError('The phone sent something unreadable.')
    }
    switch (msg.type) {
      case 'snapshot': {
        const parsed = parseDesign(msg.design)
        if (!parsed.ok) return this.handlers.onError(parsed.error)
        this.snapshotRevision = Number(msg.revision)
        // The phone's copy is what we now show; whatever it holds is saved or about to be.
        this.pending = 0
        this.revision = this.savedRevision = this.snapshotRevision
        this.emit()
        this.handlers.onSnapshot(parsed.design, this.snapshotRevision)
        return
      }
      case 'update': {
        const revision = Number(msg.revision)
        // An update can arrive that is already included in the snapshot (the server subscribes before it snapshots).
        if (revision <= this.snapshotRevision) return
        this.revision = Math.max(this.revision, revision)
        this.emit()
        this.handlers.onRemoteOp(msg.op as Op, revision)
        return
      }
      case 'reject':
        this.pending = Math.max(0, this.pending - 1)
        this.emit()
        return this.handlers.onRejected(String(msg.reason ?? 'rejected'))
      case 'saved':
        this.savedRevision = Math.max(this.savedRevision, Number(msg.revision))
        this.emit()
        return
      case 'ack':
        this.pending = Math.max(0, this.pending - 1)
        this.revision = Math.max(this.revision, Number(msg.revision))
        this.emit()
        return
      case 'deleted':
        return this.handlers.onDeleted()
      default:
        return
    }
  }
}
