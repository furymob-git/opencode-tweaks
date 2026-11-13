import { usePlugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { type BoxRenderable, CliRenderEvents, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { barParts, errorText, formatPercent, formatReset, levelOf } from "../quota/format"
import {
  dayKey,
  endOfDay,
  isCurrent,
  isWorkday,
  longestWindow,
  type PaceEntry,
  type PaceProgress,
  paceProgress,
  paceSignature,
  startPace,
} from "../quota/pace"
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
/** A failed read retries quickly, because a plugin reload can drop one call. */
const POLL_MS = 120_000
const RETRY_MS = 20_000

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
const ONLY_CURRENT = setting("onlyCurrentModel")
const DAILY_BUDGET = setting("dailyBudget")
const RESERVE = setting("reserve")
/** Workday settings ordered like `Date#getDay`, with Sunday first. */
const WORKDAYS = [
  setting("workSun"),
  setting("workMon"),
  setting("workTue"),
  setting("workWed"),
  setting("workThu"),
  setting("workFri"),
  setting("workSat"),
]

/** The stored budget of one provider's pacing window. */
const PACE_STORE = "opencode-tweaks.quota-pace"

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

/**
 * Quotas are provider-specific: each one the server knows about comes back as a
 * snapshot, and a provider it cannot read comes back as nothing. The panel
 * therefore names no provider itself.
 */
function QuotaBody(props: { readonly context: Context; readonly store: SettingsStore }) {
  const theme = () => props.context.theme
  const dimensions = useTerminalDimensions()
  const [snapshots, setSnapshots] = createSignal<readonly QuotaSnapshot[]>([])
  const [error, setError] = createSignal<string>()
  const [now, setNow] = createSignal(Date.now())
  const [panelWidth, setPanelWidth] = createSignal(MAX_ROW_WIDTH)
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())

  let root: BoxRenderable | undefined
  let refreshing = false
  let stopped = false
  let poll: ReturnType<typeof setTimeout> | undefined
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

  const onlyCurrent = () => props.store.read(quotaTweak, ONLY_CURRENT).value === true

  const dailyBudget = createMemo(() => props.store.read(quotaTweak, DAILY_BUDGET).value === true)
  const reserve = createMemo(() => {
    const value = props.store.read(quotaTweak, RESERVE).value
    return typeof value === "number" ? value : 0
  })
  const workdays = createMemo(() =>
    WORKDAYS.map((item) => props.store.read(quotaTweak, item).value === true),
  )

  // The day's allowance is frozen at the first reading of the day, so the bar
  // only moves when quota is spent instead of shrinking on every refresh.
  const [pace, updatePace] = props.context.storage.store<Record<string, PaceEntry>>(PACE_STORE, {
    initial: {},
  })

  createEffect(() => {
    const moment = now()
    const mask = workdays()
    const keep = reserve()
    const signature = paceSignature(mask, keep)
    const day = dayKey(moment)

    for (const snapshot of snapshots()) {
      const window = longestWindow(snapshot.windows)
      if (!window) continue

      const key = paceKey(snapshot.providerID, window.key)
      if (isCurrent(pace[key], day, window.resetsAt, signature)) continue

      const entry = startPace(
        window.percentRemaining,
        day,
        window.resetsAt,
        signature,
        mask,
        keep,
        moment,
      )
      void updatePace((draft) => {
        draft[key] = entry
      })
    }
  })

  /** What the daily bar shows for one provider, or nothing when it has none. */
  function budgetOf(snapshot: QuotaSnapshot): DayBudget | undefined {
    if (!dailyBudget()) return undefined

    const window = longestWindow(snapshot.windows)
    if (!window) return undefined

    const entry = pace[paceKey(snapshot.providerID, window.key)]
    if (!entry) return undefined

    return {
      progress: paceProgress(entry, window.percentRemaining),
      rest: !isWorkday(now(), workdays()),
    }
  }

  /**
   * The provider whose quota the panel follows. `undefined` asks the server for
   * every provider it can read, which is what turning the setting off means.
   */
  const target = createMemo(() =>
    onlyCurrent() ? props.context.ui.model.current()?.providerID : undefined,
  )

  async function refresh() {
    if (refreshing || stopped) return

    refreshing = true
    try {
      const providerID = target()
      const result = (await props.context.client
        .rpc(Quota)
        .snapshot(providerID ? { providerID } : {})) as { snapshots: QuotaSnapshot[] }
      if (stopped) return

      setSnapshots(result.snapshots ?? [])
      setError(undefined)
    } catch (problem) {
      // Keep the last good panels; the message only shows when nothing loaded.
      if (!stopped) setError(errorText(problem))
    } finally {
      refreshing = false
    }
  }

  function schedule(delay: number) {
    if (poll) clearTimeout(poll)
    poll = setTimeout(() => void cycle(), delay)
  }

  async function cycle() {
    if (stopped) return

    await refresh()
    if (stopped) return

    schedule(error() ? RETRY_MS : POLL_MS)
  }

  // A different model, or turning the setting, changes which quotas to ask for.
  createEffect(() => {
    target()
    void refresh()
  })

  onMount(() => {
    void cycle()
    tick = setInterval(() => setNow(Date.now()), 30_000)
  })

  onCleanup(() => {
    stopped = true
    if (poll) clearTimeout(poll)
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
  const windows = createMemo(() => snapshots().flatMap((snapshot) => snapshot.windows))
  const shownPercent = (window: QuotaWindowSnapshot) => {
    const remaining = Math.max(0, Math.min(100, window.percentRemaining))
    return mode() === "used" ? 100 - remaining : remaining
  }
  const percentWidth = createMemo(() => {
    const widest = windows().reduce(
      (width, window) => Math.max(width, formatPercent(shownPercent(window)).length),
      0,
    )
    // The daily bar shows a share of its own allowance, so it can read 100%
    // even when every quota percentage is shorter.
    const daily = dailyBudget() && windows().length > 0 ? 4 : 0

    return Math.max(MIN_PERCENT_WIDTH, widest, daily)
  })

  // Pad the reset column to its own content so the widest value keeps no leading gap.
  const resetWidth = createMemo(() =>
    windows().reduce(
      (width, window) => Math.max(width, formatReset(window.resetsAt, now()).length),
      0,
    ),
  )

  const width = createMemo(() => {
    const fixed = LABEL_WIDTH + percentWidth() + 2 + (showReset() ? resetWidth() + 1 : 0)
    const auto = Math.max(8, Math.min(panelWidth(), MAX_ROW_WIDTH) - fixed)
    const value = props.store.read(quotaTweak, BAR_WIDTH).value
    return typeof value === "number" ? Math.max(1, Math.min(value, auto)) : auto
  })

  function toggle(providerID: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(providerID)) {
        next.delete(providerID)
      } else {
        next.add(providerID)
      }
      return next
    })
  }

  return (
    <box
      ref={(renderable) => {
        root = renderable
      }}
      flexDirection="column"
      gap={1}
    >
      <For each={snapshots()}>
        {(snapshot) => (
          <QuotaSection
            context={props.context}
            snapshot={snapshot}
            budget={budgetOf(snapshot)}
            panelWidth={panelWidth()}
            width={width()}
            percentWidth={percentWidth()}
            showReset={showReset()}
            mode={mode()}
            now={now()}
            justify={providerJustify()}
            inlineProvider={inlineProvider()}
            collapsed={collapsed().has(snapshot.providerID)}
            onToggle={() => toggle(snapshot.providerID)}
            onRetry={() => void refresh()}
          />
        )}
      </For>
      <Show when={snapshots().length === 0 && error()}>
        <text fg={theme().text.muted} wrapMode="word" onMouseUp={() => void refresh()}>
          {error()}
        </text>
      </Show>
    </box>
  )
}

