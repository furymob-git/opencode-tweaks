import { describe, expect, it } from "vitest"
import {
  type HistoryEntry,
  historyDays,
  historyLabel,
  historySeries,
  historySpent,
  recordHistory,
  sparkline,
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

describe("sparkline", () => {
  it("maps the largest day to a full block and a quiet day to the lowest one", () => {
    expect(sparkline([0, 2, 4], 3)).toBe("▁▅█")
  })

  it("leaves missing days blank", () => {
    expect(sparkline([undefined, 1], 2)).toBe(" █")
  })

  it("keeps a tiny day from filling the row", () => {
    expect(sparkline([0.1, 0.1], 2)).toBe("▂▂")
  })

  it("scales against the day's allowance", () => {
    expect(sparkline([0.1], 1, 3.36)).toBe("▂")
    expect(sparkline([1, 2], 2, 4)).toBe("▃▅")
  })

  it("draws a dot for a missing day when asked", () => {
    expect(sparkline([undefined, 0.1], 2, 1, "·")).toBe("·▂")
  })

  it("groups days into fewer columns", () => {
    expect(sparkline([1, 1, 2, 2], 2)).toBe("▅█")
  })

  it("handles an empty series", () => {
    expect(sparkline([], 7)).toBe("")
  })
})

describe("historyLabel", () => {
  it("names a week and two weeks", () => {
    expect(historyLabel(7)).toBe("wk")
    expect(historyLabel(14)).toBe("2wk")
  })
})
