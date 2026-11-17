import { describe, expect, it } from 'vitest'
import { draggedHeight, settlesOpen } from './tray'

describe('draggedHeight', () => {
  it('dragging up opens the tray, dragging down closes it, one pixel per pixel', () => {
    expect(draggedHeight(0, -120, 300)).toBe(120)
    expect(draggedHeight(300, 80, 300)).toBe(220)
    expect(draggedHeight(100, -10, 300)).toBe(110)
  })
  it('never goes past fully open or fully closed', () => {
    expect(draggedHeight(0, -9999, 300)).toBe(300)
    expect(draggedHeight(300, 9999, 300)).toBe(0)
    expect(draggedHeight(0, 50, 300)).toBe(0) // pulling a closed tray down does nothing
    expect(draggedHeight(300, -50, 300)).toBe(300) // pulling an open tray up does nothing
  })
})

describe('settlesOpen', () => {
  it('without a flick, goes to the nearer end', () => {
    expect(settlesOpen(0, 200, 300)).toBe(true)
    expect(settlesOpen(0, 100, 300)).toBe(false)
    expect(settlesOpen(0.1, 151, 300)).toBe(true)
    expect(settlesOpen(-0.1, 149, 300)).toBe(false)
  })
  it('a quick flick decides the direction even from the middle or the wrong half', () => {
    expect(settlesOpen(-0.9, 30, 300)).toBe(true) // flicked up while nearly closed
    expect(settlesOpen(0.9, 280, 300)).toBe(false) // flicked down while nearly open
  })
  it('exactly halfway closes (a half-opened tray was not an intentional open)', () => {
    expect(settlesOpen(0, 150, 300)).toBe(false)
  })
})
