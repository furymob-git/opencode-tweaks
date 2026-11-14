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

/** One setting from a group in `opencode.json`, if the group holds one. */
function configValue(group: unknown, settingID: string): unknown {
  if (!group || typeof group !== "object") return undefined
  return (group as OptionsTree)[settingID]
}

/** Drops one stored value, and the empty group it leaves behind. */
function forget(stored: StoredSettings, tweakID: string, settingID: string) {
  const group = stored[tweakID]
  if (!group) return

  delete group[settingID]
  if (Object.keys(group).length === 0) delete stored[tweakID]
}

/**
 * Reads settings in priority order: value chosen in `/tweaks`, then the plugin
 * options in `opencode.json`, then the definition default. Writes only touch
 * the local layer, so the config file stays the user's to edit.
 *
 * A split tweak also checks the group its settings came from, so a value chosen
 * before the split keeps applying until the user changes or resets it.
 */
export function createSettingsStore(context: Context): SettingsStore {
  const [stored, update] = context.storage.store<StoredSettings>("settings", { initial: {} })
  const options = context.options as OptionsTree

  function read(tweak: Tweak, setting: TweakSetting): ResolvedSetting {
    const userValue = stored[tweak.id]?.[setting.id]
    if (isSettingValue(setting, userValue)) {
      return { value: userValue, source: "user" }
    }

    const tweakConfig = configValue(options[tweak.id], setting.id)
    if (isSettingValue(setting, tweakConfig)) {
      return { value: tweakConfig, source: "config" }
    }

    const legacyID = tweak.legacy?.settings[setting.id]
    if (tweak.legacy && legacyID) {
      const legacyUser = stored[tweak.legacy.id]?.[legacyID]
      if (isSettingValue(setting, legacyUser)) {
        return { value: legacyUser, source: "user" }
      }

      const legacyConfig = configValue(options[tweak.legacy.id], legacyID)
      if (isSettingValue(setting, legacyConfig)) {
        return { value: legacyConfig, source: "config" }
      }
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
    const legacyID = tweak.legacy?.settings[setting.id]

    await update((draft) => {
      forget(draft, tweak.id, setting.id)
      if (tweak.legacy && legacyID) forget(draft, tweak.legacy.id, legacyID)
    })
  }

  return { read, set, reset }
}
