import { describe, expect, it } from "vitest"
import {
  dailyAllowance,
  dayKey,
  endOfDay,
  isCurrent,
  isWorkday,
  longestWindow,
  paceProgress,
  paceSignature,
  startPace,
  weekdayOf,
  workdaysUntil,
} from "./pace"

// Monday 5 January 2026, 10:00 local time.
const monday = new Date(2026, 0, 5, 10, 0, 0).getTime()
const everyDay = [true, true, true, true, true, true, true]
// Index 0 is Sunday, like `Date#getDay`.
const mondayWednesdayFriday = [false, true, false, true, false, true, false]

function resetAt(time: number): string {
  return new Date(time).toISOString()
}

describe("longestWindow", () => {
  it("picks the window with the longest nominal length", () => {
    const windows = [
      { key: "5h" as const, percentRemaining: 50, resetsAt: resetAt(monday + 2 * 3_600_000) },
      { key: "30d" as const, percentRemaining: 96, resetsAt: resetAt(monday + 30 * 86_400_000) },
      { key: "7d" as const, percentRemaining: 80, resetsAt: resetAt(monday + 7 * 86_400_000) },
    ]
    expect(longestWindow(windows)?.key).toBe("30d")
    expect(longestWindow(windows.slice(0, 1))?.key).toBe("5h")
    expect(longestWindow([])).toBeUndefined()
  })
})

describe("dayKey and endOfDay", () => {
  it("names the local calendar day", () => {
    expect(dayKey(new Date(2026, 10, 13, 23, 59).getTime())).toBe("2026-11-13")
    expect(dayKey(new Date(2026, 0, 1, 0, 0).getTime())).toBe("2026-01-01")
  })

  it("ends the day at the next local midnight", () => {
    const end = new Date(endOfDay(monday))
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(0)
    expect(dayKey(end.getTime())).toBe("2026-01-06")
  })
})

describe("workdaysUntil", () => {
  it("counts the selected weekdays up to the reset day", () => {
    const friday = new Date(2026, 0, 9, 12, 0).getTime()
    expect(workdaysUntil(monday, resetAt(friday), mondayWednesdayFriday)).toBe(3)
  })

  it("counts today when it is a workday and the reset lands today", () => {
    const evening = new Date(2026, 0, 5, 18, 0).getTime()
    expect(workdaysUntil(monday, resetAt(evening), mondayWednesdayFriday)).toBe(1)
  })

  it("skips the days that are not selected", () => {
    const tuesday = new Date(2026, 0, 6, 12, 0).getTime()
    expect(
      workdaysUntil(monday, resetAt(tuesday), [false, false, true, false, false, false, false]),
    ).toBe(1)
  })

  it("returns nothing for a reset in the past", () => {
    expect(workdaysUntil(monday, resetAt(monday - 1_000), everyDay)).toBe(0)
  })
})

describe("dailyAllowance", () => {
  it("spreads the remaining quota over the workdays", () => {
    expect(dailyAllowance(96, 0, 30)).toBeCloseTo(3.2)
    expect(dailyAllowance(70, 0, 20)).toBeCloseTo(3.5)
  })

  it("keeps the reserve out of the budget", () => {
    expect(dailyAllowance(96, 10, 20)).toBeCloseTo(4.3)
  })

  it("never goes below zero or above the whole quota", () => {
    expect(dailyAllowance(5, 10, 20)).toBe(0)
    expect(dailyAllowance(100, 0, 1)).toBe(100)
    expect(dailyAllowance(100, 0, 0)).toBe(0)
  })
})

describe("paceProgress", () => {
  const entry = {
    day: "2026-01-05",
    resetsAt: resetAt(monday + 30 * 86_400_000),
    signature: paceSignature(everyDay, 0),
    start: 96,
    allowance: 3.2,
  }

  it("measures what is left of the day's allowance", () => {
    const progress = paceProgress(entry, 95.4)
    expect(progress.spent).toBeCloseTo(0.6)
    expect(progress.left).toBeCloseTo(2.6)
    expect(progress.ratio).toBeCloseTo(81.25)
  })

  it("stops at zero once the allowance is spent", () => {
    const progress = paceProgress(entry, 90)
    expect(progress.spent).toBeCloseTo(6)
    expect(progress.left).toBe(0)
    expect(progress.ratio).toBe(0)
  })

  it("ignores a percentage that went back up", () => {
    expect(paceProgress(entry, 99).spent).toBe(0)
  })
})

describe("startPace", () => {
  it("freezes the start and the allowance for the day", () => {
    const entry = startPace(
      96,
      "2026-01-05",
      resetAt(monday + 30 * 86_400_000),
      paceSignature(mondayWednesdayFriday, 0),
      mondayWednesdayFriday,
      0,
      monday,
    )
    expect(entry.start).toBe(96)
    // 14 workdays between that Monday and the reset.
    expect(entry.allowance).toBeCloseTo(96 / 14)
  })

  it("gives a rest day no budget", () => {
    const saturday = new Date(2026, 0, 10, 10, 0).getTime()
    const entry = startPace(
      96,
      "2026-01-10",
      resetAt(saturday + 30 * 86_400_000),
      paceSignature(mondayWednesdayFriday, 0),
      mondayWednesdayFriday,
      0,
      saturday,
    )
    expect(entry.allowance).toBe(0)
    expect(isWorkday(saturday, mondayWednesdayFriday)).toBe(false)
  })
})

describe("isCurrent", () => {
  const entry = {
    day: "2026-01-05",
    resetsAt: resetAt(monday),
    signature: "sig",
    start: 96,
    allowance: 3,
  }

  it("accepts the same day, reset and settings", () => {
    expect(isCurrent(entry, "2026-01-05", resetAt(monday), "sig")).toBe(true)
  })

  it("rejects a new day, a new reset or new settings", () => {
    expect(isCurrent(entry, "2026-01-06", resetAt(monday), "sig")).toBe(false)
    expect(isCurrent(entry, "2026-01-05", resetAt(monday + 1), "sig")).toBe(false)
    expect(isCurrent(entry, "2026-01-05", resetAt(monday), "other")).toBe(false)
    expect(isCurrent(undefined, "2026-01-05", resetAt(monday), "sig")).toBe(false)
  })
})

describe("weekdayOf", () => {
  it("matches the Date weekday, with Sunday at 0", () => {
    expect(weekdayOf(monday)).toBe(1)
    expect(weekdayOf(new Date(2026, 0, 11, 12, 0).getTime())).toBe(0)
  })
})
