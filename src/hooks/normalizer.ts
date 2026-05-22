import { createHash } from 'node:crypto';
import type {
  ActivationConfidence,
  BehaviorPhase,
  CommandClassification,
  CommandStatus,
  PathActivationKind,
  RecordDeploymentActionInput,
} from '../types.ts';
import type { HookRuntime } from './events.ts';

export interface HookEventForNormalization {
  eventId: string;
  sessionId: string;
  turnId: string | null;
  eventName: string;
  cwd: string;
  payloadJson: string;
}

export interface ClassifiedHookDeployment {
  provider: string | null;
  environment: string | null;
  target: string | null;
  status: NonNullable<RecordDeploymentActionInput['status']>;
}

export interface ClassifiedHookCommand {
  commandName: string;
  commandFamily: string;
  workingDirectory: string;
  argv: string;
  argvSummary: string;
  classification: CommandClassification;
  status: CommandStatus;
  phase: BehaviorPhase;
  outputSize: number;
  deployment: ClassifiedHookDeployment | null;
}

export interface ClassifiedHookPath {
  path: string;
  activationKind: PathActivationKind;
  confidence: ActivationConfidence;
  phase: BehaviorPhase;
}

export interface ClassifiedHookEvent {
  jobId: string;
  evidenceRef: string;
  runtime: HookRuntime;
  payload: Record<string, unknown>;
  toolName: string | null;
  commands: ClassifiedHookCommand[];
  paths: ClassifiedHookPath[];
}

interface PathFact {
  path: string;
  activationKind: PathActivationKind;
}

export function classifyHookEvent(event: HookEventForNormalization): ClassifiedHookEvent {
  const payload = parseJsonObject(event.payloadJson);
  const runtime = runtimeFromPayload(payload);
  const toolName = stringValue(payload.tool_name);
  const toolInputRaw = payload.tool_input;
  const toolInput = objectValue(toolInputRaw);
  const commands: ClassifiedHookCommand[] = [];

  if (toolName && isShellTool(toolName)) {
    const commandText = extractCommandText(toolInput);
    if (commandText) {
      const commandName = firstCommandToken(commandText);
      const status = inferHookCommandStatus(event.eventName, payload);
      const classification = classifyCommand(commandName, commandText);
      commands.push({
        commandName,
        commandFamily: commandName,
        workingDirectory: event.cwd,
        argv: commandText,
        argvSummary: summarizeCommand(commandText),
        classification,
        status,
        phase: phaseForCommand(classification, commandName, commandText),
        outputSize: estimateToolOutputSize(payload),
        deployment: classification === 'deploy'
          ? {
              provider: inferDeploymentProvider(commandText),
              environment: inferDeploymentEnvironment(commandText),
              target: inferDeploymentTarget(commandText),
              status: deploymentStatusFromCommandStatus(status),
            }
          : null,
      });
    }
  }

  const paths = toolName
    ? extractPathFacts(toolName, toolInputRaw).map((fact) => ({
        path: fact.path,
        activationKind: fact.activationKind,
        confidence: 'medium' as const,
        phase: phaseForPathActivation(fact.activationKind),
      }))
    : [];

  return {
    jobId: hookJobId(runtime, event.sessionId, event.turnId),
    evidenceRef: `hook:${event.eventId}`,
    runtime,
    payload,
    toolName,
    commands,
    paths,
  };
}

