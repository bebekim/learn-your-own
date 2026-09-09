import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel, closeKernel } from '../ledger.ts';
import { hashFile } from '../contract/refs.ts';
import { FeedbackController } from '../lyo/control/feedback-controller.ts';
import type { ControlDecision, ControlSpecification } from '../lyo/control/feedback-controller.ts';
import { seededRng } from './replay.ts';

interface Episode {
  caseId: string;
  split: 'train' | 'test';
  condition: 'explore' | 'baseline' | 'learned';
  decision: ControlDecision;
  exitCode: number | null;
  reward: number;
  wallTimeMs: number;
  evidence: { path: string; sha256: string };
}

/** Calibration of the feedback mechanism using real processes, not a coding-agent benchmark. */
export function runControlExperiment(outputDir: string, seed = 42) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be a uint32');
  mkdirSync(dirname(outputDir), { recursive: true });
  mkdirSync(outputDir); // An experiment never overwrites or mixes with a prior run.
  const instrument = hashFile(fileURLToPath(import.meta.url));
  const specification: ControlSpecification = {
    domain: 'coding/javascript-execution', objective: 'correct-output-within-2-seconds@1',
    evaluator: `node-output@1:${process.version}:${instrument.sha256}`, stateSchema: 'module-syntax@1',
    actions: ['commonjs', 'module'], baselineAction: 'commonjs',
  };
  const registration = { seed, instrument, nodeVersion: process.version, specification,
    trainingCases: 32, testCases: 12, timeoutMs: 2000,
    claim: 'mechanism-only', createdAt: new Date().toISOString() };
  writeJson(join(outputDir, 'registration.json'), registration);
  const kernel = createKernel({ dbPath: join(outputDir, 'learning.sqlite') });
  try {
    const controller = new FeedbackController(kernel, specification);
    const rng = seededRng(seed);
    const episodes: Episode[] = [];
    let revision: number | undefined;
    for (const split of ['train', 'test'] as const) {
      const count = split === 'train' ? registration.trainingCases : registration.testCases;
      for (let i = 0; i < count; i++) {
        const caseId = `${split}-${i}`;
        const caseDir = join(outputDir, caseId);
        mkdirSync(caseDir);
        const syntax = i % 2 === 0 ? 'require' : 'import';
        const n = split === 'train' ? i : i + 100;
        const source = syntax === 'require'
          ? `const { format } = require('node:util');\nconsole.log(format('%d', ${n} * ${n} + 1));\n`
          : `import { format } from 'node:util';\nconsole.log(format('%d', ${n} * ${n} + 1));\n`;
        const sourcePath = join(caseDir, 'input.js');
        writeFileSync(sourcePath, source);
        const statePath = join(caseDir, 'observation.json');
        writeJson(statePath, { state: { syntax }, source: hashFile(sourcePath) });
        const conditions = split === 'train' ? ['explore'] as const : ['baseline', 'learned'] as const;
        for (const condition of conditions) {
          const decision = controller.decide({
            episodeId: `${caseId}-${condition}`, state: { syntax }, observationRef: statePath,
            mode: split === 'train' ? 'explore' : 'evaluate',
            ...(condition === 'baseline' ? { revision: 0 }
              : condition === 'learned' && revision !== undefined ? { revision } : {}),
          }, rng);
          if (condition === 'learned') revision ??= decision.revision;
          const started = performance.now();
          const result = spawnSync(process.execPath, [`--input-type=${decision.action}`], {
            input: source, cwd: caseDir, encoding: 'utf8', timeout: registration.timeoutMs,
          });
          if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ETIMEDOUT') throw result.error;
          const wallTimeMs = performance.now() - started;
          const reward = result.status === 0 && result.stdout.trim() === String(n * n + 1) ? 1 : 0;
          const resultPath = join(caseDir, `${condition}-result.json`);
          writeJson(resultPath, { decisionId: decision.id, action: decision.action,
            evaluator: specification.evaluator, expectedOutput: String(n * n + 1),
            exitCode: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr,
            error: result.error?.message ?? null, reward, wallTimeMs });
          controller.feedback({ decisionId: decision.id, executedAction: decision.action,
            evaluator: specification.evaluator, reward, evidenceRef: resultPath });
          episodes.push({ caseId, split, condition, decision, exitCode: result.status, reward,
            wallTimeMs, evidence: hashFile(resultPath) });
        }
      }
    }
    const summarize = (condition: Episode['condition']) => {
      const rows = episodes.filter(episode => episode.condition === condition);
      return { episodes: rows.length, successes: rows.filter(episode => episode.reward === 1).length,
        wallTimeMs: rows.reduce((sum, episode) => sum + episode.wallTimeMs, 0) };
    };
    const report = { claim: 'mechanism-only', domain: specification.domain, seed, revision,
      training: summarize('explore'), baseline: summarize('baseline'), learned: summarize('learned'),
      limitation: 'Fixed JavaScript programs and two observed syntax states. No coding-agent or Go benefit demonstrated.' };
    writeJson(join(outputDir, 'episodes.json'), episodes);
    writeJson(join(outputDir, 'report.json'), report);
    return report;
  } finally { closeKernel(kernel); }
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
