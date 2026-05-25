import { createHash } from 'node:crypto';
import { summarizeCommand } from '../behavior/commands.ts';
import type {
  ActivationConfidence,
  BehaviorPhase,
  CommandClassification,
  CommandStatus,
  PathActivationKind,
  RecordDeploymentActionInput,
} from '../types/activation.ts';
import type { HookRuntime } from './events.ts';

export interface HookEventForNormalization {
  eventId: string;
  sessionId: string;
  turnId: string | null;
  eventName: string;
  cwd: string;
  payloadJson: string;
}

export interface ExtractedHookDeployment {
  provider: string | null;
  environment: string | null;
  target: string | null;
  status: NonNullable<RecordDeploymentActionInput['status']>;
}

export interface ExtractedHookCommand {
  commandName: string;
  commandFamily: string;
  workingDirectory: string;
  argv: string;
  argvSummary: string;
  classification: CommandClassification;
  status: CommandStatus;
  phase: BehaviorPhase;
  outputSize: number;
  deployment: ExtractedHookDeployment | null;
}

export interface ExtractedHookPath {
  path: string;
  activationKind: PathActivationKind;
  confidence: ActivationConfidence;
  phase: BehaviorPhase;
}

export interface ExtractedHookFacts {
  jobId: string;
  evidenceRef: string;
  runtime: HookRuntime;
  payload: Record<string, unknown>;
  toolName: string | null;
  commands: ExtractedHookCommand[];
  paths: ExtractedHookPath[];
}

interface PathFact {
  path: string;
  activationKind: PathActivationKind;
}

export function extractHookFacts(event: HookEventForNormalization): ExtractedHookFacts {
  const payload = parseJsonObject(event.payloadJson);
  const runtime = runtimeFromPayload(payload);
  const toolName = stringValue(payload.tool_name);
  const toolInputRaw = payload.tool_input;
  const toolInput = objectValue(toolInputRaw);
  const commands: ExtractedHookCommand[] = [];

  if (toolName && isShellTool(toolName)) {
    const commandText = extractCommandText(toolInput);
    if (commandText) {
      const commandName = firstCommandToken(commandText);
      const status = inferHookCommandStatus(event.eventName, payload);
      commands.push({
        commandName,
        commandFamily: commandName,
        workingDirectory: event.cwd,
        argv: commandText,
        argvSummary: summarizeCommand(commandText),
        classification: 'unknown',
        status,
        phase: 'unknown',
        outputSize: estimateToolOutputSize(payload),
        deployment: null,
      });
    }
  }

  const paths = toolName
    ? extractPathFacts(toolName, toolInputRaw).map((fact) => ({
        path: fact.path,
        activationKind: fact.activationKind,
        confidence: 'medium' as const,
        phase: 'unknown' as const,
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

function pathActivationKindForTool(toolName: string): PathActivationKind {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('read')) return 'file_read';
  if (normalized.includes('ls') || normalized.includes('list')) return 'directory_listed';
  if (normalized.includes('delete')) return 'file_deleted';
  if (normalized.includes('write') || normalized.includes('edit') || normalized.includes('patch')) return 'file_written';
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
