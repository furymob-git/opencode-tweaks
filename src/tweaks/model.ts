import { defineTweak } from "./types"

/**
 * The sidebar card reads the same catalog as the cost figures, but stays its
 * own tweak: it describes the model, while the cost tweak counts what it spent.
 * Every rate is optional so the card fits a narrow sidebar.
 */
export const modelTweak = defineTweak({
  id: "model",
  title: "Model",
  description: "Show the current model's list price and peak state in the sidebar.",
  category: "Session",
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Show the model card in the sidebar.",
      category: "General",
      kind: "boolean",
      default: true,
    },
    {
      id: "input",
      title: "Input price",
      description: "Show the input rate per million tokens.",
      category: "Rates",
      kind: "boolean",
      default: true,
    },
    {
      id: "output",
      title: "Output price",
      description: "Show the output rate per million tokens.",
      category: "Rates",
      kind: "boolean",
      default: true,
    },
    {
      id: "cache",
      title: "Cache read price",
      description: "Show the cache read rate per million tokens.",
      category: "Rates",
      kind: "boolean",
      default: true,
    },
    {
      id: "peak",
      title: "Peak state",
      description: "Show the model's current price multiplier in the card header.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "peakOnly",
      title: "Peak only",
      description: "Hide the multiplier while the model bills at its base price.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
  ],
})
