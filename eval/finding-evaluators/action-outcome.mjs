#!/usr/bin/env node
// Spec 13 action evaluator. Usage: node action-outcome.mjs applicability|adherence|prediction
// Reads the context LYO provides in LYO_FINDING_ACTION and prints {"satisfied": true|false|null}.
// It never guesses: anything it cannot establish is null (unknown).
import { readFileSync } from 'node:fs';

const check = process.argv[2];
let context = null;
try { context = JSON.parse(readFileSync(process.env.LYO_FINDING_ACTION ?? '', 'utf8')); } catch { /* no context: unknown */ }

function satisfied() {
  if (!context) return null;
  if (check === 'applicability') return context.triggerDecision?.verdict === 'yes' ? true : null;
  // Adherence needs its own calibrated question (Spec 13, "Adherence is deferred").
  if (check === 'adherence') return null;
  if (check === 'prediction') {
    const action = context.action;
    if (!action) return null;
    const failed = action.eventName === 'PostToolUseFailure' || (typeof action.exitCode === 'number' && action.exitCode !== 0);
    if (!failed) return action.eventName === 'PostToolUse' ? true : null;
    const verdict = context.outcomeDecision?.verdict;
    // The situation recurred → the prediction failed; a different cause → it held.
    return verdict === 'yes' ? false : verdict === 'no' ? true : null;
  }
  return null;
}

process.stdout.write(JSON.stringify({ satisfied: satisfied() }));
