# Contributing

## Scope

opencode-tweaks collects small, opt-in additions to OpenCode. A change belongs here when:

- it can be built on the public `@opencode/plugin` API
- it leaves OpenCode's defaults alone until the user enables it
- it feels native in the terminal and does not fight the existing interface
- OpenCode's own configuration cannot already do the same thing

Changes that patch installed packages, fork OpenCode, or inject text into prompts are out of scope.

## Branches

| Branch           | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `main`           | Stable history. Only receives merges from `development`. |
| `development`    | Integration branch. Every feature lands here first.      |
| `feature/<slug>` | One feature, cut from `development`.                     |
| `fix/<slug>`     | One bug fix, cut from `development`.                     |
| `chore/<slug>`   | Tooling, documentation, dependencies.                    |

Never commit directly to `main`. Never open a pull request against `main` unless it is the periodic promotion of
`development`.

Keep branch names lower-case and hyphenated: `feature/quota-sidebar`, `fix/sidebar-width`.

### Working on a feature

```sh
git switch development
git pull
git switch -c feature/quota-sidebar

# work, commit

git switch development
git merge --no-ff feature/quota-sidebar
git push origin development
git branch -d feature/quota-sidebar
git push origin --delete feature/quota-sidebar
```

Delete the branch after the merge, locally and on the remote. The merge commit keeps the feature visible in history.

### Promoting to `main`

`development` moves to `main` when its content is coherent, CI is green, and the new tweaks are documented. Promote
deliberately, not after every feature.

```sh
git switch main
git pull
git merge --no-ff development
git push origin main
git switch development
```

## Commits

Use Conventional Commits:

```text
feat(quota): add the sidebar quota panel
fix(quota): keep the last snapshot when the API fails
docs: describe the branch model
chore: bump @opencode/plugin
```

Rules:

- one logical change per commit
- imperative mood, lower-case after the type
- no period at the end of the subject
- keep the body for context that the diff cannot explain
- do not add `Co-authored-by` trailers

## Pull requests

Pull requests target `development`. The template in `.github/pull_request_template.md` lists the checks. A PR is ready
when:

- CI passes
- `npm run check` passes locally
- user-facing changes are documented in the README
- new behavior has been tested in a real OpenCode session, not only in the type checker

Use a merge commit. Do not squash, so the feature branch stays readable.

## Code

- TypeScript strict mode, no `any` unless a third-party type forces it
- run `npm run check` before pushing
- formatting is handled by Biome, do not reformat by hand
- comments explain why something is done, not what the line does
- keep rendering code separate from data fetching and settings
- prefer OpenCode theme tokens over fixed colors
- anything that runs on a timer must clean up in the plugin's cleanup function

## Tweaks

Each tweak needs:

- a stable id, prefixed with the plugin id when it is registered globally
- a short entry in the README: what it changes, its default, how to enable it
- a configuration option only when the default is not obvious
- no effect when disabled, including timers and network calls

## Releases

Releases are cut from `main`:

1. bump `version` in `package.json`
2. update the README tweak list
3. commit `chore: release x.y.z`
4. tag `vX.Y.Z` and push the tag

Versions follow semver. A tweak that changes an existing default is a breaking change.
