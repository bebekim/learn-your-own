# Cybernetic Learning Experiment Protocol

## Purpose

Do not try to nail Lyo's learning algorithm in one design pass. Treat the
learning loop itself as the experiment.

The experiment asks:

```text
Can local association hypotheses, updated by observed consequences and defeater
checks over repeated attempts, produce useful global behavior: better process
chains and better reusable modules?
```

The goal is not to prove the final learner. The goal is to create a controlled
loop where Lyo can try a plausible local rule, observe consequences, and revise
the rule or artifact.

## Core Hypothesis

Lyo can improve future work if it learns two things:

```text
efficiency:
  useful action chains for a task family

generalization:
  reusable modules such as verifiers, context packs, critics, and policies
```

Initial hypothesis:

```text
If an association hypothesis repeatedly receives supporting evidence in a
scoped task family without stronger defeaters, then delivering an artifact based
on that hypothesis in a future run should improve verified progress or reduce
friction.
```

This is a Polya-style conjecture, not a theorem. It must be tested by future
runs.

## Experimental Unit

The unit of experiment is a repeated task family.

Examples:

```text
compiler telemetry change
database-from-scratch milestone
CLI command classifier improvement
iOS verifier/debugging task
data pipeline invariant fix
```

Each task family should have:

```text
family_id
variant_id
attempt_id
goal
success_criteria
known verifier commands
allowed tools
baseline state
stop condition
```

The first experiment should use a small local task family where verification is
cheap and deterministic. A classifier/compiler-frontend task is a good first
target because it already has strong tests and compact traces.

## Experiment Shape

Use a simple before/after shape first:

```text
A0 baseline attempt
  no learned artifact delivered

learn
  extract association hypotheses, observe evidence events, create candidate artifacts

A1 treatment attempt
  deliver one artifact based on A0

evaluate
  compare A1 against A0
```

Then add controlled variation:

```text
A2 variant attempt
  similar but not identical task
  tests whether the artifact generalizes
```

Do not start with 3x3 or model-matrix experiments. The first question is
whether the local learning loop can produce any useful intervention at all.

## Control Conditions

To avoid fooling ourselves, every experiment should record:

```text
same or declared model lane
same repository baseline or reset procedure
same verifier definition
same task-family scope
same time/turn budget when feasible
whether coaching/delivery was enabled
whether the user manually overrode the artifact
```

When exact control is impossible, record the difference as a limitation instead
of hiding it.

## Local Signals

The deterministic trace/effect compiler provides the sensor state:

```text
reads
writes
executed commands
ordered evidence
temporal predicates
workflow style
final claim posture
```

From those signals, the experiment extracts local associations:

```text
resource -> verifier
resource -> neighboring context
edit -> required future verifier
failure -> diagnostic action
manual orchestration -> candidate loop artifact
action class -> policy boundary
```

## Credibility Rules

Each association hypothesis receives local evidence after outcome evidence is
available:

```text
supports
  The association was relevant and its predicted consequence occurred after the
  source activation.

neutral
  The association appeared, but the trace cannot show whether it helped.

incomparable
  The observation does not bear on the hypothesis.

weakens
  A relevant expected consequence failed or a defeater appeared.

defeats
  A conflicting observation undercuts the conjecture in scope.
```

Examples:

```text
resource -> verifier
  supports if the verifier passed after the related final edit
  weakens if delivered verifier failed after edit and no recovery followed
  neutral/incomparable if the verifier relation was too distant or unused

procedure chain
  supports if the delivered chain ends in verified completion
  weakens/defeats if the chain ends in unverified claim, regression, or avoidable churn
  neutral if no outcome evidence is available

context pack
  supports if delivered context is used and the run reaches verified completion with
     less wandering
  weakens if delivered context causes broad irrelevant reading and no progress
  neutral if delivered but unused

critic
  supports if it catches a missing verifier/safety issue and the run recovers
  weakens if it repeatedly blocks safe useful work
  neutral if it fires but no consequence is visible
```

Weakening and defeat must have evidence. Ambiguity is neutral or incomparable,
not negative.

## Run-Level Evaluation

Each attempt should emit a run delta record.

Core metrics:

```text
verified_completion
required_verifier_passed
stopped_after_edit_without_verification
regression
unsafe_write
time_to_first_verifier
mean_edit_to_verifier_delay
prompt_count
tool_action_count
edit_count
verifier_count
failed_verifier_count
approval_or_continuation_count_when_available
```

The first run-level score should be simple and explainable:

```text
run_score =
  verified_completion_bonus
  - unverified_stop_penalty
  - regression_penalty
  - unsafe_write_penalty
  - excessive_churn_penalty
```

The score is not the source of truth. It is a summary over evidence refs.

## Artifact-Level Evaluation

An artifact is useful only if acting on it improves later runs.

Each delivered artifact should record:

```text
artifact_id
artifact_version_id
attempt_id
delivery_mode
predicted_benefit
observed_outcome
credibility_effect
evidence_refs
```

Initial predicted benefits:

```text
procedure:
  fewer prompts/actions or faster verifier while preserving verified completion

verifier:
  earlier or fresher proof of progress

context_pack:
  fewer irrelevant reads and faster useful edit/verifier loop

critic:
  fewer unverified completion claims or unsafe actions

policy:
  fewer unnecessary approvals without increasing unsafe writes
```

