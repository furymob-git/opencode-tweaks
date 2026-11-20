import { Plugin } from "@opencode/plugin/tui"
import { openTweaksMenu } from "./tweaks/menu"
import { ModelPanel } from "./tweaks/model-panel"
import { quotaSetting, quotaTweak } from "./tweaks/quota"
import { openQuotaDialog } from "./tweaks/quota-dialog"
import { QuotaPanel } from "./tweaks/quota-panel"
import { createSettingsStore } from "./tweaks/settings"
import { spendSetting, spendTweak } from "./tweaks/spend"
import { openSpendDialog } from "./tweaks/spend-dialog"
import { createUsageInjector } from "./tweaks/usage-inject"
import { UsageInline, UsageStatus } from "./tweaks/usage-slots"

const SPEND_ENABLED = spendSetting("enabled")
const QUOTA_HISTORY = quotaSetting("history")

export default Plugin.define({
  id: "opencode-tweaks.tui",
  setup(context) {
    const store = createSettingsStore(context)
    const usage = createUsageInjector(context)
    let dialogOpen = false

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
            if (dialogOpen) return

            dialogOpen = true
            try {
              await openTweaksMenu(context, store)
            } catch (error) {
              context.ui.toast.show({
                variant: "error",
                title: "Tweaks",
                message: error instanceof Error ? error.message : String(error),
              })
            } finally {
              dialogOpen = false
            }
          },
        },
        {
          id: "opencode-tweaks.quota",
          title: "Quota history",
          description: "Open the daily quota report",
          group: "Tweaks",
          palette: true,
          slash: { name: "quota" },
          enabled: () => store.read(quotaTweak, QUOTA_HISTORY).value === true,
          run: async () => {
            if (dialogOpen) return

            dialogOpen = true
            try {
              await openQuotaDialog(context, store)
            } catch (error) {
              context.ui.toast.show({
                variant: "error",
                title: "Quota history",
                message: error instanceof Error ? error.message : String(error),
              })
            } finally {
              dialogOpen = false
            }
          },
        },
        {
          id: "opencode-tweaks.spend",
          title: "Spend",
          description: "Open the spending report for the last days",
          group: "Tweaks",
          palette: true,
          slash: { name: "spend" },
          enabled: () => store.read(spendTweak, SPEND_ENABLED).value === true,
          run: async () => {
            if (dialogOpen) return

            dialogOpen = true
            try {
              await openSpendDialog(context, store)
            } catch (error) {
              context.ui.toast.show({
                variant: "error",
                title: "Spend",
                message: error instanceof Error ? error.message : String(error),
              })
            } finally {
              dialogOpen = false
            }
          },
        },
      ],
    }))

    return () => usage.dispose()
  },
})
