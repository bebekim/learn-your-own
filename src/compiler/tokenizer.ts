import type { LearningKernel } from '../ledger.ts';
import { extractHookFacts } from '../hooks/normalizer.ts';
import type { CommandClassification, CommandStatus } from '../types/activation.ts';
import {
  finalizeCommandResources,
  inferPreOperationCommandResources,
} from './tokenizer/command-resources.ts';
import type {
  NormalizedAction,
  TelemetryToken,
  TokenKind,
  TokenProvenance,
  EventKind,
  OperationKind,
  IntentKind,
  ResourceRef,
  RiskClass,
  ActionStatus,
  FacetKind,
} from './syntax.ts';

interface HookEventRow {
  event_id: string;
  session_id: string;
  turn_id: string | null;
  event_name: string;
  cwd: string;
  created_at: string;
  payload_json: string;
}

export function tokenizeTelemetryActions(
  kernel: LearningKernel,
  input: { runId: string }
): NormalizedAction[] {
  const { runId } = input;

  // 1. Fetch relevant hook events (first try turn_id, then fallback to session_id with null turn_id)
  let events = kernel.db.prepare(`
    select event_id, session_id, turn_id, event_name, cwd, created_at, payload_json
    from hook_events
    where turn_id = ?
    order by created_at asc, event_id asc
  `).all(runId) as unknown as HookEventRow[];

  if (events.length === 0) {
    events = kernel.db.prepare(`
      select event_id, session_id, turn_id, event_name, cwd, created_at, payload_json
      from hook_events
      where session_id = ? and turn_id is null
      order by created_at asc, event_id asc
    `).all(runId) as unknown as HookEventRow[];
  }

  // 2. Scan events to build a list of completed tool calls (both by ID and by fallback tool/cmd name)
  const completedToolUseIds = new Set<string>();
  const completedTools = new Map<string, string[]>();

  for (const event of events) {
    if (
      ['PostToolUse', 'tool.after', 'PostToolUseFailure', 'tool.failure'].includes(event.event_name)
    ) {
      try {
        const payload = JSON.parse(event.payload_json);
        if (payload.tool_use_id) {
          completedToolUseIds.add(String(payload.tool_use_id));
        } else if (payload.tool_name) {
          const toolName = String(payload.tool_name);
          const toolInput = payload.tool_input && typeof payload.tool_input === 'object'
            ? payload.tool_input as Record<string, unknown>
            : {};
          const cmdText = String(toolInput.command ?? toolInput.cmd ?? toolInput.script ?? '');
          
          if (!completedTools.has(toolName)) {
            completedTools.set(toolName, []);
          }
          completedTools.get(toolName)!.push(cmdText);
        }
      } catch {}
    }
  }

  const actions: NormalizedAction[] = [];
  let ordinal = 0;

  for (const event of events) {
    // Ignore PreToolUse/tool.before if we have a corresponding Post event to prevent duplicate tokens
    if (['PreToolUse', 'tool.before'].includes(event.event_name)) {
      let toolUseId: string | null = null;
      let toolName: string | null = null;
      let cmdText = '';

      try {
        const payload = JSON.parse(event.payload_json);
        if (payload.tool_use_id) {
          toolUseId = String(payload.tool_use_id);
        }
        toolName = payload.tool_name ? String(payload.tool_name) : null;
        const toolInput = payload.tool_input && typeof payload.tool_input === 'object'
          ? payload.tool_input as Record<string, unknown>
          : {};
        cmdText = String(toolInput.command ?? toolInput.cmd ?? toolInput.script ?? '');
      } catch {}

      if (toolUseId && completedToolUseIds.has(toolUseId)) {
        continue;
      }

      if (!toolUseId && toolName && completedTools.has(toolName)) {
        const cmdList = completedTools.get(toolName)!;
        const matchIdx = cmdList.indexOf(cmdText);
        if (matchIdx !== -1) {
          cmdList.splice(matchIdx, 1);
          continue;
        }
      }
    }

    if (['SessionStart', 'session.start'].includes(event.event_name)) {
      continue;
    }

    const isPrompt = ['UserPromptSubmit', 'prompt.submit'].includes(event.event_name);
    const isStop = ['Stop', 'turn.stop', 'session.end'].includes(event.event_name);

    const extracted = extractHookFacts({
      eventId: event.event_id,
      sessionId: event.session_id,
      turnId: event.turn_id,
      eventName: event.event_name,
      cwd: event.cwd,
      payloadJson: event.payload_json,
    });

    const commandFacts = extracted.commands;
    const pathFacts = extracted.paths;

    if (!isPrompt && !isStop && commandFacts.length === 0 && pathFacts.length === 0) {
      continue;
    }

    const provenance: TokenProvenance = {
      eventId: event.event_id,
      eventName: event.event_name,
      evidenceRef: `hook:${event.event_id}`,
      sessionId: event.session_id,
      runId: event.turn_id ?? event.session_id,
      cwd: event.cwd,
      createdAt: event.created_at,
      ordinal: ordinal++,
    };

    if (extracted.payload.tool_use_id) {
      provenance.toolUseId = String(extracted.payload.tool_use_id);
    }

    const actionId = `act-${event.event_id}`;

    if (isPrompt) {
      actions.push({
        actionId,
        provenance,
        eventKind: 'boundary',
        operation: 'boundary',
        intent: 'unknown',
        resources: { read: [], written: [] },
        risk: 'none',
        status: 'succeeded',
        facets: [],
        confidence: 'high',
      });
      continue;
    }

    if (isStop) {
      actions.push({
        actionId,
        provenance,
        eventKind: 'boundary',
        operation: 'boundary',
        intent: 'unknown',
        resources: { read: [], written: [] },
        risk: 'none',
        status: 'succeeded',
        facets: [],
        confidence: 'high',
      });
      continue;
    }

    const readResources: ResourceRef[] = [];
    const writtenResources: ResourceRef[] = [];

    for (const pathFact of pathFacts) {
      const isWrite = ['file_written', 'file_created', 'file_deleted'].includes(pathFact.activationKind);
      const res: ResourceRef = {
        type: 'local_file',
        ref: pathFact.path,
      };
      if (isWrite) {
        writtenResources.push(res);
      } else {
        readResources.push(res);
      }
    }

    let eventKind: EventKind = 'tool_use';
    if (event.event_name.includes('permission') || event.event_name.includes('approval') || event.event_name.includes('request')) {
      eventKind = 'approval';
    }

    if (commandFacts.length > 0) {
      for (const cmd of commandFacts) {
        const normalizedArgv = cmd.argv.toLowerCase();
        const cmdNameLower = cmd.commandName.toLowerCase();

        const inferredResources = inferPreOperationCommandResources({
          commandClassification: cmd.classification,
          commandStatus: cmd.status,
          argv: cmd.argv,
          argvSummary: cmd.argvSummary,
          readResources,
          writtenResources,
          isPackageRegistryInspect: isPackageRegistryInspectCommand(normalizedArgv),
          isPackagePublish: isPackagePublishCommand(normalizedArgv),
          isDockerComposeMutation: isDockerComposeMutationCommand(normalizedArgv),
        });
        let read = inferredResources.read;
        let written = inferredResources.written;

        // Determine primary operation
        let operation: OperationKind = 'unknown';
        if (isDestructiveCommand(normalizedArgv)) {
          operation = 'mutate_local';
        } else if (cmd.classification === 'deploy' || cmd.classification === 'cloud' || /^(databricks|railway)\b/.test(normalizedArgv)) {
          operation = 'mutate_external';
        } else if (isPackagePublishCommand(normalizedArgv)) {
          operation = 'mutate_external';
        } else if (isVerifyCommand(cmd.classification, normalizedArgv)) {
          operation = 'verify';
        } else if (isBuildCommand(cmd.classification, normalizedArgv)) {
          operation = 'build';
        } else if (cmd.classification === 'git' || cmdNameLower === 'git') {
          operation = 'version_control';
        } else if (eventKind === 'approval') {
          operation = 'approve';
        } else if (
          written.length > 0 ||
          (isTextProcessingCommand(cmdNameLower, normalizedArgv) && textProcessingCommandWrites(cmdNameLower, normalizedArgv)) ||
          isLocalWriteCommand(cmdNameLower, normalizedArgv)
        ) {
          operation = 'mutate_local';
        } else if (
          read.length > 0 ||
          isReadOnlyInspectCommand(cmdNameLower, normalizedArgv) ||
          (isTextProcessingCommand(cmdNameLower, normalizedArgv) && !textProcessingCommandWrites(cmdNameLower, normalizedArgv))
        ) {
          operation = 'observe';
        }

        ({ read, written } = finalizeCommandResources({
          read,
          written,
          operation,
          parsedPaths: inferredResources.parsedPaths,
        }));

        // Determine Risk
        let risk: RiskClass = 'none';
        if (isDestructiveCommand(normalizedArgv)) {
          risk = 'destructive';
        } else if (referencesCredential(normalizedArgv)) {
          risk = 'credential_sensitive';
        } else if (cmd.classification === 'deploy' || cmd.classification === 'cloud' || /^(databricks|railway)\b/.test(normalizedArgv)) {
          risk = 'deploy';
        } else if (isPackagePublishCommand(normalizedArgv)) {
          risk = 'external_write';
        } else if (operation === 'mutate_local') {
          risk = 'low';
        }

        // Determine Intent & Inference Details
        let intent: IntentKind = 'unknown';
        let confidence: 'low' | 'medium' | 'high' = 'high';
        let rule = 'default';
        let rationale = 'Default tool execution';

        if (isVerifyCommand(cmd.classification, normalizedArgv)) {
          intent = 'verify';
          confidence = cmd.classification === 'test' ? 'high' : 'medium';
          rule = 'test_heuristic';
          rationale = 'Identified test signature or category';
        } else if (isBuildCommand(cmd.classification, normalizedArgv)) {
          intent = 'build';
          confidence = cmd.classification === 'build' ? 'high' : 'medium';
          rule = 'build_heuristic';
          rationale = 'Identified build signature or category';
        } else if (cmd.classification === 'git' || cmdNameLower === 'git' || /^(git status|git diff|git log|git show|git)\b/.test(normalizedArgv)) {
          intent = 'version';
          confidence = 'high';
          rule = 'git_classification';
          rationale = 'Identified git classification or signature';
        } else if (cmd.classification === 'deploy' || cmd.classification === 'cloud' || /^(databricks|railway)\b/.test(normalizedArgv)) {
          intent = 'deploy';
          confidence = 'high';
          rule = 'deploy_classification';
          rationale = 'Identified deploy or cloud classification';
        } else if (isPackagePublishCommand(normalizedArgv)) {
          intent = 'deploy';
          confidence = 'high';
          rule = 'package_publish';
          rationale = 'Publishes package artifacts to an external registry';
        } else if (written.length > 0) {
          intent = 'implement';
          confidence = 'high';
          rule = 'write_effect';
          rationale = 'Wrote to local resources';
        } else if (read.length > 0 || isReadOnlyInspectCommand(cmdNameLower, normalizedArgv)) {
          intent = 'inspect';
          confidence = 'high';
          rule = 'read_effect';
          rationale = 'Read local resources or executed query commands';
        } else if (/\bhealth\b/.test(normalizedArgv)) {
          intent = 'verify';
          confidence = 'medium';
          rule = 'healthcheck_heuristic';
          rationale = 'Ambiguous inspect vs verify resolved as verify via healthcheck keyword';
        }

        const facets: FacetKind[] = [];
        if (cmd.classification === 'git' || /git/.test(normalizedArgv)) facets.push('git');
        if (isVerifyCommand(cmd.classification, normalizedArgv)) facets.push('test');
        if (
          isBuildCommand(cmd.classification, normalizedArgv) ||
          isPackageCommand(normalizedArgv) ||
          /build|make|pack/.test(normalizedArgv)
        ) facets.push('package');
        if (isDatabaseCommand(normalizedArgv)) facets.push('database');

        let isLocal = true;
        if (cmd.classification === 'deploy' || cmd.classification === 'cloud' || /railway|databricks|aws|gcloud|deploy/.test(normalizedArgv)) {
          isLocal = false;
          facets.push('deploy');
          facets.push('cloud');
          facets.push('external');
        }
        if (/\b(curl|wget)\b/.test(normalizedArgv)) {
          isLocal = false;
          facets.push('network');
          facets.push('external');
        }
        if (isPackageRegistryInspectCommand(normalizedArgv) || isPackagePublishCommand(normalizedArgv)) {
          isLocal = false;
          facets.push('network');
          facets.push('external');
        }
        if (isPackagePublishCommand(normalizedArgv)) {
          facets.push('deploy');
        }
        if (isLocal) {
          facets.push('local');
        }

        if (isDestructiveCommand(normalizedArgv)) facets.push('destructive');
        if (referencesCredential(normalizedArgv)) facets.push('credential_sensitive');
        if (written.length > 0 || operation === 'mutate_local' || operation === 'mutate_external') {
          facets.push('write');
        } else {
          facets.push('read_only');
        }
        if (/\bhealth\b/.test(normalizedArgv)) facets.push('healthcheck');

        const exitCode = extractExitCode(extracted.payload);
        const status: ActionStatus = isAttemptOnlyEvent(event.event_name) ? 'attempted' : (cmd.status as ActionStatus);

        actions.push({
          actionId: `${actionId}-${cmd.commandName}`,
          provenance,
          eventKind,
          operation,
          intent,
          resources: { read, written },
          risk,
          status,
          facets,
          confidence,
          inference: { rule, rationale },
          command: {
            name: cmd.commandName,
            argvSummary: cmd.argvSummary,
            exitCode,
            outputSize: cmd.outputSize,
          },
        });
      }
    } else if (pathFacts.length > 0) {
      const hasWrite = pathFacts.some((f) => 
        ['file_written', 'file_created', 'file_deleted'].includes(f.activationKind)
      );
      const operation = hasWrite ? 'mutate_local' : 'observe';
      const intent = hasWrite ? 'implement' : 'inspect';
      const facets: FacetKind[] = hasWrite ? ['write', 'local'] : ['read_only', 'local'];

      actions.push({
        actionId,
        provenance,
        eventKind,
        operation,
        intent,
        resources: { read: readResources, written: writtenResources },
        risk: hasWrite ? 'low' : 'none',
        status: 'succeeded',
        facets,
        confidence: 'high',
      });
    }
  }

  return actions;
}

