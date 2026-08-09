import type { LearningKernel } from '../ledger.ts';
import type { PromptKind } from '../types/observation.ts';
import { jaccard, summaryTokens } from './text.ts';

const EPISODE_JACCARD_THRESHOLD = 0.5;
// Work-arc continuation: a short prompt following a completed turn continues the
// episode even with zero token overlap ("proceed", "what's next", "do that").
// Structural prior (spec 5, R3): length + turn position, no content patterns.
const CONTINUATION_MAX_TOKENS = 5;

interface PromptRow {
  prompt_id: string;
  session_id: string;
  prompt_index: number;
  turn_id: string | null;
  prompt_summary: string | null;
}

interface BeliefRow {
  prompt_id: string;
  kind: PromptKind;
  log_odds: number;
}

export interface PromptEpisodeMember {
  promptId: string;
  turnId: string | null;
  cost: number;
}

export interface PromptEpisode {
  episodeId: string;
  sessionId: string;
  promptIds: string[];
  members: PromptEpisodeMember[];
  dominantKind: PromptKind | null;
  cost: number;
}

export function buildPromptEpisodes(kernel: LearningKernel): PromptEpisode[] {
  const prompts = kernel.db.prepare(`
    select prompt_id, session_id, prompt_index, turn_id, prompt_summary
    from session_prompts
    where prompt_role = 'user'
    order by session_id, prompt_index
  `).all() as unknown as PromptRow[];
  const assistantIndexes = new Set(
    (kernel.db.prepare(`
      select session_id, prompt_index from session_prompts where prompt_role = 'assistant'
    `).all() as unknown as { session_id: string; prompt_index: number }[])
      .map((row) => `${row.session_id}:${row.prompt_index}`)
  );
  const beliefs = kernel.db.prepare(`
    select prompt_id, kind, sum(log_lr) as log_odds
    from prompt_kind_evidence
    group by prompt_id, kind
  `).all() as unknown as BeliefRow[];
  const costRows = kernel.db.prepare(`
    select turn_id, sum(coalesce(estimated_cost, 0)) as cost
    from model_calls
    where turn_id is not null
    group by turn_id
  `).all() as unknown as { turn_id: string; cost: number }[];

  const beliefsByPrompt = new Map<string, Map<PromptKind, number>>();
  for (const row of beliefs) {
    const kinds = beliefsByPrompt.get(row.prompt_id) ?? new Map<PromptKind, number>();
    kinds.set(row.kind, row.log_odds);
    beliefsByPrompt.set(row.prompt_id, kinds);
  }
  const costByTurn = new Map(costRows.map((row) => [row.turn_id, row.cost]));

  const episodes: PromptEpisode[] = [];
  const sessionEpisodeCounts = new Map<string, number>();
  let current: PromptRow[] = [];
  let currentSession: string | null = null;

  const flush = () => {
    if (current.length === 0 || currentSession === null) return;
    const seq = (sessionEpisodeCounts.get(currentSession) ?? 0) + 1;
    sessionEpisodeCounts.set(currentSession, seq);
    const summed = new Map<PromptKind, number>();
    for (const prompt of current) {
      for (const [kind, logOdds] of beliefsByPrompt.get(prompt.prompt_id) ?? []) {
        summed.set(kind, (summed.get(kind) ?? 0) + logOdds);
      }
    }
    const dominant = [...summed.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const members = current.map((prompt) => ({
      promptId: prompt.prompt_id,
      turnId: prompt.turn_id,
      cost: prompt.turn_id ? roundCost(costByTurn.get(prompt.turn_id) ?? 0) : 0,
    }));
    episodes.push({
      episodeId: `${currentSession}:ep:${seq}`,
      sessionId: currentSession,
      promptIds: members.map((member) => member.promptId),
      members,
      dominantKind: dominant?.[0] ?? null,
      cost: roundCost(members.reduce((sum, member) => sum + member.cost, 0)),
    });
    current = [];
  };

  for (const prompt of prompts) {
    const previous = current[current.length - 1];
    const nextTokens = summaryTokens(prompt.prompt_summary);
    const completedTurnBetween = previous !== undefined
      && previous.session_id === prompt.session_id
      && hasAssistantBetween(assistantIndexes, prompt.session_id, previous.prompt_index, prompt.prompt_index);
    const continues = previous !== undefined
      && previous.session_id === prompt.session_id
      && (jaccard(summaryTokens(previous.prompt_summary), nextTokens) >= EPISODE_JACCARD_THRESHOLD
        || (nextTokens.size <= CONTINUATION_MAX_TOKENS && completedTurnBetween));
    if (!continues) {
      flush();
      currentSession = prompt.session_id;
    }
    current.push(prompt);
  }
  flush();

  return episodes;
}

function hasAssistantBetween(
  assistantIndexes: Set<string>,
  sessionId: string,
  fromIndex: number,
  toIndex: number
): boolean {
  for (let index = fromIndex + 1; index < toIndex; index += 1) {
    if (assistantIndexes.has(`${sessionId}:${index}`)) return true;
  }
  return false;
}

function roundCost(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
