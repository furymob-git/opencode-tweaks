import type { Context } from "@opencode/plugin/tui/context"
import { describe, expect, it } from "vitest"
import { costTweak } from "./cost"
import { createSettingsStore } from "./settings"
import type { StoredSettings, TweakSetting } from "./types"

function setting(id: string): TweakSetting {
  const found = costTweak.settings.find((item) => item.id === id)
  if (!found) throw new Error(`Cost setting "${id}" is missing`)
  return found
}

/** A context that keeps the stored layer in memory and resolves options as given. */
function harness(stored: StoredSettings = {}, options: Record<string, unknown> = {}) {
  const state = structuredClone(stored)
  const context = {
    options,
    storage: {
      store: () => [state, async (mutate: (draft: StoredSettings) => void) => mutate(state)],
    },
  } as unknown as Context

  return { store: createSettingsStore(context), state }
}

describe("createSettingsStore", () => {
  it("reads a value the user chose before the tweak was split", () => {
    const { store } = harness({ tokens: { promptCost: false } })
    expect(store.read(costTweak, setting("prompt"))).toEqual({
      value: false,
      source: "user",
    })
  })

  it("prefers the new group over the old one", () => {
    const { store } = harness({ cost: { prompt: false }, tokens: { promptCost: true } })
    expect(store.read(costTweak, setting("prompt")).value).toBe(false)
  })

  it("falls back to a legacy option in opencode.json", () => {
    const { store } = harness({}, { tokens: { estimateCost: false } })
    expect(store.read(costTweak, setting("estimate"))).toEqual({
      value: false,
      source: "config",
    })
  })

  it("prefers a new option over a legacy stored value", () => {
    const { store } = harness({ tokens: { costDigits: 5 } }, { cost: { digits: 3 } })
    expect(store.read(costTweak, setting("digits"))).toEqual({ value: 3, source: "config" })
  })

  it("writes only the new group", async () => {
    const { store, state } = harness({ tokens: { promptCost: true } })
    await store.set(costTweak, setting("prompt"), false)

    expect(state).toEqual({ tokens: { promptCost: true }, cost: { prompt: false } })
    expect(store.read(costTweak, setting("prompt")).value).toBe(false)
  })

  it("resets both the new value and the legacy one", async () => {
    const { store, state } = harness({ cost: { prompt: false }, tokens: { promptCost: false } })
    await store.reset(costTweak, setting("prompt"))

    expect(state).toEqual({})
    expect(store.read(costTweak, setting("prompt"))).toEqual({ value: true, source: "default" })
  })

  it("keeps unrelated settings when resetting one", async () => {
    const { store, state } = harness({ tokens: { promptCost: false, costDigits: 4 } })
    await store.reset(costTweak, setting("prompt"))

    expect(state).toEqual({ tokens: { costDigits: 4 } })
    expect(store.read(costTweak, setting("digits")).value).toBe(4)
  })
})
