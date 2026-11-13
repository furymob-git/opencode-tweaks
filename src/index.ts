import { Plugin } from "@opencode/plugin"
import { readQuotas } from "./quota/service"
import { Quota } from "./rpc"

export default Plugin.define({
  id: "opencode-tweaks",
  async setup(context) {
    const registration = await context.rpc.register(Quota, {
      snapshot: async (input, call) => {
        // JSON Schema methods do not infer their input, so the shape is cast here.
        const { providerID } = input as { providerID?: string }
        return { snapshots: await readQuotas(context, providerID, call.signal) }
      },
    })

    return async () => {
      await registration.dispose()
    }
  },
})
