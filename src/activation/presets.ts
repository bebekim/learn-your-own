import type { LearningKernel } from '../ledger.ts';
import type {
  EnsureNectrWorkspaceDefaultsInput,
  EnsureNectrWorkspaceDefaultsResult,
  RecordZoneInput,
} from '../types/activation.ts';
import {
  recordWorkspace,
  recordZone,
} from './records.ts';

const NECTR_DEFAULT_ZONES: Omit<RecordZoneInput, 'workspaceId' | 'zoneId'>[] = [
  {
    name: 'platform_core',
    zoneKind: 'platform',
    pathGlob: 'nectr_data_eng_core/**',
    description: 'Reusable data platform checks, contracts, configs, handlers, and orchestration helpers.',
  },
  {
    name: 'business_logic',
    zoneKind: 'domain',
    pathGlob: 'nectr_data_engineering/**',
    description: 'Business domain pipelines, models, SQL, workflow manifests, and tests.',
  },
  {
    name: 'specs',
    zoneKind: 'specification',
    pathGlob: 'Specs/**',
    description: 'Implementation contracts and migration specifications.',
  },
  {
    name: 'checks',
    zoneKind: 'quality',
    pathGlob: 'checks/**',
    description: 'Reusable metadata, data quality, and migration readiness checks.',
  },
  {
    name: 'guardrails',
    zoneKind: 'guardrail',
    pathGlob: '.guardrails/**',
    description: 'Databricks operation plans and verification guardrails.',
  },
  {
    name: 'docs',
    zoneKind: 'documentation',
    pathGlob: 'docs/**',
    description: 'Architecture, domain, testing, and migration documentation.',
  },
  {
    name: 'tools',
    zoneKind: 'tooling',
    pathGlob: 'tools/**,src/**',
    description: 'Repository-local tooling and Python package code.',
  },
  {
    name: 'artifacts',
    zoneKind: 'artifact',
    pathGlob: 'artifacts/**,var/**',
    description: 'Generated investigation artifacts, inventories, and captured operational evidence.',
  },
];

export function ensureNectrWorkspaceDefaults(
  kernel: LearningKernel,
  input: EnsureNectrWorkspaceDefaultsInput
): EnsureNectrWorkspaceDefaultsResult {
  const workspaceId = input.workspaceId ?? 'nectr_data_eng';
  const workspace = recordWorkspace(kernel, {
    workspaceId,
    rootPath: input.rootPath,
    name: input.name ?? 'nectr_data_eng',
  });
  const zones = NECTR_DEFAULT_ZONES.map((zone) => recordZone(kernel, {
    ...zone,
    workspaceId,
    zoneId: `${workspaceId}:${zone.name}`,
  }));
  return { workspace, zones };
}
