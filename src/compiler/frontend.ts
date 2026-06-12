import type { LearningKernel } from '../ledger.ts';
import { analyzeTelemetrySemantics } from './analyzer.ts';
import { compileTelemetryRunAst } from './parser.ts';
import type { SemanticRunAst } from './semantics.ts';
import type { RunTelemetryAst } from './syntax.ts';

export interface CompiledTelemetryRun extends RunTelemetryAst {
  semantic: SemanticRunAst;
}

export { compileTelemetryRunAst };

export function compileTelemetryRun(
  kernel: LearningKernel,
  input: { runId: string }
): CompiledTelemetryRun {
  const ast = compileTelemetryRunAst(kernel, input);
  return {
    ...ast,
    semantic: analyzeTelemetrySemantics(ast),
  };
}
