// Generates the app icon from one definition: Android adaptive layers (background, foreground, themed/monochrome) and the
// editor favicon. The icon is the Glyph Matrix: a round LED display in a bezel showing a lit sparkle, with a red lamp.
// Usage: node tools/make_icon.mjs
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'

const SPARKLE = ['....#....', '....#....', '...###...', '..#####..', '#########', '..#####..', '...###...', '....#....', '....#....']
const N = 11, C = 5, P = 4.95, R = 1.95, HOLE = 5.4, BEZEL = 37.5, WELL = 35.2, LAMP = { x: 82, y: 26 }
const lit = new Set()
SPARKLE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') lit.add(`${x + 1},${y + 1}`) }))
const dots = []
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (Math.hypot(x - C, y - C) > HOLE) continue
  dots.push({ cx: +(54 + (x - C) * P).toFixed(2), cy: +(54 + (y - C) * P).toFixed(2), on: lit.has(`${x},${y}`) })
}
const on = dots.filter((d) => d.on), off = dots.filter((d) => !d.on)
const circle = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`
const path = (list, r) => list.map((d) => circle(d.cx, d.cy, r)).join('')
const SCALE = 0.88 // keeps the bezel inside the adaptive icon's safe circle
const MONO_SCALE = 0.9 // the themed layer, a touch larger than the colour one (Nothing's launcher draws it small inside its disc either way)

const res = 'android/app/src/main/res'
mkdirSync(`${res}/drawable`, { recursive: true }); mkdirSync(`${res}/mipmap-anydpi-v26`, { recursive: true })

const head = '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n'
const grad = (attr, x1, y1, x2, y2, stops) => `  <path android:pathData="M0,0h108v108h-108z">\n    <aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="${x1}" android:startY="${y1}" android:endX="${x2}" android:endY="${y2}">${stops.map(([o, c]) => `<item android:offset="${o}" android:color="${c}"/>`).join('')}</gradient></aapt:attr>\n  </path>\n`
const group = (body, k = SCALE) => `  <group android:pivotX="54" android:pivotY="54" android:scaleX="${k}" android:scaleY="${k}">\n${body}  </group>\n`
const fill = (color, d, alpha) => `    <path android:fillColor="${color}"${alpha ? ` android:fillAlpha="${alpha}"` : ''} android:pathData="${d}"/>\n`

// Background: graphite gradient.
writeFileSync(`${res}/drawable/ic_launcher_background.xml`, head + grad('bg', 0, 0, 108, 108, [[0, '#26262B'], [1, '#0A0A0C']]) + '</vector>\n')

// Foreground: bezel (gradient ring), dark well, unlit dots, lit dots with a soft glow, red lamp.
const bezelGrad = `    <path android:pathData="${circle(54, 54, BEZEL)}">\n      <aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="20" android:startY="20" android:endX="88" android:endY="88"><item android:offset="0" android:color="#6A6A73"/><item android:offset="0.5" android:color="#26262B"/><item android:offset="1" android:color="#0B0B0D"/></gradient></aapt:attr>\n    </path>\n`
writeFileSync(`${res}/drawable/ic_launcher_foreground.xml`, head + group(
  bezelGrad + fill('#050506', circle(54, 54, WELL)) + fill('#2C2C32', path(off, R * 0.95)) +
  fill('#FFFFFF', path(on, R * 1.55), '0.16') + fill('#FFFFFF', path(on, R * 1.28), '0.22') +
  fill('#E9E9EE', path(on, R * 1.05)) + fill('#FFFFFF', path(on, R * 0.66)) +
  fill('#FF2A34', circle(LAMP.x, LAMP.y, 7), '0.18') + fill('#FF2A34', circle(LAMP.x, LAMP.y, 5.2), '0.3') +
  fill('#FF3B44', circle(LAMP.x, LAMP.y, 3)) + fill('#FFD0D3', circle(LAMP.x - 0.7, LAMP.y - 0.7, 1)),
) + '</vector>\n')

// Themed (single colour) layer: ring, lit dots solid, unlit dots faint, lamp. Android tints it.
writeFileSync(`${res}/drawable/ic_launcher_monochrome.xml`, head + group(
  `    <path android:strokeColor="#FF000000" android:strokeWidth="4.2" android:pathData="${circle(54, 54, BEZEL - 1)}"/>\n` +
  fill('#40000000', path(off, R * 0.55)) + fill('#FF000000', path(on, R * 1.2)) + fill('#FF000000', circle(LAMP.x, LAMP.y, 4.4)),
  MONO_SCALE) + '</vector>\n')

// The old colour resource is replaced by the drawable above.
if (existsSync(`${res}/values/ic_launcher_background.xml`)) rmSync(`${res}/values/ic_launcher_background.xml`)
const adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@drawable/ic_launcher_background"/>\n    <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n</adaptive-icon>\n'
writeFileSync(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, adaptive)
writeFileSync(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`, adaptive)

// Favicon (and preview): the same picture as an SVG, with real blur for the glow.
const c = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26262B"/><stop offset="1" stop-color="#0A0A0C"/></linearGradient>
<linearGradient id="z" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A6A73"/><stop offset=".5" stop-color="#26262B"/><stop offset="1" stop-color="#0B0B0D"/></linearGradient>
<filter id="b" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>
<rect width="108" height="108" rx="24" fill="url(#g)"/>${c(54, 54, BEZEL, 'fill="url(#z)"')}${c(54, 54, WELL, 'fill="#050506"')}
${off.map((d) => c(d.cx, d.cy, +(R * 0.95).toFixed(2), 'fill="#2C2C32"')).join('')}
${on.map((d) => c(d.cx, d.cy, +(R * 1.5).toFixed(2), 'fill="#fff" opacity=".5" filter="url(#b)"') + c(d.cx, d.cy, +(R * 1.05).toFixed(2), 'fill="#E9E9EE"') + c(d.cx, d.cy, +(R * 0.66).toFixed(2), 'fill="#fff"')).join('')}
${c(LAMP.x, LAMP.y, 5.2, 'fill="#FF2A34" opacity=".9" filter="url(#b)"')}${c(LAMP.x, LAMP.y, 3, 'fill="#FF3B44"')}${c(LAMP.x - 0.7, LAMP.y - 0.7, 1, 'fill="#FFD0D3"')}</svg>\n`
writeFileSync('editor/public/favicon.svg', svg)
writeFileSync('tools/icon-preview.svg', svg)
console.log('dots', dots.length, 'lit', on.length)
