import { usePlugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { CliRenderEvents, type ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { filterRows, groupRows, type MenuRow, moveRow, orderedRows } from "./menu-model"
import { tweaks } from "./registry"
import type { SettingsStore } from "./settings"
import { displayValue, nextValue, type Tweak, type TweakSetting } from "./types"

interface Row extends MenuRow {
  readonly footer: () => string
  readonly activate: () => void | Promise<void>
  readonly cycle?: (direction: 1 | -1) => Promise<void>
  readonly reset?: () => Promise<void>
  /** Rows that cycle through values show arrows around the value while selected. */
  readonly cycleable?: boolean
}

type View = { readonly kind: "tweaks" } | { readonly kind: "tweak"; readonly tweak: Tweak }

type DisplayRow =
  | { readonly kind: "category"; readonly title: string }
  | { readonly kind: "row"; readonly row: Row }

interface DialogProps {
  readonly context: Context
  readonly store: SettingsStore
  readonly close: () => void
}

const tweakRowID = (tweak: Tweak) => `tweak:${tweak.id}`
const settingRowID = (tweak: Tweak, setting: TweakSetting) => `setting:${tweak.id}.${setting.id}`

/**
 * Opens the tweak list in one dialog that never closes while values change.
 * The layout follows OpenCode's own settings screen row for row, and values
 * update in place instead of reopening the menu after every choice.
 */
export async function openTweaksMenu(context: Context, store: SettingsStore): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      resolve()
    }

    context.ui.dialog.show(
      () => (
        <TweaksDialog context={context} store={store} close={() => context.ui.dialog.clear()} />
      ),
      settle,
    )
  })
}

