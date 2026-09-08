// Post-run diagnostic correction: an invalid suite cannot earn mutant-detection credit.
// Original calls, outputs, verification receipts, registration and reports remain unchanged.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildEvalReport, renderEvalReportMarkdown } from '../../src/eval/report.ts';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const original = read('episodes.json');
const corrected = original.map(row => ({ ...row, regression: row.false_gate || row.regression }));
const { ruleId } = read('registration.json');
const reports = {
  selection: buildEvalReport(corrected.filter(e => e.split === 'selection'), { baselineId: 'B0', treatmentId: 'B4', ruleId }),
  static: buildEvalReport(corrected.filter(e => e.split === 'selection'), { baselineId: 'B1', treatmentId: 'B4', ruleId }),
  test: buildEvalReport(corrected.filter(e => e.split === 'test')),
};
writeFileSync(new URL('corrected-reports.json', import.meta.url), JSON.stringify({
  correction: 'Failed valid-reference checks imply no mutation-detection credit. Primary success is unchanged.',
  ...reports,
}, null, 2) + '\n');
writeFileSync(new URL('corrected-report.md', import.meta.url),
  'Derived scoring correction; original primary outcomes and costs are unchanged.\n\n' +
  Object.entries(reports).map(([name, report]) => `## ${name}\n\n${renderEvalReportMarkdown(report)}`).join('\n'));
