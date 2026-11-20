import { describe, expect, it } from "vitest"
import {
  dayBefore,
  dayLabel,
  type HistoryEntry,
  historyDays,
  historySeries,
  historySpent,
  rangeLabel,
  recordHistory,
  weekDays,
} from "./history"

const day = (text: string) => new Date(`${text}T12:00:00`).getTime()

function entry(resetsAt: string, days: Record<string, [number, number]>): HistoryEntry {
  return {
    resetsAt,
    days: Object.fromEntries(
      Object.entries(days).map(([key, [first, last]]) => [key, { first, last }]),
    ),
  }
}

describe("historyDays", () => {
  it("ends today and walks back across a month boundary", () => {
    expect(historyDays(day("2026-11-03"), 3)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"])
  })

  it("covers one day when asked for less", () => {
    expect(historyDays(day("2026-11-03"), 0)).toEqual(["2026-11-03"])
  })
})

describe("weekDays", () => {
  it("starts the week on Monday", () => {
    expect(weekDays(day("2026-11-20"))).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ])
  })

  it("keeps Sunday in the week that started six days earlier", () => {
    expect(weekDays(day("2026-11-22"))[0]).toBe("2026-11-16")
    expect(weekDays(day("2026-11-16"))[0]).toBe("2026-11-16")
  })
})

describe("recordHistory", () => {
  it("keeps the first reading of a day and updates the last", () => {
    const first = recordHistory(
      undefined,
      "2026-12-12T13:44:56.000Z",
      "2026-11-16",
      96,
      day("2026-11-16"),
    )
    expect(first.days["2026-11-16"]).toEqual({ first: 96, last: 96 })

    const next = recordHistory(
      first,
      "2026-12-12T13:44:56.000Z",
      "2026-11-16",
      94.5,
      day("2026-11-16"),
    )
    expect(next.days["2026-11-16"]).toEqual({ first: 96, last: 94.5 })
  })

  it("returns the same entry when the reading did not move", () => {
    const first = recordHistory(undefined, "reset", "2026-11-16", 96, day("2026-11-16"))
    expect(recordHistory(first, "reset", "2026-11-16", 96, day("2026-11-16"))).toBe(first)
  })

  it("starts over when the window resets", () => {
    const old = entry("reset-1", { "2026-11-15": [10, 5] })
    const next = recordHistory(old, "reset-2", "2026-11-16", 99, day("2026-11-16"))

    expect(next.resetsAt).toBe("reset-2")
    expect(next.days).toEqual({ "2026-11-16": { first: 99, last: 99 } })
  })

  it("drops readings older than the retention window", () => {
    const old = entry("reset", { "2026-09-01": [10, 9] })
    const next = recordHistory(old, "reset", "2026-11-16", 96, day("2026-11-16"))

    expect(next.days["2026-09-01"]).toBeUndefined()
    expect(next.days["2026-11-16"]).toEqual({ first: 96, last: 96 })
  })

  it("clamps a reading to the quota range", () => {
    const next = recordHistory(undefined, "reset", "2026-11-16", 120, day("2026-11-16"))
    expect(next.days["2026-11-16"]).toEqual({ first: 100, last: 100 })
  })
})

describe("historySeries", () => {
  it("subtracts the previous day's last reading", () => {
    const data = entry("reset", {
      "2026-11-14": [10, 8],
      "2026-11-15": [8, 5],
      "2026-11-16": [5, 4],
    })

    expect(historySeries(data, ["2026-11-14", "2026-11-15", "2026-11-16"])).toEqual([2, 3, 1])
  })

  it("uses the day's own first reading when the previous day has none", () => {
    const data = entry("reset", { "2026-11-16": [5, 4] })
    expect(historySeries(data, ["2026-11-15", "2026-11-16"])).toEqual([undefined, 1])
  })

  it("never reports negative spending", () => {
    const data = entry("reset", { "2026-11-16": [4, 5] })
    expect(historySeries(data, ["2026-11-16"])).toEqual([0])
  })

  it("returns empty days without an entry", () => {
    expect(historySeries(undefined, ["2026-11-15", "2026-11-16"])).toEqual([undefined, undefined])
  })
})

describe("historySpent", () => {
  it("adds the defined days only", () => {
    expect(historySpent([1, undefined, 2.5])).toBe(3.5)
  })
})

describe("dayLabel", () => {
  it("names today and yesterday", () => {
    expect(dayLabel("2026-11-20", "2026-11-20")).toBe("Today")
    expect(dayLabel("2026-11-19", "2026-11-20")).toBe("Yest.")
  })

  it("names an older day with its weekday and date", () => {
    expect(dayLabel("2026-11-18", "2026-11-20")).toBe("Wed 18")
  })

  it("keeps an unreadable key as it is", () => {
    expect(dayLabel("not-a-day", "2026-11-20")).toBe("not-a-day")
  })
})

describe("dayBefore", () => {
  it("steps back one local day", () => {
    expect(dayBefore("2026-11-20")).toBe("2026-11-19")
    expect(dayBefore("2026-12-01")).toBe("2026-11-30")
  })

  it("gives nothing for an unreadable key", () => {
    expect(dayBefore("not-a-day")).toBeUndefined()
  })
})

describe("rangeLabel", () => {
  it("drops the repeated month", () => {
    expect(rangeLabel(["2026-11-16", "2026-11-22"])).toBe("Nov 16-22")
  })

  it("names both months across a boundary", () => {
    expect(rangeLabel(["2026-11-30", "2026-12-06"])).toBe("Nov 30 - Dec 6")
  })

  it("stays empty without days", () => {
    expect(rangeLabel([])).toBe("")
  })
})
