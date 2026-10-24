import type {
  PreferencePairRecord,
  ProtocolRecord,
  ScopeKind,
  TraceRecord,
} from './core.ts';

export interface DeriveVerifierGatePolicyInput {
  chosenRunId: string;
  rejectedRunId: string;
  protocolId?: string;
  scopeKind?: ScopeKind;
  scopeValue?: string;
  recordedBy?: string | null;
}

export interface DerivedVerifierGatePolicy {
  chosenTrace: TraceRecord;
  rejectedTrace: TraceRecord;
  preference: PreferencePairRecord;
  protocol: ProtocolRecord;
}
