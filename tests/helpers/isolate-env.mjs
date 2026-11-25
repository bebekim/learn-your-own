// Loaded before every test run (package.json `test`): tests and the hook processes they spawn
// must never reach the user's real LYO home, lesson store, decision config or transcripts.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'lyo-test-home-'));
process.env.LYO_HOME = home;
process.env.LYO_CLAUDE_PROJECTS_DIR = join(home, 'claude-projects');
mkdirSync(process.env.LYO_CLAUDE_PROJECTS_DIR);
for (const name of ['LYO_STORE_PATH', 'LYO_DECISIONS_FILE', 'LYO_DECISION_CASES_DIR', 'LYO_CONFIG_FILE', 'ZEROSHOT_LYO_STORE_PATH']) delete process.env[name];
