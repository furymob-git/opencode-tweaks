import { describe, expect, it } from "vitest"
import { type CatalogModel, charged, paidSibling } from "./catalog"
import type { ModelPrice } from "./cost"

const paid: ModelPrice = { input: 0.3, output: 1.2, cache: { read: 0.006, write: 0 } }
const free: ModelPrice = { input: 0, output: 0, cache: { read: 0, write: 0 } }

function model(
  name: string,
  overrides: Partial<CatalogModel> = {},
  cost: readonly ModelPrice[] = [paid],
): CatalogModel {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    modelID: name.toLowerCase().replace(/\s+/g, "-"),
    providerID: "opencode",
    name,
    cost,
    ...overrides,
  }
}

const promo = model("DeepSeek V4.1 Flash Free", { id: "free-entry" }, [free])

describe("charged", () => {
  it("is false only when every billed rate is zero", () => {
    expect(charged([paid])).toBe(true)
    expect(charged([free])).toBe(false)
    expect(charged([{ ...free, input: 0.1 }])).toBe(true)
  })
})

describe("paidSibling", () => {
  it("finds the paid entry behind a trailing Free", () => {
    const sibling = model("DeepSeek V4.1 Flash 1017")
    expect(paidSibling([promo, sibling], promo)).toBe(sibling)
  })

  it("accepts a trailing (free) and ignores the case", () => {
    const entry = model("Kimi K2.5 (Free)", { id: "kimi-free" }, [free])
    const sibling = model("Kimi K2.5")
    expect(paidSibling([entry, sibling], entry)).toBe(sibling)
  })

  it("prefers the exact name over a longer variant", () => {
    const variant = model("DeepSeek V4.1 Flash 1017")
    const exact = model("DeepSeek V4.1 Flash")
    expect(paidSibling([promo, variant, exact], promo)).toBe(exact)
  })

  it("takes the shortest variant when no name matches exactly", () => {
    const long = model("DeepSeek V4.1 Flash 1017 Preview")
    const short = model("DeepSeek V4.1 Flash 1017")
    expect(paidSibling([promo, long, short], promo)).toBe(short)
  })

  it("stays within the same provider", () => {
    const other = model("DeepSeek V4.1 Flash 1017", { providerID: "edenai" })
    expect(paidSibling([promo, other], promo)).toBeUndefined()
  })

  it("skips candidates that bill nothing", () => {
    const zero = model("DeepSeek V4.1 Flash 1017", { id: "zero" }, [free])
    expect(paidSibling([promo, zero], promo)).toBeUndefined()
  })

  it("returns nothing when the name carries no free suffix", () => {
    const plain = model("DeepSeek V4.1 Flash 1017")
    expect(paidSibling([plain], plain)).toBeUndefined()
  })

  it("returns nothing when the catalog has no paid entry", () => {
    expect(paidSibling([promo], promo)).toBeUndefined()
  })
})
