import { describe, expect, it } from "vitest"
import { costTweak } from "./cost"
import { modelTweak } from "./model"
import { quotaTweak } from "./quota"
import { tokensTweak } from "./tokens"
import {
  choicesFor,
  defineTweak,
  displayValue,
  isSettingValue,
  nextValue,
  type Tweak,
  type TweakSetting,
} from "./types"

const toggle: TweakSetting = {
  id: "enabled",
  title: "Enabled",
  description: "Enable it.",
  category: "General",
  kind: "boolean",
  default: true,
}

const level: TweakSetting = {
  id: "level",
  title: "Level",
  description: "Pick a level.",
  category: "Display",
  kind: "select",
  default: "medium",
  values: ["low", "medium", "high"],
  labels: ["Low", "Medium", "High"],
}

const width: TweakSetting = {
  id: "width",
  title: "Width",
  description: "Bar width.",
  category: "Display",
  kind: "number",
  default: 10,
  min: 8,
  max: 12,
  step: 2,
}

function tweak(settings: readonly TweakSetting[]): Tweak {
  return {
    id: "demo",
    title: "Demo",
    description: "A test tweak.",
    category: "Demo",
    settings,
  }
}

describe("defineTweak", () => {
  it("accepts a valid definition", () => {
    expect(defineTweak(tweak([toggle, level, width])).id).toBe("demo")
  })

  it("rejects duplicate setting ids", () => {
    expect(() => defineTweak(tweak([toggle, toggle]))).toThrow("Duplicate setting")
  })

  it("rejects a select default outside its values", () => {
    expect(() => defineTweak(tweak([{ ...level, default: "huge" }]))).toThrow(
      "default outside its values",
    )
  })

  it("rejects labels that do not match values", () => {
    expect(() => defineTweak(tweak([{ ...level, labels: ["Low"] }]))).toThrow("mismatched labels")
  })

  it("rejects a number default outside its range", () => {
    expect(() => defineTweak(tweak([{ ...width, default: 20 }]))).toThrow(
      "default outside its range",
    )
  })

  it("rejects a legacy mapping for a setting that does not exist", () => {
    expect(() =>
      defineTweak({
        ...tweak([toggle]),
        legacy: { id: "old", settings: { missing: "enabled" } },
      }),
    ).toThrow("Legacy setting")
  })
})

describe("displayValue", () => {
  it("uses boolean labels", () => {
    expect(displayValue({ ...toggle, labels: ["off", "on"] }, true)).toBe("on")
    expect(displayValue({ ...toggle, labels: ["off", "on"] }, false)).toBe("off")
  })

  it("falls back to on and off", () => {
    expect(displayValue(toggle, true)).toBe("on")
    expect(displayValue(toggle, false)).toBe("off")
  })

  it("uses select labels", () => {
    expect(displayValue(level, "high")).toBe("High")
  })

  it("uses a formatter when one is set", () => {
    expect(displayValue({ ...width, format: (value) => `${value} cols` }, 10)).toBe("10 cols")
  })
})

describe("choicesFor", () => {
  it("lists booleans", () => {
    expect(choicesFor(toggle)).toEqual([
      { value: false, label: "off" },
      { value: true, label: "on" },
    ])
  })

  it("lists select values with labels", () => {
    expect(choicesFor(level).map((choice) => choice.label)).toEqual(["Low", "Medium", "High"])
  })

  it("walks a number range by step", () => {
    expect(choicesFor(width).map((choice) => choice.value)).toEqual([8, 10, 12])
  })
})

describe("nextValue", () => {
  it("toggles booleans", () => {
    expect(nextValue(toggle, false, 1)).toBe(true)
    expect(nextValue(toggle, true, 1)).toBe(false)
    expect(nextValue(toggle, false, -1)).toBe(true)
  })

  it("wraps select values", () => {
    expect(nextValue(level, "high", 1)).toBe("low")
    expect(nextValue(level, "low", -1)).toBe("high")
  })

  it("walks number ranges", () => {
    expect(nextValue(width, 10, 1)).toBe(12)
    expect(nextValue(width, 8, -1)).toBe(12)
  })
})

