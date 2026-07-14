import { describe, expect, it } from 'vitest'
import { toDateKey } from './dateKey'

describe('toDateKey', () => {
  it('formats a date as local YYYY-MM-DD', () => {
    const date = new Date(2026, 6, 15, 23, 59, 0) // July 15 2026, 23:59 local time
    expect(toDateKey(date)).toBe('2026-07-15')
  })

  it('pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5, 8, 0, 0) // Jan 5 2026
    expect(toDateKey(date)).toBe('2026-01-05')
  })

  it('uses local time, not UTC, near midnight', () => {
    // A naive `date.toISOString().slice(0, 10)` implementation would shift this
    // to the 14th or 16th depending on the machine's UTC offset. toDateKey must not.
    const date = new Date(2026, 6, 15, 0, 30, 0)
    expect(toDateKey(date)).toBe('2026-07-15')
  })
})
