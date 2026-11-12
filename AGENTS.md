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

## Layout

- `src/index.ts` is the server part.
- `src/tui.tsx` is the terminal part.
- The package is loaded from source, so there is no build step.