export function deriveTelemetryTokens(actions: NormalizedAction[]): TelemetryToken[] {
  return actions.map((action) => {
    let kind: TokenKind = 'INSPECT';

    if (action.eventKind === 'boundary') {
      if (action.provenance.eventName && ['Stop', 'turn.stop', 'session.end'].includes(action.provenance.eventName)) {
        kind = 'STOP';
      } else {
        kind = 'PROMPT';
      }
    } else if (action.intent === 'verify' || action.facets.includes('test')) {
      kind = 'TEST';
    } else if (action.intent === 'build') {
      kind = 'BUILD';
    } else if (action.intent === 'version' || action.facets.includes('git')) {
      kind = 'GIT';
    } else if (action.intent === 'deploy' || action.operation === 'mutate_external' || action.facets.includes('deploy') || action.facets.includes('external')) {
      kind = 'EXTERNAL';
    } else if (action.operation === 'mutate_local' || action.resources.written.length > 0 || action.facets.includes('write')) {
      kind = 'EDIT';
    } else if (action.operation === 'observe' || action.resources.read.length > 0 || action.facets.includes('read_only')) {
      kind = 'INSPECT';
    }

    const command = action.command ? {
      name: action.command.name,
      argvSummary: action.command.argvSummary,
      status: action.status as CommandStatus,
      exitCode: action.command.exitCode,
      outputSize: action.command.outputSize,
    } : undefined;

    const paths = [
      ...action.resources.read.filter(r => r.type === 'local_file').map(r => r.ref),
      ...action.resources.written.filter(r => r.type === 'local_file').map(r => r.ref),
    ];

    return {
      kind,
      provenance: action.provenance,
      command,
      paths: paths.length > 0 ? Array.from(new Set(paths)).sort() : undefined,
    };
  });
}

