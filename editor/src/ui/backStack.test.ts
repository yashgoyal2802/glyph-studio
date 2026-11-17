import { describe, expect, it } from 'vitest'
import { handleBack, pushBack } from './backStack'

describe('back stack', () => {
  it('closes the most recent thing first and reports when nothing is left', () => {
    const closed: string[] = []
    const offA = pushBack(() => closed.push('a'))
    pushBack(() => closed.push('b'))
    expect(handleBack()).toBe(true)
    expect(closed).toEqual(['b'])
    offA() // closed some other way: it must not run again
    expect(handleBack()).toBe(false)
    expect(closed).toEqual(['b'])
  })
})
