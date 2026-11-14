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
      id: "align",
      title: "Price alignment",
      description: "Start the prices on one column, or push them against the right edge.",
      category: "Display",
      kind: "select",
      default: "right",
      values: ["left", "right"],
    },
    {
      id: "free",
      title: "Free models",
      description:
        "Show the paid list price, a Free label, or no card at all when the selected model is free.",
      category: "Display",
      kind: "select",
      default: "reference",
      values: ["reference", "label", "hidden"],
      labels: ["List price", "Free label", "Hide card"],
    },
    {
      id: "peakOnly",
      title: "Peak only",
      description: "Show the multiplier only during a peak window.",
      category: "Display",
      kind: "boolean",
      default: false,
    },
  ],
})