function QuotaSection(props: {
  readonly context: Context
  readonly snapshot: QuotaSnapshot
  readonly budget?: DayBudget
  readonly panelWidth: number
  readonly width: number
  readonly percentWidth: number
  readonly showReset: boolean
  readonly mode: "remaining" | "used"
  readonly now: number
  readonly justify: "flex-start" | "center" | "flex-end"
  readonly inlineProvider: boolean
  readonly collapsed: boolean
  readonly onToggle: () => void
  readonly onRetry: () => void
}) {
  const theme = () => props.context.theme

  return (
    <box flexDirection="column">
      <box width={props.panelWidth} flexDirection="row" onMouseUp={props.onToggle}>
        <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
          {props.collapsed ? "▶" : "▼"} Quota
        </text>
        <Show when={props.inlineProvider}>
          <box flexGrow={1} flexDirection="row" justifyContent={props.justify}>
            <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
              {props.justify === "flex-start"
                ? ` ${props.snapshot.provider}`
                : props.snapshot.provider}
            </text>
          </box>
        </Show>
      </box>
      <Show when={!props.collapsed}>
        <Show when={!props.inlineProvider}>
          <box width={props.panelWidth} flexDirection="row" justifyContent={props.justify}>
            <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
              {props.snapshot.provider}
            </text>
          </box>
        </Show>
        <Show when={props.snapshot.error && props.snapshot.windows.length === 0}>
          <text fg={theme().text.muted} wrapMode="word" onMouseUp={props.onRetry}>
            {props.snapshot.error}
          </text>
        </Show>
        <For each={props.snapshot.windows}>
          {(window) => (
            <QuotaRow
              window={window}
              width={props.width}
              percentWidth={props.percentWidth}
              showReset={props.showReset}
              mode={props.mode}
              now={props.now}
            />
          )}
        </For>
        <Show when={props.budget}>
          {(budget: () => DayBudget) => (
            <DayRow
              progress={budget().progress}
              rest={budget().rest}
              width={props.width}
              percentWidth={props.percentWidth}
              showReset={props.showReset}
              mode={props.mode}
              now={props.now}
            />
          )}
        </Show>
      </Show>
    </box>
  )
}

