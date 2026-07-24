# When writing tests for quote/escape handling, restrict assertions to cases explicitly covered by the spec's examples and invariants (e.g., fields fully wrapped in quotes); for inputs mixing quotes into non-quoted fields, flag the case as spec-gap and request clarification rather than asserting a specific literal output.

- classification: spec-gap
- observed in runs: run-20260726-054220-efa594
- disagreements: mixed quoted and unquoted fields
- status: candidate

## Rationale
The spec's invariants only define behavior for fields that are entirely wrapped in double quotes ("A field wrapped in double quotes has the surrounding quotes removed", "Two double quotes inside a quoted field decode to one literal double quote"). It never states what should happen when a quote character appears in the middle of a field that does not start with a quote (e.g. the third field 'another""""field""""' in the failing test, which begins with the letter 'a', not a quote). Both the test's expectation (collapsing all embedded quote-pairs to a single literal quote, dropping the trailing pair) and the implementation's toggle-based algorithm (which produces a different quote count/placement, e.g. leaving a trailing literal quote) are plausible extrapolations of the escaping rule to a case the spec never actually describes -- non-quoted fields containing embedded quote runs. Since neither behavior is derivable from the stated invariants or examples, this is a gap rather than a clear violation of the spec (code-bug) or an invention with no textual basis at all (test-hallucination would require the test to assert something the spec clearly forbids or never touches on in any related invariant, but here the test is at least attempting to extend an existing invariant to an untested shape).

## Evidence
Invariants state only: "A field wrapped in double quotes has the surrounding quotes removed" and "Two double quotes inside a quoted field decode to one literal double quote" -- both qualified by 'quoted field' (i.e., a field wrapped in quotes), with no rule for quotes embedded inside a field that is not wrapped in quotes, as in the test's third field 'another\"\"\"\"field\"\"\"\"'.

## Suggested spec edit
Add an invariant specifying how double quotes are handled when they appear inside a field that does not begin immediately with a quote character (e.g., whether such quotes toggle quoted-mode mid-field, collapse in pairs, or are treated as literal characters).
