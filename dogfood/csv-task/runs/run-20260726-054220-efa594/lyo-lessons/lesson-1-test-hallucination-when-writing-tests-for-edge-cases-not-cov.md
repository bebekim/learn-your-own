# When writing tests for edge cases not covered by the spec's explicit examples, derive the expected value by mechanically applying the spec's stated algorithm/invariants to the exact input, rather than hand-computing a result that silently introduces unstated behavior (e.g., whitespace trimming).

- classification: test-hallucination
- observed in runs: run-20260726-054220-efa594
- disagreements: quoted field with escaped quotes at start
- status: candidate

## Rationale
The spec's invariants define quoting via a strict pairwise algorithm (open a quoted field with ", toggle on ", decode "" to a literal ", close on an unescaped "), and all four spec examples are satisfied exactly by that canonical state-machine, which is what the implementation does. The disputed test feeds an unusual input containing a space between the closing quote and the field-separating comma (`""""a"""" ,x`) and expects that trailing space to vanish from the output (`['""a""','x']`), i.e. it invents a whitespace-trimming behavior that no invariant, example, or constraint in the spec mentions. Applying the spec's own stated algorithm to this exact input (as the implementation does) yields `'"a" '` with the space preserved, consistent with how the same algorithm reproduces every literal spec example (e.g. the `she said ""hi""` case). The test's expected value is therefore not derivable from the spec text; it reflects an assumption (silent trimming/alternate quote-collapse semantics) the test writer added on their own.

## Evidence
Invariants: "A field wrapped in double quotes has the surrounding quotes removed" and "Two double quotes inside a quoted field decode to one literal double quote" -- no invariant addresses trimming whitespace outside quotes. Test: assert.deepEqual(parseCsvLine('\"\"\"\"a\"\"\"\" ,x'), ['\"\"a\"\"', 'x']) drops the literal space present in the input from the expected output.