/** The share of the longest window that today may spend. */
interface DayBudget {
  readonly progress: PaceProgress
  readonly rest: boolean
}

function paceKey(providerID: string, windowKey: string): string {
  return `${providerID}:${windowKey}`
}

function DayRow(props: {
  readonly progress: PaceProgress
  readonly rest: boolean
  readonly width: number
  readonly percentWidth: number
  readonly showReset: boolean
  readonly mode: "remaining" | "used"
  readonly now: number
}) {
  const context = usePlugin()
  const theme = () => context.theme
  const shown = () => (props.mode === "used" ? 100 - props.progress.ratio : props.progress.ratio)
  const used = () => 100 - props.progress.ratio
  const color = () => {
    if (used() >= 100) return theme().text.feedback.low.base
    if (used() >= 90) return theme().text.feedback.warning.base
    return theme().hue.accent[200]
  }
  const bar = createMemo(() => barParts(props.rest ? 0 : shown(), props.width))
  const reset = createMemo(() =>
    formatReset(new Date(endOfDay(props.now)).toISOString(), props.now),
  )

  return (
    <box flexDirection="row" gap={1}>
      <text flexShrink={0} fg={theme().text.base}>
        {"day".padEnd(LABEL_WIDTH)}
      </text>
      <text flexShrink={0}>
        <span style={{ fg: props.rest ? theme().text.muted : color() }}>{bar().filled}</span>
        <span style={{ fg: theme().text.muted }}>{bar().empty}</span>
      </text>
      <text flexShrink={0} fg={props.rest ? theme().text.muted : color()}>
        {(props.rest ? "–" : formatPercent(shown())).padStart(props.percentWidth)}
      </text>
      <Show when={props.showReset || props.rest}>
        <text flexShrink={0} fg={theme().text.muted}>
          {props.rest ? "rest" : reset()}
        </text>
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
          {reset()}
        </text>
      </Show>
    </box>
  )
}
