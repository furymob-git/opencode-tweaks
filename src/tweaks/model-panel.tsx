import type { Context, SlotMap } from "@opencode/plugin/tui/context"
import { TextAttributes } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { type CatalogModel, paidSibling } from "../usage/catalog"
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
const FREE = setting("free")

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
  const freeMode = () => String(props.store.read(modelTweak, FREE).value)

  /**
   * The model the next prompt would use, read from the prompt selection so a
   * switch in `/models` shows its rates at once. The session only supplies a
   * model for a transcript opened without a prompt of its own.
   */
  const model = createMemo<ModelRef | undefined>(() => {
    const current = props.context.ui.model.current()
    if (current) return { providerID: current.providerID, id: current.modelID }

    return props.context.data.session.get(props.input.sessionID)?.model
  })

  const catalog = () => props.context.data.location.model.list() ?? []

  /** The catalog entry for that model, when the catalog knows it. */
  const entry = createMemo<CatalogModel | undefined>(() => {
    const ref = model()
    if (!ref) return undefined

    return catalog().find(
      (candidate) =>
        candidate.providerID === ref.providerID &&
        (candidate.modelID === ref.id || candidate.id === ref.id),
    )
  })

  /** The context the session has read so far, which picks a long-context tier. */
  const contextSize = createMemo(() => {
    const tokens = props.context.data.session.get(props.input.sessionID)?.tokens
    return tokens ? tokens.input + tokens.cache.read : 0
  })

  const price = createMemo(() => {
    const list = entry()?.cost
    return list && list.length > 0 ? priceFor(list, contextSize()) : undefined
  })

  /** A free model bills zero on every rate the card can show. */
  const freeModel = createMemo(() => {
    const value = price()
    return value ? value.input === 0 && value.output === 0 && value.cache.read === 0 : false
  })

  /** The paid list price of a free promo, when the catalog has its sibling. */
  const reference = createMemo(() => {
    if (!freeModel() || freeMode() !== "reference") return undefined
    const selected = entry()
    if (!selected) return undefined

    const sibling = paidSibling(catalog(), selected)
    return sibling ? priceFor(sibling.cost, contextSize()) : undefined
  })

  /** The rates on screen: the selected model's, or the reference it borrows. */
  const shown = createMemo(() => reference() ?? (freeModel() ? undefined : price()))

  const rates = createMemo(() => {
    const value = shown()
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

  /** A free model with no reference price says so instead of drawing zeroes. */
  const freeLabel = createMemo(() => {
    if (!freeModel() || reference()) return false
    return inputOn() || outputOn() || cacheOn()
  })

  /** `Hide card` removes the panel entirely while a free model is selected. */
  const hidden = () => freeModel() && freeMode() === "hidden"

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

  /** The price multiplier now, `1` when the catalog price is the one charged. */
  const multiplier = () => peak()?.multiplier ?? 1

  const showMultiplier = () => peakOn() && scheduled() && (peak() !== undefined || !peakOnly())

  // The live peak marker follows the clock, so refresh it while the card can
  // show one. Models without a schedule and a hidden peak state need no timer.
  createEffect(() => {
    if (!peakOn() || !scheduled()) return

    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <Show when={!hidden()}>
      <box flexDirection="column">
        <box
          flexDirection="row"
          justifyContent="space-between"
          onMouseUp={() => setCollapsed((value) => !value)}
        >
          <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
            {collapsed() ? "▶" : "▼"} Model
          </text>
          <Show when={showMultiplier()}>
            <text
              fg={peak() ? theme().text.feedback.warning.base : theme().text.base}
              wrapMode="none"
            >
              {`×${multiplier()}`}
            </text>
          </Show>
        </box>
        <Show when={!collapsed()}>
          <Show when={model()} fallback={<text fg={theme().text.muted}>No model selected</text>}>
            <Show
              when={!freeLabel()}
              fallback={
                <text fg={theme().hue.accent[200]} attributes={TextAttributes.BOLD}>
                  Free
                </text>
              }
            >
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
                    <text
                      flexShrink={0}
                      fg={row.muted ? theme().text.muted : theme().hue.accent[200]}
                    >
                      {row.value}
                    </text>
                  </box>
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </box>
    </Show>
  )
}
