export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function usage(exitCode = 0): never {
  console.log(`Usage:
	  lyo init [--db path]
	  lyo codex-hook [--db path] [--db-from-event-cwd] [--channel name] [--prompt-dir path] [--prompt-dir-from-event-cwd] [--spool-dir path] [--spool-dir-from-event-cwd] [--workspace-id id] [--no-normalize-on-stop] [--no-normalize-on-tool-use]
	  lyo claude-hook [--db path] [--db-from-event-cwd] [--prompt-dir path] [--prompt-dir-from-event-cwd] [--spool-dir path] [--spool-dir-from-event-cwd] [--workspace-id id] [--no-normalize-on-stop] [--no-normalize-on-tool-use]
	  lyo session-start [--db path] --session-id id [--repo-path path] [--platform name] [--model name]
	  lyo record-prompt [--db path] --session-id id --role role [--kind kind] [--prompt-file path] [--summary text] [--response text] [--model name]
	  lyo model-call record [--db path] --provider name --model name --model-lane lane [--call-id id] [--session-id id] [--run-id id] [--prompt-file path] [--prompt-ref path] [--summary text] [--input-tokens n] [--output-tokens n] [--total-tokens n] [--estimated-cost n] [--latency-ms n] [--status started|completed|failed]
	  lyo run-start [--db path] --run-id id --task-shape shape --channel channel [--status status] [--token-cost n]
	  lyo run-finish [--db path] --run-id id [--status status] [--token-cost n]
	  lyo context goal [--db path] --run-id id --goal text [--success-criteria text] [--stop-condition text] [--expected-process text] [--risk-class class]
	  lyo tape record [--db path] --run-id id --kind kind --summary text --evidence-ref ref [--passed true|false] [--payload-json json]
	  lyo tape view [--db path] --run-id id
	  lyo harness learn-verifier-gate [--db path] --chosen-run-id id --rejected-run-id id [--protocol-id id] [--scope-kind worktree|repository|channel] [--scope-value value] [--recorded-by name]
	  lyo exercise view [--db path] [--exercise-id id] [--run-id id] [--limit n]
	  lyo learn style [--db path]
	  lyo workspace register [--db path] --root path [--workspace-id id] [--name name]
	  lyo workspace init-nectr [--db path] --root path [--workspace-id id] [--name name]
	  lyo zone add [--db path] --workspace-id id --name name --kind kind [--zone-id id] [--parent-zone-id id] [--path-glob glob] [--description text]
	  lyo job start [--db path] --job-id id --workspace-id id [--run-id id] [--task-shape shape] [--summary text] [--source-ref ref]
	  lyo job finish [--db path] --job-id id [--status completed|failed|cancelled|unknown] [--derive] [--outcome positive|negative|unknown]
	  lyo activate path [--db path] --job-id id --path path --kind kind [--run-id id] [--evidence-ref ref] [--confidence low|medium|high]
	  lyo activate command [--db path] --job-id id --command-name name [--argv text] [--argv-summary text] [--classification class] [--status status] [--run-id id] [--evidence-ref ref]
	  lyo activate deployment [--db path] --job-id id --command-id id [--provider name] [--environment env] [--target target] [--status status] [--evidence-ref ref]
	  lyo normalize hooks [--db path] [--spool-dir path] [--workspace-id id] [--outcome positive|negative|unknown] [--limit n]
	  lyo activation derive [--db path] --job-id id [--outcome positive|negative|unknown]
	  lyo activation report [--db path] --job-id id
	  lyo zone associations [--db path] --workspace-id id [--zone-id id] [--limit n]
	  lyo associations derive [--db path] --job-id id [--outcome positive|negative|unknown]
	  lyo associations recommend [--db path] --workspace-id id [--seed-zone-id id[,id]] [--include-nonpositive] [--limit n]
	  lyo report [--db path] [--semantic [--lower] --run-id id] [--effects --run-id id] [--style --run-id id] [--at-bat --run-id id --task-context path]
	  lyo experiment [--db path] --family-id id --baseline-run-id id --treatment-run-id id [--variant-run-id id] [--artifact id --association-edge edge] [--next-experiment text]
	  lyo audit [--dir path]
	  lyo demo fixture-replay [--db path]

	Environment:
	  LEARNLOOP_DB       Default SQLite path. Defaults to .agent-learning/learning.sqlite
	  LEARNLOOP_CHANNEL  Optional channel override for hook overlay resolution
	  LEARNLOOP_PROMPT_DIR Optional directory for hook prompt blobs
	  LEARNLOOP_HOOK_SPOOL_DIR Optional append-only hook spool directory
	  LEARNLOOP_DRAIN_SPOOL_ON_STOP Set to 0 to disable Stop-hook spool draining
	  LEARNLOOP_NORMALIZE_ON_STOP Set to 0 to disable Stop-hook normalization
	  LEARNLOOP_NORMALIZE_ON_TOOL_USE Set to 0 to disable PostToolUse normalization
	  LEARNLOOP_SQLITE_BUSY_TIMEOUT_MS SQLite busy timeout for concurrent hook writers`);
  process.exit(exitCode);
}
