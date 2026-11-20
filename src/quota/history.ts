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

/** Days kept on disk. The `/quota` report draws at most a month of them. */
const KEEP_DAYS = 31
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/**
 * The calendar days a report covers, oldest first and ending today. Walking
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
 * A short name for one day of the report: `Today`, `Yest.`, or `Wed 18`.
 * Comparing keys keeps the label local and daylight-saving safe.
 */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today"

  const date = new Date(`${day}T12:00:00`)
  if (!Number.isFinite(date.getTime())) return day

  const cursor = new Date(`${today}T12:00:00`)
  if (Number.isFinite(cursor.getTime())) {
    cursor.setDate(cursor.getDate() - 1)
    if (day === dayKey(cursor.getTime())) return "Yest."
  }

  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}`
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

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}
