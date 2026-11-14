import type { MessageTokens, UsageMessage } from "./messages"

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
export type PriceLookup = (message: UsageMessage) => ModelPrice | undefined

/**
 * The cost of a list of messages: what the provider reported, or the list-price
 * estimate when it reported nothing and a price is available.
 */
export function messagesCost(messages: readonly UsageMessage[], price?: PriceLookup): number {
  return messages.reduce((total, message) => {
    const reported = message.cost ?? 0
    if (reported > 0) return total + reported
    if (!price || !message.tokens) return total + reported

    const value = price(message)
    return total + (value ? estimateCost(message.tokens, value) : reported)
  }, 0)
}

export type CostDigits = "auto" | 2 | 3 | 4 | 5 | 6

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

/** Whether a stored or configured value is a cost digit choice. */
export function isCostDigits(value: unknown): value is CostDigits {
  return value === "auto" || value === 2 || value === 3 || value === 4 || value === 5 || value === 6
}

/**
 * A list rate per million tokens. Normal rates keep two decimals; sub-cent
 * rates show up to six and drop trailing zeros, so `$0.003` stays readable.
 */
export function formatRate(value: number): string {
  if (value >= 0.01) return `$${value.toFixed(2)}`
  return `$${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`
}

/** Normal amounts keep two decimals; smaller ones grow until a digit shows. */
function autoDigits(cost: number): number {
  if (cost === 0 || cost >= 0.01) return 2
  return Math.min(6, Math.ceil(-Math.log10(cost)))
}
