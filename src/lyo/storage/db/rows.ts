export function optionalRow<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : value as T;
}

export function requiredRow<T>(value: unknown, message: string): T {
  const row = optionalRow<T>(value);
  if (!row) throw new Error(message);
  return row;
}

export function rows<T>(value: unknown): T[] {
  return value as T[];
}
