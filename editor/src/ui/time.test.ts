import { describe, expect, it } from 'vitest'
import { timeAgo } from './time'

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0)
const ago = (ms: number) => timeAgo(NOW - ms, NOW)

describe('timeAgo', () => {
  it('says just now for the last few seconds, and for clock skew into the future', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(30_000)).toBe('just now')
    expect(timeAgo(NOW + 5000, NOW)).toBe('just now')
  })
  it('uses minutes, hours and days', () => {
    expect(ago(60_000)).toBe('1 min ago')
    expect(ago(5 * 60_000)).toBe('5 min ago')
    expect(ago(59 * 60_000)).toBe('59 min ago')
    expect(ago(60 * 60_000)).toBe('1 h ago')
    expect(ago(5 * 3_600_000)).toBe('5 h ago')
    expect(ago(24 * 3_600_000)).toBe('1 d ago')
    expect(ago(3 * 86_400_000)).toBe('3 d ago')
  })
  it('falls back to a date after a week', () => {
    const s = ago(10 * 86_400_000)
    expect(s).toMatch(/2026/)
    expect(s).not.toMatch(/ago/)
  })
})
