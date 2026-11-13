import { Plugin } from "@opencode/plugin/tui"
import { openTweaksMenu } from "./tweaks/menu"
import { QuotaPanel } from "./tweaks/quota-panel"
import { createSettingsStore } from "./tweaks/settings"
import { createTokenInjector } from "./tweaks/token-inject"
import { TokenInline, TokenStatus } from "./tweaks/token-slots"

export default Plugin.define({
  id: "opencode-tweaks.tui",
  setup(context) {
    const store = createSettingsStore(context)
    const tokens = createTokenInjector(context)
    let menuOpen = false

    context.ui.slot({
      append: "sidebar.content",
      render: () => <QuotaPanel context={context} store={store} />,
    })

    context.ui.slot({
      append: "session.composer.top",
      render: (input) => (
        <TokenInline context={context} input={input} store={store} injector={tokens} />
      ),
    })

    context.ui.slot({
      after: "prompt.footer.status",
      render: (input) => <TokenStatus context={context} input={input} store={store} />,
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

    return () => tokens.dispose()
  },
})
