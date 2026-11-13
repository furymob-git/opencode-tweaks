import { describe, expect, it } from "vitest"
import { quotaTweak } from "./quota"
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
      "showReset",
      "onlyCurrentModel",
    ])
  })

  it("stays off until the user enables it", () => {
    const enabled = quotaTweak.settings.find((setting) => setting.id === "enabled")
    expect(enabled?.default).toBe(false)
  })

  it("lets the quota bar use the available width", () => {
    const width = quotaTweak.settings.find((setting) => setting.id === "barWidth")
    expect(width?.kind).toBe("select")
    expect(width?.values).toContain("auto")
    expect(width?.default).toBe("auto")
  })
})
