import type { NormalizedAction, ResourceRef } from '../syntax.ts';

export function normalizeResourceRef(resource: ResourceRef, action: NormalizedAction): string {
  const cwd = action.provenance.cwd.replaceAll('\\', '/').replace(/\/+$/, '');
  let ref = resource.ref.replaceAll('\\', '/');
  if (cwd && ref.startsWith(`${cwd}/`)) ref = ref.slice(cwd.length + 1);
  ref = ref.replace(/^\.\//, '');
  ref = ref.replace(/\/+/g, '/');
  return ref;
}

export function sourceScopeForPath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  let parts = clean.split('/').filter(Boolean);
  const anchoredParts = anchorProjectPathParts(parts);
  if (anchoredParts.length > 0) parts = anchoredParts;
  if (parts.length === 0) return path;
  if (parts[0] === 'private' && parts[1] === 'tmp') return 'private/tmp/**';
  if (parts[0] === 'tmp') return 'tmp/**';
  if (parts[0] === 'tests' || parts[0] === '__tests__') return `${parts[0]}/**`;
  if (parts[0] === '.agent-learning') return '.agent-learning/**';
  if (parts.length === 2 && isFilePath(parts[1])) return `${parts[0]}/${parts[1]}`;
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}/**`;
  return parts[0];
}

export function sourceScopeWarnings(source: string): string[] {
  const warnings: string[] = [];
  if (source === 'tests/**' || source === '__tests__/**') warnings.push('source_scope_is_test_tree');
  if (source === 'private/tmp/**' || source === 'tmp/**') warnings.push('source_scope_is_transient');
  if (source === '.agent-learning/**') warnings.push('source_scope_is_telemetry_storage');
  return warnings;
}

function isFilePath(pathPart: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(pathPart);
}

function anchorProjectPathParts(parts: string[]): string[] {
  const rootMarkers = new Set([
    '__tests__',
    'app',
    'dbt',
    'jobs',
    'lib',
    'models',
    'notebooks',
    'packages',
    'scripts',
    'sql',
    'src',
    'tests',
  ]);
  const markerIndex = parts.findIndex((part) => rootMarkers.has(part));
  return markerIndex === -1 ? parts : parts.slice(markerIndex);
}
