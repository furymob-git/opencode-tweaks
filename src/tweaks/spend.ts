import { defineTweak, type TweakSetting } from "./types"

/**
 * `/spend` reads the session messages the TUI already synced, so it needs no
 * server call. The tweak exists to keep the command switchable like the others
 * and to remember the report's window.
 */
export const spendTweak = defineTweak({
  id: "spend",
  title: "Spend",
  description: "Show what recent sessions cost from /spend.",
  category: "Spend",
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Make the /spend report available.",
      category: "General",
      kind: "boolean",
      default: true,
    },
    {
      id: "days",
      title: "Window",
      description: "Days the report covers. The dialog switches it with the arrow keys.",
      category: "Report",
      kind: "select",
      default: 7,
      values: [7, 14, 30],
      labels: ["7 days", "14 days", "30 days"],
    },
    {
      id: "models",
      title: "Per-model split",
      description: "Show the cost and share of every model in the report.",
      category: "Report",
      kind: "boolean",
      default: true,
    },
    {
      id: "cache",
      title: "Cache hit rate",
      description: "Show the share of prompt tokens that came from the cache.",
      category: "Report",
      kind: "boolean",
      default: true,
    },
  ],
})

/** One setting of the spend tweak, for the command and the dialog. */
export function spendSetting(id: string): TweakSetting {
  const found = spendTweak.settings.find((item) => item.id === id)
  if (!found) throw new Error(`Spend setting "${id}" is missing`)
  return found
}
