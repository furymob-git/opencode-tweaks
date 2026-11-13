import type { Context } from "@opencode/plugin/tui/context"

/**
 * The host draws the `agent · model · duration · tok/s` line under every
 * assistant message itself, and publishes no slot inside it. This module is the
 * deliberate exception to the plugin's "no interface fighting" rule: it splices
 * the counts into that line's text nodes, then repairs itself on a timer because
 * the host rebuilds the line whenever a turn advances.
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
/** The line is rebuilt on every token, so a slow repair would lag behind it. */
const REPAIR_MS = 400
const BEFORE_ID = "opencode-tweaks.tokens.before"
const AFTER_ID = "opencode-tweaks.tokens.after"

/**
 * A text node is the only renderable with a string-or-node child list, which is
 * also how the host tells it apart from the element it hangs from.
 */
function isTextNode(value: unknown): value is HostNode {
  const node = value as Partial<HostNode> | null
  if (!node || !Array.isArray(node.children)) return false
  return typeof node.add === "function"
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
  return node.children.map(textOf).join("")
}

/**
 * The newest footer is the last one in tree order, so walking children backwards
 * finds it without touching the rest of the interface.
 */
export function lastThroughputText(node: {
  getChildren(): readonly unknown[]
}): HostText | undefined {
  const children = node.getChildren()
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index]
    const text = asHostText(child)
    if (text) {
      // A footer always carries spans; requiring them keeps the prompt's
      // textarea, which also exposes text, out of the way.
      if (THROUGHPUT.test(text.plainText) && text.getTextChildren().length > 0) return text
      continue
    }

    const branch = child as { getChildren?: unknown }
    if (typeof branch.getChildren !== "function") continue
    const found = lastThroughputText(branch as { getChildren(): readonly unknown[] })
    if (found) return found
  }
  return undefined
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
    for (const child of node.children) {
      if (typeof child === "string" || !isTextNode(child)) continue
      if (child.children.some((item) => typeof item === "string")) {
        return child.constructor as HostNodeConstructor
      }
      pending.push(child)
    }
  }
  return undefined
}

export interface InjectorLabels {
  /** Text just before the throughput figure, such as the prompt token count. */
  readonly before?: string
  /** Text just after it, such as the prompt cost. */
  readonly after?: string
}

export interface TokenInjector {
  /** The texts to splice, or empty fields to leave the line alone. */
  setLabels(labels: InjectorLabels): void
  dispose(): void
}

export function createTokenInjector(context: Context): TokenInjector {
  let labels: InjectorLabels = {}
  let beforeNode: HostNode | undefined
  let afterNode: HostNode | undefined
  let timer: ReturnType<typeof setInterval> | undefined

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

  function detach() {
    release(beforeNode)
    release(afterNode)
    beforeNode = undefined
    afterNode = undefined
  }

  function makeNode(span: HostNode, value: string, id: string): HostNode | undefined {
    const Constructor = textNodeConstructor(span)
    if (!Constructor) return undefined

    const node = new Constructor({ id, fg: span.fg, attributes: span.attributes })
    node.add(value)
    return node
  }

  function setText(node: HostNode, value: string) {
    if (textOf(node) !== value) node.children = [value]
  }

  /** Keeps the leading node directly in front of the throughput span. */
  function placeBefore(target: HostText, span: HostNode): boolean {
    const value = labels.before
    if (!value) {
      release(beforeNode)
      beforeNode = undefined
      return true
    }

    if (!beforeNode) {
      beforeNode = makeNode(span, value, BEFORE_ID)
      if (!beforeNode) return false
    } else {
      setText(beforeNode, value)
    }

    const children = target.getTextChildren()
    const index = children.indexOf(beforeNode)
    if (index !== -1 && children[index + 1] === span) return true
    if (index !== -1) target.remove(beforeNode)
    target.insertBefore(beforeNode, span)
    return true
  }

  /** Keeps the trailing node directly after the throughput span. */
  function placeAfter(target: HostText, span: HostNode): boolean {
    const value = labels.after
    if (!value) {
      release(afterNode)
      afterNode = undefined
      return true
    }

    if (!afterNode) {
      afterNode = makeNode(span, value, AFTER_ID)
      if (!afterNode) return false
    } else {
      setText(afterNode, value)
    }

    const children = target.getTextChildren()
    const index = children.indexOf(afterNode)
    const spanIndex = children.indexOf(span)
    if (index !== -1 && spanIndex !== -1 && index === spanIndex + 1) return true
    if (index !== -1) target.remove(afterNode)

    const next = target.getTextChildren()
    const anchor = next[next.indexOf(span) + 1]
    if (anchor) {
      target.insertBefore(afterNode, anchor)
    } else if (typeof target.add === "function") {
      target.add(afterNode)
    } else {
      // Without an append, keeping the text on the line beats dropping it.
      target.insertBefore(afterNode, span)
    }
    return true
  }

  function repair() {
    try {
      if (!labels.before && !labels.after) {
        detach()
        return
      }

      const target = lastThroughputText(context.renderer.root)
      const span = target ? throughputSpan(target) : undefined
      if (!target || !span) {
        detach()
        return
      }

      if (!placeBefore(target, span) || !placeAfter(target, span)) detach()
    } catch {
      detach()
    }
  }

  function start() {
    if (!timer) timer = setInterval(repair, REPAIR_MS)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  return {
    setLabels(next) {
      labels = { before: next.before, after: next.after }
      // The timer exists only while there is something to splice, so a disabled
      // tweak runs no work at all.
      if (!labels.before && !labels.after) {
        stop()
        detach()
        return
      }
      start()
      repair()
    },
    dispose() {
      stop()
      detach()
    },
  }
}
