import { describe, expect, it } from "vitest"
import type { MessageTokens, UsageMessage } from "./messages"
import { formatTokens, replyTurnTokens, sessionTokens } from "./tokens"

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

const history: UsageMessage[] = [
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

describe("replyTurnTokens", () => {
  const turn: UsageMessage[] = [
    { type: "user" },
    { type: "assistant", tokens: usage(100, 20), finish: "stop" },
    { type: "user" },
    { type: "assistant", tokens: usage(10, 2, 1, 200, 3) },
    { type: "assistant", tokens: usage(4, 1), finish: "stop" },
  ]

  it("sums only the assistant messages of the newest reply", () => {
    expect(replyTurnTokens(turn, "all")).toBe(221)
    expect(replyTurnTokens(turn, "new")).toBe(21)
  })

  it("keeps counting after tool calls and synthetic messages", () => {
    expect(
      replyTurnTokens(
        [
          { type: "user" },
          { type: "assistant", tokens: usage(50, 10), finish: "tool-calls" },
          { type: "system" },
          { type: "assistant", tokens: usage(5, 1), finish: "stop" },
        ],
        "new",
      ),
    ).toBe(66)
  })

  it("falls back to the whole session when no prompt is left", () => {
    expect(
      replyTurnTokens(
        [
          { type: "assistant", tokens: usage(30, 3) },
          { type: "assistant", tokens: usage(2, 1), finish: "stop" },
        ],
        "new",
      ),
    ).toBe(36)
  })

  it("keeps the previous reply while a new prompt is unanswered", () => {
    expect(
      replyTurnTokens(
        [{ type: "assistant", tokens: usage(90, 9), finish: "stop" }, { type: "user" }],
        "all",
      ),
    ).toBe(99)
  })

  it("keeps the previous reply while the next step is still running", () => {
    expect(
      replyTurnTokens(
        [
          { type: "user" },
          { type: "assistant", tokens: usage(90, 9), finish: "stop" },
          { type: "user" },
          { type: "assistant", tokens: usage(5, 1) },
        ],
        "all",
      ),
    ).toBe(99)
  })

  it("returns zero before the first finished reply", () => {
    expect(replyTurnTokens([{ type: "user" }], "all")).toBe(0)
    expect(
      replyTurnTokens([{ type: "user" }, { type: "assistant", tokens: usage(5, 1) }], "all"),
    ).toBe(0)
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
