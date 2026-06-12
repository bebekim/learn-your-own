import {
  analyzeTelemetrySemantics,
  parseTelemetryEpisodes,
} from '../../src/index.ts';

export function telemetryAction(overrides = {}) {
  const eventId = overrides.eventId ?? overrides.actionId ?? 'action';
  return {
    actionId: overrides.actionId ?? `act-${eventId}`,
    provenance: {
      eventId,
      eventName: overrides.eventName ?? 'PostToolUse',
      evidenceRef: overrides.evidenceRef ?? `hook:${eventId}`,
      sessionId: overrides.sessionId ?? 'session-fixture',
      runId: overrides.runId ?? 'turn-fixture',
      cwd: overrides.cwd ?? '/tmp/project',
      createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
      ordinal: overrides.ordinal ?? 0,
      ...overrides.provenance,
    },
    eventKind: overrides.eventKind ?? 'tool_use',
    operation: overrides.operation ?? 'observe',
    intent: overrides.intent ?? 'inspect',
    resources: overrides.resources ?? { read: [], written: [] },
    risk: overrides.risk ?? 'none',
    status: overrides.status ?? 'succeeded',
    facets: overrides.facets ?? ['local', 'read_only'],
    confidence: overrides.confidence ?? 'high',
    command: overrides.command,
  };
}

export function telemetryToken(overrides = {}) {
  const action = telemetryAction(overrides.action ?? overrides);
  return {
    kind: overrides.kind ?? 'INSPECT',
    provenance: overrides.provenance ?? action.provenance,
    command: overrides.command ?? action.command,
    paths: overrides.paths,
  };
}

export function telemetryAst(overrides = {}) {
  const actions = overrides.actions ?? [];
  const tokens = overrides.tokens ?? actions.map((action) => telemetryToken({
    action,
    kind: tokenKindForAction(action),
    command: action.command,
    paths: [
      ...action.resources.read.filter((resource) => resource.type === 'local_file').map((resource) => resource.ref),
      ...action.resources.written.filter((resource) => resource.type === 'local_file').map((resource) => resource.ref),
    ],
  }));
  return {
    runId: overrides.runId ?? actions[0]?.provenance.runId ?? tokens[0]?.provenance.runId ?? 'turn-fixture',
    actions,
    tokens,
    episodes: overrides.episodes ?? parseTelemetryEpisodes(tokens),
  };
}

export function compiledTelemetryRun(overrides = {}) {
  const ast = telemetryAst(overrides);
  return {
    ...ast,
    semantic: overrides.semantic ?? analyzeTelemetrySemantics(ast),
  };
}

function tokenKindForAction(action) {
  if (action.eventKind === 'boundary') {
    return action.provenance.eventName === 'Stop' ? 'STOP' : 'PROMPT';
  }
  if (action.intent === 'verify' || action.facets.includes('test')) return 'TEST';
  if (action.intent === 'build') return 'BUILD';
  if (action.intent === 'version' || action.facets.includes('git')) return 'GIT';
  if (
    action.intent === 'deploy' ||
    action.operation === 'mutate_external' ||
    action.facets.includes('deploy') ||
    action.facets.includes('external')
  ) return 'EXTERNAL';
  if (
    action.operation === 'mutate_local' ||
    action.resources.written.length > 0 ||
    action.facets.includes('write')
  ) return 'EDIT';
  return 'INSPECT';
}