export function tokenizeTelemetryRun(
  kernel: LearningKernel,
  input: { runId: string }
): TelemetryToken[] {
  return deriveTelemetryTokens(tokenizeTelemetryActions(kernel, input));
}

function isLocalWriteCommand(name: string, argv: string): boolean {
  return /\b(apply_patch|patch|mkdir|touch|rm|rmdir|mv|cp|ln|chmod|chown|truncate|install|tee|write_file|edit)\b/.test(argv) ||
    ['apply_patch', 'patch'].includes(name) ||
    isSqliteMutatingCommand(argv) ||
    isDockerComposeMutationCommand(argv) ||
    /\bxcodegen\s+generate\b/.test(argv);
}

function isDestructiveCommand(command: string): boolean {
  const normalized = command.toLowerCase();
  return /\brm\b/.test(normalized)
    || /\bdelete\b/.test(normalized)
    || /\bdrop\s+(table|database|schema)\b/.test(normalized)
    || /\btruncate\s+table\b/.test(normalized)
    || /\bgit\s+reset\s+--hard\b/.test(normalized)
    || /\bgit\s+push\b.*\b--force\b/.test(normalized)
    || /\bdocker\s+volume\s+rm\b/.test(normalized);
}

function referencesCredential(command: string): boolean {
  return /\b(password|passwd|secret|token|api[_-]?key|credential|private[_-]?key)\b/i.test(command)
    || /(^|\s)\.env(\s|$|\/)/.test(command);
}