function TweaksDialog(props: DialogProps) {
  const theme = () => props.context.theme.surface("dialog")
  const dimensions = useTerminalDimensions()
  const [view, setView] = createSignal<View>({ kind: "tweaks" })
  const [filter, setFilter] = createSignal("")
  const firstTweak = tweaks[0]
  const [selectedID, setSelectedID] = createSignal<string | undefined>(
    firstTweak ? tweakRowID(firstTweak) : undefined,
  )
  const [saving, setSaving] = createSignal(false)

  let scroll: ScrollBoxRenderable | undefined
  let pendingScroll: (() => void) | undefined

  async function cycleSetting(tweak: Tweak, setting: TweakSetting, direction: 1 | -1) {
    const current = props.store.read(tweak, setting).value
    const next = nextValue(setting, current, direction)
    if (next !== undefined) await props.store.set(tweak, setting, next)
  }

  async function run(action: () => void | Promise<void>) {
    if (saving()) return

    setSaving(true)
    try {
      await action()
    } catch (error) {
      props.context.ui.toast.show({
        variant: "error",
        title: "Tweaks",
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  function summarize(tweak: Tweak): string {
    const enabled = tweak.settings.find((setting) => setting.id === "enabled")
    if (enabled) return displayValue(enabled, props.store.read(tweak, enabled).value)

    return tweak.settings.length === 1 ? "1 setting" : `${tweak.settings.length} settings`
  }

  function openTweak(tweak: Tweak) {
    const first = tweak.settings[0]
    setFilter("")
    setSelectedID(first ? settingRowID(tweak, first) : undefined)
    setView({ kind: "tweak", tweak })
  }

  function goBack() {
    const current = view()
    if (current.kind === "tweak") {
      setFilter("")
      setSelectedID(tweakRowID(current.tweak))
      setView({ kind: "tweaks" })
      return
    }

    props.close()
  }

  function tweakRows(): Row[] {
    return tweaks.map((tweak) => ({
      id: tweakRowID(tweak),
      title: tweak.title,
      category: tweak.category,
      // The chevron marks a row that opens another page. Settings live one level down.
      footer: () => `${summarize(tweak)} ›`,
      activate: () => openTweak(tweak),
    }))
  }

  function settingRows(tweak: Tweak): Row[] {
    return tweak.settings.map((setting) => ({
      id: settingRowID(tweak, setting),
      title: setting.title,
      category: setting.category,
      footer: () => displayValue(setting, props.store.read(tweak, setting).value),
      activate: () => cycleSetting(tweak, setting, 1),
      cycle: (direction) => cycleSetting(tweak, setting, direction),
      reset: () => props.store.reset(tweak, setting),
      cycleable: true,
    }))
  }

  const rows = createMemo<Row[]>(() => {
    const current = view()
    return current.kind === "tweaks" ? tweakRows() : settingRows(current.tweak)
  })

  const visible = createMemo(() => filterRows(rows(), filter()))

  const display = createMemo<DisplayRow[]>(() => {
    const query = filter().trim()
    const result: DisplayRow[] = []

    for (const [category, group] of groupRows(visible())) {
      if (!query && category) result.push({ kind: "category", title: category })
      for (const row of group) result.push({ kind: "row", row })
    }

    return result
  })

  const ordered = createMemo(() => orderedRows(visible()))
  const selected = createMemo(() => ordered().find((row) => row.id === selectedID()))
  const title = createMemo(() => {
    const current = view()
    return current.kind === "tweaks" ? "Tweaks" : current.tweak.title
  })
  const height = createMemo(() => Math.max(3, Math.floor(dimensions().height / 2) - 6))

  function move(delta: number) {
    const next = moveRow(ordered(), selectedID(), delta)
    if (next) setSelectedID(next.id)
  }

  function activate(row = selected()) {
    if (row) void run(row.activate)
  }

  function cycle(direction: 1 | -1) {
    const runCycle = selected()?.cycle
    if (runCycle) void run(() => runCycle(direction))
  }

  function reset() {
    const runReset = selected()?.reset
    if (runReset) void run(runReset)
  }

  function updateFilter(value: string) {
    setFilter(value)
    setSelectedID(orderedRows(filterRows(rows(), value))[0]?.id)
  }

  // Keep a valid selection when the filter changes the list.
  createEffect(() => {
    const list = ordered()
    if (list.length === 0) {
      if (selectedID() !== undefined) setSelectedID(undefined)
      return
    }

    if (!list.some((row) => row.id === selectedID())) setSelectedID(list[0]?.id)
  })

  // Keep the selected row inside the scroll viewport.
  createEffect(() => {
    const id = selectedID()
    if (!id) return

    const index = display().findIndex((item) => item.kind === "row" && item.row.id === id)
    if (index < 0) return

    if (pendingScroll) props.context.renderer.off(CliRenderEvents.FRAME, pendingScroll)
    pendingScroll = () => {
      pendingScroll = undefined
      if (!scroll) return

      const target = scroll.getChildren()[index]
      if (!target) return

      const y = target.y - scroll.y
      if (y >= scroll.height) scroll.scrollBy(y - scroll.height + 1)
      if (y < 0) scroll.scrollBy(y)
    }
    props.context.renderer.once(CliRenderEvents.FRAME, pendingScroll)
    props.context.renderer.requestRender()
  })

  props.context.keymap.layer(() => ({
    mode: "modal",
    priority: 10,
    commands: [
      {
        id: "opencode-tweaks.dialog.up",
        bind: "up",
        run: () => move(-1),
      },
      {
        id: "opencode-tweaks.dialog.down",
        bind: "down",
        run: () => move(1),
      },
      {
        id: "opencode-tweaks.dialog.enter",
        bind: "return",
        run: () => activate(),
      },
      {
        id: "opencode-tweaks.dialog.left",
        bind: "left",
        enabled: () => view().kind === "tweak",
        run: () => cycle(-1),
      },
      {
        id: "opencode-tweaks.dialog.right",
        bind: "right",
        enabled: () => view().kind === "tweak",
        run: () => cycle(1),
      },
      {
        id: "opencode-tweaks.dialog.reset",
        bind: "ctrl+r",
        enabled: () => view().kind === "tweak",
        run: () => reset(),
      },
      {
        id: "opencode-tweaks.dialog.back",
        bind: "escape",
        run: () => goBack(),
      },
    ],
  }))

  return (
    <box flexDirection="column" gap={1} paddingLeft={3} paddingRight={3} paddingBottom={1}>
      <box flexDirection="column" paddingLeft={1} paddingRight={1}>
        <box flexDirection="row" justifyContent="space-between" gap={2}>
          <text attributes={TextAttributes.BOLD} fg={theme().text.base}>
            {title()}
          </text>
          <text fg={theme().text.muted} onMouseUp={goBack}>
            esc
          </text>
        </box>
        <box paddingTop={1}>
          <input
            flexGrow={1}
            value={filter()}
            onInput={updateFilter}
            focusedBackgroundColor={theme().background.formfield.focused}
            cursorColor={theme().text.formfield.focused}
            focusedTextColor={theme().text.formfield.focused}
            placeholder="Search"
            placeholderColor={theme().text.muted}
            ref={(renderable) => {
              setTimeout(() => {
                if (!renderable.isDestroyed) renderable.focus()
              }, 1)
            }}
          />
        </box>
      </box>

      <box marginLeft={-3} marginRight={-3}>
        <scrollbox
          paddingLeft={1}
          paddingRight={1}
          maxHeight={height()}
          scrollbarOptions={{ visible: false }}
          ref={(renderable) => {
            scroll = renderable
          }}
        >
          <Show
            when={display().length > 0}
            fallback={
              <box paddingLeft={3}>
                <text fg={theme().text.muted}>No results found</text>
              </box>
            }
          >
            <For each={display()}>
              {(item, index) =>
                item.kind === "category" ? (
                  <box paddingTop={index() === 0 ? 0 : 1} paddingLeft={3}>
                    <text fg={theme().hue.accent[200]} attributes={TextAttributes.BOLD}>
                      {item.title}
                    </text>
                  </box>
                ) : (
                  <RowView
                    row={item.row}
                    active={item.row.id === selectedID()}
                    onHover={() => setSelectedID(item.row.id)}
                    onActivate={() => activate(item.row)}
                  />
                )
              }
            </For>
          </Show>
        </scrollbox>
      </box>

      <box paddingLeft={1} paddingRight={1}>
        <Footer editing={view().kind === "tweak"} />
      </box>
    </box>
  )
}

function RowView(props: {
  readonly row: Row
  readonly active: boolean
  readonly onHover: () => void
  readonly onActivate: () => void
}) {
  const theme = useDialogTheme()
  const active = () => props.active
  const value = () => {
    const text = props.row.footer()
    if (!props.row.cycleable) return text

    // Keep the column width stable: arrows appear only on the selected row.
    return active() ? `‹ ${text} ›` : `  ${text}  `
  }

  return (
    <box
      flexDirection="row"
      gap={1}
      paddingLeft={active() ? 1 : 3}
      paddingRight={3}
      backgroundColor={active() ? theme().background.action.primary.focused : undefined}
      onMouseDown={props.onHover}
      onMouseMove={props.onHover}
      onMouseUp={props.onActivate}
    >
      <Show when={active()}>
        <text width={1} flexShrink={0} fg={theme().text.action.primary.focused}>
          ●
        </text>
      </Show>
      <text
        flexGrow={1}
        paddingLeft={3}
        overflow="hidden"
        wrapMode="none"
        fg={active() ? theme().text.action.primary.focused : theme().text.base}
        attributes={active() ? TextAttributes.BOLD : undefined}
      >
        {props.row.title}
      </text>
      <text flexShrink={0} fg={active() ? theme().text.action.primary.focused : theme().text.muted}>
        {value()}
      </text>
    </box>
  )
}

function Footer(props: { readonly editing: boolean }) {
  return (
    <box flexDirection="row" gap={2} flexShrink={0}>
      <Hint title={props.editing ? "change" : "open"} key={props.editing ? "←/→" : "enter"} />
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
