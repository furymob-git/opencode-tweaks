import { usePlugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { barParts, errorText, formatPercent } from "../quota/format"
import {
  dayBefore,
  dayLabel,
  type HistoryEntry,
  historyDays,
  historySeries,
  historySpent,
  rangeLabel,
  recordHistory,
  weekDays,
} from "../quota/history"
import { dayKey, exactRemaining, longestWindow, paceSignature, startPace } from "../quota/pace"
import { Quota, type QuotaSnapshot } from "../rpc"
import { quotaSetting, quotaTweak } from "./quota"
import type { SettingsStore } from "./settings"

const WEEK = quotaSetting("historyWeek")
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
/** The retention window holds a month, so four weeks fit behind today. */
const MAX_WEEKS_BACK = 3

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
  const [weeksBack, setWeeksBack] = createSignal(0)
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
  const weekly = createMemo(() => props.store.read(quotaTweak, WEEK).value === true)
  // The dialog is content-sized, so the bar takes a steady share of the screen
  // rather than the sidebar's measured column.
  const barWidth = createMemo(() =>
    Math.max(MIN_BAR, Math.min(MAX_BAR, Math.floor(dimensions().width / 2))),
  )

  /** The seven days on screen, oldest first, shifted back by whole weeks. */
  function reportDays(at: number): string[] {
    const shifted = daysBack(at, weeksBack() * 7)
    return weekly() ? weekDays(shifted) : historyDays(shifted, 7)
  }

  function periodLabel(): string {
    const days = reportDays(moment())
    if (!weekly()) return `7 days · ${rangeLabel(days)}`

    const back = weeksBack()
    const name = back === 0 ? "This week" : back === 1 ? "Last week" : `${back} weeks ago`
    return `${name} · ${rangeLabel(days)}`
  }

  const reports = createMemo<Report[]>(() => {
    const list = snapshots()
    if (!list) return []

    const at = moment()
    const keys = reportDays(at)
    const today = dayKey(at)
    const mask = workdays()
    const keep = reserve()
    const signature = paceSignature(mask, keep)
    // The day before the first row is its baseline: without it, that day's
    // spend would read as zero instead of what it used since the day before.
    const baseline = dayBefore(keys[0] ?? "")

    return list.flatMap((snapshot) => {
      const window = longestWindow(snapshot.windows)
      if (!window) return []

      const entry = history[paceKey(snapshot.providerID, window.key)]
      const series = historySeries(entry, baseline ? [baseline, ...keys] : keys)
      const values = baseline ? series.slice(1) : series
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
      const rows = keys.map((day, index) => ({
        key: day,
        label: dayLabel(day, today),
        spent: values[index],
      }))
      // A calendar week reads Monday first; a rolling week keeps today on top.
      if (!weekly()) rows.reverse()

      return [
        {
          provider: snapshot.provider,
          window: window.key,
          rows,
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

  function moveWeek(direction: 1 | -1) {
    setWeeksBack((current) => Math.max(0, Math.min(MAX_WEEKS_BACK, current + direction)))
  }

  props.context.keymap.layer(() => ({
    mode: "modal",
    priority: 10,
    commands: [
      {
        id: "opencode-tweaks.quota.left",
        bind: "left",
        run: () => moveWeek(1),
      },
      {
        id: "opencode-tweaks.quota.right",
        bind: "right",
        run: () => moveWeek(-1),
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
        <text fg={theme().text.muted}>{periodLabel()}</text>
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
            {(report) => <ReportSection report={report} width={barWidth()} />}
          </For>
        </Show>
      </Show>

      <box paddingLeft={1} paddingRight={1}>
        <box flexDirection="row" gap={2} flexShrink={0}>
          <Hint title={weekly() ? "week" : "days"} key="←/→" />
          <Hint title="refresh" key="r" />
        </box>
      </box>
    </box>
  )
}

/** One provider's daily report. */
interface Report {
  readonly provider: string
  readonly window: string
  readonly rows: readonly ReportDay[]
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

function ReportSection(props: { readonly report: Report; readonly width: number }) {
  const theme = useDialogTheme()
  const average = () => (props.report.readings > 0 ? props.report.spent / props.report.readings : 0)

  return (
    <box flexDirection="column" gap={1} paddingLeft={1} paddingRight={1}>
      <box flexDirection="row" gap={2}>
        <text flexGrow={1} attributes={TextAttributes.BOLD} fg={theme().hue.accent[200]}>
          {props.report.provider}
        </text>
        <text flexShrink={0} fg={theme().text.muted}>
          {props.report.allowance > 0
            ? `${props.report.window} · ${formatPercent(props.report.allowance, 1)} / day`
            : props.report.window}
        </text>
      </box>

      <box flexDirection="column">
        <For each={props.report.rows}>
          {(row) => <DayLine row={row} width={props.width} scale={props.report.scale} />}
        </For>
      </box>

      <text fg={theme().text.muted}>{summary(props.report, average())}</text>
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

/** The timestamp `days` local days before `time`. */
function daysBack(time: number, days: number): number {
  const cursor = new Date(time)
  cursor.setDate(cursor.getDate() - days)
  return cursor.getTime()
}

/** The line under the rows: how much the days on screen add up to. */
function summary(report: Report, average: number): string {
  if (report.readings === 0) return "No readings in these days"
  return `${formatPercent(report.spent, 1)} spent · ${formatPercent(average, 1)} avg`
}
