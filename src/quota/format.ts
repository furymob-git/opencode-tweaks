export type QuotaLevel = "good" | "warning" | "low"

const MINUTE = 60_000

/** One decimal only when the percent has one: "98%", "99.2%". */
export function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(100, value))
  const rounded = Math.round(clamped * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`
}

/**
 * The compact reset style from the sidebar: "1h 8m", "3.0d", "29.6d".
 * Times under twelve hours keep hours and minutes; longer times use whole hours
 * or one decimal day.
 */
export function formatReset(iso: string, now: number): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time) || time <= now) return "now"

  const minutes = Math.ceil((time - now) / MINUTE)
  if (minutes >= 720) {
    const hours = Math.round(minutes / 60)
    return hours < 24 ? `${hours}h` : `${(Math.round(minutes / 144) / 10).toFixed(1)}d`
  }

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** Filled and empty cells for a line bar. The caller colors each part. */
export function barParts(percent: number, width: number): { filled: string; empty: string } {
  const cells = Math.max(0, Math.floor(width))
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * cells)
  return {
    filled: "━".repeat(filled),
    empty: "─".repeat(Math.max(0, cells - filled)),
  }
}

/** Plenty left, getting low, or almost out. */
export function levelOf(percentRemaining: number): QuotaLevel {
  const left = Math.max(0, Math.min(100, percentRemaining))
  if (left < 20) return "low"
  return left < 50 ? "warning" : "good"
}
