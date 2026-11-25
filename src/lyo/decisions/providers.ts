/**
 * Swappable typed-decision providers (Spec 12 §4). Every adapter returns the same
 * `TypedDecisionRecord`; callers only see `TypedDecisionProvider`.
 *
 *   mlxcel      local `mlxcel decide` (or a running `/v1/decisions` server); nothing leaves the machine
 *   openrouter  OpenRouter System One (`upstage/solar-decide`), zero-data-retention routing requested
 *   jev         TypeSafe Jev
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import type { TypedDecisionProvider, TypedDecisionRecord, TypedDecisionRequest } from '../application/typed-decisions.ts';
import type { TypedAnswer, TypedQuestion } from '../domain/typed-decision.ts';
import { DEFAULT_JEV_MODEL, jevProvider } from './jev.ts';

const expand = (path: string) => path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;

export const decisionConfigSchema = z.object({
  provider: z.enum(['mlxcel', 'openrouter', 'jev']),
  mlxcel: z.object({
    binary: z.string().min(1).default('mlxcel'),
    decisionModel: z.string().min(1).default('nativ-community/decider-2b'),
    /** A running `mlxcel-server --decision-model` base URL; absent means one `mlxcel decide` call per decision. */
    serverUrl: z.url().optional(),
  }).strict().default({ binary: 'mlxcel', decisionModel: 'nativ-community/decider-2b' }),
  openrouter: z.object({
    model: z.string().min(1).default('upstage/solar-decide'),
    apiKeyEnvFile: z.string().min(1).optional(),
    zdr: z.boolean().default(true),
  }).strict().default({ model: 'upstage/solar-decide', zdr: true }),
  jev: z.object({
    model: z.string().min(1).default(DEFAULT_JEV_MODEL),
    apiKeyEnvFile: z.string().min(1).optional(),
  }).strict().default({ model: DEFAULT_JEV_MODEL }),
  // Spec 14: the hypothesis generator, a text model. Absent means `hypotheses propose` sends nothing.
  generator: z.object({
    provider: z.literal('openrouter'),
    model: z.string().min(1).default('anthropic/claude-sonnet-5.5'),
    apiKeyEnvFile: z.string().min(1).optional(),
    zdr: z.boolean().default(true),
    maxOutputTokens: z.number().int().min(500).max(32000).default(8000),
    maxEpisodes: z.number().int().min(5).max(400).default(80),
    maxShadowing: z.number().int().min(1).max(50).default(5),
    // Corrective calls after rejected proposals or too few rivals.
    retries: z.number().int().min(0).max(1).default(1),
  }).strict().optional(),
  worker: z.object({
    idleSeconds: z.number().int().min(1).max(86400).default(600),
    ttlSeconds: z.number().int().min(10).max(86400).default(14400),
    maxAgeSeconds: z.number().int().min(10).max(86400).default(900),
    timeoutMs: z.number().int().min(100).max(300000).default(60000),
    maxQueued: z.number().int().min(1).max(10000).default(200),
  }).strict().default({ idleSeconds: 600, ttlSeconds: 14400, maxAgeSeconds: 900, timeoutMs: 60000, maxQueued: 200 }),
}).strict();
export type DecisionConfig = z.infer<typeof decisionConfigSchema>;

/** `LYO_DECISIONS_FILE`, else `~/.lyo/decisions.json`; null when neither exists (decision triggers stay idle). */
export function loadDecisionConfig(env: NodeJS.ProcessEnv = process.env): DecisionConfig | null {
  const path = env.LYO_DECISIONS_FILE ? expand(env.LYO_DECISIONS_FILE) : join(homedir(), '.lyo', 'decisions.json');
  if (!existsSync(path)) return null;
  return decisionConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** The provider and model a calibration must name to be valid for this configuration. */
export function configuredDecisionModel(config: DecisionConfig): { provider: DecisionConfig['provider']; model: string } {
  const model = config.provider === 'mlxcel' ? config.mlxcel.decisionModel
    : config.provider === 'openrouter' ? config.openrouter.model : config.jev.model;
  return { provider: config.provider, model };
}

export function envKey(name: string, envFile: string | undefined, env: NodeJS.ProcessEnv) {
  if (env[name]) return env[name];
  if (!envFile || !existsSync(expand(envFile))) return undefined;
  const scoped: NodeJS.ProcessEnv = {};
  for (const line of readFileSync(expand(envFile), 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) scoped[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return scoped[name];
}

export interface ProviderDeps {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  /** Runs `mlxcel decide`; injectable for tests. Resolves stdout. */
  runMlxcel?: (binary: string, args: string[], timeoutMs: number) => Promise<string>;
}

export function createDecisionProvider(config: DecisionConfig, deps: ProviderDeps = {}): TypedDecisionProvider {
  const env = deps.env ?? process.env;
  if (config.provider === 'jev') {
    const apiKey = envKey('TYPESAFE_API_KEY', config.jev.apiKeyEnvFile, env) ?? envKey('JEV_API_KEY', config.jev.apiKeyEnvFile, env);
    if (!apiKey) throw new Error('jev provider needs TYPESAFE_API_KEY (or JEV_API_KEY)');
    return jevProvider({ apiKey, model: config.jev.model, maxRetries: 0, fetch: deps.fetch });
  }
  if (config.provider === 'openrouter') {
    const apiKey = envKey('OPENROUTER_API_KEY', config.openrouter.apiKeyEnvFile, env);
    if (!apiKey) throw new Error('openrouter provider needs OPENROUTER_API_KEY');
    return jevProvider({ apiKey, model: config.openrouter.model, baseUrl: 'https://openrouter.ai/api', maxRetries: 0,
      fetch: deps.fetch, name: 'openrouter',
      extraBody: config.openrouter.zdr ? { provider: { zdr: true, allow_fallbacks: false } } : undefined });
  }
  return mlxcelProvider(config.mlxcel, deps);
}

// mlxcel's `/v1/decisions` answer shape (docs/decisions.md, v0.9.0-beta.2).
const mlxcelAnswer = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('score'), value: z.number(), probabilities: z.record(z.string(), z.number()),
    metadata: z.looseObject({ confidence: z.number(), legend: z.record(z.string(), z.unknown()) }) }),
  z.looseObject({ type: z.literal('choice'), value: z.string(), probabilities: z.record(z.string(), z.number()),
    metadata: z.looseObject({ confidence: z.number() }) }),
  z.looseObject({ type: z.literal('bool'), value: z.boolean(), probability: z.number() }),
]);
const mlxcelResponse = z.looseObject({ model: z.string().optional(), answers: z.record(z.string(), mlxcelAnswer),
  usage: z.looseObject({ input_tokens: z.number(), output_tokens: z.number().optional() }).optional() });

