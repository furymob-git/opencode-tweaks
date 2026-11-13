import { describe, expect, it } from "vitest"
import { consoleWindows, keyWindows } from "./parse"

const reset = "2026-01-01T13:00:00.000Z"

describe("consoleWindows", () => {
  it("turns used microcents into remaining percent", () => {
    const windows = consoleWindows(
      {
        fiveHour: { limitMicroCents: 100, usedMicroCents: 2, resetsAt: reset },
        week: { limitMicroCents: 100, usedMicroCents: 4 },
        month: { limitMicroCents: 0, usedMicroCents: 0, resetsAt: reset },
      },
      reset,
    )

    expect(windows.map((window) => [window.key, window.percentRemaining])).toEqual([
      ["5h", 98],
      ["7d", 96],
      ["30d", 100],
    ])
    expect(windows[1]?.resetsAt).toBe(reset)
  })

  it("skips malformed meters", () => {
    const windows = consoleWindows(
      {
        fiveHour: { limitMicroCents: "bad", usedMicroCents: 1, resetsAt: reset },
        week: { limitMicroCents: 100, usedMicroCents: 4, resetsAt: "not a date" },
        month: { limitMicroCents: 100, usedMicroCents: 2, resetsAt: reset },
      },
      undefined,
    )

    expect(windows.map((window) => window.key)).toEqual(["30d"])
  })
})

describe("keyWindows", () => {
  it("turns used percent into remaining percent", () => {
    const windows = keyWindows({
      rolling: { status: "ok", percent: 2, resetsAt: reset },
      weekly: { status: "ok", percent: 4, resetsAt: reset },
      monthly: { status: "rate-limited", percent: 100, resetsAt: reset },
    })

    expect(windows.map((window) => [window.key, window.percentRemaining])).toEqual([
      ["5h", 98],
      ["7d", 96],
      ["30d", 0],
    ])
  })

  it("skips out-of-range percents", () => {
    const windows = keyWindows({
      rolling: { status: "ok", percent: 101, resetsAt: reset },
      weekly: { status: "ok", percent: 4, resetsAt: reset },
    })

    expect(windows.map((window) => window.key)).toEqual(["7d"])
  })
})
