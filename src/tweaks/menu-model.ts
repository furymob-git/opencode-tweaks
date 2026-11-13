export interface MenuRow {
  readonly id: string
  readonly title: string
  readonly category: string
}

/** Keeps rows whose title or category matches the query. */
export function filterRows<Row extends MenuRow>(rows: readonly Row[], query: string): Row[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...rows]

  return rows.filter(
    (row) =>
      row.title.toLowerCase().includes(needle) || row.category.toLowerCase().includes(needle),
  )
}

/** Groups rows by category while preserving the order they were defined in. */
export function groupRows<Row extends MenuRow>(rows: readonly Row[]): Array<[string, Row[]]> {
  const groups = new Map<string, Row[]>()

  for (const row of rows) {
    const group = groups.get(row.category)
    if (group) {
      group.push(row)
    } else {
      groups.set(row.category, [row])
    }
  }

  return [...groups.entries()]
}

/** Moves through a wrapping list, starting at the first or last row when the current id is gone. */
export function moveRow<Row extends MenuRow>(
  rows: readonly Row[],
  current: string | undefined,
  delta: number,
): Row | undefined {
  if (rows.length === 0) return undefined

  const index = rows.findIndex((row) => row.id === current)
  if (index < 0) return delta > 0 ? rows[0] : rows[rows.length - 1]

  return rows[(index + delta + rows.length) % rows.length]
}
