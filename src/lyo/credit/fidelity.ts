import type { DatabaseSync } from 'node:sqlite';
import { aggregateCreditFidelity } from '../domain/credit-fidelity.ts';
import type { CreditFidelityReport } from '../domain/credit-fidelity.ts';
import { resolvedCreditApplications, markInfoByApplication } from '../storage/credit-state.ts';

export type { CreditFidelityReport, CreditFidelityRow } from '../domain/credit-fidelity.ts';

export function computeCreditFidelity(db: DatabaseSync): CreditFidelityReport {
  return aggregateCreditFidelity(resolvedCreditApplications(db), markInfoByApplication(db));
}
