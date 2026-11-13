import type { Context, SlotMap } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, Show } from "solid-js"
import type { SettingsStore } from "./settings"
import type { TokenInjector } from "./token-inject"
import { tokensTweak } from "./tokens"
import {
  type CostDigits,
  formatCost,
  formatTokens,
  isCostDigits,
  type TokenCount,
  turnCost,
  turnTokens,
  usageTokens,
} from "./tokens-model"
import type { TweakSetting } from "./types"

function setting(id: string): TweakSetting {
  const found = tokensTweak.settings.find((item) => item.id === id)
  if (!found) throw new Error(`Tokens setting "${id}" is missing`)
  return found
}

const ENABLED = setting("enabled")
const PROMPT = setting("prompt")
const TOTAL = setting("total")
const SUBAGENTS = setting("subagents")
const COUNT = setting("count")
const PROMPT_COST = setting("promptCost")
const TOTAL_COST = setting("totalCost")
const COST_DIGITS = setting("costDigits")
const FORMAT = setting("format")

/**
 * The two counts, shared by both placements. The prompt count follows the open
 * session because a prompt belongs to it. The total optionally follows the
 * session tree, since a subagent's tokens belong to the turn its parent started.
 */
function useCounts(props: {
  readonly context: Context
  readonly store: SettingsStore
  readonly sessionID: () => string | undefined
}) {
  const enabled = () => props.store.read(tokensTweak, ENABLED).value === true
  const perPrompt = () => props.store.read(tokensTweak, PROMPT).value === true
  const sessionTotal = () => props.store.read(tokensTweak, TOTAL).value === true
  const subagents = () => props.store.read(tokensTweak, SUBAGENTS).value === true
  const promptCost = () => props.store.read(tokensTweak, PROMPT_COST).value === true
  const totalCost = () => props.store.read(tokensTweak, TOTAL_COST).value === true
  const costDigits = (): CostDigits => {
    const value = props.store.read(tokensTweak, COST_DIGITS).value
    return isCostDigits(value) ? value : "auto"
  }
  const count = (): TokenCount => {
    const value = props.store.read(tokensTweak, COUNT).value
    return value === "generated" || value === "all" ? value : "new"
  }
  const style = () =>
    props.store.read(tokensTweak, FORMAT).value === "exact" ? "exact" : "compact"

  const messages = (sessionID: string) => props.context.data.session.message.list(sessionID) ?? []

  const sessions = props.context.data.session

  const family = createMemo(() => {
    const sessionID = props.sessionID()
    if (!sessionID) return []

    if (!subagents()) return [sessionID]

    try {
      const root = sessions.root(sessionID)
      return [...new Set([root, ...sessions.family(root)])].filter((id) => id.length > 0)
    } catch {
      // A session the client has not synced yet still shows its own total.
      return [sessionID]
    }
  })

  // The transcript keeps only a window of messages, so the session's own
  // counters are the only exact total for a long session.
  const total = createMemo(() =>
    family().reduce((sum, sessionID) => {
      const usage = sessions.get(sessionID)?.tokens
      return sum + (usage ? usageTokens(usage, count()) : 0)
    }, 0),
  )

  const prompt = createMemo(() => {
    const sessionID = props.sessionID()
    return sessionID ? turnTokens(messages(sessionID), count()) : 0
  })

  const sessionCost = createMemo(() =>
    family().reduce((sum, sessionID) => sum + (sessions.get(sessionID)?.cost ?? 0), 0),
  )

  const cost = createMemo(() => {
    const sessionID = props.sessionID()
    return sessionID ? turnCost(messages(sessionID)) : 0
  })

  /** The formatted count, or `undefined` while there is nothing worth showing. */
  const format = (value: number) => (value > 0 ? formatTokens(value, style()) : undefined)

  const promptCount = () => (enabled() && perPrompt() ? format(prompt()) : undefined)
  const totalCount = () => (enabled() && sessionTotal() ? format(total()) : undefined)
  const promptCostLabel = () =>
    enabled() && promptCost() ? formatCost(cost(), costDigits()) : undefined
  const totalCostLabel = () =>
    enabled() && totalCost() ? formatCost(sessionCost(), costDigits()) : undefined

  return { promptCount, totalCount, promptCostLabel, totalCostLabel }
}

/**
 * Inline placement has no row of its own: it hands the prompt count to the
 * injector, which splices it into the host's tok/s line. The composer slot is
 * claimed anyway because it is the published place that gives the plugin a
 * reactive session context above the prompt; this component renders nothing.
 */
export function TokenInline(props: {
  readonly context: Context
  readonly input: SlotMap["session.composer.top"]
  readonly store: SettingsStore
  readonly injector: TokenInjector
}) {
  const counts = useCounts({
    context: props.context,
    store: props.store,
    sessionID: () => props.input.sessionID,
  })

  createEffect(() => {
    const count = counts.promptCount()
    const cost = counts.promptCostLabel()
    props.injector.setLabels({
      before: count ? ` · ${count} tok` : undefined,
      after: cost ? ` · ${cost}` : undefined,
    })
  })

  return null
}

/** The bottom status line, next to the working directory and the other details. */
export function TokenStatus(props: {
  readonly context: Context
  readonly input: SlotMap["prompt.footer.status"]
  readonly store: SettingsStore
}) {
  const counts = useCounts({
    context: props.context,
    store: props.store,
    sessionID: () => props.input.sessionID,
  })

  const label = () => {
    const parts: string[] = []
    const tokens = counts.totalCount()
    if (tokens) parts.push(`${tokens} tok total`)
    const cost = counts.totalCostLabel()
    if (cost) parts.push(cost)
    return parts.length > 0 ? parts.join(" · ") : undefined
  }

  return (
    <Show when={label()}>
      <text fg={props.context.theme.text.muted} wrapMode="none" flexShrink={0}>
        {label()}
      </text>
    </Show>
  )
}
