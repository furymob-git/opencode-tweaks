import { defineTweak } from "./types"

/**
 * Token usage is a session statistic, so it joins existing status lines instead
 * of taking a panel of its own. Each number has its own toggle: a turn's usage
 * follows the prompt on screen, the session's follows the whole tree.
 */
export const tokensTweak = defineTweak({
  id: "tokens",
  title: "Tokens",
  description: "Show token and cost usage for a turn and for the whole session.",
  category: "Session",
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Turn the token and cost counts on.",
      category: "General",
      kind: "boolean",
      default: false,
    },
    {
      id: "prompt",
      title: "Turn tokens",
      description:
        "Show the tokens this turn spent, inline with its tok/s line. Best effort: that line belongs to OpenCode.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "promptCost",
      title: "Turn cost",
      description: "Show this turn's cost after the tok/s figure.",
      category: "Display",
      kind: "boolean",
      default: false,
    },
    {
      id: "total",
      title: "Session tokens",
      description: "Show the session's total token usage on the bottom status line.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "totalCost",
      title: "Session cost",
      description: "Show the session's total cost on the bottom status line.",
      category: "Display",
      kind: "boolean",
      default: false,
    },
    {
      id: "format",
      title: "Token format",
      description: "Compact counts such as 12.4K, or every digit.",
      category: "Display",
      kind: "select",
      default: "compact",
      values: ["compact", "exact"],
    },
    {
      id: "costDigits",
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
      id: "count",
      title: "Token count",
      description:
        "New tokens leave out cache reads, generated tokens are only what the model wrote, everything matches /stats.",
      category: "Scope",
      kind: "select",
      default: "new",
      values: ["new", "generated", "all"],
      labels: ["New tokens", "Generated only", "Everything"],
    },
    {
      id: "subagents",
      title: "Include subagents",
      description: "Add the tokens used by subagents to the session totals.",
      category: "Scope",
      kind: "boolean",
      default: true,
    },
    {
      id: "estimateCost",
      title: "Estimate cost",
      description:
        "Guess the cost from the model's list price when the provider reports none. A session that changed model is estimated with the model it ended on.",
      category: "Scope",
      kind: "boolean",
      default: false,
    },
  ],
})