function isVerifyCommand(classification: CommandClassification, normalizedArgv: string): boolean {
  if (['test', 'lint', 'format'].includes(classification)) return true;
  return /\b(pytest|jest|vitest|mocha|rspec|ctest)\b/.test(normalizedArgv)
    || /\b(go|cargo|mvn|gradle)\s+test\b/.test(normalizedArgv)
    || /\bcargo\s+(check|clippy)\b/.test(normalizedArgv)
    || /\bruff\s+check\b/.test(normalizedArgv)
    || /\bmypy\b/.test(normalizedArgv)
    || /\bxcodebuild\b[^|;&]*\btest\b/.test(normalizedArgv)
    || /\bswift\s+test\b/.test(normalizedArgv)
    || /\b(node)\s+--test\b/.test(normalizedArgv)
    || /\bnode\s+--check\b/.test(normalizedArgv)
    || /\bdbt\s+(parse|test)\b/.test(normalizedArgv)
    || isEmacsBatchVerifyCommand(normalizedArgv)
    || /\b(npm|pnpm|yarn|bun)\s+test\b/.test(normalizedArgv)
    || /\b(npm|pnpm|yarn|bun)\s+run\s+(test|typecheck|type-check|check|lint|verify)\b/.test(normalizedArgv)
    || (/\btsc\b/.test(normalizedArgv) && /--no-?emit\b/.test(normalizedArgv));
}

