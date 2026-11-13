# Project instructions

Read `CONTRIBUTING.md` before changing anything in this repository. It defines the branch model, commit format, code
rules, and release process.

## Non-negotiables

- Work on `development` or on a `feature/*`, `fix/*`, or `chore/*` branch cut from it. Never commit to `main`.
- One feature per branch. Merge with `--no-ff`, then delete the branch locally and on the remote.
- Use Conventional Commits. No `Co-authored-by` trailers.
- Run `npm run check` before every commit that changes source or configuration.
- Build only on the public `@opencode/plugin` API. No patches to installed packages and no private imports.
- Keep every tweak opt-in and native-feeling. If OpenCode configuration already does it, it does not belong here.
- Document each user-facing tweak in the README.
- Settings are declarative. Add a tweak definition to the registry; do not build a per-tweak settings screen.
- Server-only work such as credentials and network calls goes through the typed RPC in `src/rpc.ts`; the TUI part never
  reads credential stores.

## Layout

- `src/index.ts` is the server part and registers the quota RPC.
- `src/rpc.ts` is the typed contract shared by the server and TUI parts.
- `src/quota/` holds the credential lookup, provider parsing, and display formatting.
- `src/tui.tsx` is the terminal part: the `/tweaks` command and the sidebar slot.
- `src/tweaks/` holds the settings schema, registry, store, and the generic `/tweaks` menu.
- The package is loaded from source, so there is no build step.
