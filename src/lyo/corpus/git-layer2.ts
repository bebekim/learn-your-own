export interface PythonLayer2DeltaInput {
  path: string;
  before: string | null;
  after: string | null;
  patch: string;
}

export interface Layer2Observation {
  kind: string;
  value: string | null;
  confidence: 'low' | 'medium' | 'high';
  evidence: string;
}

export interface PythonLayer2DeltaReport {
  path: string;
  parse: {
    beforeOk: boolean;
    afterOk: boolean;
  };
  sublayers: {
    lexical: Layer2SublayerReport;
    wholeStructure: Layer2SublayerReport;
    localizedStructure: Layer2SublayerReport;
  };
  coverage: {
    anyLayer2: boolean;
  };
  leakage: Layer2Leakage[];
}

export interface Layer2SublayerReport {
  covered: boolean;
  observations: Layer2Observation[];
}

export interface Layer2Leakage {
  kind: string;
  message: string;
}

interface PythonWholeSummary {
  functions: Set<string>;
  classes: Set<string>;
  imports: Set<string>;
  callNames: Set<string>;
  asserts: number;
  raises: number;
  conditionals: number;
  assignments: number;
  returns: number;
}

interface PythonFunctionBodies {
  bodies: Map<string, string>;
}

export function analyzePythonLayer2Delta(input: PythonLayer2DeltaInput): PythonLayer2DeltaReport {
  const before = input.before ?? '';
  const after = input.after ?? '';
  const beforeOk = isParseablePythonLike(before);
  const afterOk = isParseablePythonLike(after);
  const lexical = lexicalPatchObservations(input.patch, input.path);
  const wholeStructure = beforeOk && afterOk ? wholeStructureObservations(before, after) : [];
  const localizedStructure = beforeOk && afterOk ? localizedFunctionObservations(before, after) : [];
  const leakage = leakageReports(lexical, wholeStructure, localizedStructure);

  return {
    path: input.path,
    parse: {
      beforeOk,
      afterOk,
    },
    sublayers: {
      lexical: sublayer(lexical),
      wholeStructure: sublayer(wholeStructure),
      localizedStructure: sublayer(localizedStructure),
    },
    coverage: {
      anyLayer2: lexical.length > 0 || wholeStructure.length > 0 || localizedStructure.length > 0,
    },
    leakage,
  };
}

function sublayer(observations: Layer2Observation[]): Layer2SublayerReport {
  return {
    covered: observations.length > 0,
    observations,
  };
}

function leakageReports(
  lexical: Layer2Observation[],
  wholeStructure: Layer2Observation[],
  localizedStructure: Layer2Observation[]
): Layer2Leakage[] {
  const reports: Layer2Leakage[] = [];
  if (localizedStructure.length > 0 && wholeStructure.length === 0) {
    reports.push({
      kind: 'whole_structure_silent_localized_change',
      message: 'localized function bodies changed while the coarse whole-file structural summary was unchanged',
    });
  }
  if (lexical.length > 0 && wholeStructure.length === 0 && localizedStructure.length === 0) {
    reports.push({
      kind: 'lexical_only_change',
      message: 'changed lines produced lexical cues but no parser-level structural delta',
    });
  }
  return reports;
}

