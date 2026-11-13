import type { Context } from "@opencode/plugin/tui/context"
import { describe, expect, it } from "vitest"
import { createTokenInjector, lastThroughputText } from "./token-inject"

/** The parts of a host text renderable the walker reads. */
function text(plainText: string) {
  return {
    plainText,
    getTextChildren: () => ["span"],
    insertBefore: () => 0,
    remove: () => {},
  }
}

/** A text surface without spans, like the prompt's textarea. */
function bareText(plainText: string) {
  return { ...text(plainText), getTextChildren: () => [] }
}

/** The parts of a layout renderable the walker reads. */
function box(...children: unknown[]) {
  return { getChildren: () => children }
}

const FOOTER = "Build · DeepSeek V4.1 Flash Free · 15m 38s · 62.2 tok/s"

describe("lastThroughputText", () => {
  it("returns the newest footer, not the first one in the tree", () => {
    const root = box(
      box(text("Build · Sonnet · 2s · 12.0 tok/s"), text("some answer")),
      box(text(FOOTER)),
      box(text("~/project")),
    )
    expect(lastThroughputText(root)?.plainText).toBe(FOOTER)
  })

  it("ignores text without throughput", () => {
    expect(lastThroughputText(box(box(text("no throughput here"))))).toBeUndefined()
  })

  it("ignores text without spans, such as the prompt textarea", () => {
    expect(lastThroughputText(box(bareText("typed 12.0 tok/s")))).toBeUndefined()
  })

  it("finds a footer nested deeper than a sibling without one", () => {
    const root = box(box(text("plain")), box(box(box(text(FOOTER)))))
    expect(lastThroughputText(root)?.plainText).toBe(FOOTER)
  })

  it("returns nothing for an empty tree", () => {
    expect(lastThroughputText(box())).toBeUndefined()
  })
})

/** The host's text-node base class, named the way the compiled host names it. */
class ue {
  children: (string | ue)[] = []
  parent: unknown = null
  fg?: unknown
  attributes?: number

  constructor(options: { id?: string; fg?: unknown; attributes?: number } = {}) {
    this.fg = options.fg
    this.attributes = options.attributes
  }

  add(child: string | ue): number {
    return this.children.push(child)
  }
}

/** What the host hangs its styled spans from; a subclass that adds no text. */
class Ie extends ue {}

/** A `<text>` element whose children are the nodes the injector edits. */
function hostText(plainText: string, children: ue[]) {
  return {
    plainText,
    getTextChildren: () => children,
    insertBefore(node: ue, anchor: ue) {
      const index = children.indexOf(anchor)
      children.splice(index === -1 ? children.length : index, 0, node)
      node.parent = { remove: (child: ue) => removeChild(children, child) }
      return children.length
    },
    add(node: ue) {
      children.push(node)
      node.parent = { remove: (child: ue) => removeChild(children, child) }
      return children.length - 1
    },
    remove: (node: ue) => removeChild(children, node),
  }
}

function removeChild(children: ue[], node: ue) {
  const index = children.indexOf(node)
  if (index !== -1) children.splice(index, 1)
  node.parent = null
}

/** The text a node subtree holds, enough for these fixtures. */
function nodeText(node: ue): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : nodeText(child)))
    .join("")
}

function injectorFor(extra: ue[] = []) {
  // The host renders ` · 62.2 tok/s` as a span around a leaf text node, and the
  // injector takes its class from that leaf rather than from a class name.
  const span = new Ie()
  const throughput = new ue()
  throughput.add(" · 62.2 tok/s")
  span.add(throughput)
  const text = hostText(FOOTER, [span, ...extra])
  const injector = createTokenInjector({
    renderer: { root: { getChildren: () => [text] } },
  } as unknown as Context)
  return { injector, text, span, children: text.getTextChildren() as ue[] }
}

