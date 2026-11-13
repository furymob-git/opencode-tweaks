import type { Context, SlotMap } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, Show } from "solid-js"
import type { SettingsStore } from "./settings"
import type { TokenInjector } from "./token-inject"
import { tokensTweak } from "./tokens"
import {
  type CostDigits,
  estimateCost,
  footerMessage,
  formatCost,
  formatTokens,
  isCostDigits,
  type ModelPrice,
  messagesCost,
  priceFor,
  replyTurnMessages,
  sessionTokens,
  type TokenCount,
  type TokenMessage,
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
const ESTIMATE = setting("estimateCost")
const FORMAT = setting("format")
const TTFT = setting("ttft")

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
  const estimate = () => props.store.read(tokensTweak, ESTIMATE).value === true
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

  // List prices come from the model catalog the TUI already synced, so an
  // estimate costs nothing but a lookup.
  const prices = createMemo(() => {
    const map = new Map<string, readonly ModelPrice[]>()
    for (const model of props.context.data.location.model.list() ?? []) {
      map.set(`${model.providerID}/${model.modelID}`, model.cost)
    }
    return map
  })

  /** The list price of a model at a context size, when the catalog knows it. */
  function priceOf(
    ref: { readonly providerID: string; readonly id: string } | undefined,
    context: number,
  ) {
    if (!ref) return undefined
    const list = prices().get(`${ref.providerID}/${ref.id}`)
    return list ? priceFor(list, context) : undefined
  }

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

  // The inline figures describe the turn whose footer is on screen: the host
  // draws one line per finished turn, so a prompt with no finished reply keeps
  // the previous turn's figures on its own line.
  const turn = createMemo(() => {
    const sessionID = props.sessionID()
    return sessionID ? replyTurnMessages(messages(sessionID)) : []
  })

  const prompt = createMemo(() => sessionTokens(turn(), count()))

  // The footer the figures belong to, so the injector only writes them on that
  // line and never on the older one while the host catches up.
  const promptKey = createMemo(() => {
    const sessionID = props.sessionID()
    return sessionID ? footerMessage(messages(sessionID))?.id : undefined
  })

  // A reply that has not produced a counter yet is still empty, so it shows no
  // figures rather than a zero cost.
  const replied = createMemo(() =>
    turn().some((message) => {
      if (message.type !== "assistant") return false
      if ((message.cost ?? 0) > 0) return true
      return message.tokens ? usageTokens(message.tokens, "all") > 0 : false
    }),
  )

  const sessionCost = createMemo(() =>
    family().reduce((sum, sessionID) => {
      const session = sessions.get(sessionID)
      const reported = session?.cost ?? 0
      if (reported > 0 || !estimate() || !session?.tokens) return sum + reported

      const price = priceOf(session.model, session.tokens.input + session.tokens.cache.read)
      return sum + (price ? estimateCost(session.tokens, price) : 0)
    }, 0),
  )

  const cost = createMemo(() => {
    if (!replied()) return undefined

    const lookup = estimate()
      ? (message: TokenMessage) => {
          const tokens = message.tokens
          if (!tokens) return undefined
          return priceOf(message.model, tokens.input + tokens.cache.read)
        }
      : undefined

    return messagesCost(turn(), lookup)
  })

  /** The formatted count, or `undefined` while there is nothing worth showing. */
  const format = (value: number) => (value > 0 ? formatTokens(value, style()) : undefined)

  const promptCount = () => (enabled() && perPrompt() ? format(prompt()) : undefined)
  const totalCount = () => (enabled() && sessionTotal() ? format(total()) : undefined)
  const promptCostLabel = () => {
    const value = cost()
    return enabled() && promptCost() && value !== undefined
      ? formatCost(value, costDigits())
      : undefined
  }
  const totalCostLabel = () =>
    enabled() && totalCost() ? formatCost(sessionCost(), costDigits()) : undefined

  return { enabled, promptKey, promptCount, totalCount, promptCostLabel, totalCostLabel }
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
    if (!counts.enabled()) {
      props.injector.clear()
      return
    }

    props.injector.setTtft(props.store.read(tokensTweak, TTFT).value !== false)

    const count = counts.promptCount()
    const cost = counts.promptCostLabel()
    props.injector.setLabels(
      {
        before: count ? ` · ${count} tok` : undefined,
        after: cost ? ` · ${cost}` : undefined,
      },
      counts.promptKey(),
    )
  })

  return null
}

/** The bottom status line, next to the working directory and the other details. */
export function TokenStatus(props: {
  readonly context: Context
  readonly input: SlotMap["prompt.footer.status"]
  readonly store: SettingsStore
  readonly injector: TokenInjector
}) {
  const counts = useCounts({
    context: props.context,
    store: props.store,
    sessionID: () => props.input.sessionID,
  })

  // The host prints its own shell and subagent indicator before the context
  // usage. Knowing whether one is on screen lets the total keep its separator
  // only when something follows it.
  const children = createMemo(() => {
    const sessionID = props.input.sessionID
    if (!sessionID) return false

    try {
      const shells = props.context.data.shell
        .list(props.context.location)
        .filter(
          (shell) =>
            (shell.metadata as { sessionID?: string } | undefined)?.sessionID === sessionID,
        ).length
      const sessions = props.context.data.session
      const subagents = sessions
        .family(sessionID)
        .filter((id) => id !== sessionID && sessions.status(id) === "running").length
      return shells + subagents > 0
    } catch {
      // A session the client has not synced yet simply has no indicator.
      return false
    }
  })

  const label = () => {
    const tokens = counts.totalCount()
    if (!tokens) return undefined
    return props.input.showDetails || children() ? `${tokens} tok total ·` : `${tokens} tok total`
  }

  createEffect(() => {
    // Read the host's detail state so the cost follows the usage line when the
    // host shows or hides it.
    props.input.showDetails
    children()
    const cost = counts.totalCostLabel()
    props.injector.setFooterCost(cost ? ` · ${cost}` : undefined)
  })

  return (
    <Show when={label()}>
      <text fg={props.context.theme.text.muted} wrapMode="none" flexShrink={0} marginRight={-1}>
        {label()}
      </text>
    </Show>
  )
}