function lexicalPatchObservations(patch: string, path: string): Layer2Observation[] {
  const observations: Layer2Observation[] = [];
  let inRequestedFile = false;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inRequestedFile = line.includes(` a/${path} `) || line.endsWith(` b/${path}`) || line.includes(` b/${path}`);
      continue;
    }
    if (!inRequestedFile) continue;
    if (!isChangedPayloadLine(line)) continue;
    const direction = line.startsWith('+') ? 'added' : 'removed';
    const value = line.slice(1).trim();
    if (value === '') continue;
    const evidence = `${direction}:${value}`;

    if (value.startsWith('#')) {
      observations.push(observation(`line:comment_${direction}`, null, 'high', evidence));
    }
    if (/^(async\s+def|def)\s+/.test(value)) {
      observations.push(observation(`line:function_def_${direction}`, functionName(value), 'high', evidence));
    }
    if (/^class\s+/.test(value)) {
      observations.push(observation(`line:class_def_${direction}`, className(value), 'high', evidence));
    }
    if (/^assert\b/.test(value)) {
      observations.push(observation(`line:assert_${direction}`, null, 'high', evidence));
    }
    if (/\braise\b/.test(value)) {
      observations.push(observation(`line:raise_${direction}`, null, 'medium', evidence));
    }
    if (/^(if|elif)\b/.test(value)) {
      observations.push(observation(`line:conditional_${direction}`, null, 'high', evidence));
    }
    if (/^(from\s+\S+\s+import|import\s+)/.test(value)) {
      observations.push(observation(`line:import_${direction}`, null, 'high', evidence));
    }
    if (/\breturn\b/.test(value)) {
      observations.push(observation(`line:return_${direction}`, null, 'medium', evidence));
    }
    if (assignmentLike(value)) {
      observations.push(observation(`line:assignment_like_${direction}`, null, 'low', evidence));
    }

    for (const identifier of identifiers(value)) {
      observations.push(observation(`line:identifier_${direction}`, identifier, 'low', evidence));
    }
  }
  return observations;
}

function wholeStructureObservations(before: string, after: string): Layer2Observation[] {
  const previous = summarizePython(before);
  const next = summarizePython(after);
  const observations: Layer2Observation[] = [];

  setDelta(previous.functions, next.functions, 'structure:function', observations);
  setDelta(previous.classes, next.classes, 'structure:class', observations);
  setDelta(previous.imports, next.imports, 'structure:import', observations);
  setDelta(previous.callNames, next.callNames, 'structure:call_name', observations);
  countDelta(previous.asserts, next.asserts, 'structure:assertion_count', observations);
  countDelta(previous.raises, next.raises, 'structure:raise_count', observations);
  countDelta(previous.conditionals, next.conditionals, 'structure:conditional_count', observations);
  countDelta(previous.assignments, next.assignments, 'structure:assignment_count', observations);
  countDelta(previous.returns, next.returns, 'structure:return_count', observations);

  return observations;
}

function localizedFunctionObservations(before: string, after: string): Layer2Observation[] {
  const previous = functionBodies(before);
  const next = functionBodies(after);
  const observations: Layer2Observation[] = [];

  for (const name of difference(next.bodies.keys(), previous.bodies.keys())) {
    observations.push(observation('structure:function_added', name, 'high', `function:${name}`));
  }
  for (const name of difference(previous.bodies.keys(), next.bodies.keys())) {
    observations.push(observation('structure:function_removed', name, 'high', `function:${name}`));
  }
  for (const name of intersection(previous.bodies.keys(), next.bodies.keys())) {
    if (previous.bodies.get(name) !== next.bodies.get(name)) {
      observations.push(observation('structure:function_body_changed', name, 'high', `function:${name}`));
    }
  }
  return observations;
}

function summarizePython(source: string): PythonWholeSummary {
  const summary: PythonWholeSummary = {
    functions: new Set(),
    classes: new Set(),
    imports: new Set(),
    callNames: new Set(),
    asserts: 0,
    raises: 0,
    conditionals: 0,
    assignments: 0,
    returns: 0,
  };

  for (const rawLine of source.split('\n')) {
    const line = stripComment(rawLine).trim();
    if (line === '') continue;
    const foundFunction = functionName(line);
    if (foundFunction) summary.functions.add(foundFunction);
    const foundClass = className(line);
    if (foundClass) summary.classes.add(foundClass);
    if (/^(from\s+\S+\s+import|import\s+)/.test(line)) summary.imports.add(normalizeWhitespace(line));
    if (/^assert\b/.test(line)) summary.asserts += 1;
    if (/\braise\b/.test(line)) summary.raises += 1;
    if (/^(if|elif)\b/.test(line)) summary.conditionals += 1;
    if (assignmentLike(line)) summary.assignments += 1;
    if (/\breturn\b/.test(line)) summary.returns += 1;
    for (const call of callNames(line)) summary.callNames.add(call);
  }

  return summary;
}

