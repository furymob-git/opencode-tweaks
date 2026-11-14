import { type MessageTokens, replyTurnMessages, type UsageMessage } from "./messages"

/**
 * Which counters a count adds up.
 *
 * - `new` is what the model actually processed: prompt, completion, reasoning,
 *   and cache writes, without cache reads. A turn re-reads the whole context at
 *   every step, so cache reads would dwarf every other counter.
 * - `generated` is only what the model wrote.
 * - `all` matches the counters `/stats` reports, cache reads included.
 */
export type TokenCount = "new" | "generated" | "all"

/** The tokens in one assistant message's counters under the chosen definition. */
export function usageTokens(tokens: MessageTokens, mode: TokenCount): number {
  const { input, output, reasoning, cache } = tokens

  switch (mode) {
    case "generated":
      return output + reasoning

    case "new":
      return input + output + reasoning + cache.write

    case "all":
      return input + output + reasoning + cache.read + cache.write
  }
}

/** The tokens one assistant message spent under the chosen definition. */
export function messageTokens(message: UsageMessage, mode: TokenCount): number {
  if (message.type !== "assistant" || !message.tokens) return 0
  return usageTokens(message.tokens, mode)
}

/** Every token a session spent under the chosen definition. */
export function sessionTokens(messages: readonly UsageMessage[], mode: TokenCount): number {
  return messages.reduce((total, message) => total + messageTokens(message, mode), 0)
}

/** The tokens that turn spent under the chosen definition. */
export function replyTurnTokens(messages: readonly UsageMessage[], mode: TokenCount): number {
  return sessionTokens(replyTurnMessages(messages), mode)
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const exact = new Intl.NumberFormat("en-US")

/**
 * `12.4K` in compact style, matching the numbers in `/stats`, or `12,431` for
 * every digit. Both stay short enough for the prompt footer.
 */
export function formatTokens(value: number, style: "compact" | "exact"): string {
  const total = Math.max(0, Math.round(value))
  return style === "exact" ? exact.format(total) : compact.format(total)
}
