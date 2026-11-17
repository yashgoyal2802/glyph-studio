// Dev helper: serves editor/dist with a fake phone (library, one design, websocket) on http://localhost:5599, so the editor can be
// checked at any window size in a normal browser. Run `npm run build` in editor/ first, then `node tools/layout_mock.mjs`.
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const dist = fileURLToPath(new URL('../editor/dist', import.meta.url))
const px = (cells) => { const a = new Uint8Array(625); for (const [x,y,v] of cells) a[y*25+x]=v; return Buffer.from(a).toString('base64') }
const design = { format: 1, id: 'd1', name: 'Heart', created: 1, modified: 2, matrix: { w: 25, h: 25 }, anim: { loop: 'loop' }, frames: [1,2,3].map((n) => ({ id: 'f'+n, durationMs: 200, layers: [{ id: 'l'+n, type: 'pixels', data: px([[12,10,255],[11,11,255],[13,11,255],[12,12,255],[10,10,255],[14,10,255]]) }] })) }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
http.createServer((req, res) => {
  const u = req.url.split('?')[0]
  const j = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)) }
  if (u === '/api/designs' && process.env.EMPTY) return j([])
  if (u === '/api/designs') return j([{ id: 'd1', name: 'Heart', frameCount: 3, modified: Date.now(), thumb: px([[12,12,255]]) }, { id: 'd2', name: 'Diwali lamp', frameCount: 2, modified: Date.now()-3600000, thumb: px([[10,10,255]]) }])
  if (u === '/api/designs/d1') return j({ revision: 1, design })
  if (u.endsWith('/history')) return j({ undo: [], redo: [] })
  if (u === '/api/settings') return j({ firstRunDone: true, autoClose: false })
  if (u === '/api/preview') return j({ supported: false, active: false, designId: null, frameId: null, playing: false, message: null })
  if (u.startsWith('/api/')) { res.statusCode = 404; return j({ error: 'mock' }) }
  let f = path.join(dist, u === '/' ? 'index.html' : u)
  if (!fs.existsSync(f)) f = path.join(dist, 'index.html')
  res.setHeader('content-type', mime[path.extname(f)] || 'application/octet-stream'); res.end(fs.readFileSync(f))
}).on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key']
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  const CRLF = String.fromCharCode(13, 10)
  sock.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade','Sec-WebSocket-Accept: ' + accept,'',''].join(CRLF))
  const send = (o) => { const b = Buffer.from(JSON.stringify(o)); const h = b.length < 126 ? Buffer.from([0x81, b.length]) : b.length < 65536 ? Buffer.from([0x81, 126, b.length >> 8, b.length & 255]) : (() => { const x = Buffer.alloc(10); x[0]=0x81; x[1]=127; x.writeBigUInt64BE(BigInt(b.length), 2); return x })(); sock.write(Buffer.concat([h, b])) }
  send({ type: 'snapshot', revision: 1, design })
  sock.on('data', (d) => { try { const op = d[0] & 15; if (op === 1) { const len = d[1] & 127; const m = d.slice(2, 6); const p = d.slice(6, 6 + len).map((v, i) => v ^ m[i % 4]); if (String.fromCharCode(...p).includes('"ping"')) send({ type: 'pong' }) } } catch {} })
  sock.on('error', () => {})
}).listen(5599, () => console.log('up'))
