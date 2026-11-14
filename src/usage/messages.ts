/** The token counters OpenCode stores on an assistant message. */
export interface MessageTokens {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

/** Only what usage sums need, so any session message list fits. */
export interface UsageMessage {
  readonly id?: string
  readonly type: string
  readonly tokens?: MessageTokens
  readonly cost?: number
  readonly model?: { readonly providerID: string; readonly id: string }
  /** When the step was created, which is when the provider started billing it. */
  readonly time?: { readonly created?: number }
  /** How the step ended; the host only draws a footer for a finished one. */
  readonly finish?: string | null
  readonly error?: unknown
  readonly retry?: unknown
}

/** The index just after the last user prompt before `end`. */
function turnStart(messages: readonly UsageMessage[], end: number): number {
  for (let index = end - 1; index >= 0; index--) {
    if (messages[index]?.type === "user") return index + 1
  }
  return 0
}

/** Where the turn that starts at `start` ends: at the next prompt, or the end. */
function turnEnd(messages: readonly UsageMessage[], start: number): number {
  for (let index = start; index < messages.length; index++) {
    if (messages[index]?.type === "user") return index
  }
  return messages.length
}

/**
 * The newest message the host draws a footer under. A footer belongs to the
 * last step of a turn: one that stopped for any reason other than another tool
 * call, or one that failed or is being retried.
 */
export function footerMessage(messages: readonly UsageMessage[]): UsageMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.type !== "assistant") continue
    if (message.error || message.retry) return message
    if (message.finish && message.finish !== "tool-calls" && message.finish !== "unknown") {
      return message
    }
  }
  return undefined
}

/**
 * The messages of the turn whose footer is on screen. A prompt with no finished
 * reply yet leaves the previous turn's line there, so that line keeps showing
 * the previous turn's numbers instead of the running one's.
 */
export function replyTurnMessages(messages: readonly UsageMessage[]): readonly UsageMessage[] {
  const footer = footerMessage(messages)
  if (!footer) return []

  const last = messages.lastIndexOf(footer)
  const start = turnStart(messages, last + 1)
  return messages.slice(start, turnEnd(messages, start))
}
