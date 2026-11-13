import { defineTweak } from "./types"

/**
 * The quota sidebar is the first tweak. Its settings land before the panel so
 * `/tweaks` has a real definition to manage from day one.
 */
export const quotaTweak = defineTweak({
  id: "quota",
  title: "Quota",
  description: "Show provider quota and reset times in the session sidebar.",
  category: "Quota",
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Show the quota panel in the session sidebar.",
      category: "General",
      kind: "boolean",
      default: false,
    },
    {
      id: "barWidth",
      title: "Bar width",
      description: "Width of the usage bars in columns, or auto to use the available width.",
      category: "Display",
      kind: "select",
      default: "auto",
      values: ["auto", 10, 15, 20, 25, 30, 35, 40],
    },
    {
      id: "percent",
      title: "Percentage",
      description: "Show the quota that remains or the quota that was used.",
      category: "Display",
      kind: "select",
      default: "remaining",
      values: ["remaining", "used"],
      labels: ["remaining", "used"],
    },
    {
      id: "showReset",
      title: "Reset times",
      description: "Show when each quota window resets.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "providerAlign",
      title: "Provider name",
      description: "Where the provider name sits on its line.",
      category: "Provider",
      kind: "select",
      default: "left",
      values: ["left", "center", "right"],
    },
    {
      id: "providerTab",
      title: "One tab per provider",
      description: "Put the provider name on the Quota line and collapse the rows under it.",
      category: "Provider",
      kind: "boolean",
      default: false,
    },
    {
      id: "onlyCurrentModel",
      title: "Current provider only",
      description:
        "Follow the selected model and hide quotas from other providers. Turn it off to show every quota the plugin can read.",
      category: "Provider",
      kind: "boolean",
      default: true,
    },
  ],
})