export function summarizeCommand(command: string): string {
  return redactSensitive(command).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function redactSensitive(value: string): string {
  return value
    .replace(/(token|password|passwd|secret|api[_-]?key)=\S+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[redacted-aws-key]');
}

export function classifyCommand(commandName: string, commandText: string): CommandClassification {
  const text = `${commandName} ${commandText}`.toLowerCase();
  if (/\b(node --test|npm test|npm run test|pnpm test|pnpm exec vitest|pnpm vitest|yarn test|yarn vitest|npx jest|npx vitest|jest|vitest|pytest|uv run pytest|bundle exec rspec|rails test|go test|cargo test)\b/.test(text)) return 'test';
  if (/\b(eslint|ruff|prettier|biome|black|rubocop|go fmt|cargo fmt)\b/.test(text)) return 'lint';
  if (/\b(databricks bundle deploy|cloudformation deploy|terraform apply|railway up|kubectl apply|acli push)\b/.test(text)) return 'deploy';
  if (/\baws\b/.test(text) && /\bdeploy\b/.test(text)) return 'deploy';
  if (/\b(rails db:migrate|prisma migrate|alembic upgrade|psql|sqlite3)\b/.test(text)) return 'database';
  if (/\b(npm publish|npm pack|publish-npm|twine upload|cargo publish|gem push)\b/.test(text)) return 'package';
  if (/\b(npm run build|pnpm build|yarn build|go build|cargo build)\b/.test(text)) return 'build';
  if (/\bgit\b/.test(text)) return 'git';
  return 'unknown';
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return objectValue(parsed) ?? {};
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isShellTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase();
  return normalized === 'bash'
    || normalized === 'shell'
    || normalized === 'exec_command'
    || normalized.endsWith('.exec_command');
}

function extractCommandText(toolInput: Record<string, unknown> | null): string | null {
  if (!toolInput) return null;
  return stringValue(toolInput.command)
    ?? stringValue(toolInput.cmd)
    ?? stringValue(toolInput.script)
    ?? null;
}

function inferHookCommandStatus(eventName: string, payload: Record<string, unknown>): CommandStatus {
  if (eventName === 'PreToolUse' || eventName === 'tool.before') return 'attempted';
  if (eventName === 'PostToolUseFailure' || eventName === 'tool.failure') return 'failed';
  if (eventName !== 'PostToolUse' && eventName !== 'tool.after') return 'unknown';
  return hookStatusSignal(payload) ?? 'succeeded';
}

function hookStatusSignal(value: unknown): CommandStatus | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const signal = hookStatusSignal(item);
      if (signal) return signal;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (['exitcode', 'returncode'].includes(normalizedKey) && typeof child === 'number') {
      return child === 0 ? 'succeeded' : 'failed';
    }
    if (['success', 'ok'].includes(normalizedKey) && typeof child === 'boolean') {
      return child ? 'succeeded' : 'failed';
    }
    if (['status', 'state', 'outcome'].includes(normalizedKey) && typeof child === 'string') {
      const normalizedValue = child.toLowerCase();
      if (['failed', 'failure', 'error', 'errored', 'cancelled'].includes(normalizedValue)) return 'failed';
      if (['succeeded', 'success', 'completed', 'passed', 'ok'].includes(normalizedValue)) return 'succeeded';
    }
    if (['error', 'exception'].includes(normalizedKey) && child) return 'failed';
  }

  for (const child of Object.values(value)) {
    const signal = hookStatusSignal(child);
    if (signal) return signal;
  }
  return null;
}

function deploymentStatusFromCommandStatus(status: CommandStatus): ClassifiedHookDeployment['status'] {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed') return 'failed';
  if (status === 'attempted' || status === 'planned') return 'attempted';
  return 'unknown';
}

function estimateToolOutputSize(payload: Record<string, unknown>): number {
  const redactedToolResponse = objectValue(payload.tool_response);
  if (typeof redactedToolResponse?.output_size === 'number') {
    return redactedToolResponse.output_size;
  }
  const outputRoots = [
    payload.tool_response,
    payload.tool_output,
    payload.output,
    payload.result,
  ];
  return outputRoots.reduce<number>((sum, root) => sum + stringPayloadSize(root), 0);
}

export function stringPayloadSize(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + stringPayloadSize(item), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value).reduce<number>((sum, item) => sum + stringPayloadSize(item), 0);
}

