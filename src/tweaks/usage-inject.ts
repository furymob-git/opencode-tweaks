import type { Context } from "@opencode/plugin/tui/context"

/**
 * The host draws the `agent · model · duration · tok/s` line under every
 * assistant message itself, and publishes no slot inside it. This module is the
 * deliberate exception to the plugin's "no interface fighting" rule: it splices
 * the counts into that line's text nodes, then repairs itself on a timer because
 * the host rebuilds the line whenever a turn advances.
 *
 * The host creates one such line per finished turn, so the figures belong to the
 * line they were first written on. When a newer line appears the figures move to
 * it, and the line they leave behind keeps the values it had rather than showing
 * the next turn's.
 *
 * Nothing here imports the renderer or the reactive runtime. The TUI resolves
 * bare imports in `.tsx` sources only, so this module takes everything it needs
 * from the tree it edits.
 *
 * Everything here is best effort. Any surprise leaves the line alone and the
 * counts simply stay out of it.
 */
export interface HostText {
  readonly plainText: string
  getTextChildren(): readonly unknown[]
  insertBefore(node: unknown, anchor: unknown): number
  remove(node: unknown): void
  add?(node: unknown, index?: number): unknown
}

interface HostNode {
  children: (string | HostNode)[]
  parent: unknown
  fg?: unknown
  attributes?: number
  add(text: string): number
}

type HostNodeConstructor = new (options: {
  id?: string
  fg?: unknown
  attributes?: number
}) => HostNode

/** What the host writes before the throughput, and the only thing we can key on. */
const THROUGHPUT = / \d[\d.]* tok\/s/
/**
 * The context usage the host prints on the prompt footer, such as `114.9K
 * (29%)`. A shell or goal adds a leading separator, the host may append its own
 * reported cost, and the tweak puts its figures in front, so the text is matched
 * before the tweak's own node is taken into account.
 */
const FOOTER_USAGE = /^(?: · )?\d[\d.,]*\s?[KMG]?\s?\(\d+%\)(?:\s·\s\$[\d.,]+){0,2}$/
/** The line is rebuilt on every token, so a slow repair would lag behind it. */
const REPAIR_MS = 400
const BEFORE_ID = "opencode-tweaks.usage.before"
const AFTER_ID = "opencode-tweaks.usage.after"
const FOOTER_ID = "opencode-tweaks.usage.footer"

/**
 * Hot reload evaluates this module again while the old repair timers keep
 * running. The registry lets the new copy stop them, even when the old copy
 * never reached its own dispose.
 */
const timers = new Set<ReturnType<typeof setInterval>>()
const previousTimers = (globalThis as { usageInjectorTimers?: Set<ReturnType<typeof setInterval>> })
  .usageInjectorTimers
for (const timer of previousTimers ?? []) clearInterval(timer)
;(globalThis as { usageInjectorTimers?: Set<ReturnType<typeof setInterval>> }).usageInjectorTimers =
  timers

/**
 * A text node is the only renderable with a string-or-node child list, which is
 * also how the host tells it apart from the element it hangs from.
 */
function isTextNode(value: unknown): value is HostNode {
  const node = value as Partial<HostNode> | null
  if (!node || typeof node.add !== "function") return false
  if (Array.isArray(node.children)) return true
  const text = node as { getTextChildren?: unknown }
  return typeof text.getTextChildren === "function"
}

/** The children of a node, whichever way the host exposes them. */
function childNodes(node: HostNode): (string | HostNode)[] {
  const text = node as { getTextChildren?: () => readonly unknown[] }
  if (typeof text.getTextChildren === "function") {
    return text.getTextChildren() as (string | HostNode)[]
  }
  return Array.isArray(node.children) ? node.children : []
}

function asHostText(value: unknown): HostText | undefined {
  const text = value as Partial<HostText> | null
  if (!text || typeof text.plainText !== "string") return undefined
  if (typeof text.getTextChildren !== "function") return undefined
  if (typeof text.insertBefore !== "function" || typeof text.remove !== "function") {
    return undefined
  }
  return text as HostText
}

/** The text of a node subtree, which the host only exposes as nested chunks. */
function textOf(node: unknown): string {
  if (typeof node === "string") return node
  if (!isTextNode(node)) return ""
  return childNodes(node).map(textOf).join("")
}

