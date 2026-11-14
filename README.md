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

- **Sensible defaults.** Tweaks are on out of the box, tuned to the setup that works best day to day. Every one has a
  switch in `/tweaks` when you want OpenCode untouched.
- **Native first.** If OpenCode already handles something well, this plugin does not replace it.
- **Public API only.** No forks, patches, or private imports. Everything goes through `@opencode/plugin`.
- **Small surface.** Each tweak is isolated and documented, so you can see exactly what it changes.

## Requirements

- OpenCode 2.x
- Node.js 24 or newer for local development

## Install

```sh
opencode plugin add opencode-tweaks
```

Or let OpenCode install and verify it for you. Paste this prompt into a session:

```text
Install the opencode-tweaks plugin on this machine.

- Run `opencode --version` first and stop with a clear message if it is not 2.x.
- Run `opencode plugin add opencode-tweaks`.
- Run `opencode plugin list` and confirm opencode-tweaks is registered.
- Tell me the plugin version, the config file that changed, and anything I need to restart.
- Do not edit my existing settings or plugin options.
```

To add it by hand, put it in the `plugins` list in `opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-tweaks"]
}
```

To follow the source instead, point the same list at a local checkout, such as `"../opencode-tweaks"`. Relative paths
resolve from the config file that contains the entry and must point at a directory.

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
| `quota`  | Provider quota, reset times, and a daily spending budget.         | On      |
| `tokens` | Token and cost usage per turn, plus session totals at the bottom. | On      |

### Quota

Quota shows the OpenCode Go limits for the 5h, 7d, and 30d windows. It uses the active OpenCode Console sign-in when
there is one, then an `opencode-go` API key. Sign in with `opencode auth login opencode` or
`opencode auth login opencode-go` before enabling the tweak.

The panel refreshes every two minutes, and a failed read retries after twenty seconds and keeps the last rows. Click the
`Quota` header to collapse or expand the rows. Bar width defaults to `auto`, which uses the space the sidebar leaves
after the percent and reset columns. A fixed width is available from `/tweaks`.

`Percent decimals` chooses 0, 1, or 2 decimals for every percentage, the `day` row included. The Console endpoints
publish a finer share than a whole percent, so the figures move between points instead of jumping a whole one; a source
that only reports whole percents shows the same value either way.

The provider name sits on the `Quota` line by default and can be aligned left, center, or right. Turning
`One tab per provider` off gives it a line of its own, above the rows that collapse underneath.

`Current provider only` is on by default. Each quota source is registered on the server under the provider ID the model
catalog uses, so the panel names no provider itself and follows the model in use: it appears for a provider whose quota
the plugin can read, and stays hidden for one that publishes none. Turn the setting off to show every quota the plugin
knows at once. OpenCode Go is the only source today; adding another is a reader and one entry in the registry.

`Daily budget` adds a `day` row under the longest window: the share of that quota set aside for today, spread over the
workdays left before it resets. The bar starts full each morning and empties as the provider reports less quota, so you
see how much of today's share is left. It takes the theme accent color and turns orange near the end, then red once the
share is spent. The figures are frozen at the first reading of the day, so the bar only moves when quota is used, not
on every refresh.

`Reserve` keeps a percentage of the window out of the daily budget, so the month does not end at zero. The `Workdays`
settings choose which weekdays count; every day counts by default, and a day left off gets no budget and shows `rest` on
the row. The budget resets at local midnight, and a changed provider reset or workday pattern starts a fresh one.

### Tokens

Tokens shows two token counts and, optionally, their cost. Each has its own toggle.

`Turn tokens` adds what the latest finished turn spent to its `tok/s` line: `12.3K tok · 62.2 tok/s`. OpenCode draws
that line itself and publishes no slot inside it, so the tweak splices the value into the line's text node and repairs
the splice while a turn runs. That placement is best effort and may lag or break when OpenCode changes the line. When the
splice is not available the count stays out of the line rather than moving elsewhere.

The line belongs to the turn that finished above it, so each line keeps its own figures: while the next turn runs, the
previous line still shows the previous turn's numbers rather than the running one's. When a turn finishes, its line
receives its figures and the older lines keep theirs.

`First token time` controls the host's own `1.7s ttft` figure at the end of that line: it is off by default, so the
span is removed and `tok/s` stays alone. Turning it on restores the host's figure.

`Turn cost` adds that turn's cost after the throughput figure: `62.2 tok/s · $0.0042`.

`Session tokens` adds the session's total usage to the bottom status line, before the host's context figure:
`1 shell · 790.6K tok total · $0.91 · 115K (29%)`. It reads the counters the session itself keeps, so
the number stays exact even when the transcript has only loaded its latest messages. The figures follow the shell
indicator when one is running and otherwise open the context text, so the order stays shell, total, session cost,
context. OpenCode draws those texts itself and publishes no slot inside them, so the figures are spliced in and
repaired while the line changes; when the splice is not available the figures stay out of the line rather than
moving elsewhere.

`Token count` picks what the two numbers add up. `Generated only` is the default: it keeps just what the model wrote.
`New tokens` adds prompt, completion, reasoning, and cache writes, without cache reads, because a turn re-reads the
whole context at every step and those reads would dwarf everything else. `Everything` matches the counters `/stats`
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
