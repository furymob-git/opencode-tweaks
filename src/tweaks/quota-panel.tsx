import { usePlugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { type BoxRenderable, CliRenderEvents, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { barParts, formatPercent, formatReset, levelOf } from "../quota/format"
import { Quota, type QuotaSnapshot, type QuotaWindowSnapshot } from "../rpc"
import { quotaTweak } from "./quota"
import type { SettingsStore } from "./settings"
import type { TweakSetting } from "./types"

/**
 * The sidebar content is narrower than the 42-column sidebar itself. Cap the row
 * here so the reset column always fits, even before the real width is measured.
 */
const MAX_ROW_WIDTH = 38
const LABEL_WIDTH = 3
const MIN_PERCENT_WIDTH = 3
const RESET_WIDTH = 6

function setting(id: string): TweakSetting {
  const found = quotaTweak.settings.find((item) => item.id === id)
  if (!found) throw new Error(`Quota setting "${id}" is missing`)
  return found
}

const ENABLED = setting("enabled")
const BAR_WIDTH = setting("barWidth")
const PERCENT = setting("percent")
const SHOW_RESET = setting("showReset")
const PROVIDER_ALIGN = setting("providerAlign")
const PROVIDER_TAB = setting("providerTab")

const FEEDBACK = {
  good: "success",
  warning: "warning",
  low: "error",
} as const

export function QuotaPanel(props: { readonly context: Context; readonly store: SettingsStore }) {
  const enabled = () => props.store.read(quotaTweak, ENABLED).value === true

  return (
    <Show when={enabled()}>
      <QuotaBody context={props.context} store={props.store} />
    </Show>
  )
}

function QuotaBody(props: { readonly context: Context; readonly store: SettingsStore }) {
  const theme = () => props.context.theme
  const dimensions = useTerminalDimensions()
  const [snapshot, setSnapshot] = createSignal<QuotaSnapshot>()
  const [now, setNow] = createSignal(Date.now())
  const [panelWidth, setPanelWidth] = createSignal(MAX_ROW_WIDTH)
  const [collapsed, setCollapsed] = createSignal(false)

  let root: BoxRenderable | undefined
  let refreshing = false
  let stopped = false
  let poll: ReturnType<typeof setInterval> | undefined
  let tick: ReturnType<typeof setInterval> | undefined

  // The slot does not publish its width, so measure the rendered panel after layout.
  createEffect(() => {
    dimensions().width

    const measure = () => {
      const width = root?.getLayout().width
      if (typeof width === "number" && width > 0) {
        setPanelWidth(Math.min(MAX_ROW_WIDTH, Math.floor(width)))
      }
    }
    props.context.renderer.once(CliRenderEvents.FRAME, measure)
    props.context.renderer.requestRender()
  })

  async function refresh() {
    if (refreshing || stopped) return

    refreshing = true
    try {
      const result = (await props.context.client.rpc(Quota).snapshot({})) as QuotaSnapshot
      if (!stopped) setSnapshot(result)
    } catch (error) {
      if (!stopped) {
        setSnapshot({
          provider: "OpenCode Go",
          capturedAt: Date.now(),
          windows: [],
          error: (error instanceof Error ? error.message : String(error)).slice(0, 160),
        })
      }
    } finally {
      refreshing = false
    }
  }

  onMount(() => {
    void refresh()
    poll = setInterval(() => void refresh(), 120_000)
    tick = setInterval(() => setNow(Date.now()), 30_000)
  })

  onCleanup(() => {
    stopped = true
    if (poll) clearInterval(poll)
    if (tick) clearInterval(tick)
  })

  const showReset = createMemo(() => props.store.read(quotaTweak, SHOW_RESET).value === true)
  const mode = createMemo<"remaining" | "used">(() =>
    props.store.read(quotaTweak, PERCENT).value === "used" ? "used" : "remaining",
  )
  const providerJustify = createMemo<"flex-start" | "center" | "flex-end">(() => {
    const value = props.store.read(quotaTweak, PROVIDER_ALIGN).value
    if (value === "center") return "center"
    if (value === "right") return "flex-end"
    return "flex-start"
  })
  const inlineProvider = createMemo(() => props.store.read(quotaTweak, PROVIDER_TAB).value === true)
  const percentWidth = createMemo(() => {
    const windows = snapshot()?.windows ?? []
    const widest = windows.reduce((width, window) => {
      const remaining = Math.max(0, Math.min(100, window.percentRemaining))
      const shown = mode() === "used" ? 100 - remaining : remaining
      return Math.max(width, formatPercent(shown).length)
    }, 0)

    return Math.max(MIN_PERCENT_WIDTH, widest)
  })

  const width = createMemo(() => {
    const fixed = LABEL_WIDTH + percentWidth() + 2 + (showReset() ? RESET_WIDTH + 1 : 0)
    const auto = Math.max(8, Math.min(panelWidth(), MAX_ROW_WIDTH) - fixed)
    const value = props.store.read(quotaTweak, BAR_WIDTH).value
    return typeof value === "number" ? Math.max(1, Math.min(value, auto)) : auto
  })

  return (
    <box
      ref={(renderable) => {
        root = renderable
      }}
      flexDirection="column"
    >
      <box
        width={panelWidth()}
        flexDirection="row"
        onMouseUp={() => setCollapsed((value) => !value)}
      >
        <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
          {collapsed() ? "▶" : "▼"} Quota
        </text>
        <Show when={inlineProvider() && snapshot()}>
          <box flexGrow={1} flexDirection="row" justifyContent={providerJustify()}>
            <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
              {providerJustify() === "flex-start"
                ? ` ${snapshot()?.provider ?? ""}`
                : snapshot()?.provider}
            </text>
          </box>
        </Show>
      </box>
      <Show when={!collapsed()}>
        <Show
          when={snapshot()}
          keyed
          fallback={<text fg={theme().text.muted}>Loading quota…</text>}
        >
          {(data: QuotaSnapshot) => (
            <>
              <Show when={!inlineProvider()}>
                <box width={panelWidth()} flexDirection="row" justifyContent={providerJustify()}>
                  <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
                    {data.provider}
                  </text>
                </box>
              </Show>
              <Show when={data.error && data.windows.length === 0}>
                <text fg={theme().text.muted} wrapMode="word">
                  {data.error}
                </text>
              </Show>
              <For each={data.windows}>
                {(window) => (
                  <QuotaRow
                    window={window}
                    width={width()}
                    percentWidth={percentWidth()}
                    showReset={showReset()}
                    mode={mode()}
                    now={now()}
                  />
                )}
              </For>
            </>
          )}
        </Show>
      </Show>
    </box>
  )
}

function QuotaRow(props: {
  readonly window: QuotaWindowSnapshot
  readonly width: number
  readonly percentWidth: number
  readonly showReset: boolean
  readonly mode: "remaining" | "used"
  readonly now: number
}) {
  const context = usePlugin()
  const theme = () => context.theme
  const remaining = () => Math.max(0, Math.min(100, props.window.percentRemaining))
  const shown = () => (props.mode === "used" ? 100 - remaining() : remaining())
  const color = () => theme().text.feedback[FEEDBACK[levelOf(remaining())]].base
  const bar = createMemo(() => barParts(shown(), props.width))
  const reset = createMemo(() => formatReset(props.window.resetsAt, props.now))

  return (
    <box flexDirection="row" gap={1}>
      <text flexShrink={0} fg={theme().text.base}>
        {props.window.key.padEnd(LABEL_WIDTH)}
      </text>
      <text flexShrink={0}>
        <span style={{ fg: color() }}>{bar().filled}</span>
        <span style={{ fg: theme().text.muted }}>{bar().empty}</span>
      </text>
      <text flexShrink={0} fg={color()}>
        {formatPercent(shown()).padStart(props.percentWidth)}
      </text>
      <Show when={props.showReset}>
        <text flexShrink={0} fg={theme().text.muted}>
          {reset().padStart(RESET_WIDTH)}
        </text>
      </Show>
    </box>
  )
}
