import { describe, expect, it } from "vitest"
import { estimateCost, formatCost, formatRate, messagesCost, priceFor } from "./cost"
import { type MessageTokens, replyTurnMessages, type UsageMessage } from "./messages"

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

describe("messagesCost", () => {
  it("sums the reported cost of the messages", () => {
    expect(
      messagesCost([
        { type: "assistant", cost: 0.0004 },
        { type: "assistant", cost: 0.0002 },
      ]),
    ).toBeCloseTo(0.0006)
  })

  it("estimates only the messages the provider left unpriced", () => {
    const price = { input: 0.15, output: 0.6, cache: { read: 0, write: 0 } }

    expect(
      messagesCost(
        [
          { type: "assistant", tokens: usage(1_000_000, 0), cost: 0 },
          { type: "assistant", tokens: usage(1_000_000, 0), cost: 0.5 },
        ],
        () => price,
      ),
    ).toBeCloseTo(0.65)
  })

  it("keeps the reported cost when no price is known", () => {
    expect(
      messagesCost([{ type: "assistant", tokens: usage(10, 1), cost: 0 }], () => undefined),
    ).toBe(0)
  })

  it("prices the turn the newest footer belongs to", () => {
    const messages: UsageMessage[] = [
      { type: "user" },
      { type: "assistant", cost: 0.01, finish: "stop" },
      { type: "user" },
    ]
    expect(messagesCost(replyTurnMessages(messages))).toBeCloseTo(0.01)
  })

  it("does not add a missing cost twice", () => {
    expect(messagesCost([{ type: "assistant" }])).toBe(0)
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

describe("formatRate", () => {
  it("keeps two decimals for a normal rate", () => {
    expect(formatRate(0.15)).toBe("$0.15")
    expect(formatRate(0.6)).toBe("$0.60")
    expect(formatRate(1.98)).toBe("$1.98")
  })

  it("keeps sub-cent rates readable", () => {
    expect(formatRate(0.003)).toBe("$0.003")
    expect(formatRate(0.0028)).toBe("$0.0028")
    expect(formatRate(0.003625)).toBe("$0.003625")
  })

  it("does not invent decimals on a free rate", () => {
    expect(formatRate(0)).toBe("$0")
  })
})