/**
 * Every footer in tree order, oldest first. A line always carries spans, and
 * requiring them keeps the prompt's textarea, which also exposes text, out.
 */
export function throughputTexts(node: { getChildren(): readonly unknown[] }): HostText[] {
  const found: HostText[] = []

  const walk = (branch: { getChildren(): readonly unknown[] }) => {
    for (const child of branch.getChildren()) {
      const text = asHostText(child)
      if (text) {
        if (THROUGHPUT.test(text.plainText) && text.getTextChildren().length > 0) found.push(text)
        continue
      }

      const next = child as { getChildren?: unknown }
      if (typeof next.getChildren === "function") {
        walk(next as { getChildren(): readonly unknown[] })
      }
    }
  }

  walk(node)
  return found
}

/** The newest footer, which is the last one in tree order. */
export function lastThroughputText(node: {
  getChildren(): readonly unknown[]
}): HostText | undefined {
  return throughputTexts(node).at(-1)
}

/** Every text node under a branch, in tree order. */
export function hostTexts(node: { getChildren(): readonly unknown[] }): HostText[] {
  const found: HostText[] = []

  const walk = (branch: { getChildren(): readonly unknown[] }) => {
    for (const child of branch.getChildren()) {
      const text = asHostText(child)
      if (text) {
        found.push(text)
        continue
      }

      const next = child as { getChildren?: unknown }
      if (typeof next.getChildren === "function") {
        walk(next as { getChildren(): readonly unknown[] })
      }
    }
  }

  walk(node)
  return found
}

/** The host's text without the node the tweak added, for matching. */
function withoutInjected(text: HostText, node: HostNode | undefined): string {
  const plain = text.plainText
  if (!node) return plain

  const value = textOf(node)
  if (!value) return plain
  if (plain.startsWith(value)) return plain.slice(value.length)
  if (plain.endsWith(value)) return plain.slice(0, -value.length)
  return plain
}

function isFooterUsage(text: string): boolean {
  return FOOTER_USAGE.test(text)
}

/**
 * The prompt footer's context usage text. It is the only text that carries the
 * `used (percent)` shape the host prints next to the shell and goal indicators;
 * the transcript can mention the same words, so the last one wins, which is the
 * footer the composer draws.
 */
export function footerUsageText(node: { getChildren(): readonly unknown[] }): HostText | undefined {
  let found: HostText | undefined
  for (const candidate of hostTexts(node)) {
    if (isFooterUsage(candidate.plainText)) found = candidate
  }
  return found
}

/** The ` · 62.2 tok/s` span the labels are placed around. */
function throughputSpan(text: HostText): HostNode | undefined {
  for (const child of text.getTextChildren()) {
    if (isTextNode(child) && THROUGHPUT.test(textOf(child))) return child
  }
  return undefined
}

/**
 * The host's plain text-node class, taken from a leaf node the span already
 * contains. The compiled host minifies class names, so the tree is the only
 * reliable source of a constructor; a leaf is the class that takes plain text.
 */
function textNodeConstructor(span: HostNode): HostNodeConstructor | undefined {
  const pending: HostNode[] = [span]
  while (pending.length > 0) {
    const node = pending.shift()
    if (!node) break
    for (const child of childNodes(node)) {
      if (typeof child === "string" || !isTextNode(child)) continue
      const children = childNodes(child)
      if (children.some((item) => typeof item === "string")) {
        return child.constructor as HostNodeConstructor
      }
      pending.push(child)
    }
  }
  return undefined
}

export interface InjectorLabels {
  /** Text just before the throughput figure, such as the turn token count. */
  readonly before?: string
  /** Text just after it, such as the turn cost. */
  readonly after?: string
}

export interface UsageInjector {
  /**
   * The figures for the newest footer, tagged with the turn they belong to.
   * Empty fields hide them there.
   */
  setLabels(labels: InjectorLabels, key?: string): void
  /** Hides the host's ttft figure on every footer, or brings it back. */
  setTtft(visible: boolean): void
  /**
   * The session figures to print on the prompt footer, such as
   * `649.3K tok total · $0.91`, without the surrounding separators.
   * `onPlaced` reports whether the host line accepted them.
   */
  setFooterFigures(label?: string, onPlaced?: (placed: boolean) => void): void
  /** Drops every figure, including the ones frozen on earlier lines. */
  clear(): void
  dispose(): void
}

