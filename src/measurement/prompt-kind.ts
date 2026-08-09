import type { LearningKernel } from '../ledger.ts';
import type { PromptKind } from '../types/observation.ts';

const RETRY_JACCARD_THRESHOLD = 0.5;
const FLAT_MARGIN = Math.log(2);
const DECISIVE_MARGIN = Math.log(10);

interface PromptRow {
  prompt_id: string;
  session_id: string;
  prompt_index: number;
  prompt_kind: PromptKind;
  prompt_summary: string | null;
}

interface EvidenceRow {
  prompt_id: string;
  kind: PromptKind;
  method: string;
  log_lr: number;
}

interface SessionRow {
  session_id: string;
  ended_at: string | null;
}

export interface PromptKindReport {
  coverage: {
    userPrompts: number;
    withEvidence: number;
    withMultipleMethods: number;
  };
  flips: {
    flipped: number;
    unflipped: number;
    byKind: Record<string, number>;
  };
  methodConcordance: Record<string, { prompts: number; agreeing: number; rate: number | null }>;
  margins: {
    flat: number;
    moderate: number;
    decisive: number;
  };
  behavior: {
    retries: number;
    terminalAssistantTurns: number;
    sessionsWithEndedAt: number;
    retryRateFlipped: number | null;
    retryRateUnflipped: number | null;
  };
  cost: {
    total: number;
    byTurn: Record<string, number>;
    unattributed: number;
    sessions: Record<string, number>;
  };
}