function isBuildCommand(classification: CommandClassification, normalizedArgv: string): boolean {
  if (classification === 'build') return true;
  return /\b(tsc|cargo build|mvn compile|go build|make|cmake)\b/.test(normalizedArgv)
    || /\bxcodebuild\b[^|;&]*\bbuild\b/.test(normalizedArgv)
    || /\bswift\s+build\b/.test(normalizedArgv)
    || /\bdbt\s+(build|compile)\b/.test(normalizedArgv)
    || isEmacsBatchBuildCommand(normalizedArgv)
    || /\b(npm|pnpm|yarn|bun)\s+run\s+(build|compile|bundle|pack(?::local)?)\b/.test(normalizedArgv)
    || /\bnpm\s+pack\b/.test(normalizedArgv)
    || /\bnode\s+scripts\/[^|;&\s]*(build|pack|bundle|compile|release)[^|;&\s]*\.(mjs|js|cjs|ts)\b/.test(normalizedArgv)
    || isArchiveCreateCommand(normalizedArgv);
}

function isReadOnlyInspectCommand(normalizedName: string, normalizedArgv: string): boolean {
  if (hasOutputRedirect(normalizedArgv)) return false;
  if (isArchiveInspectCommand(normalizedArgv)) return true;
  if (isSqliteReadOnlyCommand(normalizedArgv)) return true;
  if (isPackageInspectCommand(normalizedArgv)) return true;
  if (isLocalCliInspectCommand(normalizedArgv)) return true;
  if (isAppleSimulatorInspectCommand(normalizedArgv)) return true;
  if (isTimestampInspectCommand(normalizedName, normalizedArgv)) return true;
  if (isEmacsBatchInspectCommand(normalizedArgv)) return true;
  if (isShellEmitCommand(normalizedName, normalizedArgv)) return true;
  if (isHelpOrVersionCommand(normalizedArgv)) return true;
  if (isTextProcessingCommand(normalizedName, normalizedArgv) && textProcessingCommandWrites(normalizedName, normalizedArgv)) {
    return false;
  }
  if (isTextProcessingCommand(normalizedName, normalizedArgv)) return true;
  return /\b(pwd|ls|find|rg|grep|zgrep|cat|less|head|tail|nl|wc|file|stat|du|tree|which|type|printenv|lsof|ps|pgrep|netstat|ss|sort|uniq|cut|tr|jq|strings)\b/.test(normalizedArgv)
    || /\bcommand\s+-v\b/.test(normalizedArgv);
}

