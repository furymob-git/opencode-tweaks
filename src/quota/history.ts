import { dayKey } from "./pace"

/** The first and last quota reading of one local calendar day. */
export interface HistoryDay {
  readonly first: number
  readonly last: number
}

/**
 * One provider window's readings, kept only while the window lasts. A new
 * `resetsAt` starts a fresh entry, because spending before and after a reset
 * cannot be subtracted from each other.
 */
export interface HistoryEntry {
  readonly resetsAt: string
  readonly days: Readonly<Record<string, HistoryDay>>
}

/** Days kept on disk. The panel draws at most two weeks of them. */
const KEEP_DAYS = 31
const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const

/**
 * The calendar days a sparkline covers, oldest first and ending today. Walking
 * with `setDate` keeps the keys local, so a daylight-saving change cannot skip
 * or repeat a day.
 */
export function historyDays(now: number, days: number): string[] {
  const count = Math.max(1, Math.round(days))
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  cursor.setDate(cursor.getDate() - (count - 1))

  const keys: string[] = []
  for (let index = 0; index < count; index++) {
    keys.push(dayKey(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

/**
 * Records one reading. The first reading of a day is kept as the baseline for
 * that day, and every later reading replaces the last value. Returning the same
 * entry when nothing moved keeps the reactive store from writing on every tick.
 */
export function recordHistory(
  current: HistoryEntry | undefined,
  resetsAt: string,
  day: string,
  remaining: number,
  now: number,
): HistoryEntry {
  const value = clamp(remaining)
  const base = current?.resetsAt === resetsAt ? current : undefined
  const days = pruneDays(base?.days ?? {}, now)
  const today = days[day]

  if (base && today && today.last === value && days === base.days) return base

  return {
    resetsAt,
    days: {
      ...days,
      [day]: { first: today?.first ?? value, last: value },
    },
  }
}

/**
 * Percentage points spent on each day, oldest first. A day without a reading
 * stays empty instead of borrowing a neighbour's baseline, and a day after a
 * gap starts from its own first reading. Today's value is partial by nature.
 */
export function historySeries(
  entry: HistoryEntry | undefined,
  days: readonly string[],
): Array<number | undefined> {
  if (!entry) return days.map(() => undefined)

  return days.map((day, index) => {
    const reading = entry.days[day]
    if (!reading) return undefined

    const previous = index > 0 ? entry.days[days[index - 1] ?? ""] : undefined
    const baseline = previous?.last ?? reading.first
    return Math.max(0, baseline - reading.last)
  })
}

/** The percentage points the whole series adds up to. */
export function historySpent(values: readonly (number | undefined)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

/**
 * A sparkline for the series. Values are grouped into `buckets` columns when
 * the bar column is narrower than the number of days, so a fixed bar width
 * still shows the whole history. Missing days stay a dot.
 */
export function sparkline(values: readonly (number | undefined)[], buckets: number): string {
  if (values.length === 0) return ""

  const width = Math.max(1, Math.min(Math.round(buckets), values.length))
  const groups = bucketize(values, width)
  // One percentage point is the smallest scale worth drawing. Without it a
  // hundredth of a point would fill the row on a quiet day.
  const top = Math.max(
    1,
    groups.reduce<number>(
      (highest, value) => (value === undefined ? highest : Math.max(highest, value)),
      0,
    ),
  )

  return groups
    .map((value) => {
      if (value === undefined) return " "
      if (value <= 0) return BLOCKS[0]

      const level = Math.max(1, Math.ceil((value / top) * (BLOCKS.length - 1)))
      return BLOCKS[Math.min(BLOCKS.length - 1, level)]
    })
    .join("")
}

/** The label that fits the three-column quota label: a week or two weeks. */
export function historyLabel(days: number): string {
  if (days >= 28) return "mo"
  return days >= 14 ? "2wk" : "wk"
}

/** Drops readings older than the retention window, reusing the record when it can. */
function pruneDays(
  days: Readonly<Record<string, HistoryDay>>,
  now: number,
): Readonly<Record<string, HistoryDay>> {
  const cutoff = historyDays(now, KEEP_DAYS)[0] ?? ""
  const stale = Object.keys(days).filter((key) => key < cutoff)
  if (stale.length === 0) return days

  const next = { ...days }
  for (const key of stale) delete next[key]
  return next
}

/** Sums contiguous days into exactly `width` groups, keeping empty days empty. */
function bucketize(
  values: readonly (number | undefined)[],
  width: number,
): Array<number | undefined> {
  if (width >= values.length) return [...values]

  const groups: Array<number | undefined> = []
  for (let index = 0; index < width; index++) {
    const start = Math.floor((index * values.length) / width)
    const end = Math.floor(((index + 1) * values.length) / width)

    let sum: number | undefined
    for (let at = start; at < end; at++) {
      const value = values[at]
      if (value !== undefined) sum = (sum ?? 0) + value
    }
    groups.push(sum)
  }
  return groups
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}
