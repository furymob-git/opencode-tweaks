import { describe, expect, it } from "vitest"
import {
  estimateCost,
  formatCost,
  formatTokens,
  type MessageTokens,
  priceFor,
  sessionTokens,
  type TokenMessage,
  turnCost,
  turnMessages,
  turnTokens,
} from "./tokens-model"

const usage = (
  input: number,
  output: number,
  reasoning = 0,
  read = 0,
  write = 0,
): MessageTokens => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

const history: TokenMessage[] = [
  { type: "user" },
  { type: "assistant", tokens: usage(100, 20, 5, 1000, 50) },
  { type: "assistant", tokens: usage(10, 2) },
]

describe("sessionTokens", () => {
  it("adds every counter in the all mode", () => {
    expect(sessionTokens(history, "all")).toBe(1187)
  })

  it("skips cache reads in the default mode", () => {
    expect(sessionTokens(history, "new")).toBe(187)
  })

  it("keeps only the completion in the generated mode", () => {
    expect(sessionTokens(history, "generated")).toBe(27)
  })

  it("ignores messages without usage and non-assistant roles", () => {
    expect(
      sessionTokens(
        [{ type: "system" }, { type: "assistant" }, { type: "user", tokens: usage(500, 500) }],
        "all",
      ),
    ).toBe(0)
  })

  it("returns zero for an empty session", () => {
    expect(sessionTokens([], "all")).toBe(0)
  })
})

describe("turnTokens", () => {
  const turn: TokenMessage[] = [
    { type: "user" },
    { type: "assistant", tokens: usage(100, 20) },
    { type: "user" },
    { type: "assistant", tokens: usage(10, 2, 1, 200, 3) },
    { type: "assistant", tokens: usage(4, 1) },
  ]

  it("sums only the assistant messages after the last prompt", () => {
    expect(turnTokens(turn, "all")).toBe(221)
    expect(turnTokens(turn, "new")).toBe(21)
  })

  it("keeps counting after tool calls and synthetic messages", () => {
    expect(
      turnTokens(
        [
          { type: "user" },
          { type: "assistant", tokens: usage(50, 10) },
          { type: "system" },
          { type: "assistant", tokens: usage(5, 1) },
        ],
        "new",
      ),
    ).toBe(66)
  })

  it("falls back to the whole session when no prompt is left", () => {
    expect(
      turnTokens(
        [
          { type: "assistant", tokens: usage(30, 3) },
          { type: "assistant", tokens: usage(2, 1) },
        ],
        "new",
      ),
    ).toBe(36)
  })

  it("returns zero right after a prompt", () => {
    expect(turnTokens([{ type: "assistant", tokens: usage(90, 9) }, { type: "user" }], "all")).toBe(
      0,
    )
  })
})

describe("turnMessages", () => {
  it("keeps only the messages after the last prompt", () => {
    expect(
      turnMessages([
        { type: "user" },
        { type: "assistant" },
        { type: "user" },
        { type: "assistant" },
      ]),
    ).toHaveLength(1)
  })
})

describe("priceFor", () => {
  const base = { input: 0.15, output: 0.6, cache: { read: 0.003, write: 0.3 } }
  const long = { ...base, input: 0.3, tier: { size: 200_000 } }

  it("uses the base price below the tier", () => {
    expect(priceFor([base, long], 100_000)).toBe(base)
  })

  it("uses the tier once the context is large enough", () => {
    expect(priceFor([base, long], 250_000)).toBe(long)
    expect(priceFor([long, base], 250_000)).toBe(long)
  })

  it("falls back to the first price when no base exists", () => {
    expect(priceFor([long], 100_000)).toBe(long)
  })
})

describe("estimateCost", () => {
  const price = { input: 0.15, output: 0.6, cache: { read: 0.003, write: 0.3 } }

  it("prices every counter per million tokens", () => {
    const tokens = usage(1_000_000, 400_000, 100_000, 1_000_000, 1_000_000)
    expect(estimateCost(tokens, price)).toBeCloseTo(0.15 + 0.3 + 0.003 + 0.3)
  })
})

describe("turnCost", () => {
  it("sums the cost of the assistant messages after the last prompt", () => {
    expect(
      turnCost([
        { type: "user" },
        { type: "assistant", cost: 0.01 },
        { type: "user" },
        { type: "assistant", cost: 0.0004 },
        { type: "assistant", cost: 0.0002 },
      ]),
    ).toBeCloseTo(0.0006)
  })

  it("estimates only the messages the provider left unpriced", () => {
    const price = { input: 0.15, output: 0.6, cache: { read: 0, write: 0 } }

    expect(
      turnCost(
        [
          { type: "user" },
          { type: "assistant", tokens: usage(1_000_000, 0), cost: 0 },
          { type: "assistant", tokens: usage(1_000_000, 0), cost: 0.5 },
        ],
        () => price,
      ),
    ).toBeCloseTo(0.65)
  })

  it("keeps the reported cost when no price is known", () => {
    expect(
      turnCost(
        [{ type: "user" }, { type: "assistant", tokens: usage(10, 1), cost: 0 }],
        () => undefined,
      ),
    ).toBe(0)
  })

  it("falls back to the whole session when no prompt is left", () => {
    expect(turnCost([{ type: "assistant", cost: 0.02 }])).toBeCloseTo(0.02)
  })

  it("does not add a missing cost twice", () => {
    expect(turnCost([{ type: "user" }, { type: "assistant" }])).toBe(0)
  })
})

describe("formatCost", () => {
  it("keeps two decimals for normal amounts", () => {
    expect(formatCost(1.234)).toBe("$1.23")
    expect(formatCost(0.5)).toBe("$0.50")
    expect(formatCost(0.01)).toBe("$0.01")
  })

  it("auto stops at the first significant digit", () => {
    expect(formatCost(0.00416775)).toBe("$0.004")
    expect(formatCost(0.0004)).toBe("$0.0004")
    expect(formatCost(0.099)).toBe("$0.10")
  })

  it("honours a fixed number of decimals", () => {
    expect(formatCost(0.00416775, 4)).toBe("$0.0042")
    expect(formatCost(1.234, 3)).toBe("$1.234")
    expect(formatCost(0.5, 6)).toBe("$0.500000")
  })

  it("shows free models as zero", () => {
    expect(formatCost(0)).toBe("$0.00")
    expect(formatCost(-1)).toBe("$0.00")
  })
})

describe("formatTokens", () => {
  it("keeps small counts exact", () => {
    expect(formatTokens(0, "compact")).toBe("0")
    expect(formatTokens(842, "compact")).toBe("842")
  })

  it("scales compact counts to the largest unit with one decimal", () => {
    expect(formatTokens(1_000, "compact")).toBe("1K")
    expect(formatTokens(12_431, "compact")).toBe("12.4K")
    expect(formatTokens(1_234_567, "compact")).toBe("1.2M")
    expect(formatTokens(2_000_000_000, "compact")).toBe("2B")
  })

  it("writes every digit in exact style", () => {
    expect(formatTokens(12_431, "exact")).toBe("12,431")
    expect(formatTokens(1_234_567, "exact")).toBe("1,234,567")
  })

  it("never shows a negative total", () => {
    expect(formatTokens(-12, "compact")).toBe("0")
  })
})
