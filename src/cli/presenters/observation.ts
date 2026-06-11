export type ObservationReportKind = 'atBat' | 'style' | 'semantic' | 'experiment';

export function observationSummaryResponse<T extends object>(summary: T): { ok: true } & T {
  return {
    ok: true,
    ...summary,
  };
}

export function observationReportResponse(
  key: ObservationReportKind,
  report: unknown
): unknown {
  return {
    ok: true,
    [key]: report,
  };
}

export function observationEffectsResponse(report: unknown): unknown {
  return {
    ok: true,
    effects: report,
  };
}

export function observationLoweringPlanResponse(plan: unknown): unknown {
  return {
    ok: true,
    loweringPlan: plan,
  };
}
