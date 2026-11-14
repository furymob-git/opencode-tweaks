import { describe, expect, it } from "vitest"
import { formatPriceWindow, priceWindowFor, turnPriceWindow } from "./price-window"

const at = (value: string) => new Date(value)
const flash = { providerID: "deepseek", id: "deepseek-flash" }
const goFlash = { providerID: "opencode-go", id: "deepseek-v4.1-flash" }
const step = (created: string, model = flash) => ({
  type: "assistant",
  model,
  time: { created: Date.parse(created) },
})

describe("priceWindowFor", () => {
  it("marks both peak windows on a weekday", () => {
    expect(priceWindowFor(flash, at("2026-11-16T01:00:00Z"))).toEqual({
      label: "peak",
      multiplier: 2,
    })
    expect(priceWindowFor(flash, at("2026-11-16T03:59:59Z"))).toEqual({
      label: "peak",
      multiplier: 2,
    })
    expect(priceWindowFor(flash, at("2026-11-16T06:00:00Z"))).toEqual({
      label: "peak",
      multiplier: 2,
    })
    expect(priceWindowFor(flash, at("2026-11-16T09:59:59Z"))).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("keeps the gaps and the exact window ends at the catalog rate", () => {
    expect(priceWindowFor(flash, at("2026-11-16T00:59:59Z"))).toBeUndefined()
    expect(priceWindowFor(flash, at("2026-11-16T04:00:00Z"))).toBeUndefined()
    expect(priceWindowFor(flash, at("2026-11-16T05:59:59Z"))).toBeUndefined()
    expect(priceWindowFor(flash, at("2026-11-16T10:00:00Z"))).toBeUndefined()
  })

  it("does not use the old 16:30-00:30 window", () => {
    expect(priceWindowFor(flash, at("2026-11-16T00:30:00Z"))).toBeUndefined()
    expect(priceWindowFor(flash, at("2026-11-16T16:30:00Z"))).toBeUndefined()
  })

  it("stays off-peak on weekends", () => {
    expect(priceWindowFor(flash, at("2026-11-14T02:00:00Z"))).toBeUndefined()
    expect(priceWindowFor(flash, at("2026-11-15T02:00:00Z"))).toBeUndefined()
  })

  it("follows the Chinese public holidays", () => {
    expect(priceWindowFor(flash, at("2026-02-17T02:00:00Z"))).toBeUndefined()
    expect(priceWindowFor(flash, at("2027-02-08T02:00:00Z"))).toBeUndefined()
  })

  it("returns to peak on the first weekday after a holiday", () => {
    expect(priceWindowFor(flash, at("2026-02-24T02:00:00Z"))).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("covers DeepSeek models served by OpenCode Go", () => {
    expect(priceWindowFor(goFlash, at("2026-11-16T02:00:00Z"))).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("leaves other providers and models alone", () => {
    expect(
      priceWindowFor({ providerID: "opencode-go", id: "kimi-k3" }, at("2026-11-16T02:00:00Z")),
    ).toBeUndefined()
    expect(
      priceWindowFor(
        { providerID: "openrouter", id: "deepseek/deepseek-v4.1-flash" },
        at("2026-11-16T02:00:00Z"),
      ),
    ).toBeUndefined()
    expect(priceWindowFor(undefined, at("2026-11-16T02:00:00Z"))).toBeUndefined()
  })
})

describe("turnPriceWindow", () => {
  it("marks a round that started in a peak window", () => {
    expect(turnPriceWindow([{ type: "user" }, step("2026-11-16T02:00:00Z")])).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("keeps the marker after the window closes", () => {
    expect(turnPriceWindow([step("2026-11-16T02:00:00Z")])).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("uses the first assistant step as the round start", () => {
    expect(turnPriceWindow([step("2026-11-16T02:00:00Z"), step("2026-11-16T04:30:00Z")])).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("leaves a round that started off-peak unmarked", () => {
    expect(turnPriceWindow([step("2026-11-16T12:00:00Z")])).toBeUndefined()
  })

  it("skips a step without a start time", () => {
    expect(turnPriceWindow([{ type: "assistant" }, step("2026-11-16T02:00:00Z")])).toEqual({
      label: "peak",
      multiplier: 2,
    })
  })

  it("falls back to the session model when the step has none", () => {
    expect(
      turnPriceWindow(
        [{ type: "assistant", time: { created: Date.parse("2026-11-16T02:00:00Z") } }],
        flash,
      ),
    ).toEqual({ label: "peak", multiplier: 2 })
  })

  it("needs a start time", () => {
    expect(turnPriceWindow([{ type: "assistant", model: flash }])).toBeUndefined()
    expect(turnPriceWindow([], flash)).toBeUndefined()
  })
})

describe("formatPriceWindow", () => {
  it("writes the multiplier beside the label", () => {
    expect(formatPriceWindow({ label: "peak", multiplier: 2 })).toBe("peak ×2")
  })
})
