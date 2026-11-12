import { Plugin } from "@opencode/plugin/tui"
import { openTweaksMenu } from "./tweaks/menu"
import { createSettingsStore } from "./tweaks/settings"

export default Plugin.define({
  id: "opencode-tweaks.tui",
  setup(context) {
    const store = createSettingsStore(context)
    let menuOpen = false

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "opencode-tweaks.tweaks",
          title: "Tweaks",
          description: "Open the opencode-tweaks settings menu",
          group: "Tweaks",
          palette: true,
          slash: { name: "tweaks" },
          run: async () => {
            if (menuOpen) return

            menuOpen = true
            try {
              await openTweaksMenu(context, store)
            } catch (error) {
              context.ui.toast.show({
                variant: "error",
                title: "Tweaks",
                message: error instanceof Error ? error.message : String(error),
              })
            } finally {
              menuOpen = false
            }
          },
        },
      ],
    }))
  },
})