function firstCommandToken(command: string): string {
  const trimmed = command.trim();
  const first = trimmed.split(/\s+/)[0] ?? 'command';
  return first.replace(/^["']|["']$/g, '') || 'command';
}

function inferDeploymentProvider(command: string): string | null {
  const text = command.toLowerCase();
  if (text.includes('databricks')) return 'databricks';
  if (text.includes('terraform')) return 'terraform';
  if (text.includes('railway')) return 'railway';
  if (text.includes('kubectl')) return 'kubernetes';
  if (/\baws\b/.test(text)) return 'aws';
  if (/\bacli\b/.test(text)) return 'acli';
  return null;
}

function inferDeploymentEnvironment(command: string): string | null {
  const match = command.match(/(?:^|\s)(?:-t|--target|--env|--environment)\s+([A-Za-z0-9_.:-]+)/);
  return match?.[1] ?? null;
}

function inferDeploymentTarget(command: string): string | null {
  const match = command.match(/(?:bundle deploy|deploy|apply|push)\s+([A-Za-z0-9_./:-]+)/i);
  const target = match?.[1] ?? null;
  return target && !target.startsWith('-') ? target : null;
}

function pathActivationKindForTool(toolName: string): PathActivationKind {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('read')) return 'file_read';
  if (normalized.includes('ls') || normalized.includes('list')) return 'directory_listed';
  if (normalized.includes('delete')) return 'file_deleted';
  if (normalized.includes('write') || normalized.includes('edit') || normalized.includes('patch')) return 'file_written';
  return 'unknown';
}

export function phaseForPathActivation(kind: PathActivationKind): BehaviorPhase {
  if (['file_read', 'file_diffed', 'directory_listed'].includes(kind)) return 'explore';
  if (['file_written', 'file_created', 'file_deleted'].includes(kind)) return 'fix';
  return 'unknown';
}

export function phaseForCommand(classification: CommandClassification, commandName: string, commandText: string): BehaviorPhase {
  const text = `${commandName} ${commandText}`.toLowerCase();
  if (['test', 'lint', 'build', 'package'].includes(classification)) return 'validate';
  if (['format', 'database', 'deploy', 'cloud'].includes(classification)) return 'fix';
  if (classification === 'inspect') return 'explore';
  if (classification === 'git' && /\b(commit|merge|rebase|push|pull|checkout|switch|branch)\b/.test(text)) return 'fix';
  if (classification === 'git') return 'explore';
  if (/\b(rg|grep|find|sed|cat|ls|pwd|head|tail|wc)\b/.test(text)) return 'explore';
  return 'unknown';
}

function extractPathFacts(toolName: string, value: unknown): PathFact[] {
  const defaultKind = pathActivationKindForTool(toolName);
  const facts = new Map<string, PathFact>();
  collectPathFacts(value, facts, defaultKind);
  return [...facts.values()].filter((fact) => !fact.path.startsWith('-') && !fact.path.includes('\n'));
}

function addPathFact(facts: Map<string, PathFact>, path: string, activationKind: PathActivationKind): void {
  const normalizedPath = normalizeRelativePath(path.trim());
  const key = `${normalizedPath}\0${activationKind}`;
  facts.set(key, { path: normalizedPath, activationKind });
}

function collectPathFacts(
  value: unknown,
  facts: Map<string, PathFact>,
  defaultKind: PathActivationKind,
  key = ''
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPathFacts(item, facts, defaultKind, key);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectPathFacts(childValue, facts, defaultKind, childKey);
    }
    return;
  }
  if (typeof value !== 'string' || !value.trim()) return;
  const normalizedKey = key.toLowerCase();
  if (['path', 'file_path', 'filepath', 'file', 'filename', 'relative_path'].includes(normalizedKey)) {
    addPathFact(facts, value, defaultKind);
  }
  if (normalizedKey === 'patch' || value.includes('*** Begin Patch')) {
    for (const fact of parsePatchPathFacts(value)) {
      addPathFact(facts, fact.path, fact.activationKind);
    }
  }
}

function parsePatchPathFacts(patch: string): PathFact[] {
  const facts: PathFact[] = [];
  const pattern = /^\*\*\* (Update|Add|Delete) File: (.+)$/gm;
  for (const match of patch.matchAll(pattern)) {
    const operation = match[1];
    const path = match[2]?.trim();
    if (!path) continue;
    facts.push({
      path,
      activationKind: patchOperationKind(operation),
    });
  }
  return facts;
}

function patchOperationKind(operation: string): PathActivationKind {
  if (operation === 'Add') return 'file_created';
  if (operation === 'Delete') return 'file_deleted';
  return 'file_written';
}

function runtimeFromPayload(payload: Record<string, unknown>): HookRuntime {
  const metadata = objectValue(payload._lyo);
  const runtime = stringValue(metadata?.runtime);
  if (runtime === 'codex' || runtime === 'gemini' || runtime === 'claude') return runtime;
  return 'codex';
}

function hookJobId(runtime: HookRuntime, sessionId: string, turnId: string | null): string {
  return `${runtime}-job-${sha256(`${sessionId}:${turnId ?? 'session'}`).slice(0, 16)}`;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
