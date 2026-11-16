import { describe, expect, it } from "vitest"
import type { ModelPrice } from "../usage/cost"
import {
  cacheHitRate,
  type SpendMessage,
  type SpendSession,
  startOfDay,
  summarize,
  windowStart,
} from "./report"

const at = (text: string) => new Date(`${text}T12:00:00`).getTime()
const tokens = (input: number, output: number, reasoning = 0, read = 0, write = 0) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

function assistant(
  created: string,
  cost: number,
  counts = tokens(1000, 500),
  model = { providerID: "opencode-go", id: "model-a" },
): SpendMessage {
  return {
    type: "assistant",
    cost,
    tokens: counts,
    model,
    time: { created: at(created) },
  }
}

function user(created: string): SpendMessage {
  return { type: "user", time: { created: at(created) } }
}

function session(id: string, messages: readonly SpendMessage[]): SpendSession {
  return { id, messages }
}

const price: ModelPrice = {
  input: 1,
  output: 2,
  cache: { read: 0.5, write: 0.25 },
}

describe("startOfDay", () => {
  it("returns local midnight", () => {
    const start = startOfDay(at("2026-11-16"))
    const date = new Date(start)
    expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([0, 0, 0])
    expect(date.getDate()).toBe(16)
  })
})

describe("windowStart", () => {
  it("includes today and the six days before it", () => {
    expect(windowStart(at("2026-11-16"), 7)).toBe(at("2026-11-10") - 12 * 60 * 60 * 1000)
  })

  it("covers one day when asked for less", () => {
    expect(windowStart(at("2026-11-16"), 0)).toBe(at("2026-11-16") - 12 * 60 * 60 * 1000)
  })
})

describe("summarize", () => {
  const from = at("2026-11-10")
  const to = at("2026-11-16")

  it("adds costs, tokens, turns, and sessions in the window", () => {
    const summary = summarize(
      [
        session("one", [
          user("2026-11-10"),
          assistant("2026-11-10", 0.5, tokens(1000, 200, 100, 400, 50)),
          user("2026-11-11"),
          assistant("2026-11-11", 0.25, tokens(2000, 300, 50, 600, 100)),
        ]),
        session("two", [user("2026-11-12"), assistant("2026-11-12", 0.75)]),
      ],
      from,
      to,
    )

    expect(summary.cost).toBe(1.5)
    expect(summary.tokens).toEqual({
      input: 4000,
      output: 1000,
      reasoning: 150,
      cacheRead: 1000,
      cacheWrite: 150,
    })
    expect(summary.generated).toBe(1150)
    expect(summary.turns).toBe(3)
    expect(summary.sessions).toBe(2)
    expect(summary.messages).toBe(3)
  })

  it("leaves out messages outside the window", () => {
    const summary = summarize(
      [
        session("one", [
          assistant("2026-11-09", 9),
          assistant("2026-11-10", 1),
          assistant("2026-11-16", 2),
          assistant("2026-11-17", 8),
        ]),
      ],
      from,
      to,
    )

    expect(summary.cost).toBe(3)
    expect(summary.messages).toBe(2)
    expect(summary.sessions).toBe(1)
  })

  it("counts a session only when it has a message in the window", () => {
    const summary = summarize(
      [session("old", [assistant("2026-11-01", 4)]), session("new", [user("2026-11-16")])],
      from,
      to,
    )

    expect(summary.sessions).toBe(1)
    expect(summary.turns).toBe(1)
    expect(summary.messages).toBe(0)
  })

  it("ignores messages without a creation time", () => {
    const summary = summarize(
      [session("one", [{ type: "assistant", cost: 3, tokens: tokens(1, 1) }])],
      from,
      to,
    )

    expect(summary.cost).toBe(0)
    expect(summary.sessions).toBe(0)
  })

  it("estimates a cost the provider did not report", () => {
    const summary = summarize(
      [session("one", [assistant("2026-11-16", 0, tokens(1_000_000, 1_000_000))])],
      from,
      to,
      () => price,
    )

    // 1M input at $1, 1M output at $2.
    expect(summary.cost).toBeCloseTo(3)
  })

  it("keeps a reported cost even when a price is available", () => {
    const summary = summarize(
      [session("one", [assistant("2026-11-16", 0.25, tokens(1_000_000, 1_000_000))])],
      from,
      to,
      () => price,
    )

    expect(summary.cost).toBe(0.25)
  })

  it("splits cost and generated tokens by model", () => {
    const summary = summarize(
      [
        session("one", [
          assistant("2026-11-16", 0.5, tokens(10, 100, 20), {
            providerID: "opencode-go",
            id: "model-a",
          }),
          assistant("2026-11-16", 0.75, tokens(10, 50), {
            providerID: "opencode-go",
            id: "model-b",
          }),
          assistant("2026-11-16", 0.25, tokens(10, 10), {
            providerID: "opencode-go",
            id: "model-a",
          }),
        ]),
      ],
      from,
      to,
    )

    expect(summary.models).toEqual([
      {
        providerID: "opencode-go",
        modelID: "model-a",
        cost: 0.75,
        tokens: 130,
      },
      {
        providerID: "opencode-go",
        modelID: "model-b",
        cost: 0.75,
        tokens: 50,
      },
    ])
  })
})

describe("cacheHitRate", () => {
  it("reads the cache share of the prompt", () => {
    expect(
      cacheHitRate({ input: 250, output: 0, reasoning: 0, cacheRead: 750, cacheWrite: 0 }),
    ).toBe(75)
  })

  it("has no rate without prompt tokens", () => {
    expect(
      cacheHitRate({ input: 0, output: 10, reasoning: 0, cacheRead: 0, cacheWrite: 0 }),
    ).toBeUndefined()
  })
})
