import type { Context, SlotMap } from "@opencode/plugin/tui/context"
import { TextAttributes } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { formatRate, priceFor } from "../usage/cost"
import { hasPriceSchedule, priceWindowFor } from "../usage/price-window"
import { formatTokens } from "../usage/tokens"
import { modelTweak } from "./model"
import type { SettingsStore } from "./settings"
import type { TweakSetting } from "./types"

function setting(id: string): TweakSetting {
  const found = modelTweak.settings.find((item) => item.id === id)
  if (!found) throw new Error(`Model setting "${id}" is missing`)
  return found
}

const ENABLED = setting("enabled")
const INPUT = setting("input")
const OUTPUT = setting("output")
const CACHE = setting("cache")
const VARIANT = setting("variant")
const PEAK = setting("peak")

/** The ref stored on a session or returned by the composer. */
interface ModelRef {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

/**
 * The model card is a companion to the cost figures: it names the model and
 * lists its catalog rates, while the cost tweak counts what the session spent.
 */
export function ModelPanel(props: {
  readonly context: Context
  readonly input: SlotMap["sidebar.content"]
  readonly store: SettingsStore
}) {
  const enabled = () => props.store.read(modelTweak, ENABLED).value === true

  return (
    <Show when={enabled()}>
      <ModelBody context={props.context} input={props.input} store={props.store} />
    </Show>
  )
}

function ModelBody(props: {
  readonly context: Context
  readonly input: SlotMap["sidebar.content"]
  readonly store: SettingsStore
}) {
  const theme = () => props.context.theme
  const [now, setNow] = createSignal(Date.now())
  const [collapsed, setCollapsed] = createSignal(false)

  const inputOn = () => props.store.read(modelTweak, INPUT).value === true
  const outputOn = () => props.store.read(modelTweak, OUTPUT).value === true
  const cacheOn = () => props.store.read(modelTweak, CACHE).value === true
  const variantOn = () => props.store.read(modelTweak, VARIANT).value === true
  const peakOn = () => props.store.read(modelTweak, PEAK).value === true

  /** The session's model, or the composer's while the session has none yet. */
  const model = createMemo<ModelRef | undefined>(() => {
    const session = props.context.data.session.get(props.input.sessionID)
    if (session?.model) return session.model

    const current = props.context.ui.model.current()
    return current
      ? { providerID: current.providerID, id: current.modelID, variant: current.variant }
      : undefined
  })

  /** The catalog entry for that model, with what the panel needs to show it. */
  const entry = createMemo(() => {
    const ref = model()
    if (!ref) return undefined

    const found = (props.context.data.location.model.list() ?? []).find(
      (candidate) =>
        candidate.providerID === ref.providerID &&
        (candidate.modelID === ref.id || candidate.id === ref.id),
    )
    const provider = (props.context.data.location.provider.list() ?? []).find(
      (candidate) => candidate.id === ref.providerID,
    )

    return {
      ref,
      name: found?.name ?? ref.id,
      provider: provider?.name,
      costs: found?.cost ?? [],
    }
  })

  /** The context the session has read so far, which picks a long-context tier. */
  const contextSize = createMemo(() => {
    const tokens = props.context.data.session.get(props.input.sessionID)?.tokens
    return tokens ? tokens.input + tokens.cache.read : 0
  })

  const price = createMemo(() => {
    const costs = entry()?.costs
    return costs?.length ? priceFor(costs, contextSize()) : undefined
  })

  const rates = createMemo(() => {
    const value = price()
    if (!value) return []

    const rows: { label: string; value: string }[] = []
    if (inputOn()) rows.push({ label: "in", value: formatRate(value.input) })
    if (outputOn()) rows.push({ label: "out", value: formatRate(value.output) })
    if (cacheOn()) rows.push({ label: "cache", value: formatRate(value.cache.read) })
    if (rows.length > 0 && value.tier) {
      rows.push({ label: "from", value: `>${formatTokens(value.tier.size, "compact")}` })
    }

    return rows
  })

  const variant = () => (variantOn() ? entry()?.ref.variant : undefined)

  const title = () => {
    const name = entry()?.name
    const selected = variant()
    return selected ? `${name} · ${selected}` : name
  }

  const scheduled = () => {
    const ref = entry()?.ref
    return ref ? hasPriceSchedule(ref) : false
  }

  const peak = () => {
    const ref = entry()?.ref
    if (!ref || !peakOn() || !scheduled()) return undefined
    return priceWindowFor(ref, new Date(now()))
  }

  const stateValue = () => {
    if (!peakOn() || !scheduled()) return undefined
    const value = peak()
    return value ? `${value.label} ×${value.multiplier} now` : "off-peak"
  }

  // The live peak marker follows the clock, so refresh it while the card can
  // show one. Models without a schedule and a hidden peak row need no timer.
  createEffect(() => {
    if (!peakOn() || !scheduled()) return

    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <box flexDirection="column" marginTop={1}>
      <box
        flexDirection="row"
        justifyContent="space-between"
        onMouseUp={() => setCollapsed((value) => !value)}
      >
        <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
          {collapsed() ? "▶" : "▼"} Model
        </text>
        <Show when={entry()?.provider}>
          <text fg={theme().text.muted} wrapMode="none">
            {entry()?.provider}
          </text>
        </Show>
      </box>
      <Show when={!collapsed()}>
        <Show when={entry()} fallback={<text fg={theme().text.muted}>No model selected</text>}>
          <text fg={theme().text.base} wrapMode="word">
            {title()}
          </text>
          <For each={rates()}>
            {(row) => (
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} fg={theme().text.muted}>
                  {row.label.padEnd(5)}
                </text>
                <text fg={theme().text.base}>{row.value}</text>
              </box>
            )}
          </For>
          <Show when={stateValue()}>
            <box flexDirection="row" gap={1}>
              <text flexShrink={0} fg={theme().text.muted}>
                {"state".padEnd(5)}
              </text>
              <text fg={peak() ? theme().text.feedback.warning.base : theme().text.muted}>
                {stateValue()}
              </text>
            </box>
          </Show>
        </Show>
      </Show>
    </box>
  )
}
