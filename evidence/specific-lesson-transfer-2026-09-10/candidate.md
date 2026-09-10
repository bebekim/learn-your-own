# Task lesson 77b7d36b8d92

- classification: code-bug
- status: candidate
- vehicle: prose
- helpful: 0
- harmful: 0
- observed in runs: pilot-20260909-train-command
- falsifiable_by: The validation logic does not reject whitespace-only command values.

## Cause hypothesis

The original code allowed whitespace-only command values to pass validation, which led to failures in the eval task reader. The repair involved changing the validation logic to check for trimmed string length, thus rejecting invalid commands while preserving valid task data.

## Intervention

When a string must contain meaningful text, validate its trimmed length while preserving the original accepted value.

## Prediction

Future tasks that involve command validation will succeed if they implement similar input checks to ensure non-empty string values.

## Evidence

Intervention: 77b7d36b8d920fa091db94920f615ad9bd589de3a615361cb03b8a72254d6de4
Source receipt: 7d5c3a95213c577e3a64dc7cd5263d9099be90c29fb35a23f8939f02d4ae0819
Removal/restoration check supported: true. Future usefulness is unvalidated.
