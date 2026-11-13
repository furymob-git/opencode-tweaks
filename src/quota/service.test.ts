import { describe, expect, it } from "vitest"
import { readQuotas, supportedProviders } from "./service"

describe("supportedProviders", () => {
  it("lists the providers that have a quota source", () => {
    expect(supportedProviders().length).toBeGreaterThan(0)
    expect(supportedProviders()).toContain("opencode-go")
  })
})

describe("readQuotas", () => {
  it("returns nothing for a provider without a source, so the panel stays hidden", async () => {
    const signal = new AbortController().signal
    expect(await readQuotas({} as never, "not-a-provider", signal)).toEqual([])
  })
})
