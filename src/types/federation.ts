import type { ScopeKind } from './core.ts';

export type LearningPacketKind = 'protocol.active.v1';
export type LearningPacketStatus = 'pending' | 'admitted' | 'rejected' | 'broadcasted';
export type LearningTrustLevel = 'local' | 'team' | 'org' | 'external' | 'untrusted';

export interface LearningNodeRecord {
  nodeId: string;
  machineId: string | null;
  repoPath: string | null;
  trustLevel: LearningTrustLevel;
}

export interface RegisterLearningNodeInput {
  nodeId: string;
  machineId?: string | null;
  repoPath?: string | null;
  trustLevel?: LearningTrustLevel;
}

export interface ProtocolLearningPacketPayload {
  protocol: {
    protocolId: string;
    title: string;
    scopeKind: ScopeKind;
    scopeValue: string;
    action: string;
    status: 'active';
  };
  evidence: {
    gapId: string;
    runId: string;
    kind: string;
    summary: string;
    evidenceRef: string;
    status: string;
  }[];
  outcomes: {
    deliveries: number;
    outcomes: number;
    positiveOutcomes: number;
    negativeOutcomes: number;
    creditDelta: number;
  };
  telemetrySignals: string[];
}

export interface LearningPacket {
  schemaVersion: 1;
  packetId: string;
  kind: LearningPacketKind;
  sourceNodeId: string;
  sourceRepoPath: string | null;
  scopeKind: ScopeKind;
  scopeValue: string;
  subjectId: string;
  evidenceCount: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  creditDelta: number;
  contentHash: string;
  payload: ProtocolLearningPacketPayload;
  createdAt: string;
  signature?: {
    algorithm: string;
    keyId: string;
    signature: string;
  };
}

export interface BuildProtocolLearningPacketInput {
  protocolId: string;
  sourceNodeId: string;
  sourceRepoPath?: string | null;
}

export interface EnqueueLearningPacketResult {
  packetId: string;
  status: LearningPacketStatus;
  duplicate: boolean;
}

export interface AdmitLearningPacketInput {
  packetId: string;
  minEvidence?: number;
  minCredit?: number;
  allowNetNegative?: boolean;
}

export interface AdmitLearningPacketResult {
  packetId: string;
  status: 'admitted' | 'rejected';
  reason: string | null;
}

export interface LearningMempoolRecord {
  packetId: string;
  packetKind: LearningPacketKind;
  sourceNodeId: string;
  sourceRepoPath: string | null;
  scopeKind: ScopeKind;
  scopeValue: string;
  subjectId: string;
  contentHash: string;
  evidenceCount: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  creditDelta: number;
  status: LearningPacketStatus;
  rejectionReason: string | null;
  receivedAt: string;
  admittedAt: string | null;
  broadcastAt: string | null;
}

export interface FederatedLearningSummary {
  nodes: number;
  pendingPackets: number;
  admittedPackets: number;
  rejectedPackets: number;
  broadcastPackets: number;
  admittedProtocols: number;
  admittedEvidence: number;
  admittedCredit: number;
}
