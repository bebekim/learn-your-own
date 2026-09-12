import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashValue } from '../../src/contract/refs.ts';
import { LessonStore } from '../../src/lyo/storage/lesson-store.ts';
import { emitSessionLessons } from '../../src/lyo/selection/session-hook.ts';
import { registerFindingOpportunity } from '../../src/lyo/interface/session-finding-evidence.ts';
import { reviewFindingSemantics } from '../../src/lyo/interface/session-finding-semantics.ts';
import { inspectFinding, reviseFinding } from '../../src/lyo/interface/session-findings.ts';
import { spoolCodexHookEvent, spoolClaudeHookEvent } from '../../src/hooks/runtime.ts';

const originalAdvice = 'Reject blank strings using value.trim().length > 0; return the original accepted string.';
const revisedAdvice = 'For contracts rejecting both ECMAScript and Unicode whitespace, require /[^\\s\\p{White_Space}]/u to match; preserve the accepted string.';
const parser = (condition: string) => `export function parse(value) {
  if (typeof value !== 'string' || ${condition}) throw new Error('blank');
  return value;
}\n`;
const initial = parser('value.length === 0');
const trim = parser('value.trim().length === 0');
const unicode = parser('! /[^\\s\\p{White_Space}]/u.test(value)');
// Explicit contract inputs; prediction executes the parser, not a stored success flag.
const blank = [9, 10, 11, 12, 13, 32, 133, 160, 5760, ...Array.from({ length: 11 }, (_, i) => 8192 + i),
  8232, 8233, 8239, 8287, 12288, 65279];
const contract = { id: 'ecmascript-and-unicode-blank-v1',
  reject: ['', ...blank.flatMap(code => [String.fromCodePoint(code), String.fromCodePoint(code).repeat(3)]), null, 1],
  preserve: ['A', ' A ', '\u0085A\u0085', '\u200b', '한글', '🎲'] };
