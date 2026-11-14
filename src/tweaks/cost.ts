import { defineTweak } from "./types"

/**
 * Cost reads the same counters as token usage but stays its own tweak: a
 * provider that reports nothing still benefits from an estimate, while a user
 * who only wants the counts can leave the prices off. The figures share the
 * turn's throughput line and the session status line with the token counts.
 */
export const costTweak = defineTweak({
  id: "cost",
  title: "Cost",
  description: "Show what a turn and the whole session cost.",
  category: "Session",
  /** Cost used to live in the token tweak; keep those choices readable. */
  legacy: {
    id: "tokens",
    settings: {
      prompt: "promptCost",
      total: "totalCost",
      digits: "costDigits",
      estimate: "estimateCost",
    },
  },
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Turn the cost figures on.",
      category: "General",
      kind: "boolean",
      default: true,
    },
    {
      id: "prompt",
      title: "Turn cost",
      description: "Show that turn's cost after the tok/s figure.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "total",
      title: "Session cost",
      description: "Show the session's total cost on the bottom status line.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "digits",
      title: "Cost decimals",
      description:
        "Decimals shown for costs, or auto to keep going until the first significant digit.",
      category: "Display",
      kind: "select",
      default: "auto",
      values: ["auto", 2, 3, 4, 5, 6],
      labels: ["Auto", "2 digits", "3 digits", "4 digits", "5 digits", "6 digits"],
    },
    {
      id: "windows",
      title: "Price windows",
      description:
        "Mark when the provider charges more than the catalog price, such as DeepSeek peak hours.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "estimate",
      title: "Estimate cost",
      description:
        "Guess the cost from the model's list price when the provider reports none. A session that changed model is estimated with the model it ended on.",
      category: "Scope",
      kind: "boolean",
      default: true,
    },
  ],
})
