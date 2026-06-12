import type {
  CandidateAtBatTaskContext,
  CandidateAtBatVerifierKind,
  CandidateAtBatVerifierMatchMode,
  CandidateAtBatVerifierSpec,
} from '../candidate-at-bat.ts';

export function parseCandidateAtBatTaskContext(value: unknown): CandidateAtBatTaskContext {
  if (!value || typeof value !== 'object') {
    throw new Error('candidate at-bat task context must be an object');
  }

  const input = value as Record<string, unknown>;
  const baseline = input.baseline;
  if (!baseline || typeof baseline !== 'object') {
    throw new Error('candidate at-bat task context missing baseline object');
  }

  return {
    taskId: requiredString(input, 'taskId'),
    language: optionalString(input, 'language'),
    taskComplexity: requiredNumber(input, 'taskComplexity'),
    expectedPattern: requiredString(input, 'expectedPattern'),
    successCriteria: requiredStringArray(input, 'successCriteria'),
    allowedTools: optionalStringArray(input, 'allowedTools'),
    verifiers: optionalVerifierSpecs(input, 'verifiers'),
    baseline: {
      existingTestsPass: optionalBoolean((baseline as Record<string, unknown>).existingTestsPass),
      buildSucceeds: optionalBoolean((baseline as Record<string, unknown>).buildSucceeds),
      knownIssues: optionalStringArray(baseline as Record<string, unknown>, 'knownIssues'),
    },
  };
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`candidate at-bat task context missing ${key}`);
  }
  return value;
}

function requiredNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`candidate at-bat task context missing numeric ${key}`);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`candidate at-bat task context invalid string ${key}`);
  }
  return value;
}

function requiredStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`candidate at-bat task context missing string array ${key}`);
  }
  return [...value] as string[];
}

function optionalStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`candidate at-bat task context invalid string array ${key}`);
  }
  return [...value] as string[];
}

function optionalVerifierSpecs(
  input: Record<string, unknown>,
  key: string
): CandidateAtBatVerifierSpec[] {
  const value = input[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`candidate at-bat task context invalid verifier array ${key}`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`candidate at-bat task context invalid verifier at index ${index}`);
    }
    const verifier = item as Record<string, unknown>;
    return {
      id: requiredString(verifier, 'id'),
      commandPattern: requiredString(verifier, 'commandPattern'),
      kind: verifierKind(verifier.kind, index),
      required: requiredBoolean(verifier, 'required'),
      matchMode: optionalMatchMode(verifier.matchMode, index),
    };
  });
}

function verifierKind(value: unknown, index: number): CandidateAtBatVerifierKind {
  const allowed: CandidateAtBatVerifierKind[] = [
    'targeted',
    'broad',
    'static',
    'build',
    'smoke',
    'unknown',
  ];
  if (typeof value === 'string' && allowed.includes(value as CandidateAtBatVerifierKind)) {
    return value as CandidateAtBatVerifierKind;
  }
  throw new Error(`candidate at-bat task context invalid verifier kind at index ${index}`);
}

function optionalMatchMode(value: unknown, index: number): CandidateAtBatVerifierMatchMode | undefined {
  if (value === undefined || value === null) return undefined;
  const allowed: CandidateAtBatVerifierMatchMode[] = ['contains', 'exact', 'regex'];
  if (typeof value === 'string' && allowed.includes(value as CandidateAtBatVerifierMatchMode)) {
    return value as CandidateAtBatVerifierMatchMode;
  }
  throw new Error(`candidate at-bat task context invalid verifier matchMode at index ${index}`);
}

function requiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') {
    throw new Error(`candidate at-bat task context missing boolean ${key}`);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw new Error('candidate at-bat task context baseline fields must be booleans');
  }
  return value;
}
