# Adaptive feedback calibration — 2026-09-09

**Result: the adaptation mechanism worked in this bounded experiment.**
This does not establish coding-agent improvement, Go improvement, or the
helpfulness of the existing lesson library.

The runner used Node v24.15.0, seed 42, and 32 randomized training episodes.
It then froze policy revision 32 and evaluated 12 new inputs, each under a
fixed CommonJS baseline and the learned policy. All 56 outcomes came from
actual Node child processes. No model was called and no reward was supplied
by a language-model judge.

| Condition | Successful executions | Total process wall time |
| --- | ---: | ---: |
| Randomized training | 14 / 32 | 1,272 ms |
| Fixed baseline on new inputs | 6 / 12 | 446 ms |
| Frozen learned policy on the same new inputs | 12 / 12 | 462 ms |

The learned policy gained six successful executions on these twelve paired
inputs. No speed improvement is claimed. The timings above omit controller
and CLI overhead and are not a total workflow-cost comparison.

## How the choices were learned

Training selected each available action with probability 0.5. The observation
was a syntax label. The objective was correct stdout with exit status zero
under a two-second process timeout.

| Observed syntax | Chosen action | Training successes | Estimated return |
| --- | --- | ---: | ---: |
| `import` | `commonjs` | 0 / 9 | 0 |
| `import` | `module` | 7 / 7 | 1 |
| `require` | `commonjs` | 7 / 7 | 1 |
| `require` | `module` | 0 / 9 | 0 |

The controller used the larger measured mean for each state. The experiment
supplied the state representation and action vocabulary, but did not encode
the syntax-to-action mapping in the controller. The fixed baseline succeeded
on every `require` case and failed on every `import` case. The frozen policy
selected the working action for both states. Test outcomes did not train it.

## Evidence

- [Registration](registration.json) records the seed, instrument hash, runtime,
  fixed specification, and case counts before execution.
- [Machine-readable report](report.json) contains the measured totals.
- [Artifact archive](artifacts.tar.gz), approximately 40 KB, contains all inputs,
  observation files, result files, `episodes.json`, the SQLite ledger, and a
  snapshot of the experiment runner.
- [Archive checksum](artifacts.sha256) identifies the archive bytes.

Every result-file hash in `episodes.json` and the registered instrument hash
was checked before archiving. Paths in the records identify the original local
worktree. After extraction elsewhere, resolve their suffixes relative to the
extracted `adaptive-feedback-2026-09-09` directory.

From this evidence directory:

```sh
rtk proxy shasum -a 256 -c artifacts.sha256
rtk proxy tar -xzf artifacts.tar.gz -C /tmp
```

To reproduce with the feature checkout and Node 24:

```sh
rtk proxy node src/cli.ts eval control --dir .agent-learning/experiments/new-calibration --seed 42
```

Use a fresh directory. The command refuses to overwrite a prior run.

## Scope and limitations

The programs and correct actions are deliberately simple and already
understood. This calibrates the sensor → decision → execution → measurement →
policy-update path. A hard-coded syntax mapping could solve this particular
execution problem; discovering an economically useful coding intervention is
not the purpose or achievement of this run.

There are only two exact states and one seed. New inputs change numeric
constants, not task families. There is no learned representation, sequential
credit assignment, or uncertainty-based acceptance gate. Baseline execution
always precedes learned execution within each test case, so timing comparisons
would also need an order-controlled experiment.

The evaluator is independent of action selection, but implemented in the same
experiment runner. The generic feedback API accepts caller-supplied evidence
references; trustworthy evaluation and genuine train/test separation are
adapter obligations. Historical telemetry has not been reclassified as causal
evidence, and the existing four lesson candidates have not gained validated
helpful outcomes from this experiment.

Daily agent hooks and central corpus imports do not yet handle these controller
records. The next increment is one real coding-agent decision with independent
measurement, shared persistence, and a comparison registered before results.

## Implementation checks

`npm test`: 570 passed, 0 failed, 1 skipped because the sandbox disallows a
localhost bind. The nine new checks cover persistent adaptation, retries,
invalid feedback, frozen evaluation, delayed measurement, scope isolation,
separate CLI processes, and the real-process calibration.

`npm run typecheck`, `npm run build:npm`, and `npm run pack:local` passed.
The generated package's exported controller changed a decision from measured
feedback, and its compiled CLI reproduced 6/12 versus 12/12. The local tarball
was built for review; it was not published or installed into daily hooks.
