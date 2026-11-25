# Tuning LYO for your machine

Machines differ: a hook that starts an evaluator in 60 ms on one laptop takes 600 ms on
another that is also running a local model. LYO keeps every machine-dependent budget in
configuration, never in code, and measures the machine to suggest values.

## Where settings live

| File (under `LYO_HOME`, default `~/.lyo`) | Section | What it controls |
|---|---|---|
| `config.json` | `tuning.hooks.checkSeconds` | Wall-time budget per evaluator check inside a hook (default 2). Running out reads as unknown and declines enrollment. |
| `config.json` | `tuning.hooks.stdinGuardMs` | A hook exits after this long if the host never closes stdin (default 2500). |
| `config.json` | `tuning.git.timeoutMs` | Repository identity lookups (default 1000). A timeout loses the repository identity. |
| `config.json` | `tuning.sqlite.busyTimeoutMs` | Lock wait for the lesson store and corpus (default 5000). |
| `config.json` | `tuning.sqlite.ledgerBusyTimeoutMs` | Lock wait for per-repository capture ledgers (default 10000). |
| `decisions.json` | `worker.*` | Background decision worker: per-decision timeout, job age, idle shutdown, TTL, queue size. |
| `decisions.json` | `generator.requestTimeoutMs` | Hypothesis generator request timeout (default 300000). |

`LYO_CONFIG_FILE` and `LYO_DECISIONS_FILE` point at other files. An invalid `tuning`
section is reported on stderr and replaced by defaults, so a typo never blocks a hook.
`lyo tune --show` prints the effective values.

Host hook timeouts (for example `timeout` in `~/.claude/settings.json`) belong to the host.
`lyo tune` checks them against LYO's budgets and suggests a value, but never edits them.

## Measuring and applying

```sh
lyo tune            # measure, including one local decision if decisions.json is set
lyo tune --quick    # skip the decision provider
lyo tune --apply    # write the suggestions into LYO's own files (each backed up first)
```

Each suggestion names the file, key, current and suggested value, and the measurement
behind it, for example `node start-up p90 600 ms; budget = 8×p90 + 0.5 s`. Budgets scale
with the measured p90 so a loaded machine keeps headroom, and never go below the defaults.

Where npm allows install scripts, a global install runs the quick diagnostics once
(`lyo tune --from-install`; skipped in CI or with `LYO_SKIP_TUNE=1`). Recent npm versions
block install scripts by default, so this cannot be relied on: until `lyo tune` has run,
any `lyo` command in a terminal prints a one-line notice saying the machine has not been
measured, or that an install-time report has unreviewed suggestions. Hooks never print it.
The install never changes settings. The last report is kept at `<LYO_HOME>/tune-report.json`.
