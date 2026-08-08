# Lyo Local Corpus Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first OSS package slice for local learning propagation: discover repo-local Lyo ledgers, import new rows into a central SQLite corpus, and report corpus coverage.

**Architecture:** Reuse existing `.agent-learning/learning.sqlite` discovery and `node:sqlite` patterns. Add a focused `src/corpus` module for schema/import/report logic, a `src/cli/commands/corpus.ts` command file for `sync once` and `corpus report`, and CLI tests that exercise real temporary SQLite ledgers.

**Tech Stack:** TypeScript, Node.js 24 `node:sqlite`, built-in `node:test`, existing CLI command registry.

---

### Task 1: Local Corpus Schema And Import

**Files:**
- Create: `src/corpus/schema.ts`
- Create: `src/corpus/sync.ts`
- Test: `tests/corpus-sync-cli.test.js`

- [ ] **Step 1: Write a failing CLI test for `lyo sync once`**

Create `tests/corpus-sync-cli.test.js` with a test that creates two temporary ledgers, records `runs` and `hook_events`, runs `lyo sync once --dir <root> --corpus <corpus.sqlite> --json`, and asserts the JSON summary reports two ledgers plus imported row counts.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/corpus-sync-cli.test.js`

Expected: failure because `sync once` is not registered.

- [ ] **Step 3: Add corpus schema and import implementation**

Create `src/corpus/schema.ts` with `initCorpusDb(db)` that creates `sync_ledgers`, `sync_cursors`, `sync_batches`, `sync_steps`, `corpus_runs`, and `corpus_events`.

Create `src/corpus/sync.ts` with `syncCorpusOnce({ rootDir, corpusPath })` that:
- discovers ledgers with `discoverAgentLearningLedgers`;
- opens each source ledger read-only;
- imports rows from `runs` and `hook_events`;
- stores source provenance;
- uses idempotent primary keys;
- updates per-ledger/table cursors;
- returns discovered/imported counts.

- [ ] **Step 4: Register CLI command**

Create `src/cli/commands/corpus.ts` and register it in `src/cli/commands.ts` so `lyo sync once` works.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- tests/corpus-sync-cli.test.js`

Expected: pass.

### Task 2: Corpus Report

**Files:**
- Modify: `src/corpus/sync.ts`
- Modify: `src/cli/commands/corpus.ts`
- Test: `tests/corpus-sync-cli.test.js`

- [ ] **Step 1: Write a failing test for `lyo corpus report`**

Extend `tests/corpus-sync-cli.test.js` to run `lyo corpus report --db <corpus.sqlite> --json` after sync and assert ledger/run/event totals and per-ledger rows.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/corpus-sync-cli.test.js`

Expected: failure because `corpus report` is not registered or returns no report.

- [ ] **Step 3: Add report implementation**

Add `corpusReport({ corpusPath })` that opens the corpus read-only and returns total ledgers, total runs, total events, and per-ledger imported counts.

- [ ] **Step 4: Register CLI command**

Register `corpus report` in `src/cli/commands/corpus.ts`.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- tests/corpus-sync-cli.test.js`

Expected: pass.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Test: package test suite

- [ ] **Step 1: Add README commands**

Document:

```sh
lyo sync once --dir ~/repositories --corpus ~/.lyo/corpus.sqlite --json
lyo corpus report --db ~/.lyo/corpus.sqlite --json
```

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- tests/corpus-sync-cli.test.js`

Expected: pass.

- [ ] **Step 3: Run the broader test suite**

Run: `npm test`

Expected: pass.