function isArchiveInspectCommand(normalizedArgv: string): boolean {
  return /\btar\s+[^|;&]*-[a-z]*t[a-z]*\b/.test(normalizedArgv)
    || /\bunzip\s+[^|;&]*-l\b/.test(normalizedArgv)
    || /\bzipinfo\b/.test(normalizedArgv);
}

function isArchiveCreateCommand(normalizedArgv: string): boolean {
  return /\btar\s+[^|;&]*-[a-z]*c[a-z]*\b/.test(normalizedArgv)
    || /\bzip\s+[^|;&]*\S/.test(normalizedArgv);
}

function isDatabaseCommand(normalizedArgv: string): boolean {
  return /\b(sqlite3|dbt)\b/.test(normalizedArgv);
}

function isPackageCommand(normalizedArgv: string): boolean {
  return /\b(npm|pnpm|yarn|bun|uv)\b/.test(normalizedArgv);
}

function isPackageInspectCommand(normalizedArgv: string): boolean {
  return /\b(npm|pnpm|yarn|bun)\s+(view|info|show|search|list|ls|outdated|why)\b/.test(normalizedArgv)
    || /\buv\s+(tool\s+)?(list|tree|pip\s+list|pip\s+show)\b/.test(normalizedArgv);
}

function isPackageRegistryInspectCommand(normalizedArgv: string): boolean {
  return /\b(npm|pnpm|yarn|bun)\s+(view|info|show|search|outdated)\b/.test(normalizedArgv);
}

function isPackagePublishCommand(normalizedArgv: string): boolean {
  return /\b(npm|pnpm|yarn|bun)\s+publish\b/.test(normalizedArgv);
}

function isLocalCliInspectCommand(normalizedArgv: string): boolean {
  return /\blyo\s+(report|audit)\b/.test(normalizedArgv)
    || /\bnode\s+\S*(?:src\/cli\.ts|dist\/npm\/package\/src\/cli\.js)\s+(report|audit)\b/.test(normalizedArgv);
}

function isAppleSimulatorInspectCommand(normalizedArgv: string): boolean {
  return /\bxcrun\s+simctl\s+list\b/.test(normalizedArgv);
}

function isTimestampInspectCommand(normalizedName: string, normalizedArgv: string): boolean {
  return normalizedName === 'date' || /^date(\s|$)/.test(normalizedArgv);
}

function isShellEmitCommand(normalizedName: string, normalizedArgv: string): boolean {
  return normalizedName === 'printf'
    || normalizedName === 'echo'
    || /(^|\s)(printf|echo)(\s|$)/.test(normalizedArgv);
}

