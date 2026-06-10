import type { LearningKernel } from '../ledger.ts';
import type {
  GetRunTapeViewInput,
  RecordRunTapeCellInput,
  RunTapeCellKind,
  RunTapeCellRecord,
  RunTapeState,
  RunTapeView,
} from '../types/tape.ts';
import {
  ISO_NOW,
  requireFields,
} from './shared.ts';

export function recordRunTapeCell(kernel: LearningKernel, input: RecordRunTapeCellInput): RunTapeCellRecord {
  requireFields(input, ['runId', 'kind', 'summary', 'evidenceRef']);
  validateCellPayload(input);

  const view = getRunTapeView(kernel, { runId: input.runId });
  if (!view.legalNextKinds.includes(input.kind)) {
    throw new Error(
      `illegal tape transition: ${view.state} cannot append ${input.kind}; legal next cells: ${view.legalNextKinds.join(', ') || 'none'}`
    );
  }

  const cellIndex = view.cells.length + 1;
  const stateBefore = view.state;
  const stateAfter = stateAfterForCell(input.kind);
  const cellId = input.cellId ?? `tape-${input.runId}-${String(cellIndex).padStart(4, '0')}`;

  kernel.db.prepare(`
    insert into run_tape_cells (
      cell_id, run_id, cell_index, kind, summary, evidence_ref, passed,
      state_before, state_after, payload_json, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cellId,
    input.runId,
    cellIndex,
    input.kind,
    input.summary,
    input.evidenceRef,
    input.passed === undefined || input.passed === null ? null : Number(input.passed),
    stateBefore,
    stateAfter,
    input.payload === undefined ? null : JSON.stringify(input.payload),
    ISO_NOW()
  );

  return getRunTapeCell(kernel, cellId);
}

export function getRunTapeView(kernel: LearningKernel, input: GetRunTapeViewInput): RunTapeView {
  requireFields(input, ['runId']);
  const cells = getRunTapeCells(kernel, input.runId);
  const scan = cells.at(-1) ?? null;
  const state = scan?.stateAfter ?? 'empty';
  const legalNextKinds = legalNextKindsFor(scan, state);
  return {
    runId: input.runId,
    state,
    leftSpan: cells.slice(0, -1).map((cell) => cell.kind),
    scan,
    rightSpan: legalNextKinds,
    legalNextKinds,
    cells,
  };
}

function getRunTapeCell(kernel: LearningKernel, cellId: string): RunTapeCellRecord {
  const row = kernel.db.prepare(`
    select
      cell_id as cellId,
      run_id as runId,
      cell_index as cellIndex,
      kind,
      summary,
      evidence_ref as evidenceRef,
      passed,
      state_before as stateBefore,
      state_after as stateAfter,
      payload_json as payloadJson
    from run_tape_cells
    where cell_id = ?
  `).get(cellId) as RunTapeCellRow | undefined;
  if (!row) throw new Error(`unknown run tape cell: ${cellId}`);
  return mapTapeCell(row);
}

function getRunTapeCells(kernel: LearningKernel, runId: string): RunTapeCellRecord[] {
  return (kernel.db.prepare(`
    select
      cell_id as cellId,
      run_id as runId,
      cell_index as cellIndex,
      kind,
      summary,
      evidence_ref as evidenceRef,
      passed,
      state_before as stateBefore,
      state_after as stateAfter,
      payload_json as payloadJson
    from run_tape_cells
    where run_id = ?
    order by cell_index
  `).all(runId) as unknown as RunTapeCellRow[]).map(mapTapeCell);
}

function validateCellPayload(input: RecordRunTapeCellInput): void {
  if (input.kind === 'verifier_result' && typeof input.passed !== 'boolean') {
    throw new Error('verifier_result tape cells require passed=true or passed=false');
  }
  if (input.kind !== 'verifier_result' && input.passed !== undefined && input.passed !== null) {
    throw new Error('only verifier_result tape cells can record passed');
  }
}

function legalNextKindsFor(scan: RunTapeCellRecord | null, state: RunTapeState): RunTapeCellKind[] {
  if (!scan) return ['run_goal'];
  if (state === 'goal_declared') return ['verifier_spec'];
  if (state === 'verifier_specified') return ['worker_action'];
  if (state === 'working') return ['assistant_claim', 'verifier_result'];
  if (state === 'claimed_completion') return ['gap', 'verifier_result', 'blocked'];
  if (state === 'revising') return ['worker_action', 'blocked'];
  if (state === 'verifying' && scan.kind === 'verifier_result' && scan.passed === false) {
    return ['gap', 'worker_action', 'blocked'];
  }
  if (state === 'verifying' && scan.kind === 'verifier_result' && scan.passed === true) {
    return ['outcome_completed', 'verifier_spec'];
  }
  return [];
}

function stateAfterForCell(kind: RunTapeCellKind): RunTapeState {
  switch (kind) {
    case 'run_goal':
      return 'goal_declared';
    case 'verifier_spec':
      return 'verifier_specified';
    case 'worker_action':
      return 'working';
    case 'assistant_claim':
      return 'claimed_completion';
    case 'verifier_result':
      return 'verifying';
    case 'gap':
      return 'revising';
    case 'outcome_completed':
      return 'completed';
    case 'blocked':
      return 'blocked';
  }
}

function mapTapeCell(row: RunTapeCellRow): RunTapeCellRecord {
  return {
    cellId: row.cellId,
    runId: row.runId,
    cellIndex: row.cellIndex,
    kind: row.kind,
    summary: row.summary,
    evidenceRef: row.evidenceRef,
    passed: row.passed === null ? null : Boolean(row.passed),
    stateBefore: row.stateBefore,
    stateAfter: row.stateAfter,
    payload: row.payloadJson === null ? null : JSON.parse(row.payloadJson),
  };
}

interface RunTapeCellRow {
  cellId: string;
  runId: string;
  cellIndex: number;
  kind: RunTapeCellKind;
  summary: string;
  evidenceRef: string;
  passed: 0 | 1 | null;
  stateBefore: RunTapeState;
  stateAfter: RunTapeState;
  payloadJson: string | null;
}