describe("isSettingValue", () => {
  it("checks the kind and range", () => {
    expect(isSettingValue(toggle, true)).toBe(true)
    expect(isSettingValue(toggle, "on")).toBe(false)
    expect(isSettingValue(width, 9)).toBe(true)
    expect(isSettingValue(width, 14)).toBe(false)
    expect(isSettingValue(level, "high")).toBe(true)
    expect(isSettingValue(level, "urgent")).toBe(false)
  })
})

describe("quotaTweak", () => {
  it("registers the expected settings", () => {
    expect(quotaTweak.settings.map((setting) => setting.id)).toEqual([
      "enabled",
      "barWidth",
      "percent",
      "percentDecimals",
      "showReset",
      "providerAlign",
      "providerTab",
      "onlyCurrentModel",
      "dailyBudget",
      "reserve",
      "workMon",
      "workTue",
      "workWed",
      "workThu",
      "workFri",
      "workSat",
      "workSun",
    ])
  })

  it("budgets on weekdays and keeps no reserve by default", () => {
    const budget = quotaTweak.settings.find((setting) => setting.id === "dailyBudget")
    const reserve = quotaTweak.settings.find((setting) => setting.id === "reserve")
    expect(budget?.default).toBe(true)
    expect(reserve?.default).toBe(0)

    const decimals = quotaTweak.settings.find((setting) => setting.id === "percentDecimals")
    expect(decimals?.kind).toBe("select")
    expect(decimals?.values).toEqual([0, 1, 2])
    expect(decimals?.default).toBe(1)

    const workdays = quotaTweak.settings
      .filter((setting) => setting.id.startsWith("work"))
      .map((setting) => [setting.id, setting.default])
    expect(workdays).toEqual([
      ["workMon", true],
      ["workTue", true],
      ["workWed", true],
      ["workThu", true],
      ["workFri", true],
      ["workSat", true],
      ["workSun", true],
    ])
  })

  it("aligns the provider name from the settings menu", () => {
    const align = quotaTweak.settings.find((setting) => setting.id === "providerAlign")
    expect(align?.kind).toBe("select")
    expect(align?.default).toBe("right")
    expect(align?.values).toEqual(["left", "center", "right"])
  })

  it("keeps the provider name on the Quota line by default", () => {
    const tab = quotaTweak.settings.find((setting) => setting.id === "providerTab")
    expect(tab?.kind).toBe("boolean")
    expect(tab?.default).toBe(true)
  })

  it("shows the panel by default", () => {
    const enabled = quotaTweak.settings.find((setting) => setting.id === "enabled")
    expect(enabled?.default).toBe(true)
  })

  it("lets the quota bar use the available width", () => {
    const width = quotaTweak.settings.find((setting) => setting.id === "barWidth")
    expect(width?.kind).toBe("select")
    expect(width?.values).toContain("auto")
    expect(width?.default).toBe("auto")
  })
})

describe("tokensTweak", () => {
  it("turns every count on by default", () => {
    const defaults = Object.fromEntries(
      tokensTweak.settings.map((setting) => [setting.id, setting.default]),
    )

    expect(defaults).toEqual({
      enabled: true,
      prompt: true,
      total: true,
      format: "compact",
      ttft: false,
      count: "generated",
      subagents: true,
    })
  })

  it("keeps no cost setting", () => {
    expect(tokensTweak.settings.map((setting) => setting.id)).not.toContain("promptCost")
  })
})

describe("costTweak", () => {
  it("turns every figure on by default", () => {
    const defaults = Object.fromEntries(
      costTweak.settings.map((setting) => [setting.id, setting.default]),
    )

    expect(defaults).toEqual({
      enabled: true,
      prompt: true,
      total: true,
      digits: "auto",
      windows: true,
      estimate: true,
    })
  })

  it("reads the choices stored under the token tweak", () => {
    expect(costTweak.legacy).toEqual({
      id: "tokens",
      settings: {
        prompt: "promptCost",
        total: "totalCost",
        digits: "costDigits",
        estimate: "estimateCost",
      },
    })
  })
})

describe("modelTweak", () => {
  it("shows every rate and the peak state by default", () => {
    const defaults = Object.fromEntries(
      modelTweak.settings.map((setting) => [setting.id, setting.default]),
    )

    expect(defaults).toEqual({
      enabled: true,
      input: true,
      output: true,
      cache: true,
      variant: true,
      peak: true,
    })
  })
})
