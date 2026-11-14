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
const PEAK = setting("peak")
const PEAK_ONLY = setting("peakOnly")
const ALIGN = setting("align")

/** The ref stored on a session or returned by the composer. */
interface ModelRef {
  readonly providerID: string
  readonly id: string
}

/**
 * The model card sits under the quota and carries what the bottom bar does
 * not: the current model's list price and its provider's peak state. The
 * model name and variant already live on that bar, so the card stays compact.
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
  const peakOn = () => props.store.read(modelTweak, PEAK).value === true
  const peakOnly = () => props.store.read(modelTweak, PEAK_ONLY).value === true
  const alignRight = () => props.store.read(modelTweak, ALIGN).value === "right"

  /** The session's model, or the composer's while the session has none yet. */
  const model = createMemo<ModelRef | undefined>(() => {
    const session = props.context.data.session.get(props.input.sessionID)
    if (session?.model) return session.model

    const current = props.context.ui.model.current()
    return current ? { providerID: current.providerID, id: current.modelID } : undefined
  })

  /** The catalog rates for that model, when the catalog knows it. */
  const costs = createMemo(() => {
    const ref = model()
    if (!ref) return []

    return (
      (props.context.data.location.model.list() ?? []).find(
        (candidate) =>
          candidate.providerID === ref.providerID &&
          (candidate.modelID === ref.id || candidate.id === ref.id),
      )?.cost ?? []
    )
  })

  /** The context the session has read so far, which picks a long-context tier. */
  const contextSize = createMemo(() => {
    const tokens = props.context.data.session.get(props.input.sessionID)?.tokens
    return tokens ? tokens.input + tokens.cache.read : 0
  })

  const price = createMemo(() => {
    const list = costs()
    return list.length > 0 ? priceFor(list, contextSize()) : undefined
  })

  const rates = createMemo(() => {
    const value = price()
    if (!value) return []

    const rows: { label: string; value: string; muted?: boolean }[] = []
    if (inputOn()) rows.push({ label: "Input", value: formatRate(value.input) })
    if (outputOn()) rows.push({ label: "Output", value: formatRate(value.output) })
    if (cacheOn()) rows.push({ label: "Cache", value: formatRate(value.cache.read) })
    if (rows.length > 0 && value.tier) {
      rows.push({
        label: "From",
        value: `>${formatTokens(value.tier.size, "compact")}`,
        muted: true,
      })
    }

    return rows
  })

  /** The widest label, so the prices start on one column. */
  const labelWidth = createMemo(() =>
    rates().reduce((width, row) => Math.max(width, row.label.length), 0),
  )

  const scheduled = () => {
    const ref = model()
    return ref ? hasPriceSchedule(ref) : false
  }

  const peak = () => {
    const ref = model()
    if (!ref || !peakOn() || !scheduled()) return undefined
    return priceWindowFor(ref, new Date(now()))
  }

  /** The higher price the provider charges right now, or base price as `1`. */
  const multiplier = () => peak()?.multiplier ?? 1

  const state = () => {
    if (!peakOn() || !scheduled()) return undefined
    const value = multiplier()
    if (value === 1 && peakOnly()) return undefined
    return `×${value}`
  }

  // The live peak marker follows the clock, so refresh it while the card can
  // show one. Models without a schedule and a hidden peak state need no timer.
  createEffect(() => {
    if (!peakOn() || !scheduled()) return

    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <box flexDirection="column">
      <box flexDirection="row" onMouseUp={() => setCollapsed((value) => !value)}>
        <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
          {collapsed() ? "▶" : "▼"} Model
          <span
            style={{
              fg: multiplier() > 1 ? theme().text.feedback.warning.base : theme().text.muted,
            }}
          >
            {state() ? ` ${state()}` : ""}
          </span>
        </text>
      </box>
      <Show when={!collapsed()}>
        <Show when={model()} fallback={<text fg={theme().text.muted}>No model selected</text>}>
          <For each={rates()}>
            {(row) => (
              <box
                flexDirection="row"
                justifyContent={alignRight() ? "space-between" : "flex-start"}
                gap={1}
              >
                <text flexShrink={0} fg={theme().text.base}>
                  {alignRight() ? row.label : row.label.padEnd(labelWidth())}
                </text>
                <text flexShrink={0} fg={row.muted ? theme().text.muted : theme().hue.accent[200]}>
                  {row.value}
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>
    </box>
  )
}
