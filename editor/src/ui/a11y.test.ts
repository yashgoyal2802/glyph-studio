import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every button must have a name a screen reader can announce: an aria-label, or visible text. Buttons that only contain an
 * icon must have the aria-label. This reads the component source, so a new unlabeled icon button fails the build.
 */
const dir = join(__dirname)
const files = readdirSync(dir).filter((f) => f.endsWith('.svelte'))

function buttons(src: string): { tag: string; inner: string; line: number }[] {
  const out: { tag: string; inner: string; line: number }[] = []
  const re = /<button\b([^>]*(?:\{[^}]*\}[^>]*)*)>([\s\S]*?)<\/button>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    out.push({ tag: m[1], inner: m[2], line: src.slice(0, m.index).split('\n').length })
  }
  return out
}

/** Text a user would see: what is left after removing tags and Svelte blocks, keeping {expression} text as content. */
function visibleText(inner: string): string {
  return inner
    .replace(/<Icon\b[^>]*\/>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[#/:@][^}]*\}/g, ' ')
    .replace(/\{([^}]*)\}/g, '$1')
    .replace(/&[a-z]+;/g, 'x')
    .trim()
}

describe('buttons have accessible names', () => {
  for (const f of files) {
    it(f, () => {
      const src = readFileSync(join(dir, f), 'utf8')
      const bad: string[] = []
      for (const b of buttons(src)) {
        const labelled = /aria-label\s*=/.test(b.tag) || /aria-labelledby\s*=/.test(b.tag)
        const text = visibleText(b.inner)
        if (!labelled && text.length === 0) bad.push(`line ${b.line}: <button${b.tag.slice(0, 60)}…>`)
      }
      expect(bad, bad.join('\n')).toEqual([])
    })
  }
})

describe('the check itself', () => {
  it('flags an icon-only button and accepts labelled or texted ones', () => {
    const name = (src: string) => buttons(src).map((b) => /aria-label\s*=/.test(b.tag) || visibleText(b.inner).length > 0)
    expect(name('<button onclick={x}><Icon name="a" size={20} /></button>')).toEqual([false])
    expect(name('<button aria-label="Undo"><Icon name="a" /></button>')).toEqual([true])
    expect(name('<button><Icon name="a" /><span>Undo</span></button>')).toEqual([true])
    expect(name('<button onclick={() => (a = !a)}>{a ? "On" : "Off"}</button>')).toEqual([true])
  })
})
