/**
 * Documentation generated from configuration schemas, so a page cannot drift from the code.
 * A page marks each generated region with
 *   <!-- generated:NAME --> ... <!-- /generated:NAME -->
 * and `npm run docs:gen` rewrites what lies between. `npm test` fails while a page is stale.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { tuningSchema } from './tuning.ts';
import { decisionConfigSchema } from '../decisions/providers.ts';

interface JsonSchema {
  type?: string; properties?: Record<string, JsonSchema>; default?: unknown; description?: string;
  minimum?: number; maximum?: number; const?: unknown; enum?: unknown[];
}

interface Row { key: string; schema: JsonSchema }

function leaves(schema: JsonSchema, prefix: string): Row[] {
  if (schema.type === 'object' && schema.properties) {
    return Object.entries(schema.properties).flatMap(([name, child]) => leaves(child, `${prefix}.${name}`));
  }
  return [{ key: prefix, schema }];
}

const code = (value: unknown) => `\`${typeof value === 'string' ? value : JSON.stringify(value)}\``;

function range(s: JsonSchema) {
  if (s.minimum !== undefined && s.maximum !== undefined) return `${s.minimum}–${s.maximum}`;
  if (s.enum) return s.enum.map(code).join(', ');
  return '';
}

function table(rows: Row[]) {
  const missing = rows.filter(r => !r.schema.description).map(r => r.key);
  if (missing.length) throw new Error(`settings without a description: ${missing.join(', ')}`);
  return ['| Setting | Default | Range | What it controls |', '|---|---|---|---|',
    ...rows.map(({ key, schema }) => `| \`${key}\` | ${schema.default === undefined ? '' : code(schema.default)} | ${range(schema)} | ${schema.description!.replace(/\|/g, '\\|')} |`)]
    .join('\n');
}

const toJson = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as JsonSchema;

/** Every machine-dependent budget in `config.json`. Each must carry a description. */
function tuningTable() {
  return table(leaves(toJson(tuningSchema), 'tuning'));
}

/** The decision worker and hypothesis generator sections of `decisions.json`. */
function decisionsTable() {
  const props = toJson(decisionConfigSchema).properties!;
  const generator = props.generator!;
  return table([...leaves(props.worker!, 'worker'),
    ...leaves({ ...generator, properties: Object.fromEntries(Object.entries(generator.properties!)
      .filter(([name]) => !['provider', 'apiKeyEnvFile'].includes(name))) }, 'generator')]);
}

export const GENERATED_REGIONS: Record<string, () => string> = {
  'tuning-settings': tuningTable,
  'decision-settings': decisionsTable,
};

/** Pages under the repository root that carry generated regions. */
export const GENERATED_PAGES = ['docs/tuning.md'];

export function renderPage(text: string, regions = GENERATED_REGIONS) {
  return text.replace(/<!-- generated:([\w-]+) -->\n[\s\S]*?<!-- \/generated:\1 -->/g, (_whole, name: string) => {
    const render = regions[name];
    if (!render) throw new Error(`unknown generated region: ${name}`);
    return `<!-- generated:${name} -->\n${render()}\n<!-- /generated:${name} -->`;
  });
}

/** Rewrites stale pages (or, with check, only reports them). Returns the stale page paths. */
export function generateDocs(root: string, options: { check?: boolean } = {}) {
  const stale: string[] = [];
  for (const page of GENERATED_PAGES) {
    const path = join(root, page), before = readFileSync(path, 'utf8'), after = renderPage(before);
    if (after === before) continue;
    stale.push(page);
    if (!options.check) writeFileSync(path, after);
  }
  return stale;
}
