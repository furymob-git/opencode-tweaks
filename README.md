# opencode-tweaks

[![CI](https://github.com/furymob-git/opencode-tweaks/actions/workflows/ci.yml/badge.svg)](https://github.com/furymob-git/opencode-tweaks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Settings and small interface improvements for [OpenCode](https://opencode.ai), collected in one place.

OpenCode is already comfortable out of the box. This plugin is for the details you may still want to tune: a command
that is missing, a keybinding that does not fit your workflow, a behavior you would rather switch off. Every tweak is
optional, and the defaults stay exactly where they are.

## Status

Early development. The plugin installs and loads, but no tweaks have shipped yet. Both the tweak list and the
configuration format may change before the first stable release.

## Principles

- **Opt-in.** A tweak does nothing until you enable it. Defaults remain untouched.
- **Native first.** If OpenCode already handles something well, this plugin does not replace it.
- **Public API only.** No forks, patches, or private imports. Everything goes through `@opencode/plugin`.
- **Small surface.** Each tweak is isolated and documented, so you can see exactly what it changes.

## Requirements

- OpenCode 2.x
- Node.js 24 or newer for local development

## Install

`opencode-tweaks` is not published on npm yet. Until it is, point OpenCode at a local checkout:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["../opencode-tweaks"]
}
```

Relative paths resolve from the config file that contains the entry and must point at a directory. Once the package is
published, installation will be:

```sh
opencode plugin add opencode-tweaks
```

## Tweaks

No tweaks are available yet. Each one will be listed here with its identifier, the behavior it changes, and whether it
is enabled by default.

## Development

```sh
npm install
npm run check
```

`npm run check` runs the type checker and the linter. `npm run format` applies the formatter.

OpenCode loads the package from `src`, so there is no build step. To test changes, configure the checkout as a local
plugin (see Install) and let the config watcher reload it. If a change is not picked up, run `opencode service restart`.

```text
src/
  index.ts   server entry: config transforms, tools, session hooks
  tui.tsx    terminal entry: commands, keymaps, slots, dialogs
```

## Contributing

Tweaks should stay small, opt-in, and built on the public plugin API. If something can be done with normal OpenCode
configuration, it does not belong here. Open an issue before starting on anything substantial.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model, commit format, code rules, and release process.

## License

[MIT](LICENSE)
