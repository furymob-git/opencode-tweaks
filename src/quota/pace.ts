import type { QuotaWindowKey } from "../rpc"

/**
 * The longest window is the one a daily budget is planned on. Its nominal
 * length is enough to choose it, because the reset date alone cannot tell a
 * 5h window that just started from a 30d one that is about to reset.
 */
const WINDOW_DAYS: Readonly<Record<QuotaWindowKey, number>> = {
  "5h": 5 / 24,
  "7d": 7,
  "30d": 30,
}

export interface PaceWindow {
  readonly key: QuotaWindowKey
  readonly percentRemaining: number
  readonly percentRemainingExact?: number
  readonly resetsAt: string
}

/**
 * The share to pace with: the provider's exact figure when it publishes one, so
 * the daily bar moves with real spending instead of a whole percent at a time.
 */
export function exactRemaining(window: PaceWindow): number {
  return window.percentRemainingExact ?? window.percentRemaining
}

/**
 * The window whose quota is spread over the days: the 30d one when the provider
 * publishes it, the 7d one otherwise, and so on.
 */
export function longestWindow<Window extends PaceWindow>(
  windows: readonly Window[],
): Window | undefined {
  let best: Window | undefined
  for (const window of windows) {
    if (!best || WINDOW_DAYS[window.key] > WINDOW_DAYS[best.key]) best = window
  }
  return best
}

/** Local calendar day as `2026-11-13`: the budget resets with it. */
export function dayKey(time: number): string {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** Local midnight that follows `time`, when today's budget is replaced. */
export function endOfDay(time: number): number {
  const date = new Date(time)
  date.setHours(24, 0, 0, 0)
  return date.getTime()
}

/** The weekday a timestamp falls on, with Sunday at index 0 like `Date`. */
export function weekdayOf(time: number): number {
  return new Date(time).getDay()
}

/**
 * How many selected weekdays are left before the window resets, today
 * included when it is a workday. The reset day counts even when the reset
 * happens early, because that morning still had a budget.
 */
export function workdaysUntil(
  time: number,
  resetsAt: string,
  workdays: readonly boolean[],
): number {
  const reset = Date.parse(resetsAt)
  if (!Number.isFinite(reset) || reset <= time) return 0

  const cursor = new Date(time)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(reset)
  end.setHours(0, 0, 0, 0)

  let count = 0
  let guard = 0
  // A window can never span more than a year, so the guard only stops a
  // malformed reset date from looping.
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    if (workdays[cursor.getDay()] === true) count += 1
    cursor.setDate(cursor.getDate() + 1)
    guard += 1
  }
  return count
}

/** Percent of the window that can be spent on each remaining workday. */
export function dailyAllowance(
  percentRemaining: number,
  reserve: number,
  workdays: number,
): number {
  const spendable = Math.max(0, clamp(percentRemaining) - Math.max(0, reserve))
  if (workdays <= 0) return 0
  return spendable / workdays
}

/** What identifies a budget day, so a changed setting starts a new baseline. */
export function paceSignature(workdays: readonly boolean[], reserve: number): string {
  return `${workdays.map((day) => (day ? "1" : "0")).join("")}:${reserve}`
}

/**
 * The baseline frozen at the first reading of a budget day. Keeping the start
 * and the allowance still means the bar only moves when quota is spent, instead
 * of shrinking every time the panel reads a lower percentage.
 */
export interface PaceEntry {
  readonly day: string
  readonly resetsAt: string
  readonly signature: string
  readonly start: number
  readonly allowance: number
}

export function isCurrent(
  entry: PaceEntry | undefined,
  day: string,
  resetsAt: string,
  signature: string,
): boolean {
  return (
    entry !== undefined &&
    entry.day === day &&
    entry.resetsAt === resetsAt &&
    entry.signature === signature
  )
}

export function startPace(
  percentRemaining: number,
  day: string,
  resetsAt: string,
  signature: string,
  workdays: readonly boolean[],
  reserve: number,
  now: number,
): PaceEntry {
  const restDay = workdays[weekdayOf(now)] !== true
  const allowance = restDay
    ? 0
    : dailyAllowance(percentRemaining, reserve, workdaysUntil(now, resetsAt, workdays))

  return {
    day,
    resetsAt,
    signature,
    start: clamp(percentRemaining),
    allowance,
  }
}

export interface PaceProgress {
  readonly allowance: number
  readonly spent: number
  readonly left: number
  /** Share of the day's allowance that is left, from 0 to 100. */
  readonly ratio: number
}

export function paceProgress(entry: PaceEntry, percentRemaining: number): PaceProgress {
  const spent = Math.max(0, entry.start - clamp(percentRemaining))
  const left = Math.max(0, entry.allowance - spent)
  const ratio = entry.allowance > 0 ? clamp((left / entry.allowance) * 100) : 0
  return { allowance: entry.allowance, spent, left, ratio }
}

export function isWorkday(time: number, workdays: readonly boolean[]): boolean {
  return workdays[weekdayOf(time)] === true
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}
