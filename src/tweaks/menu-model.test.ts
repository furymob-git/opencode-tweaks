import { describe, expect, it } from "vitest"
import { filterRows, groupRows, type MenuRow, moveRow, orderedRows } from "./menu-model"

const rows: MenuRow[] = [
  { id: "quota", title: "Quota", category: "Quota" },
  { id: "enabled", title: "Enabled", category: "General" },
  { id: "bar", title: "Bar width", category: "Display" },
  { id: "reset", title: "Reset times", category: "Display" },
]

describe("filterRows", () => {
  it("matches titles and categories without case sensitivity", () => {
    expect(filterRows(rows, "BAR").map((row) => row.id)).toEqual(["bar"])
    expect(filterRows(rows, "general").map((row) => row.id)).toEqual(["enabled"])
  })

  it("returns every row for an empty query", () => {
    expect(filterRows(rows, "  ")).toEqual(rows)
  })
})

describe("groupRows", () => {
  it("groups in definition order", () => {
    expect(groupRows(rows).map(([category]) => category)).toEqual(["Quota", "General", "Display"])
    expect(groupRows(rows).find(([category]) => category === "Display")?.[1]).toHaveLength(2)
  })
})

describe("orderedRows", () => {
  it("flattens categories in the order they are drawn", () => {
    // A row defined after another category still draws inside its own group.
    const outOfOrder: MenuRow[] = [
      ...rows,
      { id: "format", title: "Format", category: "Display" },
      { id: "count", title: "Count", category: "Scope" },
    ]

    expect(orderedRows(outOfOrder).map((row) => row.id)).toEqual([
      "quota",
      "enabled",
      "bar",
      "reset",
      "format",
      "count",
    ])
  })

  it("keeps navigation next to what the screen shows", () => {
    const drawn = orderedRows([
      { id: "a", title: "A", category: "One" },
      { id: "b", title: "B", category: "Two" },
      { id: "c", title: "C", category: "One" },
    ])

    expect(moveRow(drawn, "c", 1)?.id).toBe("b")
  })
})

describe("moveRow", () => {
  it("wraps in both directions", () => {
    expect(moveRow(rows, "quota", -1)?.id).toBe("reset")
    expect(moveRow(rows, "reset", 1)?.id).toBe("quota")
  })

  it("starts at the first or last row when the current one is gone", () => {
    expect(moveRow(rows, "missing", 1)?.id).toBe("quota")
    expect(moveRow(rows, "missing", -1)?.id).toBe("reset")
  })

  it("returns nothing for an empty list", () => {
    expect(moveRow([], "quota", 1)).toBeUndefined()
  })
})
