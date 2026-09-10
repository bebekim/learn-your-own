import { z } from 'zod';
import { buildEvalReport } from './report.ts';
import type { TaskPolicy, TaskRecord } from '../lyo/control/task-evidence.ts';

const id = z.string().trim().min(1);
export const taskComparisonSchema = z.object({
  id, policyId: id,
  pairs: z.array(z.object({ baselineAttemptId: id, learnedAttemptId: id }).strict()).min(1),
  maxTotalTokenRatio: z.number().positive(),
}).strict();
export type TaskComparison = z.infer<typeof taskComparisonSchema>;

export function buildTaskReport(policy: TaskPolicy, attempts: TaskRecord[], comparison?: TaskComparison) {
  const evaluation = buildEvalReport(attempts.flatMap(r => r.receipt ? [r.receipt.episode] : []),
    { baselineId: 'B0', treatmentId: 'B4', ruleId: policy.id });
  const reasons = [...(evaluation.gate?.reasons ?? ['a matched baseline and learned-policy comparison is required'])];
  let decision = evaluation.gate?.decision ?? 'inconclusive';
  if (!comparison) { decision = 'inconclusive'; reasons.push('register the comparison before work starts'); }
  if (attempts.some(r => !r.receipt)) { decision = 'inconclusive'; reasons.push('registered evaluation attempts remain unfinished'); }
  const baseline = evaluation.baseline_scores.find(s => s.baseline_id === 'B0');
  const learned = evaluation.baseline_scores.find(s => s.baseline_id === 'B4');
  const totalLearnedTokens = policy.training.totalTokens === null || learned?.token_cost == null
    ? null : policy.training.totalTokens + learned.token_cost;
  if (totalLearnedTokens === null) { decision = 'inconclusive'; reasons.push('training and evaluation costs must be known'); }
  if (decision === 'accept' && comparison && baseline?.token_cost != null && totalLearnedTokens !== null
    && totalLearnedTokens > baseline.token_cost * comparison.maxTotalTokenRatio) {
    decision = 'reject'; reasons.push('learning plus evaluation token cost exceeds the registered baseline ratio');
  }
  if (decision === 'accept' && attempts.some(r => r.registration.input.condition === 'learned' && r.receipt?.measurement.withinBudget !== true)) {
    decision = 'reject'; reasons.push('learned attempts must meet their declared task budgets');
  }
  return { policy, comparison: comparison ?? null, training: policy.training, evaluation,
    registeredAttempts: attempts.length, totalLearnedTokens, decision, reasons, deployment: 'experimental-only' };
}
