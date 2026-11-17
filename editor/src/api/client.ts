import type { Design } from '../format/types'
import type { SavedHistory } from '../core/history'

export interface DesignSummary {
  id: string
  name: string
  frameCount: number
  modified: number
  /** First frame's pixels, base64 (625 bytes), for the library preview. */
  thumb: string
}

export interface DesignSnapshot {
  revision: number
  design: Design
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Talks to the phone's server. All URLs are relative, so the same code works inside the app's WebView
 * (http://127.0.0.1:port) and from a PC browser (http://<phone-ip>:port). The session cookie is sent automatically.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the phone. Check that the app is open and on the same Wi-Fi.')
  }
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (typeof body?.error === 'string') message = body.error
    } catch {
      /* body was not JSON; keep the status text */
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const listDesigns = () => request<DesignSummary[]>('/api/designs')
export const getDesign = (id: string) => request<DesignSnapshot>(`/api/designs/${encodeURIComponent(id)}`)
export const createDesign = (name?: string) => request<DesignSnapshot>('/api/designs', json(name ? { name } : {}))
export const duplicateDesign = (id: string) => request<DesignSnapshot>(`/api/designs/${encodeURIComponent(id)}/duplicate`, { method: 'POST' })
export const deleteDesign = (id: string) => request<void>(`/api/designs/${encodeURIComponent(id)}`, { method: 'DELETE' })
/** Preferences kept on the phone (the app's WebView forgets its own storage on every launch). */
export interface Settings { firstRunDone: boolean; autoClose: boolean; trayHintDone: boolean }
export const getSettings = () => request<Settings>('/api/settings')
export const putSettings = (patch: Partial<Settings>) =>
  request<Settings>('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
export const getHistory = (id: string) => request<SavedHistory>(`/api/designs/${encodeURIComponent(id)}/history`)
export const putHistory = (id: string, history: SavedHistory) =>
  request<void>(`/api/designs/${encodeURIComponent(id)}/history`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(history) })
export const renameDesign = (id: string, name: string) =>
  request<{ revision: number }>(`/api/designs/${encodeURIComponent(id)}/ops`, json({ t: 'rename', name }))

export interface SlotInfo {
  slot: number
  designId: string | null
  designName: string | null
}

export interface PreviewStatus {
  supported: boolean
  active: boolean
  designId: string | null
  frameId: string | null
  /** True while the phone plays the whole animation on the matrix. */
  playing: boolean
  message: string | null
}

export const listSlots = () => request<SlotInfo[]>('/api/slots')
export const assignSlot = (slot: number, designId: string | null) =>
  request<SlotInfo[]>(`/api/slots/${slot}`, { ...json({ designId }), method: 'PUT' })
export const getPreview = () => request<PreviewStatus>('/api/preview')
export const setPreview = (body: { enabled: false } | { enabled: true; designId: string; frameId: string | null; playing?: boolean }) =>
  request<PreviewStatus>('/api/preview', { ...json(body), method: 'PUT' })
export const openToyManager = () => request<{ ok: boolean }>('/api/device/open-toy-manager', { method: 'POST' })

export const saveDesign = (id: string) =>
  request<{ revision: number; saved: boolean }>(`/api/designs/${encodeURIComponent(id)}/save`, { method: 'POST' })

/** Add designs (as made by serializeDesign). The phone gives each one a new id, so nothing is ever overwritten. */
export const importDesigns = (designs: unknown[]) => request<DesignSummary[]>('/api/import', json(designs))

/** The design as pretty JSON text, ready to be written to a .glyph.json file. */
export const exportDesignText = async (id: string) =>
  JSON.stringify(await request<unknown>(`/api/designs/${encodeURIComponent(id)}/export`), null, 2)
/** The chosen designs in one list (a "pack"), as JSON text. */
export const exportManyText = async (ids: string[]) =>
  JSON.stringify(await Promise.all(ids.map((id) => request<unknown>(`/api/designs/${encodeURIComponent(id)}/export`))), null, 2)
/** Every design in one list (a "pack"), as JSON text. */
export const exportAllText = async () => JSON.stringify(await request<unknown>('/api/export'), null, 2)

export interface PcStatus {
  on: boolean
  url: string | null
  /** The 6-digit pairing code a computer must enter. */
  code: string | null
  /** How many computers are signed in. */
  paired: number
}

// PC editing controls exist only in the app's own screen; a paired computer gets 404 for these.
export const getPcStatus = () => request<PcStatus>('/api/pc/status')
export const startPcEditing = () => request<PcStatus>('/api/pc/start', { method: 'POST' })
export const stopPcEditing = () => request<PcStatus>('/api/pc/stop', { method: 'POST' })
export const disconnectPcs = () => request<PcStatus>('/api/pc/disconnect', { method: 'POST' })
