import type { Context, SlotMap } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js"
import {
  type CostDigits,
  estimateCost,
  formatCost,
  isCostDigits,
  type ModelPrice,
  messagesCost,
  priceFor,
} from "../usage/cost"
import { footerMessage, replyTurnMessages, type UsageMessage } from "../usage/messages"
import { formatTokens, sessionTokens, type TokenCount, usageTokens } from "../usage/tokens"
import { costTweak } from "./cost"
import type { SettingsStore } from "./settings"
import { tokensTweak } from "./tokens"
import type { Tweak, TweakSetting } from "./types"
import type { UsageInjector } from "./usage-inject"

function setting(tweak: Tweak, id: string): TweakSetting {
  const found = tweak.settings.find((item) => item.id === id)
  if (!found) throw new Error(`${tweak.title} setting "${id}" is missing`)
  return found
}

const TOKENS_ON = setting(tokensTweak, "enabled")
const PROMPT = setting(tokensTweak, "prompt")
const TOTAL = setting(tokensTweak, "total")
const SUBAGENTS = setting(tokensTweak, "subagents")
const COUNT = setting(tokensTweak, "count")
const FORMAT = setting(tokensTweak, "format")
const TTFT = setting(tokensTweak, "ttft")

const COST_ON = setting(costTweak, "enabled")
const PROMPT_COST = setting(costTweak, "prompt")
const TOTAL_COST = setting(costTweak, "total")
const COST_DIGITS = setting(costTweak, "digits")
const ESTIMATE = setting(costTweak, "estimate")

/**
 * The figures, shared by both placements. The prompt figures follow the open
 * session because a prompt belongs to it. The totals optionally follow the
 * session tree, since a subagent's usage belongs to the turn its parent
 * started. Tokens and cost can be switched off independently.
 */
function useUsage(props: {
  readonly context: Context
  readonly store: SettingsStore
  readonly sessionID: () => string | undefined
}) {
  const tokensOn = () => props.store.read(tokensTweak, TOKENS_ON).value === true
  const costOn = () => props.store.read(costTweak, COST_ON).value === true
  const perPrompt = () => props.store.read(tokensTweak, PROMPT).value === true
  const sessionTotal = () => props.store.read(tokensTweak, TOTAL).value === true
  const subagents = () => props.store.read(tokensTweak, SUBAGENTS).value === true
  const promptCost = () => props.store.read(costTweak, PROMPT_COST).value === true
  const totalCost = () => props.store.read(costTweak, TOTAL_COST).value === true
  const estimate = () => props.store.read(costTweak, ESTIMATE).value === true
  const ttft = () => props.store.read(tokensTweak, TTFT).value !== false
  const costDigits = (): CostDigits => {
    const value = props.store.read(costTweak, COST_DIGITS).value
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
      ? (message: UsageMessage) => {
          const tokens = message.tokens
          if (!tokens) return undefined
          return priceOf(message.model, tokens.input + tokens.cache.read)
        }
      : undefined

    return messagesCost(turn(), lookup)
  })

  /** The formatted count, or `undefined` while there is nothing worth showing. */
  const format = (value: number) => (value > 0 ? formatTokens(value, style()) : undefined)

  const promptCount = () => (tokensOn() && perPrompt() ? format(prompt()) : undefined)
  const totalCount = () => (tokensOn() && sessionTotal() ? format(total()) : undefined)
  const promptCostLabel = () => {
    const value = cost()
    return costOn() && promptCost() && value !== undefined
      ? formatCost(value, costDigits())
      : undefined
  }
  const totalCostLabel = () =>
    costOn() && totalCost() ? formatCost(sessionCost(), costDigits()) : undefined

  return {
    enabled: () => tokensOn() || costOn(),
    // The host keeps its own ttft figure whenever the token tweak is off.
    ttft: () => !tokensOn() || ttft(),
    promptKey,
    promptCount,
    totalCount,
    promptCostLabel,
    totalCostLabel,
  }
}

/**
 * Inline placement has no row of its own: it hands the prompt figures to the
 * injector, which splices them into the host's tok/s line. The composer slot is
 * claimed anyway because it is the published place that gives the plugin a
 * reactive session context above the prompt; this component renders nothing.
 */
export function UsageInline(props: {
  readonly context: Context
  readonly input: SlotMap["session.composer.top"]
  readonly store: SettingsStore
  readonly injector: UsageInjector
}) {
  const usage = useUsage({
    context: props.context,
    store: props.store,
    sessionID: () => props.input.sessionID,
  })

  createEffect(() => {
    if (!usage.enabled()) {
      props.injector.clear()
      return
    }

    props.injector.setTtft(usage.ttft())

    const count = usage.promptCount()
    const cost = usage.promptCostLabel()
    props.injector.setLabels(
      {
        before: count ? ` · ${count} tok` : undefined,
        after: cost ? ` · ${cost}` : undefined,
      },
      usage.promptKey(),
    )
  })

  return null
}

/** The bottom status line, next to the working directory and the other details. */
export function UsageStatus(props: {
  readonly context: Context
  readonly input: SlotMap["prompt.footer.status"]
  readonly store: SettingsStore
  readonly injector: UsageInjector
}) {
  const usage = useUsage({
    context: props.context,
    store: props.store,
    sessionID: () => props.input.sessionID,
  })

  // The host prints its own shell and subagent indicator before the context
  // usage, so the figures normally ride on that text. The slot is only a
  // fallback for a footer with neither of them.
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

  const figures = () => {
    const parts: string[] = []
    const tokens = usage.totalCount()
    if (tokens) parts.push(`${tokens} tok total`)
    const cost = usage.totalCostLabel()
    if (cost) parts.push(cost)
    return parts.length > 0 ? parts.join(" · ") : undefined
  }

  const [placed, setPlaced] = createSignal(false)

  const repaint = () => props.injector.setFooterFigures(figures(), setPlaced)

  createEffect(() => {
    // Read the host's detail state so the figures follow the usage line when
    // the host shows or hides it.
    props.input.showDetails
    repaint()
  })

  // The host adds or removes its shell indicator in a render pass of its own,
  // which rebuilds the usage text and leaves the figures beside a stray
  // separator for a moment. Repainting right away, then again over the next
  // frames, keeps the line from settling visibly.
  let lastPresence: boolean | undefined
  createEffect(() => {
    const present = children()
    if (present === lastPresence) return
    lastPresence = present
    // The usage counters must not re-run this effect: it would cancel the
    // follow-up passes every time a figure changes.
    untrack(repaint)
    const passes = [16, 50, 150].map((delay) => setTimeout(() => untrack(repaint), delay))
    onCleanup(() => {
      for (const pass of passes) clearTimeout(pass)
    })
  })

  const [stale, setStale] = createSignal(false)

  createEffect(() => {
    // A rejected splice is transient while the host redraws the line, so the
    // slot only takes over after the figures have stayed out for a while.
    setStale(false)
    if (placed()) return
    const timer = setTimeout(() => setStale(true), 500)
    onCleanup(() => clearTimeout(timer))
  })

  // The injector owns the real line: it puts the figures after the shell
  // indicator and before the context usage. The slot is only a last resort
  // after the splice has stayed unavailable, so nothing flashes to the wrong
  // side of a shell while the host is still drawing it.
  const fallback = () => (placed() || !stale() ? undefined : figures())

  return (
    <Show when={fallback()}>
      <text fg={props.context.theme.text.muted} wrapMode="none" flexShrink={0}>
        {fallback()}
      </text>
    </Show>
  )
}
