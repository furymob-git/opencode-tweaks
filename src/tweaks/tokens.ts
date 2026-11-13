import { defineTweak } from "./types"

/**
 * Token usage is a session statistic, so it joins existing status lines instead
 * of taking a panel of its own. The two counts are independent features: one
 * follows the current prompt, the other follows the whole session.
 */
export const tokensTweak = defineTweak({
  id: "tokens",
  title: "Tokens",
  description: "Show token and cost usage per prompt and for the whole session.",
  category: "Session",
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Turn the token counts on.",
      category: "General",
      kind: "boolean",
      default: false,
    },
    {
      id: "prompt",
      title: "Tokens per prompt",
      description:
        "Show the tokens this prompt spent, inline with the turn's tok/s line. Best effort: that line belongs to OpenCode.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "total",
      title: "Session total",
      description: "Show the session's total token usage on the bottom status line.",
      category: "Display",
      kind: "boolean",
      default: true,
    },
    {
      id: "promptCost",
      title: "Cost per prompt",
      description: "Show the cost of this prompt after the turn's tok/s figure.",
      category: "Display",
      kind: "boolean",
      default: false,
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
      id: "costDigits",
      title: "Cost digits",
      description:
        "Decimals shown for costs, or auto to keep going until the first significant digit.",
      category: "Display",
      kind: "select",
      default: "auto",
      values: ["auto", 2, 3, 4, 5, 6],
      labels: ["Auto", "2 digits", "3 digits", "4 digits", "5 digits", "6 digits"],
    },
    {
      id: "format",
      title: "Format",
      description: "Compact counts such as 12.4K, or every digit.",
      category: "Display",
      kind: "select",
      default: "compact",
      values: ["compact", "exact"],
    },
    {
      id: "subagents",
      title: "Include subagents",
      description: "Add the tokens used by subagents to the session total.",
      category: "Scope",
      kind: "boolean",
      default: true,
    },
    {
      id: "count",
      title: "Count",
      description:
        "New tokens leave out cache reads, generated tokens are only what the model wrote, everything matches /stats.",
      category: "Scope",
      kind: "select",
      default: "new",
      values: ["new", "generated", "all"],
      labels: ["New tokens", "Generated only", "Everything"],
    },
  ],
})
