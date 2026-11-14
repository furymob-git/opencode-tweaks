import type { UsageMessage } from "./messages"

/** The provider and model a message belongs to. */
export interface PriceModel {
  readonly providerID: string
  readonly id: string
}

/** A period that bills above the catalog price. */
export interface PriceWindow {
  /** Short label shown beside the cost, such as `peak`. */
  readonly label: string
  /** What the period does to the catalog price, such as 2 for double. */
  readonly multiplier: number
}

interface PeakRange {
  /** Minutes after midnight UTC, inclusive. */
  readonly from: number
  /** Minutes after midnight UTC, exclusive. */
  readonly to: number
}

interface PriceSchedule {
  /** Providers whose catalog price follows this schedule. */
  readonly providers: readonly string[]
  /** Model id prefix the schedule covers, when the provider serves other models. */
  readonly modelPrefix: string
  /** Weekdays billed at the higher price, where 1 is Monday and 7 is Sunday. */
  readonly peakDays: readonly number[]
  /** Peak windows in UTC; none of them crosses midnight. */
  readonly peak: readonly PeakRange[]
  /** Days billed at the catalog price even when they fall on a peak weekday. */
  readonly holidays?: ReadonlySet<string>
  readonly label: string
  readonly multiplier: number
}

/** Every UTC date from `from` to `to`, both included. */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)

  for (let at = Date.parse(`${from}T00:00:00Z`); at <= end; at += 86_400_000) {
    dates.push(new Date(at).toISOString().slice(0, 10))
  }

  return dates
}

/**
 * Mainland China public holidays from the State Council notices of 2025-11-04
 * (2026) and 2026-11-05 (2027). DeepSeek bills these days at the off-peak rate
 * even when they fall on a weekday. Add the next notice's dates here.
 */
const CHINA_HOLIDAYS: ReadonlySet<string> = new Set([
  ...dateRange("2026-01-01", "2026-01-03"),
  ...dateRange("2026-02-15", "2026-02-23"),
  ...dateRange("2026-04-04", "2026-04-06"),
  ...dateRange("2026-05-01", "2026-05-05"),
  ...dateRange("2026-06-19", "2026-06-21"),
  ...dateRange("2026-09-25", "2026-09-27"),
  ...dateRange("2026-10-01", "2026-10-07"),
  ...dateRange("2027-01-01", "2027-01-03"),
  ...dateRange("2027-02-05", "2027-02-13"),
  ...dateRange("2027-04-03", "2027-04-05"),
  ...dateRange("2027-05-01", "2027-05-05"),
  ...dateRange("2027-06-09", "2027-06-09"),
  ...dateRange("2027-09-15", "2027-09-15"),
  ...dateRange("2027-10-01", "2027-10-07"),
])

/**
 * DeepSeek doubles its catalog price from 01:00 to 04:00 and from 06:00 to
 * 10:00 UTC, Monday to Friday, excluding Chinese public holidays. Its catalog
 * prices are the off-peak rates, so the higher price is twice the listed one.
 * OpenCode Go publishes the same DeepSeek rates.
 *
 * Source: https://api-docs.deepseek.com/quick_start/pricing/ (2026-11)
 */
const DEEPSEEK: PriceSchedule = {
  providers: ["deepseek", "opencode-go"],
  modelPrefix: "deepseek-",
  peakDays: [1, 2, 3, 4, 5],
  peak: [
    { from: 1 * 60, to: 4 * 60 },
    { from: 6 * 60, to: 10 * 60 },
  ],
  holidays: CHINA_HOLIDAYS,
  label: "peak",
  multiplier: 2,
}

const schedules: readonly PriceSchedule[] = [DEEPSEEK]

/** Monday-first weekday, since the schedules are written that way. */
function weekday(date: Date): number {
  const day = date.getUTCDay()
  return day === 0 ? 7 : day
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utcMinutes(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

/**
 * The higher price that applies to a model at `at`, or `undefined` when the
 * catalog price is the one being charged. The check is deliberately narrow:
 * only published schedules show a badge, and an unknown provider stays silent.
 */
export function priceWindowFor(model: PriceModel | undefined, at: Date): PriceWindow | undefined {
  if (!model) return undefined

  const schedule = schedules.find(
    (candidate) =>
      candidate.providers.includes(model.providerID) && model.id.startsWith(candidate.modelPrefix),
  )
  if (!schedule) return undefined

  if (!schedule.peakDays.includes(weekday(at))) return undefined
  if (schedule.holidays?.has(utcDate(at))) return undefined

  const minutes = utcMinutes(at)
  if (!schedule.peak.some((range) => minutes >= range.from && minutes < range.to)) {
    return undefined
  }

  return { label: schedule.label, multiplier: schedule.multiplier }
}

/** The short text shown beside a cost, such as `peak ×2`. */
export function formatPriceWindow(window: PriceWindow): string {
  return `${window.label} ×${window.multiplier}`
}

/**
 * The window that applied to a round, from the step that started it. Each
 * request is billed when it starts, so a round that ran during peak keeps its
 * marker after the window closes. Only assistant steps carry a start time.
 */
export function turnPriceWindow(
  messages: readonly UsageMessage[],
  fallback?: PriceModel,
): PriceWindow | undefined {
  const step = messages.find(
    (message) => message.type === "assistant" && message.time?.created !== undefined,
  )
  const created = step?.time?.created
  const model = step?.model ?? fallback
  if (!model || created === undefined) return undefined

  return priceWindowFor(model, new Date(created))
}
