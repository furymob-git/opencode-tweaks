/** A value a tweak setting can hold. */
export type SettingValue = boolean | number | string

export type SettingKind = "boolean" | "number" | "select"

/**
 * One row in the `/tweaks` menu.
 *
 * The menu renders settings from this definition, so a tweak never ships its
 * own settings UI. Add a setting here and it appears in the menu with the right
 * picker, validation, and persistence.
 */
export interface TweakSetting {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly category: string
  readonly kind: SettingKind
  readonly default: SettingValue
  /** Accepted values for a `select` setting. */
  readonly values?: readonly SettingValue[]
  /** Display labels, aligned with `values` or with `false`/`true`. */
  readonly labels?: readonly string[]
  /** Inclusive bounds for a `number` setting. */
  readonly min?: number
  readonly max?: number
  /** Picker increment for a `number` setting. */
  readonly step?: number
  /** Overrides the text shown in the menu footer. */
  readonly format?: (value: SettingValue) => string
}

/**
 * Where a tweak's settings lived before it was split out. The store reads the
 * old group when the new one holds no value, so a rename keeps the choice the
 * user already made instead of silently resetting it.
 */
export interface TweakLegacy {
  /** The tweak id the settings used to be stored under. */
  readonly id: string
  /** Current setting id to the id it used to have. */
  readonly settings: Readonly<Record<string, string>>
}

export interface Tweak {
  readonly id: string
  readonly title: string
  readonly description: string
  /** Group shown in the `/tweaks` list. */
  readonly category: string
  readonly settings: readonly TweakSetting[]
  readonly legacy?: TweakLegacy
}

/** Settings changed from the menu, keyed by tweak and setting id. */
export type StoredSettings = Record<string, Record<string, SettingValue>>

export interface ResolvedSetting {
  readonly value: SettingValue
  readonly source: "user" | "config" | "default"
}

export interface SettingChoice {
  readonly value: SettingValue
  readonly label: string
}

/**
 * Checks a definition before it reaches the menu. A bad definition fails when
 * the plugin loads, which is easier to trace than a broken row at runtime.
 */
export function defineTweak(tweak: Tweak): Tweak {
  const ids = new Set<string>()

  for (const setting of tweak.settings) {
    if (ids.has(setting.id)) {
      throw new Error(`Duplicate setting "${setting.id}" in tweak "${tweak.id}"`)
    }
    ids.add(setting.id)

    switch (setting.kind) {
      case "boolean":
        if (typeof setting.default !== "boolean") {
          throw new Error(`Setting "${tweak.id}.${setting.id}" needs a boolean default`)
        }
        break

      case "select":
        if (!setting.values?.length) {
          throw new Error(`Setting "${tweak.id}.${setting.id}" needs at least one value`)
        }
        if (setting.labels && setting.labels.length !== setting.values.length) {
          throw new Error(`Setting "${tweak.id}.${setting.id}" has mismatched labels`)
        }
        if (!setting.values.includes(setting.default)) {
          throw new Error(`Setting "${tweak.id}.${setting.id}" has a default outside its values`)
        }
        break

      case "number":
        if (
          setting.min === undefined ||
          setting.max === undefined ||
          setting.step === undefined ||
          setting.min > setting.max ||
          setting.step <= 0
        ) {
          throw new Error(`Setting "${tweak.id}.${setting.id}" needs valid min, max, and step`)
        }
        if (
          typeof setting.default !== "number" ||
          setting.default < setting.min ||
          setting.default > setting.max
        ) {
          throw new Error(`Setting "${tweak.id}.${setting.id}" has a default outside its range`)
        }
        break
    }
  }

  for (const id of Object.keys(tweak.legacy?.settings ?? {})) {
    if (!ids.has(id)) {
      throw new Error(`Legacy setting "${tweak.id}.${id}" is not defined`)
    }
  }

  return tweak
}

/** Whether a stored or configured value is valid for a setting. */
export function isSettingValue(setting: TweakSetting, value: unknown): value is SettingValue {
  switch (setting.kind) {
    case "boolean":
      return typeof value === "boolean"

    case "select":
      return setting.values?.some((choice) => choice === value) ?? false

    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= (setting.min ?? Number.NEGATIVE_INFINITY) &&
        value <= (setting.max ?? Number.POSITIVE_INFINITY)
      )
  }
}

/** The text shown next to a setting or in a picker. */
export function displayValue(setting: TweakSetting, value: SettingValue): string {
  if (setting.format) return setting.format(value)

  if (setting.kind === "boolean") {
    return setting.labels?.[value ? 1 : 0] ?? (value ? "on" : "off")
  }

  if (setting.kind === "select") {
    const index = setting.values?.indexOf(value) ?? -1
    if (index >= 0) return setting.labels?.[index] ?? String(value)
  }

  return String(value)
}

/** Every value a picker offers for a setting. */
export function choicesFor(setting: TweakSetting): SettingChoice[] {
  if (setting.kind === "boolean") {
    return [false, true].map((value, index) => ({
      value,
      label: setting.labels?.[index] ?? (value ? "on" : "off"),
    }))
  }

  if (setting.kind === "select") {
    return (setting.values ?? []).map((value, index) => ({
      value,
      label: setting.labels?.[index] ?? String(value),
    }))
  }

  const min = setting.min ?? 0
  const max = setting.max ?? 0
  const step = setting.step ?? 1
  const count = Math.floor((max - min) / step + 1e-9) + 1
  const choices: SettingChoice[] = []

  for (let index = 0; index < count; index++) {
    const value = Number((min + index * step).toFixed(6))
    choices.push({ value, label: displayValue(setting, value) })
  }

  return choices
}

/** The value after moving one step through a setting's choices, wrapping at both ends. */
export function nextValue(
  setting: TweakSetting,
  current: SettingValue,
  direction: 1 | -1,
): SettingValue | undefined {
  const choices = choicesFor(setting)
  if (choices.length === 0) return undefined

  const index = choices.findIndex((choice) => choice.value === current)
  return choices[(index + direction + choices.length) % choices.length]?.value
}