describe("createTokenInjector", () => {
  it("splices the total in front of the throughput span", () => {
    const { injector, children, span } = injectorFor()
    injector.setLabels({ before: " · 8.5M tok" })

    expect(children).toHaveLength(2)
    expect(children[1]).toBe(span)
    expect(children[0]?.children).toEqual([" · 8.5M tok"])
    // The injected node borrows the span's own style so it blends in.
    expect(children[0]?.fg).toBe(span.fg)

    injector.dispose()
    expect(children).toHaveLength(1)
  })

  it("puts the cost right after the throughput span", () => {
    const tail = new Ie()
    const { injector, children, span } = injectorFor([tail])
    injector.setLabels({ after: " · $0.0042" })

    expect(children).toHaveLength(3)
    expect(children[0]).toBe(span)
    expect(children[1]?.children).toEqual([" · $0.0042"])
    expect(children[2]).toBe(tail)

    injector.dispose()
    expect(children).toHaveLength(2)
  })

  it("appends the cost when nothing follows the throughput span", () => {
    const { injector, children, span } = injectorFor()
    injector.setLabels({ after: " · $0.0042" })

    expect(children).toHaveLength(2)
    expect(children[0]).toBe(span)
    expect(children[1]?.children).toEqual([" · $0.0042"])
    injector.dispose()
  })

  it("keeps the count before and the cost after the same span", () => {
    const { injector, children, span } = injectorFor()
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" })

    expect(children).toHaveLength(3)
    expect(children[0]?.children).toEqual([" · 8.5M tok"])
    expect(children[1]).toBe(span)
    expect(children[2]?.children).toEqual([" · $0.0042"])

    injector.dispose()
    expect(children).toHaveLength(1)
  })

  it("puts the nodes back after the host rebuilds the line", () => {
    const tail = new Ie()
    const { injector, children, span } = injectorFor([tail])
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" })
    children.length = 0
    children.push(span, tail)

    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" })
    expect(children).toHaveLength(4)
    expect(children[0]?.children).toEqual([" · 8.5M tok"])
    expect(children[1]).toBe(span)
    expect(children[2]?.children).toEqual([" · $0.0042"])
    injector.dispose()
  })

  it("updates the text without adding a second node", () => {
    const tail = new Ie()
    const { injector, children } = injectorFor([tail])
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" })
    injector.setLabels({ before: " · 9.1M tok", after: " · $0.0101" })

    expect(children).toHaveLength(4)
    expect(children[0]?.children).toEqual([" · 9.1M tok"])
    expect(children[2]?.children).toEqual([" · $0.0101"])
    injector.dispose()
  })

  it("removes the nodes when the labels go away", () => {
    const { injector, children } = injectorFor()
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" })
    injector.setLabels({})

    expect(children).toHaveLength(1)
    injector.dispose()
  })

  it("leaves the line alone when the host has no throughput", () => {
    const injector = createTokenInjector({
      renderer: {
        root: { getChildren: () => [hostText("~/project", [new Ie()])] },
      },
    } as unknown as Context)
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" })
    injector.dispose()
  })
})

/** One turn's footer, with its own throughput span and, optionally, ttft. */
function footer(rate: string, ttft?: string) {
  const span = new Ie()
  const throughput = new ue()
  throughput.add(` · ${rate} tok/s`)
  span.add(throughput)

  const children: ue[] = [span]
  if (ttft) {
    const tail = new Ie()
    tail.add(` · ${ttft} ttft`)
    children.push(tail)
  }

  const text = hostText(
    `Build · Model · 2s · ${rate} tok/s${ttft ? ` · ${ttft} ttft` : ""}`,
    children,
  )
  return { text, span, children: text.getTextChildren() as ue[] }
}

