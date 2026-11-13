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

| Tweak    | What it does                                                      | Default |
| -------- | ----------------------------------------------------------------- | ------- |
| `quota`  | Provider quota and reset times in the session sidebar.            | Off     |
| `tokens` | Token and cost usage per turn, plus session totals at the bottom. | Off     |

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

`Current provider only` is on by default. Each quota source is registered on the server under the provider ID the model
catalog uses, so the panel names no provider itself and follows the model in use: it appears for a provider whose quota
the plugin can read, and stays hidden for one that publishes none. Turn the setting off to show every quota the plugin
knows at once. OpenCode Go is the only source today; adding another is a reader and one entry in the registry.

### Tokens

Tokens shows two token counts and, optionally, their cost. Each has its own toggle.

`Turn tokens` adds what the latest finished turn spent to its `tok/s` line: `12.3K tok · 62.2 tok/s`. OpenCode draws
that line itself and publishes no slot inside it, so the tweak splices the value into the line's text node and repairs
the splice while a turn runs. That placement is best effort and may lag or break when OpenCode changes the line. When the
splice is not available the count stays out of the line rather than moving elsewhere.

The line belongs to the turn that finished above it, so each line keeps its own figures: while the next turn runs, the
previous line still shows the previous turn's numbers rather than the running one's. When a turn finishes, its line
receives its figures and the older lines keep theirs.

`First token time` controls the host's own `1.7s ttft` figure at the end of that line: turning it off removes the span
and leaves `tok/s` in place, and turning it back on restores it.

`Turn cost` adds that turn's cost after the throughput figure: `62.2 tok/s · $0.0042`.

`Session tokens` adds the session's total usage to the bottom status line, next to the context percentage:
`790.6K tok total`. It reads the counters the session itself keeps, so the number stays exact even when the transcript
has only loaded its latest messages. `Session cost` follows it on the same line: `790.6K tok total · $0.31`.

`Token count` picks what the two numbers add up. `New tokens` is the default: prompt, completion, reasoning, and cache
writes, without cache reads, because a turn re-reads the whole context at every step and those reads would dwarf
everything else. `Generated only` keeps just what the model wrote, and `Everything` matches the counters `/stats`
reports, cache reads included. `Include subagents` is on by default, so the session totals cover the whole session tree
instead of only the session on screen; the per-turn count always stays on the session on screen, because a prompt
belongs to it. `Token format` switches between compact counts such as `12.4K` and every digit such as `12,431`.

Costs come from what the provider reports, so a free plan shows `$0.00`. `Cost decimals` controls the decimals:
`Auto` keeps two decimals and grows until the first significant digit shows (`$0.004`), while a fixed choice always
keeps that many (`$0.0042`).

`Estimate cost` fills in a price the provider did not report, using the model's list price from the same catalog
OpenCode already synced: prompt, completion, reasoning billed as output, and cache traffic, each at its own rate. A
provider that reports a price always wins, and a session that changed model is estimated with the model it ended on, so
treat the figure as an estimate. This is what makes the OpenCode Go monthly credit readable: the plan reports `$0.00`
per turn, and the estimate follows the API rates instead. Costs use the raw counters whatever `Token count` says.

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
    tokens.ts       tokens tweak definition
    token-slots.tsx inline splice driver and status line
    token-inject.ts splice into the host's tok/s line
    tokens-model.ts token sum and formatting
```

## Contributing

Tweaks should stay small, opt-in, and built on the public plugin API. If something can be done with normal OpenCode
configuration, it does not belong here. Open an issue before starting on anything substantial.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model, commit format, code rules, and release process.

## License

[MIT](LICENSE)
