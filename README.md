# opencode-tweaks

[![CI](https://github.com/furymob-git/opencode-tweaks/actions/workflows/ci.yml/badge.svg)](https://github.com/furymob-git/opencode-tweaks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Settings and small interface improvements for [OpenCode](https://opencode.ai), collected in one place.

OpenCode is already comfortable out of the box. This plugin is for the details you may still want to tune: a command
that is missing, a keybinding that does not fit your workflow, a behavior you would rather switch off. Every tweak is
optional, and the defaults stay exactly where they are.

## Status

Early development. The `/tweaks` menu and the OpenCode Go quota sidebar are in place. Both the tweak list and the
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

## Settings

Run `/tweaks` to open the settings menu. It mirrors OpenCode's own settings dialog: the same theme, grouped rows, search
field, and footer hints. The tweak list opens first; selecting one shows its settings. Boolean settings toggle in place;
other settings cycle through their values with `enter` or `←`/`→`. Press `ctrl+r` to reset the selected setting.

The command also appears in the palette under `Tweaks`. Its id is `opencode-tweaks.tweaks` if you want to bind a key in
`cli.json`.

Values are resolved in this order:

1. a value changed from `/tweaks` and stored locally by the plugin
2. an option in `opencode.json`
3. the default in the tweak definition

Options are useful when you want the same configuration on several machines:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-tweaks",
      "options": {
        "quota": {
          "enabled": true,
          "barWidth": 30
        }
      }
    }
  ]
}
```

Resetting a setting drops the local value, so the option or default applies again.

## Tweaks

| Tweak   | What it does                                           | Default |
| ------- | ------------------------------------------------------ | ------- |
| `quota` | Provider quota and reset times in the session sidebar. | Off     |

### Quota

Quota shows the OpenCode Go limits for the 5h, 7d, and 30d windows. It uses the active OpenCode Console sign-in when
there is one, then an `opencode-go` API key. Sign in with `opencode auth login opencode` or
`opencode auth login opencode-go` before enabling the tweak.

The panel refreshes every two minutes, and a failed read retries after twenty seconds and keeps the last rows. Click the
`Quota` header to collapse or expand the rows. Bar width defaults to `auto`, which uses the space the sidebar leaves
after the percent and reset columns. A fixed width is available from `/tweaks`.

The provider name sits on its own line by default and can be aligned left, center, or right. Enabling
`One tab per provider` moves it onto the `Quota` line, using the same alignment in the space after the title, with the
rows collapsing underneath.

## Development

```sh
npm install
npm run check
```

`npm run check` runs the type checker, the linter, and the tests. `npm run format` applies the formatter.

OpenCode loads the package from `src`, so there is no build step. To test changes, configure the checkout as a local
plugin (see Install) and let the config watcher reload it. If a change is not picked up, run `opencode service restart`.

```text
src/
  index.ts          server entry: quota RPC registration
  rpc.ts            typed RPC contract
  quota/
    service.ts      credential lookup and quota fetch
    parse.ts        provider response parsing
    format.ts       percents, reset times, and bars
  tui.tsx           terminal entry: command and sidebar slot
  tweaks/
    types.ts        settings schema and validation
    registry.ts     list of tweaks
    settings.ts     stored, config, and default resolution
    menu.ts         /tweaks entry
    menu-dialog.tsx reactive settings dialog
    menu-model.ts   filtering and selection helpers
    quota.ts        quota tweak definition
    quota-panel.tsx sidebar quota panel
```

## Contributing

Tweaks should stay small, opt-in, and built on the public plugin API. If something can be done with normal OpenCode
configuration, it does not belong here. Open an issue before starting on anything substantial.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model, commit format, code rules, and release process.

## License

[MIT](LICENSE)