/** The nodes written on one footer, and the values they currently hold. */
interface Placed {
  values: InjectorLabels
  /** The host's own throughput text, which changes if the line is reused. */
  readonly signature: string
  beforeNode?: HostNode
  afterNode?: HostNode
}

export function createUsageInjector(context: Context): UsageInjector {
  let labels: InjectorLabels = {}
  let key: string | undefined
  let active: HostText | undefined
  let activeKey: string | undefined
  /** Whether the host's own ttft figure stays on the line. */
  let ttft = true
  /** The session figures the prompt footer should carry. */
  let footerLabel: string | undefined
  let footerFigures: { text: HostText; node: HostNode } | undefined
  let footerListener: ((placed: boolean) => void) | undefined
  let footerReported: boolean | undefined
  const placed = new Map<HostText, Placed>()
  /** The ttft spans taken out of a line, with what followed them. */
  const hidden = new Map<HostText, { node: HostNode; anchor: unknown }>()
  let timer: ReturnType<typeof setInterval> | undefined
  /** Keeps the host's renderable ids unique across the lines we annotate. */
  let serial = 0

  /** Dropping a node from the tree is enough; a rebuilt line has no parent. */
  function release(node: HostNode | undefined) {
    if (!node) return
    const parent = node.parent as { remove?: (child: HostNode) => void } | null
    try {
      parent?.remove?.(node)
    } catch {
      // The host already dropped the node; nothing left to clean up.
    }
    node.parent = null
  }

  function releasePlaced(record: Placed) {
    release(record.beforeNode)
    release(record.afterNode)
    record.beforeNode = undefined
    record.afterNode = undefined
  }

  function detachAll() {
    for (const record of placed.values()) releasePlaced(record)
    placed.clear()
    active = undefined
    activeKey = undefined
    releaseFooter()
  }

  function reportFooter(placed: boolean) {
    if (footerReported === placed) return
    footerReported = placed
    try {
      footerListener?.(placed)
    } catch {
      // A component that unmounted mid-repair must not break the timer.
    }
  }

  function releaseFooter() {
    release(footerFigures?.node)
    footerFigures = undefined
    reportFooter(false)
  }

  function makeNode(span: HostNode, value: string, id: string): HostNode | undefined {
    const Constructor = textNodeConstructor(span)
    if (!Constructor) return undefined

    serial += 1
    const node = new Constructor({
      id: `${id}.${serial}`,
      fg: span.fg,
      attributes: span.attributes,
    })
    node.add(value)
    return node
  }

  /** A child text node for the host's footer, styled like its parent text. */
  function makeFooterNode(target: HostText, source: HostText, value: string): HostNode | undefined {
    let Constructor: HostNodeConstructor | undefined
    try {
      Constructor = textNodeConstructor(source as unknown as HostNode)
    } catch {
      Constructor = undefined
    }
    Constructor ??= source.constructor as HostNodeConstructor | undefined
    if (!Constructor) return undefined
    const parent = target as unknown as { fg?: unknown; attributes?: number }

    serial += 1
    const node = new Constructor({
      id: `${FOOTER_ID}.${serial}`,
      fg: parent.fg,
      attributes: parent.attributes,
    })
    if (typeof node?.add !== "function") return undefined
    node.add(value)
    return node
  }

  function setText(node: HostNode, value: string) {
    if (textOf(node) !== value) node.children = [value]
  }

  /** Keeps the leading node directly in front of the throughput span. */
  function placeBefore(target: HostText, span: HostNode, record: Placed): boolean {
    const value = record.values.before
    if (!value) {
      release(record.beforeNode)
      record.beforeNode = undefined
      return true
    }

    if (!record.beforeNode) {
      record.beforeNode = makeNode(span, value, BEFORE_ID)
      if (!record.beforeNode) return false
    } else {
      setText(record.beforeNode, value)
    }

    const children = target.getTextChildren()
    const index = children.indexOf(record.beforeNode)
    if (index !== -1 && children[index + 1] === span) return true
    if (index !== -1) target.remove(record.beforeNode)
    target.insertBefore(record.beforeNode, span)
    return true
  }

  /** Keeps the trailing node directly after the throughput span. */
  function placeAfter(target: HostText, span: HostNode, record: Placed): boolean {
    const value = record.values.after
    if (!value) {
      release(record.afterNode)
      record.afterNode = undefined
      return true
    }

    if (!record.afterNode) {
      record.afterNode = makeNode(span, value, AFTER_ID)
      if (!record.afterNode) return false
    } else {
      setText(record.afterNode, value)
    }

    const children = target.getTextChildren()
    const index = children.indexOf(record.afterNode)
    const spanIndex = children.indexOf(span)
    if (index !== -1 && spanIndex !== -1 && index === spanIndex + 1) return true
    if (index !== -1) target.remove(record.afterNode)

    const next = target.getTextChildren()
    const anchor = next[next.indexOf(span) + 1]
    if (anchor) {
      target.insertBefore(record.afterNode, anchor)
    } else if (typeof target.add === "function") {
      target.add(record.afterNode)
    } else {
      // Without an append, keeping the text on the line beats dropping it.
      target.insertBefore(record.afterNode, span)
    }
    return true
  }

  /** Keeps a node first among a text's children. */
  function placeFirst(target: HostText, node: HostNode) {
    const children = target.getTextChildren()
    if (children[0] === node) return
    if (children.includes(node)) target.remove(node)
    const first = target.getTextChildren()[0]
    if (first) target.insertBefore(node, first)
    else target.add?.(node)
  }

  /**
   * Keeps the session figures in front of the prompt footer's context usage.
   * The host draws the shell indicator as a separate text just before it, so
   * prefixing the usage gives the requested order without touching the shell:
   *
   *   `1 shell · 649.3K tok total · $0.91 · 219.6K (56%)`
   *
   * The host rebuilds the usage text while a turn runs, so the repair pass puts
   * the node back when it disappears.
   */
  function placeFooterFigures(label: string | undefined) {
    if (!label) {
      releaseFooter()
      return
    }

    let texts: HostText[]
    try {
      texts = hostTexts(context.renderer.root)
    } catch {
      releaseFooter()
      return
    }

    const previous = footerFigures?.text
    const previousNode = footerFigures?.node
    const previousBase =
      previous && texts.includes(previous) ? withoutInjected(previous, previousNode) : undefined

    let usage: HostText | undefined
    if (previousBase !== undefined && isFooterUsage(previousBase)) {
      usage = previous
    } else {
      for (const text of texts) {
        if (isFooterUsage(text.plainText)) usage = text
      }
    }

    if (!usage) {
      releaseFooter()
      return
    }

    const leading = withoutInjected(
      usage,
      footerFigures?.text === usage ? footerFigures.node : undefined,
    ).startsWith(" · ")
    const value = leading ? ` · ${label}` : `${label} · `

    if (footerFigures && footerFigures.text !== usage) releaseFooter()

    try {
      if (footerFigures) {
        setText(footerFigures.node, value)
      } else {
        const node = makeFooterNode(usage, usage, value)
        if (!node) return
        footerFigures = { text: usage, node }
      }

      placeFirst(usage, footerFigures.node)
      reportFooter(true)
    } catch {
      releaseFooter()
    }
  }

  /** Writes one footer's values, creating or moving its nodes as needed. */
  function place(text: HostText, values: InjectorLabels) {
    const record = placed.get(text)
    if (!values.before && !values.after) {
      if (record) releasePlaced(record)
      return
    }

    const span = throughputSpan(text)
    if (!span) {
      // The host rebuilt the line without throughput; nothing to hang on to.
      if (record) {
        releasePlaced(record)
        placed.delete(text)
      }
      return
    }

    let target = record
    if (!target) {
      target = { values, signature: textOf(span) }
      placed.set(text, target)
    }
    target.values = values

    if (!placeBefore(text, span, target) || !placeAfter(text, span, target)) {
      releasePlaced(target)
      placed.delete(text)
    }
  }

  /** Whether anything still needs the repair timer. */
  function pending(): boolean {
    if (!ttft) return true
    if (footerLabel !== undefined) return true
    if (labels.before || labels.after) return true
    for (const record of placed.values()) {
      if (record.beforeNode || record.afterNode) return true
    }
    return false
  }

  /** Takes the host's ` · 1.7s ttft` span out of every footer on screen. */
  function hideTtft(texts: readonly HostText[]) {
    for (const text of texts) {
      const children = text.getTextChildren()
      const index = children.findIndex((child) => isTextNode(child) && / ttft$/.test(textOf(child)))
      if (index === -1) continue

      const span = children[index] as HostNode
      hidden.set(text, { node: span, anchor: children[index + 1] })
      text.remove(span)
    }

    for (const text of hidden.keys()) {
      if (!texts.includes(text)) hidden.delete(text)
    }
  }

  /** Puts the ttft spans back where they were, before the line is rebuilt. */
  function restoreTtft(texts: readonly HostText[]) {
    for (const [text, record] of hidden) {
      hidden.delete(text)
      if (!texts.includes(text)) continue

      const children = text.getTextChildren()
      if (record.anchor && children.includes(record.anchor)) {
        text.insertBefore(record.node, record.anchor)
      } else {
        text.add?.(record.node)
      }
    }
  }

  /** Restores every hidden figure, wherever the host still shows the line. */
  function restoreAll() {
    try {
      restoreTtft(throughputTexts(context.renderer.root))
    } catch {
      hidden.clear()
    }
  }

  function repair() {
    try {
      const texts = throughputTexts(context.renderer.root)

      // The host's ttft figure is optional, and it is the only part of the line
      // the tweak removes rather than writes.
      if (ttft) {
        restoreTtft(texts)
      } else {
        hideTtft(texts)
      }

      // The prompt footer is independent of the per-turn throughput lines.
      placeFooterFigures(footerLabel)

      // Forget the footers the host dropped, and the ones it reused for another
      // turn, so no figure ends up on a line it does not belong to.
      for (const [text, record] of placed) {
        const span = texts.includes(text) ? throughputSpan(text) : undefined
        if (span && textOf(span) === record.signature) continue
        releasePlaced(record)
        placed.delete(text)
      }

      const last = texts.at(-1)
      if (!last) {
        // No footer is mounted right now. Keep the timer alive while labels are
        // pending, so the first line to appear still gets them.
        if (!pending()) stop()
        return
      }

      if (labels.before || labels.after) {
        if (active && texts.includes(active)) {
          // A newer footer only takes the figures when its turn has finished and
          // the host rendered the matching line. Without a key, the newest line
          // is the best guess, which is how the injector behaves in isolation.
          const retarget =
            key === undefined
              ? last !== active && !placed.has(last)
              : activeKey !== key && last !== active && !placed.has(last)
          if (retarget) {
            active = last
            activeKey = key
          }
        } else {
          // The line we were refreshing left the tree, or there never was one.
          active = undefined
          activeKey = undefined
          if (!placed.has(last)) {
            active = last
            activeKey = key
          }
        }
      }

      for (const text of texts) {
        const record = placed.get(text)
        if (text === active && activeKey === key) {
          place(text, labels)
        } else if (record) {
          // Every other line keeps the values it was written with.
          place(text, record.values)
        }
      }

      if (!pending()) stop()
    } catch {
      detachAll()
    }
  }

  function start() {
    if (!timer) {
      timer = setInterval(repair, REPAIR_MS)
      timers.add(timer)
    }
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timers.delete(timer)
    timer = undefined
  }

  return {
    setLabels(next, nextKey) {
      labels = { before: next.before, after: next.after }
      key = nextKey
      // The timer exists only while there is something to splice, so a disabled
      // tweak runs no work at all.
      if (!labels.before && !labels.after && !pending()) {
        stop()
        detachAll()
        return
      }
      start()
      repair()
    },
    setTtft(visible) {
      ttft = visible
      if (visible) restoreAll()
      if (!pending()) {
        stop()
        return
      }
      start()
      repair()
    },
    setFooterFigures(label, onPlaced) {
      footerLabel = label
      footerListener = onPlaced
      footerReported = undefined
      if (!pending()) {
        releaseFooter()
        reportFooter(false)
        stop()
        return
      }
      start()
      repair()
    },
    clear() {
      labels = {}
      key = undefined
      footerLabel = undefined
      restoreAll()
      detachAll()
      footerListener = undefined
      stop()
    },
    dispose() {
      labels = {}
      key = undefined
      footerLabel = undefined
      restoreAll()
      detachAll()
      footerListener = undefined
      stop()
    },
  }
}
