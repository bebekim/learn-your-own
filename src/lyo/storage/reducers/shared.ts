import { createHash } from 'node:crypto';
import type { LearningKernel } from '../ledger.ts';
import { requiredRow } from '../db/rows.ts';

export const ISO_NOW = () => new Date().toISOString();

export function countRows(kernel: LearningKernel, tableName: string): number {
  const row = requiredRow<{ count: number }>(
    kernel.db.prepare(`select count(*) as count from ${tableName}`).get(),
    `count query returned no row for ${tableName}`
  );
  return row.count;
}

export function requireFields(input: object, fields: string[]): void {
  const values = input as Record<string, unknown>;
  for (const field of fields) {
    if (values[field] === undefined || values[field] === null || values[field] === '') {
      throw new Error(`missing required field: ${field}`);
    }
  }
}

export function boolInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

export function summarize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
