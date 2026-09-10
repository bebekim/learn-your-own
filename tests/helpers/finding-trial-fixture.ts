import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixture } from './session-finding-fixture.ts';
import { inspectFinding } from '../../src/lyo/selection/session-findings.ts';

export function trialFixture() {
  const f = fixture();
  const template = f.prepare(f.deliver(f.root, 'setup-only').deliveryId);
  const { id, deliveryId, taskId, cwd, findingId, ...measurement } = template.input;
  const basis = { rationale: 'The fixture evaluator reads the named target property.', verifierPaths: [template.verifier] };
  const trial = { id: 'ordinary-trial', findingId: f.findingId, findingVersion: inspectFinding(f.store, f.findingId).version,
    roots: [f.root], model: 'test-model', trigger: { toolName: 'Bash', toolInput: { command: 'diagnose' }, result: 'failure' },
    measurement: { ...measurement, capture: { toolName: 'Bash', next: true }, sourceFiles: ['state.json'],
      checks: Object.fromEntries(Object.entries(measurement.checks).map(([key, command]) => [key, command.replace(`'${template.source}'`, "'state.json'")])) },
    review: { reviewer: { id: 'fixture-reviewer', kind: 'agent' }, claimKind: 'deterministic',
      applicability: basis, adherence: basis, prediction: basis, limitations: 'Synthetic trial of hook plumbing.' } };
  const workspace = (name: string) => {
    const cwd = join(f.root, name); mkdirSync(cwd, { recursive: true });
    const source = join(cwd, 'state.json');
    writeFileSync(source, JSON.stringify({ applicable: true, followed: false, predicted: false }));
    return { cwd, source };
  };
  const target = workspace('first-task');
  const event = { cwd: target.cwd, session_id: 'ordinary-session', model: 'test-model', hook_event_name: 'PostToolUse',
    tool_use_id: 'diagnostic-1', tool_name: 'Bash', tool_input: { command: 'diagnose' }, tool_response: { exit_code: 1 } };
  const config = join(f.root, 'config.json');
  writeFileSync(config, JSON.stringify({ rootDir: f.root, corpusPath: join(f.root, 'corpus.sqlite'), adaptiveFeedback: { mode: 'explore' } }));
  const cli = (args: string[], event: unknown = {}) => JSON.parse(execFileSync(process.execPath,
    [new URL('../../src/cli.ts', import.meta.url).pathname, ...args], {
      cwd: target.cwd, env: { ...process.env, LYO_CONFIG_FILE: config }, input: JSON.stringify(event), encoding: 'utf8' }));
  return { ...f, trial, event, workspace, target, cli };
}
