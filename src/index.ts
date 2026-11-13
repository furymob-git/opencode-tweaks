import { Plugin } from "@opencode/plugin"
import { readQuota } from "./quota/service"
import { Quota } from "./rpc"

export default Plugin.define({
  id: "opencode-tweaks",
  async setup(context) {
    const registration = await context.rpc.register(Quota, {
      snapshot: async (_input, call) => readQuota(context, call.signal),
    })

    return async () => {
      await registration.dispose()
    }
  },
})