describe("createTokenInjector across turns", () => {
  it("writes the figures on the newest footer only", () => {
    const first = footer("12.0")
    const second = footer("62.2")
    const root = { getChildren: () => [first.text, second.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" }, "turn 2")

    expect(first.children).toHaveLength(1)
    expect(second.children.map(nodeText)).toEqual([" · 8.5M tok", " · 62.2 tok/s", " · $0.0042"])
    injector.dispose()
  })

  it("keeps the previous line's figures when a newer footer appears", () => {
    const first = footer("12.0")
    const root = { getChildren: (): unknown[] => [first.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setLabels({ before: " · 1.2K tok", after: " · $0.0010" }, "turn 1")
    expect(first.children.map(nodeText)).toEqual([" · 1.2K tok", " · 12.0 tok/s", " · $0.0010"])

    const second = footer("62.2")
    root.getChildren = () => [first.text, second.text]
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" }, "turn 2")

    expect(first.children.map(nodeText)).toEqual([" · 1.2K tok", " · 12.0 tok/s", " · $0.0010"])
    expect(second.children.map(nodeText)).toEqual([" · 8.5M tok", " · 62.2 tok/s", " · $0.0042"])
    injector.dispose()
  })

  it("waits for the new turn's footer instead of writing on the old line", () => {
    const first = footer("12.0")
    const root = { getChildren: (): unknown[] => [first.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setLabels({ before: " · 1.2K tok", after: " · $0.0010" }, "turn 1")
    // The figures for turn 2 land before the host renders its footer.
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" }, "turn 2")
    expect(first.children.map(nodeText)).toEqual([" · 1.2K tok", " · 12.0 tok/s", " · $0.0010"])

    const second = footer("62.2")
    root.getChildren = () => [first.text, second.text]
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" }, "turn 2")

    expect(first.children.map(nodeText)).toEqual([" · 1.2K tok", " · 12.0 tok/s", " · $0.0010"])
    expect(second.children.map(nodeText)).toEqual([" · 8.5M tok", " · 62.2 tok/s", " · $0.0042"])
    injector.dispose()
  })

  it("leaves the frozen lines alone when the newest turn has nothing to show", () => {
    const first = footer("12.0")
    const second = footer("62.2")
    const root = { getChildren: (): unknown[] => [first.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setLabels({ before: " · 1.2K tok" }, "turn 1")
    root.getChildren = () => [first.text, second.text]
    injector.setLabels({ before: " · 8.5M tok" }, "turn 2")
    injector.setLabels({}, "turn 2")

    expect(first.children.map(nodeText)).toEqual([" · 1.2K tok", " · 12.0 tok/s"])
    expect(second.children.map(nodeText)).toEqual([" · 62.2 tok/s"])
    injector.dispose()
  })

  it("clears every line when the tweak is turned off", () => {
    const first = footer("12.0")
    const second = footer("62.2")
    const root = { getChildren: (): unknown[] => [first.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setLabels({ before: " · 1.2K tok" }, "turn 1")
    root.getChildren = () => [first.text, second.text]
    injector.setLabels({ before: " · 8.5M tok" }, "turn 2")
    injector.clear()

    expect(first.children.map(nodeText)).toEqual([" · 12.0 tok/s"])
    expect(second.children.map(nodeText)).toEqual([" · 62.2 tok/s"])
  })
})

describe("createTokenInjector and the host's ttft", () => {
  it("hides the ttft span and keeps the throughput", () => {
    const line = footer("62.2", "1.7s")
    const root = { getChildren: () => [line.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setTtft(false)
    expect(line.children.map(nodeText)).toEqual([" · 62.2 tok/s"])

    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" }, "turn 1")
    expect(line.children.map(nodeText)).toEqual([" · 8.5M tok", " · 62.2 tok/s", " · $0.0042"])
    injector.dispose()
  })

  it("puts the ttft span back after the cost", () => {
    const line = footer("62.2", "1.7s")
    const root = { getChildren: () => [line.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setTtft(false)
    injector.setLabels({ before: " · 8.5M tok", after: " · $0.0042" }, "turn 1")
    injector.setTtft(true)

    expect(line.children.map(nodeText)).toEqual([
      " · 8.5M tok",
      " · 62.2 tok/s",
      " · $0.0042",
      " · 1.7s ttft",
    ])
    injector.dispose()
  })

  it("hides it again on a line the host rebuilt", () => {
    const line = footer("62.2", "1.7s")
    const root = { getChildren: () => [line.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    const ttftSpan = line.children[1] as ue
    injector.setTtft(false)
    line.children.length = 0
    line.children.push(line.span, ttftSpan)
    injector.setTtft(false)

    expect(line.children.map(nodeText)).toEqual([" · 62.2 tok/s"])
    injector.dispose()
  })

  it("brings ttft back when the tweak is turned off", () => {
    const line = footer("62.2", "1.7s")
    const root = { getChildren: () => [line.text] }
    const injector = createTokenInjector({ renderer: { root } } as unknown as Context)

    injector.setTtft(false)
    injector.clear()

    expect(line.children.map(nodeText)).toEqual([" · 62.2 tok/s", " · 1.7s ttft"])
  })
})

/** The host's context usage text node, with children the injector can append to. */
class UsageText {
  children: (string | UsageText)[] = []
  parent: unknown = null
  fg?: unknown
  attributes?: number

  constructor(options: { id?: string; fg?: unknown; attributes?: number } = {}) {
    this.fg = options.fg
    this.attributes = options.attributes
  }

  get plainText(): string {
    return this.children
      .map((child) => (typeof child === "string" ? child : child.plainText))
      .join("")
  }

  getTextChildren() {
    return this.children
  }

  insertBefore(node: UsageText, anchor: UsageText) {
    const index = this.children.indexOf(anchor)
    this.children.splice(index === -1 ? this.children.length : index, 0, node)
    node.parent = this
    return this.children.length
  }

  add(child: string | UsageText) {
    this.children.push(child)
    if (typeof child !== "string") child.parent = this
    return this.children.length - 1
  }

  remove(node: UsageText) {
    const index = this.children.indexOf(node)
    if (index !== -1) this.children.splice(index, 1)
    node.parent = null
  }
}

function usageSurface(text = "114.9K (29%)") {
  const usage = new UsageText({ fg: "muted" })
  usage.children.push(text)
  return usage
}

describe("createTokenInjector and the footer cost", () => {
  it("appends the cost after the context usage", () => {
    const usage = usageSurface()
    const injector = createTokenInjector({
      renderer: { root: { getChildren: () => [usage] } },
    } as unknown as Context)

    injector.setFooterCost(" · $0.91")
    expect(usage.plainText).toBe("114.9K (29%) · $0.91")
    expect(usage.children).toHaveLength(2)

    injector.dispose()
    expect(usage.plainText).toBe("114.9K (29%)")
  })

  it("puts the cost back after the host rebuilds the usage", () => {
    const usage = usageSurface()
    const injector = createTokenInjector({
      renderer: { root: { getChildren: () => [usage] } },
    } as unknown as Context)

    injector.setFooterCost(" · $0.91")
    usage.children.length = 1

    injector.setFooterCost(" · $0.91")
    expect(usage.plainText).toBe("114.9K (29%) · $0.91")
    expect(usage.children).toHaveLength(2)
    injector.dispose()
  })

  it("updates the cost without adding a second node", () => {
    const usage = usageSurface()
    const injector = createTokenInjector({
      renderer: { root: { getChildren: () => [usage] } },
    } as unknown as Context)

    injector.setFooterCost(" · $0.91")
    injector.setFooterCost(" · $1.24")
    expect(usage.plainText).toBe("114.9K (29%) · $1.24")
    expect(usage.children).toHaveLength(2)
    injector.dispose()
  })

  it("keeps the host's own cost and adds the tweak's after it", () => {
    const usage = usageSurface("114.9K (29%) · $0.05")
    const injector = createTokenInjector({
      renderer: { root: { getChildren: () => [usage] } },
    } as unknown as Context)

    injector.setFooterCost(" · $0.91")
    expect(usage.plainText).toBe("114.9K (29%) · $0.05 · $0.91")
    injector.dispose()
  })

  it("leaves text that only mentions the usage alone", () => {
    const usage = usageSurface("the context is 114.9K (29%) now")
    const injector = createTokenInjector({
      renderer: { root: { getChildren: () => [usage] } },
    } as unknown as Context)

    injector.setFooterCost(" · $0.91")
    expect(usage.plainText).toBe("the context is 114.9K (29%) now")
    injector.dispose()
  })
})
