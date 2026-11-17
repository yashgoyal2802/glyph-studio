/**
 * RFC 4122 v4 id. Uses getRandomValues (works on plain http://, unlike crypto.randomUUID which needs a
 * secure context -- the PC editor is served over http://<phone-ip>).
 */
export function uuid(): string {
  const b = new Uint8Array(16)
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}
