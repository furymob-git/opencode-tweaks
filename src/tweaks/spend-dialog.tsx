import { usePlugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { formatPercent } from "../quota/format"
import {
  cacheHitRate,
  type SpendMessage,
  type SpendModel,
  type SpendSession,
  type SpendSummary,
  startOfDay,
  summarize,
  windowStart,
} from "../spend/report"
import { formatCost, type ModelPrice, priceFor } from "../usage/cost"
import { formatTokens } from "../usage/tokens"
import type { SettingsStore } from "./settings"
import { spendSetting, spendTweak } from "./spend"
import { nextValue } from "./types"

const DAYS = spendSetting("days")
const MODELS = spendSetting("models")
const CACHE = spendSetting("cache")

/** The widest window the dialog can switch to, so one load covers every choice. */
const MAX_DAYS = 30
const MAX_SESSIONS = 100
const MAX_MODEL_ROWS = 6
const LOAD_BATCH = 6

interface DialogProps {
  readonly context: Context
  readonly store: SettingsStore
  readonly close: () => void
}

/**
 * Opens the spending report in one dialog. It reads the messages the TUI keeps
 * for the sessions updated in the widest window, so switching the window is a
 * local recomputation rather than another round of syncing.
 */
export async function openSpendDialog(context: Context, store: SettingsStore): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      resolve()
    }

    context.ui.dialog.show(
      () => <SpendDialog context={context} store={store} close={() => context.ui.dialog.clear()} />,
      settle,
    )
  })
}

