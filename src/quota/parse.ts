import type { QuotaWindowKey, QuotaWindowSnapshot } from "../rpc"

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function numeric(value: unknown): number | null {
  const parsed =
    typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function resetIso(value: unknown): string | undefined {
  const raw = text(value)
  if (!raw) return undefined

  const time = Date.parse(raw)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

function consoleWindow(
  key: QuotaWindowKey,
  value: unknown,
  fallbackReset: string | undefined,
): QuotaWindowSnapshot | undefined {
  if (!isRecord(value)) return undefined

  const limit = numeric(value.limitMicroCents)
  const used = numeric(value.usedMicroCents)
  if (limit === null || used === null || limit < 0 || used < 0) return undefined

  const usedShare =
    limit === 0 ? (used > 0 ? 100 : 0) : Math.min(100, Math.max(0, (used / limit) * 100))
  const percentUsed = Math.round(usedShare)
  const resetsAt = resetIso(value.resetsAt) ?? resetIso(fallbackReset)
  if (!resetsAt) return undefined

  return {
    key,
    percentRemaining: 100 - percentUsed,
    percentRemainingExact: 100 - usedShare,
    resetsAt,
  }
}

function keyWindow(key: QuotaWindowKey, value: unknown): QuotaWindowSnapshot | undefined {
  if (!isRecord(value)) return undefined

  const percent = numeric(value.percent)
  if (percent === null || percent < 0 || percent > 100) return undefined

  const resetsAt = resetIso(value.resetsAt)
  if (!resetsAt) return undefined

  const remaining = value.status === "rate-limited" ? 0 : 100 - percent
  return {
    key,
    percentRemaining: remaining,
    percentRemainingExact: remaining,
    resetsAt,
  }
}

/** The Console `access.meters` response, in the order the sidebar shows. */
export function consoleWindows(
  meters: Record<string, unknown>,
  endsAt: string | undefined,
): QuotaWindowSnapshot[] {
  const windows: QuotaWindowSnapshot[] = []

  for (const [key, meter] of [
    ["5h", "fiveHour"],
    ["7d", "week"],
    ["30d", "month"],
  ] as const) {
    const window = consoleWindow(key, meters[meter], endsAt)
    if (window) windows.push(window)
  }

  return windows
}

/** The Zen `/v1/usage` response, in the order the sidebar shows. */
export function keyWindows(usage: Record<string, unknown>): QuotaWindowSnapshot[] {
  const windows: QuotaWindowSnapshot[] = []

  for (const [key, meter] of [
    ["5h", "rolling"],
    ["7d", "weekly"],
    ["30d", "monthly"],
  ] as const) {
    const window = keyWindow(key, usage[meter])
    if (window) windows.push(window)
  }

  return windows
}
