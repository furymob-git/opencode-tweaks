import { usePlugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { barParts, errorText, formatPercent, formatReset } from "../quota/format"
import {
  dayLabel,
  type HistoryEntry,
  historyDays,
  historySeries,
  historySpent,
  recordHistory,
} from "../quota/history"
import { dayKey, exactRemaining, longestWindow, paceSignature, startPace } from "../quota/pace"
import { Quota, type QuotaSnapshot } from "../rpc"
import { quotaSetting, quotaTweak } from "./quota"
import type { SettingsStore } from "./settings"
import { nextValue } from "./types"

const DAYS = quotaSetting("historyDays")
const ONLY_CURRENT = quotaSetting("onlyCurrentModel")
const RESERVE = quotaSetting("reserve")
/** Workday settings ordered like `Date#getDay`, with Sunday first. */
const WORKDAYS = [
  quotaSetting("workSun"),
  quotaSetting("workMon"),
  quotaSetting("workTue"),
  quotaSetting("workWed"),
  quotaSetting("workThu"),
  quotaSetting("workFri"),
  quotaSetting("workSat"),
]
const HISTORY_STORE = "opencode-tweaks.quota-history"

const MIN_BAR = 10
const MAX_BAR = 30
const LABEL_WIDTH = 7
const PERCENT_WIDTH = 7

interface DialogProps {
  readonly context: Context
  readonly store: SettingsStore
  readonly close: () => void
}

/**
 * Opens the daily quota report in one dialog. It asks the server for the same
 * snapshots the sidebar reads, records today's reading so the report is current
 * even when the panel is off, and draws one row per calendar day.
 */
export async function openQuotaDialog(context: Context, store: SettingsStore): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      resolve()
    }

    context.ui.dialog.show(
      () => <QuotaDialog context={context} store={store} close={() => context.ui.dialog.clear()} />,
      settle,
    )
  })
}

