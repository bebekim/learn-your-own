import type {
  CommandActivationRecord,
  DeploymentActionRecord,
  ZoneRecord,
} from '../types.ts';

export function normalizeRelativePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/');
}

export function pathMatchesGlob(path: string, glob: string): boolean {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedGlob = normalizeRelativePath(glob);
  if (normalizedGlob === normalizedPath) return true;
  if (normalizedGlob.endsWith('/**')) {
    const prefix = normalizedGlob.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedGlob.endsWith('*')) {
    return normalizedPath.startsWith(normalizedGlob.slice(0, -1));
  }
  return false;
}

export function commandMatchesZone(command: CommandActivationRecord, zone: ZoneRecord): boolean {
  if (zone.zoneKind !== 'external_command' && zone.zoneKind !== 'deployment') return false;
  const haystack = [
    command.commandName,
    command.commandFamily,
    command.classification,
    command.argvSummary,
    zone.zoneKind,
    zone.name,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  const zoneName = zone.name.toLowerCase().replace(/[_-]/g, ' ');
  const commandName = command.commandName.toLowerCase();
  return haystack.includes(zoneName)
    || zoneName.includes(commandName)
    || (command.commandFamily ? zoneName.includes(command.commandFamily.toLowerCase()) : false);
}

export function deploymentMatchesZone(action: DeploymentActionRecord, zone: ZoneRecord): boolean {
  if (zone.zoneKind !== 'deployment' && zone.zoneKind !== 'external_command') return false;
  const haystack = [
    action.provider,
    action.environment,
    action.target,
    zone.zoneKind,
    zone.name,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  return haystack.includes(zone.name.toLowerCase().replace(/[_-]/g, ' '))
    || (action.provider ? haystack.includes(action.provider.toLowerCase()) : false);
}

export function sortedPair(left: string, right: string): [string, string] {
  return left <= right ? [left, right] : [right, left];
}
