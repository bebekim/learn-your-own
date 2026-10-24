/**
 * Provider-neutral typed questions and answers (the Choice/Score/Noul primitives
 * shared by TypeSafe Jev and Laya). An answer's probabilities and confidence are
 * the model's own report; they are not calibrated accuracy until measured on
 * labelled cases from the domain where they are used.
 */

export type Description = string | Record<string, unknown> | unknown[];

export type TypedQuestion =
  | { type: 'noul'; instructions: Description; criteria?: { true?: Description; false?: Description } }
  | { type: 'choice'; instructions?: Description; criteria: Record<string, Description | null> }
  | { type: 'score'; instructions?: Description; criteria: Description[] };

export type TypedAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number>; legend: Record<string, unknown> };

/** Yes above `yes`, no below `no`, unknown between: a model near 0.5 has not decided. */
export function noulVerdict(answer: TypedAnswer, band: { yes: number; no: number }): 'yes' | 'no' | 'unknown' {
  if (answer.type !== 'noul') throw new Error('noulVerdict needs a noul answer');
  if (!(band.no < band.yes)) throw new Error('noul band requires no < yes');
  return answer.noul >= band.yes ? 'yes' : answer.noul <= band.no ? 'no' : 'unknown';
}

/** The selected option, or unknown when the reported confidence is below the caller's floor. */
export function choiceVerdict(answer: TypedAnswer, minimumConfidence: number): string | 'unknown' {
  if (answer.type !== 'choice') throw new Error('choiceVerdict needs a choice answer');
  return answer.confidence >= minimumConfidence ? answer.choice : 'unknown';
}
