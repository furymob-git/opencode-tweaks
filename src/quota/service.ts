import type { Plugin } from "@opencode/plugin"
import type { QuotaSnapshot } from "../rpc"
import { consoleWindows, isRecord, keyWindows, text } from "./parse"

const PROVIDER = "OpenCode Go"
const CONSOLE_URL = "https://opencode.ai/console"
const ZEN_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const REQUEST_TIMEOUT_MS = 15_000

type ConsoleAuth = {
  readonly kind: "console"
  readonly access: string
  readonly server: string
  readonly orgID?: string
}

type KeyAuth = {
  readonly kind: "key"
  readonly key: string
}

type Auth = ConsoleAuth | KeyAuth

type Connection = NonNullable<
  Awaited<ReturnType<Plugin.Context["integration"]["connection"]["active"]>>
>
type Credential = NonNullable<
  Awaited<ReturnType<Plugin.Context["integration"]["connection"]["resolve"]>>
>

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 160)
}

async function activeConnection(
  context: Plugin.Context,
  integrationID: string,
): Promise<Connection | undefined> {
  try {
    return await context.integration.connection.active(integrationID)
  } catch {
    return undefined
  }
}

async function resolveConnection(
  context: Plugin.Context,
  connection: Connection,
): Promise<Credential | undefined> {
  try {
    return await context.integration.connection.resolve(connection)
  } catch {
    return undefined
  }
}

/**
 * The active OpenCode Console OAuth login authorizes the Go status endpoint.
 * Without one, an OpenCode Go or OpenCode API key uses the public usage
 * endpoint. The environment variable stays as a last fallback.
 */
async function readAuth(context: Plugin.Context): Promise<Auth | null> {
  const consoleConnection = await activeConnection(context, "opencode")
  const consoleValue = consoleConnection
    ? await resolveConnection(context, consoleConnection)
    : undefined

  if (consoleValue?.type === "oauth") {
    const access = text(consoleValue.access)
    const metadata = isRecord(consoleValue.metadata) ? consoleValue.metadata : undefined
    if (access) {
      return {
        kind: "console",
        access,
        server: text(metadata?.server) ?? CONSOLE_URL,
        orgID: text(metadata?.orgID),
      }
    }
  }

  for (const integrationID of ["opencode-go", "opencode"]) {
    const connection = await activeConnection(context, integrationID)
    const value = connection ? await resolveConnection(context, connection) : undefined
    if (value?.type !== "key") continue

    const key = value.key.trim()
    if (key) return { kind: "key", key }
  }

  const envKey = text(process.env.OPENCODE_API_KEY)?.trim()
  return envKey ? { kind: "key", key: envKey } : null
}

async function withTimeout<T>(
  signal: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort()

  if (signal.aborted) controller.abort()
  else signal.addEventListener("abort", abort, { once: true })

  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", abort)
  }
}

async function readConsole(auth: ConsoleAuth, signal: AbortSignal) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.access}`,
    Accept: "application/json",
  }
  if (auth.orgID) headers["x-org-id"] = auth.orgID

  const response = await fetch(`${auth.server.replace(/\/+$/u, "")}/api/go/status`, {
    headers,
    signal,
  })
  if (response.status === 404) throw new Error("OpenCode Go is not active for this account")
  if (!response.ok) throw new Error(`OpenCode Console API error ${response.status}`)

  const payload: unknown = await response.json()
  const access = isRecord(payload) && isRecord(payload.access) ? payload.access : undefined
  const meters = access && isRecord(access.meters) ? access.meters : undefined
  if (!access || !meters) throw new Error("OpenCode Go is not active for this account")

  return consoleWindows(meters, text(access.endsAt))
}

async function readKey(auth: KeyAuth, signal: AbortSignal) {
  const response = await fetch(ZEN_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${auth.key}`,
      Accept: "application/json",
    },
    signal,
  })
  if (response.status === 403) throw new Error("OpenCode Go is not active for this key")
  if (!response.ok) throw new Error(`OpenCode Go API error ${response.status}`)

  const payload: unknown = await response.json()
  const usage = isRecord(payload) && isRecord(payload.usage) ? payload.usage : undefined
  if (!usage) throw new Error("OpenCode Go usage is unavailable")

  return keyWindows(usage)
}

/** Reads the active OpenCode Go quota and always returns a snapshot, including failures. */
export async function readQuota(
  context: Plugin.Context,
  signal: AbortSignal,
): Promise<QuotaSnapshot> {
  try {
    const auth = await readAuth(context)
    if (!auth) throw new Error("OpenCode Go is not signed in")

    const windows = await withTimeout(signal, (requestSignal) =>
      auth.kind === "console" ? readConsole(auth, requestSignal) : readKey(auth, requestSignal),
    )
    if (windows.length === 0) throw new Error("OpenCode Go returned no quota windows")

    return { provider: PROVIDER, capturedAt: Date.now(), windows }
  } catch (error) {
    return { provider: PROVIDER, capturedAt: Date.now(), windows: [], error: errorText(error) }
  }
}