export function buildPromptKindReport(kernel: LearningKernel): PromptKindReport {
  const prompts = kernel.db.prepare(`
    select prompt_id, session_id, prompt_index, prompt_kind, prompt_summary
    from session_prompts
    where prompt_role = 'user'
    order by session_id, prompt_index
  `).all() as unknown as PromptRow[];
  const evidence = kernel.db.prepare(`
    select prompt_id, kind, method, log_lr
    from prompt_kind_evidence
    order by prompt_id, evidence_id
  `).all() as unknown as EvidenceRow[];
  const sessions = kernel.db.prepare(`
    select session_id, ended_at from agent_sessions
  `).all() as unknown as SessionRow[];
  const lastRoles = kernel.db.prepare(`
    select session_id, prompt_role
    from session_prompts
    where (session_id, prompt_index) in (
      select session_id, max(prompt_index) from session_prompts group by session_id
    )
  `).all() as unknown as { session_id: string; prompt_role: string }[];

  const evidenceByPrompt = new Map<string, EvidenceRow[]>();
  for (const row of evidence) {
    const rows = evidenceByPrompt.get(row.prompt_id) ?? [];
    rows.push(row);
    evidenceByPrompt.set(row.prompt_id, rows);
  }

  const contentMethods = (rows: EvidenceRow[]) =>
    new Set(rows.filter((row) => row.method !== 'positional').map((row) => row.method));

  // A flip requires later content evidence (contextual, correction, outcome) to
  // have caused the change: the stored kind must be one the later evidence
  // actually voted for, and differ from the heuristic vote. Positional
  // dominance (index-0 direction_setting) is not a flip.
  const flippedByPromptId = new Map<string, boolean>();
  for (const prompt of prompts) {
    const rows = evidenceByPrompt.get(prompt.prompt_id) ?? [];
    const heuristic = rows.find((row) => row.method === 'heuristic');
    const laterKinds = new Set(
      rows.filter((row) => row.method !== 'heuristic' && row.method !== 'positional')
        .map((row) => row.kind)
    );
    flippedByPromptId.set(
      prompt.prompt_id,
      heuristic !== undefined && prompt.prompt_kind !== heuristic.kind && laterKinds.has(prompt.prompt_kind)
    );
  }

  const flips: PromptKindReport['flips'] = { flipped: 0, unflipped: 0, byKind: {} };
  for (const prompt of prompts) {
    const rows = evidenceByPrompt.get(prompt.prompt_id) ?? [];
    if (!rows.some((row) => row.method === 'heuristic')) continue;
    if (flippedByPromptId.get(prompt.prompt_id)) {
      flips.flipped += 1;
      flips.byKind[prompt.prompt_kind] = (flips.byKind[prompt.prompt_kind] ?? 0) + 1;
    } else {
      flips.unflipped += 1;
    }
  }

  // Inter-method concordance: on prompts where multiple content methods voted,
  // do independent methods agree? This avoids the structural bias of measuring
  // agreement with the final belief, which just restates the LR ordering.
  const methodConcordance: PromptKindReport['methodConcordance'] = {};
  for (const prompt of prompts) {
    const rows = evidenceByPrompt.get(prompt.prompt_id) ?? [];
    const kindsByMethod = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.method === 'positional') continue;
      const kinds = kindsByMethod.get(row.method) ?? new Set<string>();
      kinds.add(row.kind);
      kindsByMethod.set(row.method, kinds);
    }
    const methods = [...kindsByMethod.keys()].sort();
    for (let left = 0; left < methods.length; left += 1) {
      for (let right = left + 1; right < methods.length; right += 1) {
        const key = `${methods[left]}×${methods[right]}`;
        const entry = methodConcordance[key] ?? { prompts: 0, agreeing: 0, rate: null };
        entry.prompts += 1;
        const leftKinds = kindsByMethod.get(methods[left]) ?? new Set<string>();
        const rightKinds = kindsByMethod.get(methods[right]) ?? new Set<string>();
        if ([...leftKinds].some((kind) => rightKinds.has(kind))) entry.agreeing += 1;
        methodConcordance[key] = entry;
      }
    }
  }
  for (const entry of Object.values(methodConcordance)) {
    entry.rate = entry.prompts === 0 ? null : entry.agreeing / entry.prompts;
  }

  const margins: PromptKindReport['margins'] = { flat: 0, moderate: 0, decisive: 0 };
  for (const prompt of prompts) {
    const rows = evidenceByPrompt.get(prompt.prompt_id) ?? [];
    if (rows.length === 0) continue;
    const logOddsByKind = new Map<string, number>();
    for (const row of rows) {
      logOddsByKind.set(row.kind, (logOddsByKind.get(row.kind) ?? 0) + row.log_lr);
    }
    const ordered = [...logOddsByKind.values()].sort((a, b) => b - a);
    const margin = ordered.length < 2 ? Number.POSITIVE_INFINITY : ordered[0] - ordered[1];
    if (margin < FLAT_MARGIN) margins.flat += 1;
    else if (margin < DECISIVE_MARGIN) margins.moderate += 1;
    else margins.decisive += 1;
  }

  const behavior: PromptKindReport['behavior'] = {
    retries: 0,
    terminalAssistantTurns: lastRoles.filter((row) => row.prompt_role === 'assistant').length,
    sessionsWithEndedAt: sessions.filter((row) => row.ended_at !== null).length,
    retryRateFlipped: null,
    retryRateUnflipped: null,
  };
  const promptsBySession = new Map<string, PromptRow[]>();
  for (const prompt of prompts) {
    const sessionPrompts = promptsBySession.get(prompt.session_id) ?? [];
    sessionPrompts.push(prompt);
    promptsBySession.set(prompt.session_id, sessionPrompts);
  }
  let flippedWithNext = 0;
  let flippedRetried = 0;
  let unflippedWithNext = 0;
  let unflippedRetried = 0;
  for (const sessionPrompts of promptsBySession.values()) {
    for (let index = 0; index < sessionPrompts.length - 1; index += 1) {
      const previous = sessionPrompts[index];
      const isRetry = jaccard(
        summaryTokens(previous.prompt_summary),
        summaryTokens(sessionPrompts[index + 1].prompt_summary)
      ) >= RETRY_JACCARD_THRESHOLD;
      if (isRetry) behavior.retries += 1;
      if (flippedByPromptId.get(previous.prompt_id)) {
        flippedWithNext += 1;
        if (isRetry) flippedRetried += 1;
      } else {
        unflippedWithNext += 1;
        if (isRetry) unflippedRetried += 1;
      }
    }
  }
  behavior.retryRateFlipped = flippedWithNext === 0 ? null : flippedRetried / flippedWithNext;
  behavior.retryRateUnflipped = unflippedWithNext === 0 ? null : unflippedRetried / unflippedWithNext;

  const cost: PromptKindReport['cost'] = { total: 0, byTurn: {}, unattributed: 0, sessions: {} };
  const costRows = kernel.db.prepare(`
    select turn_id, session_id, coalesce(estimated_cost, 0) as cost
    from model_calls
  `).all() as unknown as { turn_id: string | null; session_id: string | null; cost: number }[];
  for (const row of costRows) {
    cost.total += row.cost;
    if (row.turn_id) {
      cost.byTurn[row.turn_id] = (cost.byTurn[row.turn_id] ?? 0) + row.cost;
    } else {
      cost.unattributed += row.cost;
    }
    if (row.session_id) {
      cost.sessions[row.session_id] = (cost.sessions[row.session_id] ?? 0) + row.cost;
    }
  }
  cost.total = roundCost(cost.total);
  cost.unattributed = roundCost(cost.unattributed);
  for (const key of Object.keys(cost.byTurn)) cost.byTurn[key] = roundCost(cost.byTurn[key]);
  for (const key of Object.keys(cost.sessions)) cost.sessions[key] = roundCost(cost.sessions[key]);

  return {
    coverage: {
      userPrompts: prompts.length,
      withEvidence: prompts.filter((prompt) => (evidenceByPrompt.get(prompt.prompt_id) ?? []).length > 0).length,
      withMultipleMethods: prompts.filter((prompt) =>
        contentMethods(evidenceByPrompt.get(prompt.prompt_id) ?? []).size >= 2).length,
    },
    flips,
    methodConcordance,
    margins,
    behavior,
    cost,
  };
}

function roundCost(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function summaryTokens(summary: string | null): Set<string> {
  if (!summary) return new Set();
  const cleaned = summary.replace(/\s+length=\d+$/, '').toLowerCase();
  return new Set(cleaned.split(/[^a-z0-9]+/).filter((token) => token.length > 0));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}
