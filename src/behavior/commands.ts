export function summarizeCommand(command: string): string {
  return redactSensitive(command).replace(/\s+/g, ' ').trim().slice(0, 240);
}

function redactSensitive(value: string): string {
  return value
    .replace(/(token|password|passwd|secret|api[_-]?key)=\S+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/AKIA[0-9A-Z]{16}/g, '[redacted-aws-key]');
}
