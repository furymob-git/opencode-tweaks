import type { Context } from "@opencode/plugin/tui/context"
import {
  isSettingValue,
  type ResolvedSetting,
  type SettingValue,
  type StoredSettings,
  type Tweak,
  type TweakSetting,
} from "./types"

export interface SettingsStore {
  read(tweak: Tweak, setting: TweakSetting): ResolvedSetting
  set(tweak: Tweak, setting: TweakSetting, value: SettingValue): Promise<void>
  reset(tweak: Tweak, setting: TweakSetting): Promise<void>
}

interface OptionsTree {
  readonly [key: string]: unknown
}

/**
 * Reads settings in priority order: value chosen in `/tweaks`, then the plugin
 * options in `opencode.json`, then the definition default. Writes only touch
 * the local layer, so the config file stays the user's to edit.
 */
export function createSettingsStore(context: Context): SettingsStore {
  const [stored, update] = context.storage.store<StoredSettings>("settings", { initial: {} })
  const options = context.options as OptionsTree

  function read(tweak: Tweak, setting: TweakSetting): ResolvedSetting {
    const userValue = stored[tweak.id]?.[setting.id]
    if (isSettingValue(setting, userValue)) {
      return { value: userValue, source: "user" }
    }

    const tweakOptions = options[tweak.id]
    const configValue =
      tweakOptions && typeof tweakOptions === "object"
        ? (tweakOptions as OptionsTree)[setting.id]
        : undefined

    if (isSettingValue(setting, configValue)) {
      return { value: configValue, source: "config" }
    }

    return { value: setting.default, source: "default" }
  }

  async function set(tweak: Tweak, setting: TweakSetting, value: SettingValue): Promise<void> {
    if (!isSettingValue(setting, value)) return

    await update((draft) => {
      const group = draft[tweak.id]
      if (group) {
        group[setting.id] = value
      } else {
        draft[tweak.id] = { [setting.id]: value }
      }
    })
  }

  async function reset(tweak: Tweak, setting: TweakSetting): Promise<void> {
    await update((draft) => {
      const group = draft[tweak.id]
      if (!group) return

      delete group[setting.id]
      if (Object.keys(group).length === 0) delete draft[tweak.id]
    })
  }

  return { read, set, reset }
}
