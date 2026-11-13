import { describe, expect, it } from "vitest"
import { barParts, formatPercent, formatReset, levelOf } from "./format"

const now = Date.UTC(2026, 0, 1, 12, 0, 0)

function resetIn(minutes: number): string {
  return new Date(now + minutes * 60_000).toISOString()
}

describe("formatPercent", () => {
  it("drops a zero decimal and keeps a real one", () => {
    expect(formatPercent(98)).toBe("98%")
    expect(formatPercent(99.2)).toBe("99.2%")
    expect(formatPercent(100)).toBe("100%")
    expect(formatPercent(0)).toBe("0%")
  })

  it("clamps values outside the scale", () => {
    expect(formatPercent(-4)).toBe("0%")
    expect(formatPercent(120)).toBe("100%")
  })
})

describe("formatReset", () => {
  it("keeps hours and minutes below twelve hours", () => {
    expect(formatReset(resetIn(68), now)).toBe("1h 8m")
    expect(formatReset(resetIn(719), now)).toBe("11h 59m")
  })

  it("uses whole hours from twelve hours", () => {
    expect(formatReset(resetIn(720), now)).toBe("12h")
    expect(formatReset(resetIn(60), now)).toBe("1h")
    expect(formatReset(resetIn(59), now)).toBe("59m")
  })

  it("uses one decimal day from a day", () => {
    expect(formatReset(resetIn(1440), now)).toBe("1.0d")
    expect(formatReset(resetIn(3 * 1440), now)).toBe("3.0d")
    expect(formatReset(resetIn(29.6 * 1440), now)).toBe("29.6d")
  })

  it("says now for a past reset", () => {
    expect(formatReset(new Date(now - 1_000).toISOString(), now)).toBe("now")
  })
})

describe("barParts", () => {
  it("fills the rounded share and leaves the rest empty", () => {
    expect(barParts(96, 25)).toEqual({ filled: "━".repeat(24), empty: "─".repeat(1) })
    expect(barParts(98, 25)).toEqual({ filled: "━".repeat(25), empty: "" })
    expect(barParts(0, 4)).toEqual({ filled: "", empty: "────" })
  })
})

describe("levelOf", () => {
  it("uses the sidebar thresholds", () => {
    expect(levelOf(100)).toBe("good")
    expect(levelOf(50)).toBe("good")
    expect(levelOf(49)).toBe("warning")
    expect(levelOf(20)).toBe("warning")
    expect(levelOf(19)).toBe("low")
  })
})
