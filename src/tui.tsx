import { Plugin } from "@opencode/plugin/tui"
import { openTweaksMenu } from "./tweaks/menu"
import { ModelPanel } from "./tweaks/model-panel"
import { QuotaPanel } from "./tweaks/quota-panel"
import { createSettingsStore } from "./tweaks/settings"
import { createUsageInjector } from "./tweaks/usage-inject"
import { UsageInline, UsageStatus } from "./tweaks/usage-slots"

export default Plugin.define({
  id: "opencode-tweaks.tui",
  setup(context) {
    const store = createSettingsStore(context)
    const usage = createUsageInjector(context)
    let menuOpen = false

    context.ui.slot({
      append: "sidebar.content",
      render: () => <QuotaPanel context={context} store={store} />,
    })

    context.ui.slot({
      append: "sidebar.content",
      render: (input) => <ModelPanel context={context} input={input} store={store} />,
    })

    context.ui.slot({
      append: "session.composer.top",
      render: (input) => (
        <UsageInline context={context} input={input} store={store} injector={usage} />
      ),
    })

    context.ui.slot({
      after: "prompt.footer.status",
      render: (input) => (
        <UsageStatus context={context} input={input} store={store} injector={usage} />
      ),
    })

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

    return () => usage.dispose()
  },
})
