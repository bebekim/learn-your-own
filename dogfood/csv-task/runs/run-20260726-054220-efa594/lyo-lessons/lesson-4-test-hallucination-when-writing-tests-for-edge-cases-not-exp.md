# When writing tests for edge cases not explicitly covered by the specification (e.g., quote characters embedded in a field that is not itself quoted), do not invent precise expected outputs; either omit the case or flag it as an open question rather than asserting an unverifiable exact result.

- classification: test-hallucination
- observed in runs: run-20260726-054220-efa594
- disagreements: mixed quoted and unquoted fields
- status: candidate

## Rationale
The spec's invariants and examples only define quote/escape semantics for fields that are wrapped in double quotes (i.e., the field begins with a quote character and that quote toggles quoted mode). Nothing in the spec addresses what should happen when quote characters appear inside a field that is not itself a quoted field (e.g., 'another""""field""""'). The test invents a specific decoding for this unaddressed case ('another"field'), and that expected value is not even internally consistent with any plausible escaping rule (8 literal quote characters in the input collapse to a single quote in the expected output, which doesn't match either a 'keep literal' rule or a 'pair-of-quotes decodes to one quote' rule applied to both quote runs). The implementation instead applies the same toggle/escape state machine described for quoted fields uniformly, which correctly satisfies every literal example and invariant in the spec, but disagrees with this test's fabricated expectation for a scenario the spec never specifies.

## Evidence
Spec invariants: "A field wrapped in double quotes has the surrounding quotes removed" and "Two double quotes inside a quoted field decode to one literal double quote" -- both are scoped to quoted fields. The test asserts parseCsvLine('"quoted,field",unquoted,another\"\"\"\"field\"\"\"\"') === ['quoted,field','unquoted','another\"field'], expecting an unquoted field's 8 embedded quote characters to collapse to a single leading quote with none after 'field' -- a rule not stated anywhere in the spec and not self-consistent with the stated pairing rule.