function QuotaDialog(props: DialogProps) {
  const theme = () => props.context.theme.surface("dialog")
  const dimensions = useTerminalDimensions()
  const [days, setDays] = createSignal(readDays())
  const [snapshots, setSnapshots] = createSignal<readonly QuotaSnapshot[]>()
  const [moment, setMoment] = createSignal(Date.now())
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  let stopped = false

  const [history, updateHistory] = props.context.storage.store<Record<string, HistoryEntry>>(
    HISTORY_STORE,
    { initial: {} },
  )

  const workdays = createMemo(() =>
    WORKDAYS.map((item) => props.store.read(quotaTweak, item).value === true),
  )
  const reserve = createMemo(() => {
    const value = props.store.read(quotaTweak, RESERVE).value
    return typeof value === "number" ? value : 0
  })
  const onlyCurrent = () => props.store.read(quotaTweak, ONLY_CURRENT).value === true
  // The dialog is content-sized, so the bar takes a steady share of the screen
  // rather than the sidebar's measured column.
  const barWidth = createMemo(() =>
    Math.max(MIN_BAR, Math.min(MAX_BAR, Math.floor(dimensions().width / 2))),
  )

  const reports = createMemo<Report[]>(() => {
    const list = snapshots()
    if (!list) return []

    const at = moment()
    const count = days()
    const keys = historyDays(at, count)
    const today = dayKey(at)
    const mask = workdays()
    const keep = reserve()
    const signature = paceSignature(mask, keep)
    // A month of rows does not fit a short terminal, so the list keeps the most
    // recent days and the summary says how many older ones it left out.
    const limit = Math.max(5, dimensions().height - 14)

    return list.flatMap((snapshot) => {
      const window = longestWindow(snapshot.windows)
      if (!window) return []

      const entry = history[paceKey(snapshot.providerID, window.key)]
      const values = historySeries(entry, keys)
      const readings = values.filter((value) => value !== undefined).length
      const highest = values.reduce<number>((top, value) => Math.max(top, value ?? 0), 0)
      // A full bar stands for the day's planned share, with one point as the
      // floor, so a quiet day stays short instead of filling the row. A rest
      // day has no share, so its busiest day becomes the scale instead.
      const pace = startPace(
        exactRemaining(window),
        today,
        window.resetsAt,
        signature,
        mask,
        keep,
        at,
      )
      const scale = pace.allowance > 0 ? pace.allowance : Math.max(1, highest)
      const rows = keys
        .map((day, index) => ({
          key: day,
          label: dayLabel(day, today),
          spent: values[index],
        }))
        .reverse()

      return [
        {
          provider: snapshot.provider,
          window: window.key,
          remaining: exactRemaining(window),
          resetsAt: window.resetsAt,
          rows: rows.slice(0, limit),
          hidden: Math.max(0, rows.length - limit),
          spent: historySpent(values),
          readings,
          scale,
          allowance: pace.allowance,
        },
      ]
    })
  })

  async function load() {
    setLoading(true)
    setError(undefined)

    try {
      const at = Date.now()
      const providerID = onlyCurrent() ? props.context.ui.model.current()?.providerID : undefined
      const result = (await props.context.client
        .rpc(Quota)
        .snapshot(providerID ? { providerID } : {})) as { snapshots: QuotaSnapshot[] }
      if (stopped) return

      const list = result.snapshots ?? []
      const day = dayKey(at)
      const fresh: Record<string, HistoryEntry> = {}
      for (const snapshot of list) {
        const window = longestWindow(snapshot.windows)
        if (!window) continue

        const key = paceKey(snapshot.providerID, window.key)
        const current = history[key]
        const next = recordHistory(current, window.resetsAt, day, exactRemaining(window), at)
        if (next !== current) fresh[key] = next
      }

      if (Object.keys(fresh).length > 0) {
        void updateHistory((draft) => {
          for (const [key, entry] of Object.entries(fresh)) draft[key] = entry
        })
      }

      setMoment(at)
      setSnapshots(list)
    } catch (problem) {
      if (!stopped) setError(errorText(problem))
    } finally {
      if (!stopped) setLoading(false)
    }
  }

  onMount(() => void load())
  onCleanup(() => {
    stopped = true
  })

  function cycleDays(direction: 1 | -1) {
    const next = nextValue(DAYS, days(), direction)
    if (typeof next !== "number") return

    setDays(next)
    void props.store.set(quotaTweak, DAYS, next)
  }

  props.context.keymap.layer(() => ({
    mode: "modal",
    priority: 10,
    commands: [
      {
        id: "opencode-tweaks.quota.left",
        bind: "left",
        run: () => cycleDays(-1),
      },
      {
        id: "opencode-tweaks.quota.right",
        bind: "right",
        run: () => cycleDays(1),
      },
      {
        id: "opencode-tweaks.quota.refresh",
        bind: "r",
        run: () => {
          if (!loading()) void load()
        },
      },
      {
        id: "opencode-tweaks.quota.close",
        bind: "escape",
        run: () => props.close(),
      },
    ],
  }))

  return (
    <box flexDirection="column" gap={1} paddingLeft={3} paddingRight={3} paddingBottom={1}>
      <box flexDirection="column" paddingLeft={1} paddingRight={1}>
        <box flexDirection="row" justifyContent="space-between" gap={2}>
          <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
            Quota history
          </text>
          <text fg={theme().text.muted} onMouseUp={props.close}>
            esc
          </text>
        </box>
        <text fg={theme().text.muted}>{`${days()} days · one reading per day`}</text>
      </box>

      <Show
        when={!loading()}
        fallback={
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme().text.muted}>Reading quota…</text>
          </box>
        }
      >
        <Show when={error()}>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme().text.feedback.error.base} wrapMode="word">
              {error()}
            </text>
            <text fg={theme().text.muted}>Press r to try again.</text>
          </box>
        </Show>

        <Show when={!error() && reports().length === 0}>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme().text.muted}>No quota source to report.</text>
          </box>
        </Show>

        <Show when={!error()}>
          <For each={reports()}>
            {(report) => <ReportSection report={report} width={barWidth()} now={moment()} />}
          </For>
        </Show>
      </Show>

      <box paddingLeft={1} paddingRight={1}>
        <box flexDirection="row" gap={2} flexShrink={0}>
          <Hint title="window" key="←/→" />
          <Hint title="refresh" key="r" />
        </box>
      </box>
    </box>
  )

  function readDays(): number {
    const value = props.store.read(quotaTweak, DAYS).value
    return typeof value === "number" ? value : 7
  }
}

