import { estimateCost, type ModelPrice } from "../usage/cost"
import type { MessageTokens } from "../usage/messages"

/** Only what a spending report reads, so any session message list fits. */
export interface SpendMessage {
  readonly type: string
  readonly cost?: number
  readonly tokens?: MessageTokens
  readonly model?: { readonly providerID: string; readonly id: string }
  readonly time?: { readonly created?: number }
}

/** One session's messages, as the TUI keeps them. */
export interface SpendSession {
  readonly id: string
  readonly messages: readonly SpendMessage[]
}

export interface SpendTokens {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

export interface SpendModel {
  readonly providerID: string
  readonly modelID: string
  readonly cost: number
  readonly tokens: number
}

export interface SpendSummary {
  readonly cost: number
  readonly tokens: SpendTokens
  readonly generated: number
  readonly messages: number
  readonly turns: number
  readonly sessions: number
  /** Highest cost first, then the busiest model. */
  readonly models: readonly SpendModel[]
}

/** The list price of a message, used when the provider reported no cost. */
export type SpendPrice = (message: SpendMessage) => ModelPrice | undefined

/** The accumulators below fill read-only totals in place. */
type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] }

/** Local midnight at the start of the day `time` falls in. */
export function startOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Local midnight that starts a window of `days` calendar days ending today.
 * Seven days therefore mean today plus the six days before it.
 */
export function windowStart(now: number, days: number): number {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (Math.max(1, Math.round(days)) - 1))
  return date.getTime()
}

/**
 * Adds up the messages created between `from` and `to`, both included. A
 * message without a creation time cannot be placed on a day, so it stays out
 * of the report instead of inflating today.
 */
export function summarize(
  sessions: readonly SpendSession[],
  from: number,
  to: number,
  price?: SpendPrice,
): SpendSummary {
  const tokens: Mutable<SpendTokens> = {
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }
  const models = new Map<string, SpendModel>()
  let cost = 0
  let messages = 0
  let turns = 0
  let active = 0

  for (const session of sessions) {
    let seen = false

    for (const message of session.messages) {
      const created = message.time?.created
      if (created === undefined || created < from || created > to) continue
      seen = true

      if (message.type === "user") {
        turns += 1
        continue
      }
      if (message.type !== "assistant") continue

      messages += 1
      const amount = messageCost(message, price)
      cost += amount

      if (message.tokens) {
        tokens.input += message.tokens.input
        tokens.output += message.tokens.output
        tokens.reasoning += message.tokens.reasoning
        tokens.cacheRead += message.tokens.cache.read
        tokens.cacheWrite += message.tokens.cache.write
      }

      if (message.model) {
        const key = `${message.model.providerID}/${message.model.id}`
        const entry: Mutable<SpendModel> = models.get(key) ?? {
          providerID: message.model.providerID,
          modelID: message.model.id,
          cost: 0,
          tokens: 0,
        }
        entry.cost += amount
        entry.tokens += (message.tokens?.output ?? 0) + (message.tokens?.reasoning ?? 0)
        models.set(key, entry)
      }
    }

    if (seen) active += 1
  }

  return {
    cost,
    tokens,
    generated: tokens.output + tokens.reasoning,
    messages,
    turns,
    sessions: active,
    models: [...models.values()].sort(
      (left, right) =>
        right.cost - left.cost ||
        right.tokens - left.tokens ||
        left.modelID.localeCompare(right.modelID),
    ),
  }
}

/**
 * The share of prompt tokens that came from the cache. Cache reads, cache
 * writes, and fresh input together are what the provider had to read.
 */
export function cacheHitRate(tokens: SpendTokens): number | undefined {
  const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite
  if (prompt <= 0) return undefined
  return Math.max(0, Math.min(100, (tokens.cacheRead / prompt) * 100))
}

/** What one message cost: the reported figure first, then a list-price estimate. */
function messageCost(message: SpendMessage, price?: SpendPrice): number {
  const reported = message.cost ?? 0
  if (reported > 0) return reported
  if (!price || !message.tokens) return 0

  const list = price(message)
  return list ? estimateCost(message.tokens, list) : 0
}
