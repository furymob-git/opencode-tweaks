/** The token counters OpenCode stores on an assistant message. */
export interface MessageTokens {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

/** Only what the sum needs, so any session message list fits. */
export interface TokenMessage {
  readonly type: string
  readonly tokens?: MessageTokens
  readonly cost?: number
}

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
export function messageTokens(message: TokenMessage, mode: TokenCount): number {
  if (message.type !== "assistant" || !message.tokens) return 0
  return usageTokens(message.tokens, mode)
}

/** Every token a session spent under the chosen definition. */
export function sessionTokens(messages: readonly TokenMessage[], mode: TokenCount): number {
  return messages.reduce((total, message) => total + messageTokens(message, mode), 0)
}

/** The index just after the last user prompt, which is where the turn starts. */
function turnStart(messages: readonly TokenMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.type === "user") return index + 1
  }
  return 0
}

/**
 * The tokens the current turn spent: every assistant message after the last
 * user prompt. A session whose history starts mid-turn, or that has no prompt
 * left after compaction, falls back to all of its messages.
 */
export function turnTokens(messages: readonly TokenMessage[], mode: TokenCount): number {
  return sessionTokens(messages.slice(turnStart(messages)), mode)
}

/** The cost the current turn spent, summed the same way as its tokens. */
export function turnCost(messages: readonly TokenMessage[]): number {
  return messages
    .slice(turnStart(messages))
    .reduce((total, message) => total + (message.cost ?? 0), 0)
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

/**
 * Dollars with two decimals, or more under a cent so the first significant
 * digit shows. `auto` picks the decimals; a number fixes them.
 */
export function formatCost(value: number, digits: CostDigits = "auto"): string {
  const cost = Math.max(0, value)
  const places = digits === "auto" ? autoDigits(cost) : digits

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(cost)
}

export type CostDigits = "auto" | 2 | 3 | 4 | 5 | 6

/** Whether a stored or configured value is a cost digit choice. */
export function isCostDigits(value: unknown): value is CostDigits {
  return value === "auto" || value === 2 || value === 3 || value === 4 || value === 5 || value === 6
}

/** Normal amounts keep two decimals; smaller ones grow until a digit shows. */
function autoDigits(cost: number): number {
  if (cost === 0 || cost >= 0.01) return 2
  return Math.min(6, Math.ceil(-Math.log10(cost)))
}
