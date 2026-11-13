import { Rpc } from "@opencode/plugin/rpc"

export type QuotaWindowKey = "5h" | "7d" | "30d"

export interface QuotaWindowSnapshot {
  readonly key: QuotaWindowKey
  readonly percentRemaining: number
  readonly resetsAt: string
}

/**
 * One provider's quota. `providerID` is the model catalog ID (`opencode-go`),
 * so the panel can follow the selected model without knowing any provider name.
 */
export interface QuotaSnapshot {
  readonly providerID: string
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

const snapshotSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    provider: { type: "string" },
    capturedAt: { type: "number" },
    windows: {
      type: "array",
      items: windowSchema,
    },
    error: { type: "string" },
  },
  required: ["providerID", "provider", "capturedAt", "windows"],
  additionalProperties: false,
} as const

export const Quota = Rpc.define({
  id: "opencode-tweaks.quota",
  methods: {
    snapshot: {
      /** A provider ID reads that provider; omitting it reads every source. */
      input: {
        type: "object",
        properties: {
          providerID: { type: "string" },
        },
        additionalProperties: false,
      } as const,
      output: {
        type: "object",
        properties: {
          snapshots: {
            type: "array",
            items: snapshotSchema,
          },
        },
        required: ["snapshots"],
        additionalProperties: false,
      } as const,
    },
  },
  events: {},
} as const)