## Local-To-Global Mechanism

The experiment should explicitly test the local-to-global claim:

```text
local association hypothesis
-> supporting/weakening/defeating evidence
-> stronger or weaker conjecture
-> candidate artifact
-> artifact delivery
-> changed future trace
-> observed consequence
-> retained, specialized, generalized, or demoted artifact
```

Global behavior exists only when future traces change in the intended direction.

Evidence of global behavior:

```text
the same artifact helps across more than one attempt
a generalized artifact works on a related variant
a negative counterexample causes specialization
a bad artifact is demoted instead of repeatedly delivered
manual prompting is compressed into an explicit chain or module
```

## Iteration Loop

Run the experiment in explicit cycles:

```text
1. Select task family and variant.
2. Run baseline attempt without delivered learning artifacts.
3. Compile the trace.
4. Extract association conjectures.
5. Assign credibility effects from outcome evidence and defeater checks.
6. Create one or two candidate artifacts.
7. Select one artifact to deliver in the next attempt.
8. Run treatment attempt.
9. Compare attempt delta.
10. Append evidence for or against the delivered artifact's hypothesis.
11. Decide: retain, specialize, generalize, demote, or redesign the local rule.
```

The stop condition is not "algorithm is perfect." The stop condition is:

```text
the current local rule either produced measurable improvement, produced a clear
counterexample, or failed to create a useful intervention after enough attempts.
```

## Minimal First Experiment

Use a compiler/classifier task family:

```text
family_id:
  lyo-compiler-classifier-v1

baseline attempt:
  implement one deterministic classifier improvement without delivered learning

candidate artifact:
  verifier module:
    source scope: src/compiler/**
    verifier: node --test tests/compiler-frontend.test.js

treatment attempt:
  implement a related classifier or workflow-style change with verifier module
  delivered

success signal:
  verifier is run after final edit
  verifier passes
  fewer manual reminders to run tests
  no unverified final claim

generalization attempt:
  apply the artifact to a related but distinct compiler module
```

Expected first result:

```text
not a final algorithm, but evidence about whether resource -> verifier
associations are worth promoting into verifier modules.
```

Run the first dry-run comparison with:

```sh
lyo experiment \
  --db .agent-learning/learning.sqlite \
  --family-id lyo-compiler-classifier-v1 \
  --baseline-run-id <A0-run-id> \
  --treatment-run-id <A1-run-id> \
  --variant-run-id <A2-run-id> \
  --artifact verifier:compiler-frontend \
  --association-edge "src/compiler/** -> tests/compiler-frontend.test.js" \
  --next-experiment "try related compiler module variant"
```

This command is read-only. It compiles each run through the existing
trace/effect pipeline, emits attempt deltas, assigns credibility effects from
observed consequences and defeater checks, and returns hypotheses, evidence
events, and a retain/specialize/generalize/demote decision. It does not persist
association hypotheses or artifact state.

## Experiment Report Shape

The report should be readable as JSON and prose.

```json
{
  "experimentVersion": "lyo/cybernetic-learning-experiment/v1",
  "familyId": "lyo-compiler-classifier-v1",
  "attempts": [
    {
      "attemptId": "A0",
      "mode": "baseline",
      "verifiedCompletion": true,
      "promptCount": 8,
      "toolActionCount": 31,
      "meanEditToVerifierDelayMs": 180000
    },
    {
      "attemptId": "A1",
      "mode": "treatment",
      "deliveredArtifacts": ["verifier:compiler-frontend"],
      "verifiedCompletion": true,
      "promptCount": 5,
      "toolActionCount": 23,
      "meanEditToVerifierDelayMs": 60000
    }
  ],
  "associationHypotheses": [
    {
      "id": "hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js",
      "source": "src/compiler/**",
      "relation": "verified_by",
      "target": "tests/compiler-frontend.test.js",
      "credibility": "plausible",
      "predictedConsequences": [
        "fresh passing verifier evidence after a related source activation"
      ]
    }
  ],
  "evidenceEvents": [
    {
      "hypothesisId": "hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js",
      "runId": "A1-run",
      "credibilityEffect": "supports",
      "polyaPattern": "verifying_consequence",
      "defeatersPresent": [],
      "provenanceRefs": ["hook:verifier"]
    }
  ],
  "decision": "retain_candidate",
  "nextExperiment": "try related compiler module variant"
}
```

## Failure Modes To Watch

The experiment is useful only if it can reveal failure.

Expected failure modes:

```text
decorative verification:
  tests run, but not relevant to the changed resource

over-generalization:
  a verifier module applies too broadly and misses the real test

context bloat:
  context pack adds many reads without improving outcome

critic friction:
  critic interrupts safe work too often

manual override masking:
  user fixes the run manually, making the artifact look better than it was

selection bias:
  only easy successful attempts are used as supporting evidence
```

Each failure should create a counterexample, not embarrassment. Counterexamples
are how the local rule improves.

## Non-Goals

The first experiment should not:

- prove the final learning algorithm;
- train a black-box model;
- auto-promote artifacts without review;
- compare every possible model or agent;
- require perfect historical telemetry coverage;
- turn interview/evaluate mode into live coaching;
- optimize raw code volume.

The aim is narrower:

```text
Can Lyo learn one useful process or module from local trace evidence, deliver it
later, and measure whether behavior changed?
```
