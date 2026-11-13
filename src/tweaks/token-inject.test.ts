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
