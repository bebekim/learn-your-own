# Tuning LYO for your machine

Machines differ: a hook that starts an evaluator in 60 ms on one laptop takes 600 ms on
another that is also running a local model. LYO keeps every machine-dependent budget in
configuration, never in code, and measures the machine to suggest values.

## Where settings live

Both files live under `LYO_HOME` (default `~/.lyo`). The tables below are generated from
the configuration schemas (`npm run docs:gen`), so defaults and ranges are the code's own.

### `config.json`

<!-- generated:tuning-settings -->
| Setting | Default | Range | What it controls |
|---|---|---|---|
| `tuning.hooks.checkSeconds` | `2` | 0.2–30 | Wall-time budget for each evaluator check run inside a hook; running out reads as unknown. |
| `tuning.hooks.stdinGuardMs` | `2500` | 100–60000 | A hook process exits after this long if the host never closes stdin. |
| `tuning.git.timeoutMs` | `1000` | 100–60000 | Repository identity lookups (`git rev-parse`) made during hooks and commands. A timeout loses the repository identity. |
| `tuning.sqlite.busyTimeoutMs` | `5000` | 0–120000 | How long a writer waits for another writer's lock on the lesson store or corpus before failing. |
| `tuning.sqlite.ledgerBusyTimeoutMs` | `10000` | 0–120000 | The same for per-repository capture ledgers, which many concurrent hooks write. |
| `tuning.lab.openaiCompatibleMs` | `120000` | 1000–3600000 | One model call by the OpenAI-compatible lab executor (OpenRouter, local servers). |
| `tuning.lab.upstageMs` | `300000` | 1000–3600000 | One model call by the Upstage executor. |
| `tuning.lab.kimiCliMs` | `600000` | 1000–3600000 | One run of the Kimi CLI executor. |
| `tuning.lab.kimiRetryDelayMs` | `5000` | 0–600000 | Pause before the Kimi CLI executor retries. |
| `tuning.lab.verifierMs` | `300000` | 1000–3600000 | One `node --test` run by the lab verifier. |
| `tuning.lab.judgeMs` | `180000` | 1000–3600000 | One OpenRouter judge call. |
| `tuning.lab.elaboratorMs` | `8000` | 500–600000 | One elaborator-reflector call. |
| `tuning.decisions.replayMs` | `120000` | 1000–1800000 | One decision while replaying a case set or matching shadowed hypotheses (not the hook worker). |
| `tuning.decisions.jevRequestMs` | `10000` | 500–600000 | One request to a Jev decision server. |
| `tuning.sessions.staleAfterHours` | `12` | 0.1–720 | A host session quiet this long is bridged as ended. |
<!-- /generated:tuning-settings -->

### `decisions.json` (worker and hypothesis generator)

<!-- generated:decision-settings -->
| Setting | Default | Range | What it controls |
|---|---|---|---|
| `worker.idleSeconds` | `600` | 1–86400 | The decision worker exits (releasing a local model) after this long idle. |
| `worker.ttlSeconds` | `14400` | 10–86400 | The decision worker exits after this long in total. |
| `worker.maxAgeSeconds` | `900` | 10–86400 | A queued decision older than this is recorded as expired, not decided. |
| `worker.timeoutMs` | `60000` | 100–300000 | One background decision; a timeout records unknown. |
| `worker.maxQueued` | `200` | 1–10000 | Queue size; a job beyond it is dropped and recorded unknown. |
| `generator.model` | `anthropic/claude-sonnet-5.5` |  | OpenRouter model that proposes hypotheses. |
| `generator.zdr` | `true` |  | Route only to zero-data-retention endpoints. |
| `generator.maxOutputTokens` | `8000` | 500–32000 | Output token limit per generator request. |
| `generator.maxEpisodes` | `80` | 5–400 | Failure and repair episodes sent per proposal run. |
| `generator.maxShadowing` | `5` | 1–50 | Hypotheses shadowing at once. |
| `generator.requestTimeoutMs` | `300000` | 1000–1800000 | One generator request. |
| `generator.retries` | `1` | 0–1 | Corrective calls after rejected proposals or too few rivals. |
<!-- /generated:decision-settings -->

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