function SpendDialog(props: DialogProps) {
  const theme = () => props.context.theme.surface("dialog")
  const [days, setDays] = createSignal(readDays())
  const [sessions, setSessions] = createSignal<readonly SpendSession[]>()
  const [now, setNow] = createSignal(Date.now())
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string>()
  let stopped = false

  const models = createMemo(() => {
    const map = new Map<string, { name: string; prices: readonly ModelPrice[] }>()
    for (const model of props.context.data.location.model.list() ?? []) {
      map.set(`${model.providerID}/${model.modelID}`, {
        name: model.name,
        prices: model.cost,
      })
    }
    return map
  })

  /** The list price of a message, so a provider that reports nothing still costs something. */
  function priceOf(message: SpendMessage): ModelPrice | undefined {
    const ref = message.model
    const counts = message.tokens
    if (!ref || !counts) return undefined

    const model = models().get(`${ref.providerID}/${ref.id}`)
    return model ? priceFor(model.prices, counts.input + counts.cache.read) : undefined
  }

  const summary = createMemo<SpendSummary | undefined>(() => {
    const data = sessions()
    return data ? summarize(data, windowStart(now(), days()), now(), priceOf) : undefined
  })
  const today = createMemo<SpendSummary | undefined>(() => {
    const data = sessions()
    return data ? summarize(data, startOfDay(now()), now(), priceOf) : undefined
  })
  const cache = createMemo(() => {
    const data = summary()
    return data ? cacheHitRate(data.tokens) : undefined
  })
  const shownModels = createMemo(() => summary()?.models.slice(0, MAX_MODEL_ROWS) ?? [])
  const hiddenModels = createMemo(() =>
    Math.max(0, (summary()?.models.length ?? 0) - MAX_MODEL_ROWS),
  )

  async function load() {
    setLoading(true)
    setError(undefined)

    try {
      const moment = Date.now()
      const from = windowStart(moment, MAX_DAYS)
      const list = props.context.data.session
        .list()
        .filter((session) => session.time.updated >= from)
        .sort((left, right) => right.time.updated - left.time.updated)
        .slice(0, MAX_SESSIONS)

      const ids = new Set<string>()
      for (const session of list) {
        ids.add(session.id)
        try {
          for (const child of props.context.data.session.family(session.id)) ids.add(child)
        } catch {
          // A session the client has not synced yet still reports on its own.
        }
      }

      const loaded: SpendSession[] = []
      const targets = [...ids].slice(0, MAX_SESSIONS)
      // OpenCode's message store reads one session at a time; a few in flight
      // keeps the dialog responsive without opening one request per session.
      for (let start = 0; start < targets.length; start += LOAD_BATCH) {
        const batch = targets.slice(start, start + LOAD_BATCH)
        await Promise.all(
          batch.map(async (id) => {
            try {
              await props.context.data.session.message.sync(id)
            } catch {
              // Keep whatever messages the client already holds for this session.
            }
          }),
        )
        for (const id of batch) {
          loaded.push({ id, messages: props.context.data.session.message.list(id) ?? [] })
        }
      }

      if (stopped) return
      setNow(moment)
      setSessions(loaded)
    } catch (problem) {
      if (!stopped) setError(problem instanceof Error ? problem.message : String(problem))
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
    void props.store.set(spendTweak, DAYS, next)
  }

  props.context.keymap.layer(() => ({
    mode: "modal",
    priority: 10,
    commands: [
      {
        id: "opencode-tweaks.spend.left",
        bind: "left",
        run: () => cycleDays(-1),
      },
      {
        id: "opencode-tweaks.spend.right",
        bind: "right",
        run: () => cycleDays(1),
      },
      {
        id: "opencode-tweaks.spend.refresh",
        bind: "r",
        run: () => {
          if (!loading()) void load()
        },
      },
      {
        id: "opencode-tweaks.spend.close",
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
            Spend
          </text>
          <text fg={theme().text.muted} onMouseUp={props.close}>
            esc
          </text>
        </box>
        <text fg={theme().text.muted}>{`${days()} days · all sessions`}</text>
      </box>

      <Show
        when={!loading()}
        fallback={
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme().text.muted}>Reading sessions...</text>
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

        <Show when={!error() && summary()}>
          {(data: () => SpendSummary) => (
            <box flexDirection="column" gap={0} paddingLeft={1} paddingRight={1}>
              <Metric
                label="Today"
                value={formatCost(today()?.cost ?? 0)}
                detail={`${formatTokens(today()?.generated ?? 0, "compact")} tok`}
              />
              <Metric
                label={`${days()} days`}
                value={formatCost(data().cost)}
                detail={`${formatTokens(data().generated, "compact")} tok`}
              />
              <Show when={readCache()}>
                <Metric
                  label="Cache"
                  value={cache() === undefined ? "-" : formatPercent(cache() ?? 0, 0)}
                  detail={
                    cache() === undefined
                      ? undefined
                      : `${formatTokens(data().tokens.cacheRead, "compact")} read`
                  }
                />
              </Show>
              <Metric
                label="Sessions"
                value={`${data().sessions} sessions`}
                detail={`${data().turns} turns`}
              />
            </box>
          )}
        </Show>

        <Show when={!error() && readModels() && shownModels().length > 0}>
          <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
            <text attributes={TextAttributes.BOLD} fg={theme().hue.accent[200]}>
              Models
            </text>
            <For each={shownModels()}>
              {(model) => (
                <ModelLine
                  model={model}
                  name={models().get(`${model.providerID}/${model.modelID}`)?.name ?? model.modelID}
                  total={summary()?.cost ?? 0}
                />
              )}
            </For>
            <Show when={hiddenModels() > 0}>
              <text fg={theme().text.muted}>{`+${hiddenModels()} more`}</text>
            </Show>
          </box>
        </Show>

        <Show when={!error() && summary()?.sessions === 0}>
          <box paddingLeft={1} paddingRight={1}>
            <text fg={theme().text.muted}>No sessions in this window.</text>
          </box>
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
    const value = props.store.read(spendTweak, DAYS).value
    return typeof value === "number" ? value : 7
  }

  function readModels(): boolean {
    return props.store.read(spendTweak, MODELS).value === true
  }

  function readCache(): boolean {
    return props.store.read(spendTweak, CACHE).value === true
  }
}

function Metric(props: {
  readonly label: string
  readonly value: string
  readonly detail?: string
}) {
  const theme = useDialogTheme()

  return (
    <box flexDirection="row" gap={1}>
      <text width={9} flexShrink={0} fg={theme().text.muted}>
        {props.label}
      </text>
      <text flexGrow={1} fg={theme().text.base}>
        {props.value}
      </text>
      <Show when={props.detail}>
        <text flexShrink={0} fg={theme().text.muted}>
          {props.detail}
        </text>
      </Show>
    </box>
  )
}

function ModelLine(props: {
  readonly model: SpendModel
  readonly name: string
  readonly total: number
}) {
  const theme = useDialogTheme()
  const share = () =>
    props.total > 0 ? formatPercent((props.model.cost / props.total) * 100, 0) : "-"

  return (
    <box flexDirection="row" gap={1}>
      <text flexGrow={1} overflow="hidden" wrapMode="none" fg={theme().text.base}>
        {props.name}
      </text>
      <text flexShrink={0} fg={theme().text.base}>
        {formatCost(props.model.cost)}
      </text>
      <box width={4} flexShrink={0} justifyContent="flex-end">
        <text fg={theme().text.muted}>{share()}</text>
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
