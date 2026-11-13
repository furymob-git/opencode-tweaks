import { Rpc } from "@opencode/plugin/rpc"

export type QuotaWindowKey = "5h" | "7d" | "30d"

export interface QuotaWindowSnapshot {
  readonly key: QuotaWindowKey
  readonly percentRemaining: number
  readonly resetsAt: string
}

export interface QuotaSnapshot {
  readonly provider: string
  readonly capturedAt: number
  readonly windows: readonly QuotaWindowSnapshot[]
  readonly error?: string
}

const windowSchema = {
  type: "object",
  properties: {
    key: { type: "string", enum: ["5h", "7d", "30d"] },
    percentRemaining: { type: "number" },
    resetsAt: { type: "string" },
  },
  required: ["key", "percentRemaining", "resetsAt"],
  additionalProperties: false,
} as const

export const Quota = Rpc.define({
  id: "opencode-tweaks.quota",
  methods: {
    snapshot: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      } as const,
      output: {
        type: "object",
        properties: {
          provider: { type: "string" },
          capturedAt: { type: "number" },
          windows: {
            type: "array",
            items: windowSchema,
          },
          error: { type: "string" },
        },
        required: ["provider", "capturedAt", "windows"],
        additionalProperties: false,
      } as const,
    },
  },
  events: {},
} as const)
