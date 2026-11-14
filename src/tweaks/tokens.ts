import { defineTweak } from "./types"

/**
 * Token usage is a session statistic, so it joins existing status lines instead
 * of taking a panel of its own. Each number has its own toggle: a turn's usage
 * follows the prompt on screen, the session's follows the whole tree.
 */
export const tokensTweak = defineTweak({
  id: "tokens",
  title: "Tokens",
  description: "Show token usage for a turn and for the whole session.",
  category: "Session",
  settings: [
    {
      id: "enabled",
      title: "Enabled",
      description: "Turn the token counts on.",
      category: "General",
      kind: "boolean",
      default: true,
    },
    {
      id: "prompt",
      title: "Turn tokens",
      description:
        "Show the latest finished turn's tokens inline with its tok/s line. Best effort: that line belongs to OpenCode.",
      category: "Display",
      kind: "boolean",
      default: true,
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
      id: "format",
      title: "Token format",
      description: "Compact counts such as 12.4K, or every digit.",
      category: "Display",
      kind: "select",
      default: "compact",
      values: ["compact", "exact"],
    },
    {
      id: "ttft",
      title: "First token time",
      description:
        "Show the host's ttft figure, the wait before the first token, at the end of the throughput line. Turn it off to keep tok/s alone.",
      category: "Display",
      kind: "boolean",
      default: false,
    },
    {
      id: "count",
      title: "Token count",
      description:
        "New tokens leave out cache reads, generated tokens are only what the model wrote, everything matches /stats.",
      category: "Scope",
      kind: "select",
      default: "generated",
      values: ["new", "generated", "all"],
      labels: ["New tokens", "Generated only", "Everything"],
    },
    {
      id: "subagents",
      title: "Include subagents",
      description: "Add the usage of subagents to the session totals. Costs follow the same scope.",
      category: "Scope",
      kind: "boolean",
      default: true,
    },
  ],
})
