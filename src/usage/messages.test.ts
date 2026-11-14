import { describe, expect, it } from "vitest"
import { replyTurnMessages, type UsageMessage } from "./messages"

describe("replyTurnMessages", () => {
  it("keeps the newest finished turn and ignores the prompt after it", () => {
    expect(
      replyTurnMessages([
        { type: "user" },
        { type: "assistant", finish: "stop" },
        { type: "user" },
        { type: "assistant", finish: "tool-calls" },
        { type: "assistant", finish: "stop" },
        { type: "user" },
      ]),
    ).toHaveLength(2)
  })

  it("keeps the turn together and stops at the next prompt", () => {
    const messages: UsageMessage[] = [
      { type: "user" },
      { type: "assistant", finish: "stop" },
      { type: "system" },
      { type: "user" },
    ]
    expect(replyTurnMessages(messages).map((message) => message.type)).toEqual([
      "assistant",
      "system",
    ])
  })

  it("ignores the running step that has no footer yet", () => {
    const messages: UsageMessage[] = [
      { type: "user" },
      { type: "assistant", finish: "stop" },
      { type: "user" },
      { type: "assistant" },
    ]
    expect(replyTurnMessages(messages).map((message) => message.type)).toEqual(["assistant"])
  })

  it("counts a failed turn, because the host still draws its footer", () => {
    expect(
      replyTurnMessages([
        { type: "user" },
        { type: "assistant", error: { message: "provider failed" } },
      ]),
    ).toHaveLength(1)
  })

  it("returns nothing before the first footer", () => {
    expect(replyTurnMessages([{ type: "user" }])).toEqual([])
    expect(replyTurnMessages([{ type: "user" }, { type: "assistant" }])).toEqual([])
  })
})