/** Maps mlxcel's answer to the provider-neutral form. Score keeps its expected level index, as System One does. */
export function fromMlxcelAnswer(answer: z.infer<typeof mlxcelAnswer>): TypedAnswer {
  if (answer.type === 'score') return { type: 'score', score: answer.value, confidence: answer.metadata.confidence,
    probabilities: answer.probabilities, legend: answer.metadata.legend };
  if (answer.type === 'choice') return { type: 'choice', choice: answer.value, confidence: answer.metadata.confidence,
    probabilities: answer.probabilities };
  return { type: 'noul', noul: answer.probability };
}

/** System One names the bool type `noul`; mlxcel accepts `noul` as an alias, so questions pass through unchanged. */
function mlxcelQuestions(questions: Record<string, TypedQuestion>) {
  return Object.fromEntries(Object.entries(questions).map(([name, q]) => [name, q]));
}

function defaultRunMlxcel(binary: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => execFile(expand(binary), args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
    (error, stdout, stderr) => error ? reject(new Error(`mlxcel decide failed: ${String(stderr || error.message).slice(-300)}`)) : resolve(stdout)));
}

export function mlxcelProvider(config: DecisionConfig['mlxcel'], deps: ProviderDeps = {}): TypedDecisionProvider {
  const run = deps.runMlxcel ?? defaultRunMlxcel, fetchImpl = deps.fetch ?? fetch;
  return {
    name: 'mlxcel',
    async decide(input: TypedDecisionRequest, options = {}): Promise<TypedDecisionRecord> {
      const timeoutMs = options.timeoutMs ?? 60000;
      const body = { model: config.decisionModel, state: input.state, questions: mlxcelQuestions(input.questions) };
      let raw: unknown;
      if (config.serverUrl) {
        const res = await fetchImpl(`${config.serverUrl.replace(/\/$/, '')}/v1/decisions`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({ state: input.state, questions: body.questions }) });
        if (!res.ok) throw new Error(`mlxcel server returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
        raw = await res.json();
      } else {
        const dir = mkdtempSync(join(tmpdir(), 'lyo-decide-'));
        try {
          const stateFile = join(dir, 'state.txt'), questionsFile = join(dir, 'questions.json');
          writeFileSync(stateFile, typeof input.state === 'string' ? input.state : JSON.stringify(input.state), { mode: 0o600 });
          writeFileSync(questionsFile, JSON.stringify(body.questions), { mode: 0o600 });
          const stdout = await run(config.binary, ['decide', '-m', config.decisionModel, '--state-file', stateFile,
            '--questions-file', questionsFile], timeoutMs);
          raw = JSON.parse(stdout.slice(stdout.indexOf('{')));
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      const parsed = mlxcelResponse.safeParse(raw);
      if (!parsed.success) throw new Error(`mlxcel response did not match the decision contract: ${parsed.error.message.slice(0, 300)}`);
      const answers: Record<string, TypedAnswer> = {};
      for (const [name, question] of Object.entries(input.questions)) {
        const answer = parsed.data.answers[name];
        if (!answer) throw new Error(`mlxcel returned no answer for ${name}`);
        const mapped = fromMlxcelAnswer(answer);
        if (mapped.type !== question.type) throw new Error(`mlxcel returned ${answer.type} for ${question.type} question ${name}`);
        answers[name] = mapped;
      }
      return { source: 'typed-decision@1', provider: 'mlxcel', requestedModel: config.decisionModel,
        answeredModel: parsed.data.model ?? config.decisionModel, requestHash: hashValue(body), answers,
        usage: parsed.data.usage ? { inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens ?? 0 } : null,
        decidedAt: new Date().toISOString() };
    },
  };
}

/** Expected level on a 1..n scale from score probabilities keyed "0".."n-1". */
export function expectedLevel(answer: TypedAnswer): number | null {
  if (answer.type !== 'score') return null;
  const entries = Object.entries(answer.probabilities).map(([k, v]) => [Number(k), v] as const).filter(([k]) => Number.isInteger(k));
  const mass = entries.reduce((s, [, v]) => s + v, 0);
  return mass > 0 ? entries.reduce((s, [k, v]) => s + (k + 1) * v, 0) / mass : null;
}