function isHelpOrVersionCommand(normalizedArgv: string): boolean {
  return /(^|\s)(--help|-h|help)(\s|$)/.test(normalizedArgv)
    || /(^|\s)(version|--version|-v)\s*$/.test(normalizedArgv);
}

function isSqliteReadOnlyCommand(normalizedArgv: string): boolean {
  return /\bsqlite3\b/.test(normalizedArgv)
    && !isSqliteMutatingCommand(normalizedArgv)
    && (
      /\b(select|pragma|explain|with)\b/.test(normalizedArgv)
      || /\.(schema|tables|indexes|indices|databases|show|dump)\b/.test(normalizedArgv)
    );
}

function isSqliteMutatingCommand(normalizedArgv: string): boolean {
  return /\bsqlite3\b/.test(normalizedArgv)
    && (
      /\b(insert|update|delete|replace|create|alter|drop|vacuum|reindex|attach|detach)\b/.test(normalizedArgv)
      || /\.(read|import|restore|backup|save|output)\b/.test(normalizedArgv)
    );
}

function isDockerComposeMutationCommand(normalizedArgv: string): boolean {
  return /\bdocker\s+compose\s+up\b/.test(normalizedArgv)
    || /\bdocker-compose\s+up\b/.test(normalizedArgv);
}

function isEmacsBatchBuildCommand(normalizedArgv: string): boolean {
  return /\bemacs\b/.test(normalizedArgv)
    && /\s--batch\b/.test(normalizedArgv)
    && /\bbatch-byte-compile\b/.test(normalizedArgv);
}

function isEmacsBatchVerifyCommand(normalizedArgv: string): boolean {
  return /\bemacs\b/.test(normalizedArgv)
    && /\s--batch\b/.test(normalizedArgv)
    && /\bparse\s+ok\b/.test(normalizedArgv);
}

function isEmacsBatchInspectCommand(normalizedArgv: string): boolean {
  return /\bemacs\b/.test(normalizedArgv)
    && /\s--batch\b/.test(normalizedArgv)
    && !isEmacsBatchBuildCommand(normalizedArgv)
    && !/\b(package-refresh-contents|package-install|package-vc-install|write-file|write-region|delete-file)\b/.test(normalizedArgv)
    && /(\bmessage\b|\bprinc\b|\bwhere-is-internal\b|\bkey-binding\b|\blocate-library\b|\bfeaturep\b|\bbound-and-true-p\b|\bload-path\b)/.test(normalizedArgv);
}

function isAttemptOnlyEvent(eventName: string): boolean {
  return eventName === 'PreToolUse'
    || eventName === 'tool.before'
    || eventName === 'PermissionRequest'
    || eventName === 'permission.request';
}

function isTextProcessingCommand(normalizedName: string, normalizedArgv: string): boolean {
  return ['sed', 'awk', 'perl'].includes(normalizedName)
    || /(^|\s)(sed|awk|perl)(\s|$)/.test(normalizedArgv);
}

function textProcessingCommandWrites(normalizedName: string, normalizedArgv: string): boolean {
  if (['sed', 'perl'].includes(normalizedName) && /(^|\s)-i(?:\s|$|['".a-z])/.test(normalizedArgv)) {
    return true;
  }
  return hasOutputRedirect(normalizedArgv);
}

function hasOutputRedirect(normalizedArgv: string): boolean {
  const unquotedArgv = normalizedArgv.replace(/"[^"]*"|'[^']*'/g, '');
  return /(^|[^0-9])>>?\s*[^&\s]/.test(unquotedArgv)
    || /(^|\s)&>\s*\S/.test(unquotedArgv)
    || /\|\s*tee(?:\s|$)/.test(unquotedArgv);
}

function extractExitCode(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const exitCode = extractExitCode(item);
      if (exitCode !== null) return exitCode;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (['exitcode', 'returncode'].includes(normalizedKey) && typeof child === 'number') {
      return child;
    }
  }
  for (const child of Object.values(value)) {
    const exitCode = extractExitCode(child);
    if (exitCode !== null) return exitCode;
  }
  return null;
}
