import { quotaTweak } from "./quota"
import { tokensTweak } from "./tokens"
import type { Tweak } from "./types"

/** Every tweak shown by `/tweaks`. Add new definitions here. */
export const tweaks: readonly Tweak[] = [quotaTweak, tokensTweak]

export function findTweak(id: string): Tweak | undefined {
  return tweaks.find((tweak) => tweak.id === id)
}