/** One provider's daily report, newest day first. */
interface Report {
  readonly provider: string
  readonly window: string
  readonly remaining: number
  readonly resetsAt: string
  readonly rows: readonly ReportDay[]
  /** Older days the terminal was too short to list. */
  readonly hidden: number
  readonly spent: number
  readonly readings: number
  readonly scale: number
  readonly allowance: number
}

interface ReportDay {
  readonly key: string
  readonly label: string
  readonly spent: number | undefined
}

function ReportSection(props: {
  readonly report: Report
  readonly width: number
  readonly now: number
}) {
  const theme = useDialogTheme()
  const average = () => (props.report.readings > 0 ? props.report.spent / props.report.readings : 0)

  return (
    <box flexDirection="column" gap={1} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" gap={2}>
        <text flexGrow={1} attributes={TextAttributes.BOLD} fg={theme().hue.accent[200]}>
          {props.report.provider}
        </text>
        <text flexShrink={0} fg={theme().text.muted}>
          {`${props.report.window} · ${formatPercent(props.report.remaining, 1)} left`}
        </text>
      </box>

      <box flexDirection="column">
        <For each={props.report.rows}>
          {(row) => <DayLine row={row} width={props.width} scale={props.report.scale} />}
        </For>
      </box>

      <box flexDirection="row" gap={2}>
        <text flexGrow={1} fg={theme().text.muted}>
          {summary(props.report, average())}
        </text>
        <text flexShrink={0} fg={theme().text.muted}>
          {`resets ${formatReset(props.report.resetsAt, props.now)}`}
        </text>
      </box>
    </box>
  )
}

function DayLine(props: {
  readonly row: ReportDay
  readonly width: number
  readonly scale: number
}) {
  const theme = useDialogTheme()
  const spent = () => props.row.spent
  const share = () => Math.min(100, ((spent() ?? 0) / props.scale) * 100)
  const bar = createMemo(() => barParts(share(), props.width))
  const percent = () => {
    const value = spent()
    return value === undefined ? "–" : formatPercent(value, 1)
  }
  const color = () => {
    const value = spent()
    if (value === undefined) return theme().text.muted
    return value > props.scale ? theme().text.feedback.warning.base : theme().hue.accent[200]
  }

  return (
    <box flexDirection="row" gap={1}>
      <text width={LABEL_WIDTH} flexShrink={0} fg={color()}>
        {props.row.label}
      </text>
      <text flexShrink={0}>
        <span style={{ fg: color() }}>{bar().filled}</span>
        <span style={{ fg: theme().text.muted }}>{bar().empty}</span>
      </text>
      <box width={PERCENT_WIDTH} flexShrink={0} justifyContent="flex-end">
        <text fg={color()}>{percent()}</text>
      </box>
    </box>
  )
}

function Hint(props: { readonly title: string; readonly key: string }) {
  const theme = useDialogTheme()

  return (
    <text>
      {props.title}
      <span style={{ fg: theme().text.muted }}>{` ${props.key}`}</span>
    </text>
  )
}

function useDialogTheme() {
  const context = usePlugin()
  return () => context.theme.surface("dialog")
}

function paceKey(providerID: string, windowKey: string): string {
  return `${providerID}:${windowKey}`
}

/** The line under the rows: how much was spent, and against which share. */
function summary(report: Report, average: number): string {
  const parts = [
    `${report.readings} ${report.readings === 1 ? "day" : "days"}`,
    `${formatPercent(report.spent, 1)} spent`,
    `${formatPercent(average, 1)} avg`,
  ]
  if (report.allowance > 0) parts.push(`${formatPercent(report.allowance, 1)} budget`)
  if (report.hidden > 0) parts.push(`${report.hidden} older hidden`)
  return parts.join(" · ")
}