const checker = `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [mode, source, contractPath, expected] = process.argv.slice(2);
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const { parse } = await import(pathToFileURL(source));
const rejects = value => { try { parse(value); return false; } catch { return true; } };
const satisfied = mode === 'applicability' ? contract.id === 'ecmascript-and-unicode-blank-v1'
  : mode === 'adherence' ? readFileSync(source, 'utf8') === readFileSync(expected, 'utf8')
  : contract.reject.every(rejects) && contract.preserve.every(value => parse(value) === value);
console.log(JSON.stringify({ satisfied }));\n`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Controlled local exercise. Events and patches are scripted, not independent agent trials. */
export function runFeedbackLoop(directory: string) {
  mkdirSync(directory, { recursive: true });
  const root = realpathSync(directory), storePath = join(root, 'lessons.sqlite');
  assert.equal(existsSync(storePath), false, 'use a fresh directory; never overwrite evidence');
  const previous = process.env.ZEROSHOT_LYO_STORE_PATH;
  process.env.ZEROSHOT_LYO_STORE_PATH = storePath;
  let store = new LessonStore(storePath);
  try {
    const findingId = 'finding:unicode-contract-exercise';
    const source = readFileSync(new URL('../specific-lesson-transfer-2026-09-10/unicode-audit.json', import.meta.url), 'utf8');
    const provenance = 'finding-origin:retained-unicode-audit';
    store.recordTrace({ trace_id: provenance, kind: 'behavior', summary: 'Prior post-hoc counterexample; not a new trial.',
      payload: { source: 'feedback-exercise-origin@1', path: 'evidence/specific-lesson-transfer-2026-09-10/unicode-audit.json',
        content: source, hash: hashValue(source) } });
    store.recordTrace({ trace_id: findingId, kind: 'behavior', summary: 'Isolated replay of advice with a known limitation.',
      ref: provenance, payload: { source: 'session-finding@1', gitCommonDir: root, activity: 'transfer-review',
        observation: 'U+0085 survives trim but belongs to the target blank-character contract.',
        evidenceRef: provenance, intervention: originalAdvice } });
    const deliver = (cwd: string, session: string) => {
      let output = '';
      emitSessionLessons({ cwd, session_id: session, prompt: '[lyo:transfer-review]' }, text => { output += text; });
      return { id: `session-delivery:${session}`, output };
    };
    const apply = (id: string, runtime: 'codex' | 'claude', expected: string, advice: string) => {
      const cwd = join(root, id); mkdirSync(cwd);
      const sourcePath = join(cwd, 'parser.mjs'), contractPath = join(cwd, 'contract.json');
      const verifier = join(cwd, 'check.mjs'), expectedPath = join(cwd, 'expected.mjs'), actionPath = join(cwd, 'apply.mjs');
      writeFileSync(sourcePath, initial); writeFileSync(contractPath, JSON.stringify(contract, null, 2));
      writeFileSync(verifier, checker); writeFileSync(expectedPath, expected);
      writeFileSync(actionPath, "import { copyFileSync } from 'node:fs'; copyFileSync(new URL('./expected.mjs', import.meta.url), new URL('./parser.mjs', import.meta.url));\n");
      const delivery = deliver(cwd, id);
      assert.ok(delivery.output.includes(advice));
      const check = (mode: string) => [process.execPath, verifier, mode, sourcePath, contractPath, expectedPath].map(quote).join(' ');
      const command = [process.execPath, actionPath].map(quote).join(' ');
      const toolInput = { command };
      registerFindingOpportunity(store, { id, findingId, deliveryId: delivery.id, taskId: id, cwd,
        claim: { kind: 'deterministic', conditions: 'The explicit ECMAScript plus Unicode blank-character contract applies.',
          action: advice, prediction: 'Reject every listed blank input and preserve every listed accepted string.',
          falsifiedBy: 'Any declared input violates the frozen contract after the advised parser change.' },
        checks: { applicability: check('applicability'), adherence: check('adherence'), prediction: check('prediction') },
        sourceFiles: [sourcePath], verifierFiles: [verifier, contractPath, expectedPath, actionPath],
        evaluator: { id: 'explicit-blank-contract', version: '1' }, capture: { runtime, toolName: 'Bash', toolInput } });
      const basis = (rationale: string) => ({ rationale, verifierPaths: [verifier, contractPath, expectedPath] });
      reviewFindingSemantics(store, { id: `${id}-semantics`, opportunityId: id,
        reviewer: { id: 'codex-controlled-exercise', kind: 'agent' }, verdict: 'accepted', claimKind: 'deterministic',
        applicability: basis('The frozen contract explicitly lists the target whitespace inputs, including U+0085.'),
        adherence: basis('Exact source equality establishes this scripted implementation of the delivered condition and original-value preservation.'),
        prediction: basis('The checker executes the parser on all frozen inputs and compares rejection or the exact returned value.'),
        limitations: 'Finite contract only; scripted patch and hook events. No independent reviewer, host choice, causal prompt benefit, or generalization.' });
      const hook = runtime === 'codex' ? spoolCodexHookEvent : spoolClaudeHookEvent;
      const event = { cwd, session_id: id, tool_use_id: `${id}-call`, tool_name: 'Bash', tool_input: toolInput };
      const spool = { spoolDir: join(root, 'spool') };
      hook({ ...event, hook_event_name: 'PreToolUse' }, spool);
      execFileSync(process.execPath, [actionPath], { cwd });
      hook({ ...event, hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }, spool);
      const state = inspectFinding(store, findingId), entry = state.opportunities.find(row => row.id === id)!;
      assert.equal(entry.reviewEvidenceCurrent, true);
      assert.equal(entry.evidence!.incrementalBenefit, 'unknown');
      return { id, delivery, version: entry.registered!.version, outcome: entry.evidence!.outcome,
        prediction: entry.evidence!.measurement.prediction!.satisfied, feedbackId: state.currentFeedback.find(row => row.opportunityId === id)!.id };
    };
    const first = apply('original', 'codex', trim, originalAdvice);
    assert.equal(first.outcome, 'contradicted');
    assert.equal(first.prediction, false);
    const suspended = deliver(root, 'after-counterexample').output;
    assert.ok(!suspended.includes(originalAdvice));
    assert.match(suspended, /needs-content-review/);
    // Cross a real storage boundary: the revision must be based on retained evidence.
    store.close(); store = new LessonStore(storePath);
    const revision = reviseFinding(store, { id: 'unicode-contract-correction', findingId, previousVersion: first.version,
      intervention: revisedAdvice, feedbackIds: [first.feedbackId], author: 'codex-controlled-exercise',
      rationale: 'U+0085 is rejected by the declared target contract but survives trim. Restrict the wording to this explicit whitespace contract.' });
    assert.equal(inspectFinding(store, findingId).supporting, 0);
    const second = apply('revised', 'claude', unicode, revisedAdvice);
    assert.equal(second.outcome, 'supported');
    assert.equal(second.prediction, true);
    assert.notEqual(first.version, second.version);
    const next = deliver(join(root, 'revised'), 'after-correction').output;
    assert.ok(next.includes(revisedAdvice));
    assert.ok(!next.includes(originalAdvice));
    const state = inspectFinding(store, findingId);
    assert.equal(state.currentFeedback.length, 2);
    assert.equal(state.supporting, 1);
    const report = { kind: 'controlled-finding-feedback-loop', storePath, findingId, provenance,
      original: first, suspendedPrompt: suspended, revision, revised: second, nextPrompt: next,
      validity: state.validity, supporting: state.supporting, incrementalBenefit: 'unknown',
      boundary: 'Real parser execution; scripted actions and hook events. Not an independent ordinary-session benefit trial.' };
    writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    writeFileSync(join(root, 'journal.json'), JSON.stringify(store.db.prepare('SELECT * FROM learning_trace ORDER BY rowid').all(), null, 2) + '\n');
    return report;
  } finally {
    store.close();
    if (previous === undefined) delete process.env.ZEROSHOT_LYO_STORE_PATH;
    else process.env.ZEROSHOT_LYO_STORE_PATH = previous;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('usage: node evidence/finding-feedback-loop-2026-09-10/run.ts NEW_OUTPUT_DIRECTORY');
  const report = runFeedbackLoop(process.argv[2]);
  console.log(JSON.stringify({ storePath: report.storePath, original: report.original.outcome, revised: report.revised.outcome,
    validity: report.validity, incrementalBenefit: report.incrementalBenefit }, null, 2));
}