function functionBodies(source: string): PythonFunctionBodies {
  const lines = source.split('\n');
  const bodies = new Map<string, string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const name = functionName(line.trim());
    if (!name) continue;
    const baseIndent = indentation(line);
    const body: string[] = [normalizeBodyLine(line, baseIndent)];
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const bodyLine = lines[bodyIndex];
      if (bodyLine.trim() !== '' && indentation(bodyLine) <= baseIndent) break;
      body.push(normalizeBodyLine(bodyLine, baseIndent));
    }
    bodies.set(name, body.join('\n').trim());
  }
  return { bodies };
}

function normalizeBodyLine(line: string, baseIndent: number): string {
  return stripComment(line.slice(Math.min(baseIndent, line.length))).trimEnd();
}

function setDelta(
  previous: Set<string>,
  next: Set<string>,
  prefix: string,
  observations: Layer2Observation[]
): void {
  for (const value of difference(next.values(), previous.values())) {
    observations.push(observation(`${prefix}_added`, value, 'high', value));
  }
  for (const value of difference(previous.values(), next.values())) {
    observations.push(observation(`${prefix}_removed`, value, 'high', value));
  }
}

function countDelta(
  previous: number,
  next: number,
  prefix: string,
  observations: Layer2Observation[]
): void {
  const delta = next - previous;
  if (delta > 0) observations.push(observation(`${prefix}_increased`, String(delta), 'high', `+${delta}`));
  if (delta < 0) observations.push(observation(`${prefix}_decreased`, String(delta), 'high', String(delta)));
}

function observation(
  kind: string,
  value: string | null,
  confidence: 'low' | 'medium' | 'high',
  evidence: string
): Layer2Observation {
  return { kind, value, confidence, evidence };
}

function isChangedPayloadLine(line: string): boolean {
  if (!(line.startsWith('+') || line.startsWith('-'))) return false;
  return !line.startsWith('+++') && !line.startsWith('---');
}

function functionName(line: string): string | null {
  const match = /^(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
  return match?.[1] ?? null;
}

function className(line: string): string | null {
  const match = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(line);
  return match?.[1] ?? null;
}

function identifiers(line: string): string[] {
  const ignored = new Set([
    'and',
    'as',
    'assert',
    'class',
    'def',
    'elif',
    'else',
    'False',
    'for',
    'from',
    'if',
    'import',
    'in',
    'is',
    'None',
    'not',
    'or',
    'raise',
    'return',
    'True',
    'while',
    'with',
  ]);
  return Array.from(line.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g))
    .map((match) => match[0])
    .filter((identifier) => !ignored.has(identifier));
}

function callNames(line: string): string[] {
  return Array.from(line.matchAll(/(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
    .map((match) => match[1])
    .filter((name) => !['if', 'elif', 'for', 'while', 'with', 'return'].includes(name));
}

function assignmentLike(line: string): boolean {
  return /(^|[^=!<>])=([^=]|$)/.test(line);
}

function stripComment(line: string): string {
  const index = line.indexOf('#');
  return index === -1 ? line : line.slice(0, index);
}

function normalizeWhitespace(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

function indentation(line: string): number {
  return line.length - line.trimStart().length;
}

function difference(left: Iterable<string>, right: Iterable<string>): string[] {
  const rightSet = new Set(right);
  return Array.from(left).filter((value) => !rightSet.has(value));
}

function intersection(left: Iterable<string>, right: Iterable<string>): string[] {
  const rightSet = new Set(right);
  return Array.from(left).filter((value) => rightSet.has(value));
}

function isParseablePythonLike(source: string): boolean {
  let parenDepth = 0;
  for (const character of source) {
    if (character === '(') parenDepth += 1;
    if (character === ')') parenDepth -= 1;
    if (parenDepth < 0) return false;
  }
  return parenDepth === 0;
}
