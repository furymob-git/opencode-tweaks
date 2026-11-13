/** The token counters OpenCode stores on an assistant message. */
export interface MessageTokens {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

/** Only what the sum needs, so any session message list fits. */
export interface TokenMessage {
  readonly id?: string
  readonly type: string
  readonly tokens?: MessageTokens
  readonly cost?: number
  readonly model?: { readonly providerID: string; readonly id: string }
  /** How the step ended; the host only draws a footer for a finished one. */
  readonly finish?: string | null
  readonly error?: unknown
  readonly retry?: unknown
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

/** The index just after the last user prompt before `end`. */
function turnStart(messages: readonly TokenMessage[], end: number): number {
  for (let index = end - 1; index >= 0; index--) {
    if (messages[index]?.type === "user") return index + 1
  }
  return 0
}

/** Where the turn that starts at `start` ends: at the next prompt, or the end. */
function turnEnd(messages: readonly TokenMessage[], start: number): number {
  for (let index = start; index < messages.length; index++) {
    if (messages[index]?.type === "user") return index
  }
  return messages.length
}

/**
 * The newest message the host draws a footer under. A footer belongs to the
 * last step of a turn: one that stopped for any reason other than another tool
 * call, or one that failed or is being retried.
 */
export function footerMessage(messages: readonly TokenMessage[]): TokenMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type !== "assistant") continue
    if (message.error || message.retry) return message
    if (message.finish && message.finish !== "tool-calls" && message.finish !== "unknown") {
      return message
    }
  }
  return undefined
}

/**
 * The messages of the turn whose footer is on screen. A prompt with no finished
 * reply yet leaves the previous turn's line there, so that line keeps showing
 * the previous turn's numbers instead of the running one's.
 */
export function replyTurnMessages(messages: readonly TokenMessage[]): readonly TokenMessage[] {
  const footer = footerMessage(messages)
  if (!footer) return []

  const last = messages.lastIndexOf(footer)
  const start = turnStart(messages, last + 1)
  return messages.slice(start, turnEnd(messages, start))
}

/** The tokens that turn spent under the chosen definition. */
export function replyTurnTokens(messages: readonly TokenMessage[], mode: TokenCount): number {
  return sessionTokens(replyTurnMessages(messages), mode)
}

/** A model's list price, in dollars per million tokens. */
export interface ModelPrice {
  readonly input: number
  readonly output: number
  readonly cache: { readonly read: number; readonly write: number }
  readonly tier?: { readonly size: number }
}

/**
 * The price that applies at a context size: the base price, raised by a tier
 * once the request is large enough. Long-context pricing works this way.
 */
export function priceFor(prices: readonly ModelPrice[], context: number): ModelPrice | undefined {
  let base: ModelPrice | undefined
  let tiered: ModelPrice | undefined

  for (const price of prices) {
    const tier = price.tier
    if (!tier) {
      base ??= price
      continue
    }
    if (context < tier.size) continue
    if (!tiered?.tier || tier.size > tiered.tier.size) tiered = price
  }

  return tiered ?? base ?? prices[0]
}

/**
 * The list-price cost of one message's counters. Reasoning is billed at the
 * output price, as providers do.
 */
export function estimateCost(tokens: MessageTokens, price: ModelPrice): number {
  const { input, output, reasoning, cache } = tokens
  const total =
    input * price.input +
    (output + reasoning) * price.output +
    cache.read * price.cache.read +
    cache.write * price.cache.write

  return total / 1_000_000
}

/** Resolves the list price of one message, if the model is known. */
export type PriceLookup = (message: TokenMessage) => ModelPrice | undefined

/**
 * The cost of a list of messages: what the provider reported, or the list-price
 * estimate when it reported nothing and a price is available.
 */
export function messagesCost(messages: readonly TokenMessage[], price?: PriceLookup): number {
  return messages.reduce((total, message) => {
    const reported = message.cost ?? 0
    if (reported > 0) return total + reported
    if (!price || !message.tokens) return total + reported

    const value = price(message)
    return total + (value ? estimateCost(message.tokens, value) : reported)
  }, 0)
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
