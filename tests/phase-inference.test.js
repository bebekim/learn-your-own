import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferPhaseFromClassification,
  inferPhaseFromActivationKind,
} from '../src/behavior/phase-inference.ts';

// --- inferPhaseFromClassification ---

test('test classification → validate phase', () => {
  assert.equal(inferPhaseFromClassification('test'), 'validate');
});

test('build classification → validate phase', () => {
  assert.equal(inferPhaseFromClassification('build'), 'validate');
});

test('lint classification → validate phase', () => {
  assert.equal(inferPhaseFromClassification('lint'), 'validate');
});

test('format classification → validate phase', () => {
  assert.equal(inferPhaseFromClassification('format'), 'validate');
});

test('inspect classification → explore phase', () => {
  assert.equal(inferPhaseFromClassification('inspect'), 'explore');
});

test('deploy classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('deploy'), 'unknown');
});

test('git classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('git'), 'unknown');
});

test('database classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('database'), 'unknown');
});

test('cloud classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('cloud'), 'unknown');
});

test('package classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('package'), 'unknown');
});

test('local_dev classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('local_dev'), 'unknown');
});

test('unknown classification → unknown phase', () => {
  assert.equal(inferPhaseFromClassification('unknown'), 'unknown');
});

// --- inferPhaseFromActivationKind ---

test('file_read → explore phase', () => {
  assert.equal(inferPhaseFromActivationKind('file_read'), 'explore');
});

test('directory_listed → explore phase', () => {
  assert.equal(inferPhaseFromActivationKind('directory_listed'), 'explore');
});

test('file_written → fix phase', () => {
  assert.equal(inferPhaseFromActivationKind('file_written'), 'fix');
});

test('file_created → fix phase', () => {
  assert.equal(inferPhaseFromActivationKind('file_created'), 'fix');
});

test('file_deleted → fix phase', () => {
  assert.equal(inferPhaseFromActivationKind('file_deleted'), 'fix');
});

test('file_diffed → fix phase', () => {
  assert.equal(inferPhaseFromActivationKind('file_diffed'), 'fix');
});

test('unknown activation kind → unknown phase', () => {
  assert.equal(inferPhaseFromActivationKind('unknown'), 'unknown');
});
