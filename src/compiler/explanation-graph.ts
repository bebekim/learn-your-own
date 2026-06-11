export const EXPLANATION_GRAPH_VERSION = 'lyo/explanation-graph/v1';

export type BinaryHypothesisKey = 'notH' | 'h';

export type ExplanationGraphCredibility =
  | 'provisionally_supported'
  | 'weakly_supported'
  | 'inconclusive'
  | 'weakened';

export interface BinaryBelief {
  notH: number;
  h: number;
}

export interface ExplanationHypothesis {
  id: string;
  label: string;
  source?: string;
  relation?: string;
  target?: string;
  scope?: string;
}

export interface ExplanationFactorMatrix {
  notH: [number, number];
  h: [number, number];
}

export interface ExplanationFactorInput {
  factorId: string;
  label: string;
  observedState: string;
  states: [string, string];
  matrix: ExplanationFactorMatrix;
}

export interface ExplanationFactorMessage {
  factorId: string;
  label: string;
  observedState: string;
  states: [string, string];
  matrix: ExplanationFactorMatrix;
  message: BinaryBelief;
}

export interface ExplanationGraphInput {
  hypothesis: ExplanationHypothesis;
  prior: BinaryBelief;
  factors: ExplanationFactorInput[];
  rivalOutcomes?: RivalOutcomeInput[];
}

export interface RivalExplanationInput {
  rivalId: string;
  prior: number;
  likelihood: BinaryBelief;
}

export interface RivalOutcomeInput {
  outcomeId: string;
  rivals: RivalExplanationInput[];
}

export interface RivalOutcomeMessage {
  outcomeId: string;
  rivalPriors: Record<string, number>;
  rivals: Array<{
    rivalId: string;
    prior: number;
    likelihood: BinaryBelief;
  }>;
  message: BinaryBelief;
}

export interface ExplanationGraphReport {
  explanationGraphVersion: typeof EXPLANATION_GRAPH_VERSION;
  hypothesis: ExplanationHypothesis;
  prior: BinaryBelief;
  factorMessages: ExplanationFactorMessage[];
  rivalOutcomeMessages: RivalOutcomeMessage[];
  unnormalized: BinaryBelief;
  belief: BinaryBelief;
  odds: {
    priorHToNotH: number | null;
    posteriorHToNotH: number | null;
  };
  credibility: ExplanationGraphCredibility;
  limitations: string[];
}

export function buildExplanationGraphReport(input: ExplanationGraphInput): ExplanationGraphReport {
  const prior = normalizeBinaryBelief(input.prior, 'prior');
  const factorMessages = input.factors.map(computeObservedFactorMessage);
  const rivalOutcomeMessages = (input.rivalOutcomes ?? []).map(computeRivalOutcomeMessage);
  const beliefMessages = [
    ...factorMessages.map((factor) => factor.message),
    ...rivalOutcomeMessages.map((outcome) => outcome.message),
  ];
  const unnormalized = beliefMessages.reduce((current, message) => ({
    notH: current.notH * message.notH,
    h: current.h * message.h,
  }), prior);
  const belief = normalizeBinaryBelief(unnormalized, 'unnormalized belief');

  return {
    explanationGraphVersion: EXPLANATION_GRAPH_VERSION,
    hypothesis: input.hypothesis,
    prior,
    factorMessages,
    rivalOutcomeMessages,
    unnormalized: roundBinaryBelief(unnormalized),
    belief: roundBinaryBelief(belief),
    odds: {
      priorHToNotH: safeRatio(prior.h, prior.notH),
      posteriorHToNotH: safeRatio(belief.h, belief.notH),
    },
    credibility: credibilityForBelief(belief),
    limitations: [
      'belief is provisional and only as good as the modeled factors',
      'factor messages are local plausibility updates, not production-rule proof',
      'defeaters and rival explanations must be represented explicitly before strengthening a hypothesis',
    ],
  };
}

export function computeObservedFactorMessage(input: ExplanationFactorInput): ExplanationFactorMessage {
  const observedIndex = input.states.indexOf(input.observedState);
  if (observedIndex === -1) {
    throw new Error(`observed state ${input.observedState} is not present in factor ${input.factorId}`);
  }

  validateMatrix(input.matrix, input.factorId);

  return {
    factorId: input.factorId,
    label: input.label,
    observedState: input.observedState,
    states: input.states,
    matrix: input.matrix,
    message: roundBinaryBelief({
      notH: input.matrix.notH[observedIndex],
      h: input.matrix.h[observedIndex],
    }),
  };
}

export function computeRivalOutcomeMessage(input: RivalOutcomeInput): RivalOutcomeMessage {
  if (input.rivals.length === 0) {
    throw new Error(`rival outcome ${input.outcomeId} must include at least one rival explanation`);
  }

  const priorTotal = input.rivals.reduce((total, rival) => {
    validateNonnegativeFinite(rival.prior, `${input.outcomeId}.${rival.rivalId}.prior`);
    validateNonnegativeFinite(rival.likelihood.notH, `${input.outcomeId}.${rival.rivalId}.likelihood.notH`);
    validateNonnegativeFinite(rival.likelihood.h, `${input.outcomeId}.${rival.rivalId}.likelihood.h`);
    return total + rival.prior;
  }, 0);

  if (priorTotal <= 0) {
    throw new Error(`rival outcome ${input.outcomeId} must contain positive rival prior mass`);
  }

  const rivals = input.rivals.map((rival) => ({
    rivalId: rival.rivalId,
    prior: roundNumber(rival.prior / priorTotal),
    likelihood: roundBinaryBelief(rival.likelihood),
  }));
  const message = rivals.reduce((current, rival) => ({
    notH: current.notH + rival.prior * rival.likelihood.notH,
    h: current.h + rival.prior * rival.likelihood.h,
  }), { notH: 0, h: 0 });

  return {
    outcomeId: input.outcomeId,
    rivalPriors: Object.fromEntries(
      rivals.map((rival) => [rival.rivalId, rival.prior])
    ),
    rivals,
    message: roundBinaryBelief(message),
  };
}

export function normalizeBinaryBelief(input: BinaryBelief, label: string): BinaryBelief {
  validateNonnegativeFinite(input.notH, `${label}.notH`);
  validateNonnegativeFinite(input.h, `${label}.h`);
  const total = input.notH + input.h;
  if (total <= 0) {
    throw new Error(`${label} must contain positive probability mass`);
  }
  return roundBinaryBelief({
    notH: input.notH / total,
    h: input.h / total,
  });
}

function credibilityForBelief(belief: BinaryBelief): ExplanationGraphCredibility {
  if (belief.h >= 0.8) return 'provisionally_supported';
  if (belief.h >= 0.6) return 'weakly_supported';
  if (belief.h <= 0.4) return 'weakened';
  return 'inconclusive';
}

function validateMatrix(matrix: ExplanationFactorMatrix, factorId: string): void {
  matrix.notH.forEach((value, index) => validateNonnegativeFinite(value, `${factorId}.notH[${index}]`));
  matrix.h.forEach((value, index) => validateNonnegativeFinite(value, `${factorId}.h[${index}]`));
}

function validateNonnegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite nonnegative number`);
  }
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return roundNumber(numerator / denominator);
}

function roundBinaryBelief(input: BinaryBelief): BinaryBelief {
  return {
    notH: roundNumber(input.notH),
    h: roundNumber(input.h),
  };
}

function roundNumber(value: number): number {
  return Number(value.toFixed(12));
}
